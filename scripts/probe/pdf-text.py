"""按内容流从 PDF 中提取可读文本（处理 Chromium 的 CID 子集字体）。

Chromium 导出的中文 PDF 里，文本是 `<十六进制>` Tj 形式的字形编号（CID），
要还原成文字必须：解开内容流 → 取出十六进制串 → 按 2 字节切成 CID →
再到该字体的 /ToUnicode CMap 里查真实字符。

用法：python pdf-text.py <pdf 路径> [要检查的片段 ...]
输出：一行 JSON，含还原文本、片段命中情况、页数与 ToUnicode 是否存在。
"""

import json
import re
import sys
import zlib


def inflate(data: bytes) -> bytes | None:
    try:
        return zlib.decompress(data)
    except zlib.error:
        return None


def iter_streams(raw: bytes):
    """产出每个对象流解压后的字节（解不开就跳过）。"""
    for match in re.finditer(rb"stream\r?\n", raw):
        start = match.end()
        end = raw.find(b"endstream", start)
        if end < 0:
            continue
        decoded = inflate(raw[start:end])
        if decoded is not None:
            yield decoded


def parse_cmap(data: bytes) -> dict[int, str]:
    """解析 ToUnicode CMap，返回 CID → 字符 的映射。"""
    mapping: dict[int, str] = {}

    for block in re.finditer(rb"beginbfchar(.*?)endbfchar", data, re.S):
        for src, dst in re.findall(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block.group(1)):
            cid = int(src, 16)
            mapping[cid] = decode_utf16_hex(dst)

    for block in re.finditer(rb"beginbfrange(.*?)endbfrange", data, re.S):
        for start, end, dst in re.findall(
            rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block.group(1)
        ):
            first = int(start, 16)
            last = int(end, 16)
            base = decode_utf16_hex(dst)
            for offset in range(min(last - first + 1, 65536)):
                if base:
                    codepoint = ord(base[0]) + offset
                    mapping[first + offset] = chr(codepoint)

    return mapping


def decode_utf16_hex(hex_text: bytes) -> str:
    try:
        return bytes.fromhex(hex_text.decode("ascii")).decode("utf-16-be", errors="ignore")
    except ValueError:
        return ""


def is_cjk(ch: str) -> bool:
    code = ord(ch)
    return 0x3400 <= code <= 0x9FFF or 0xF900 <= code <= 0xFAFF


def extract_text(raw: bytes) -> dict:
    """还原文本，并统计 CMap 覆盖情况。

    内容流里的 <...> 字串长度并不总是 4 的倍数（不同字体子集的 CID 宽度不同），
    因此这里对每个字串尝试多种切分宽度，取「能在 CMap 里查到最多 CID」的那种。
    """
    cmaps: dict[int, str] = {}
    content_chunks: list[bytes] = []
    saw_tounicode = False

    for stream in iter_streams(raw):
        is_cmap = b"beginbfchar" in stream or b"beginbfrange" in stream or b"begincmap" in stream
        if is_cmap:
            cmaps.update(parse_cmap(stream))
            saw_tounicode = True
            continue
        if (b"Tj" in stream or b"TJ" in stream) and b"/Type" not in stream[:64]:
            content_chunks.append(stream)

    pieces: list[str] = []
    hits = 0
    misses = 0

    for chunk in content_chunks:
        for hex_text in re.findall(rb"<([0-9A-Fa-f\s]+)>", chunk):
            compact = re.sub(rb"\s+", b"", hex_text)
            if not compact:
                continue
            best_text = ""
            best_score = -1
            for width in (4, 2, 6):
                if len(compact) % width != 0:
                    continue
                text = ""
                score = 0
                for index in range(0, len(compact), width):
                    cid = int(compact[index : index + width], 16)
                    mapped = cmaps.get(cid)
                    if mapped:
                        text += mapped
                        score += 1
                if score > best_score:
                    best_score = score
                    best_text = text
            if best_score <= 0:
                misses += 1
            else:
                hits += 1
                pieces.append(best_text)

    text = "".join(pieces)
    cjk_mappings = sum(1 for value in cmaps.values() if value and is_cjk(value[0]))

    return {
        "text": text,
        "toUnicode": saw_tounicode,
        "cmapEntries": len(cmaps),
        "cjkMappings": cjk_mappings,
        "streamsDecoded": hits,
        "streamsUnmapped": misses,
    }


def main() -> int:
    if len(sys.argv) < 2:
        sys.stdout.write(json.dumps({"error": "缺少 PDF 路径"}, ensure_ascii=False))
        return 2

    path = sys.argv[1]
    probes = sys.argv[2:]

    with open(path, "rb") as handle:
        raw = handle.read()

    extracted = extract_text(raw)
    text = extracted.pop("text")

    result = {
        **extracted,
        "textLength": len(text),
        "sample": text[:160],
        "probes": {probe: (probe in text) for probe in probes},
        "bytes": len(raw),
        "pageCount": len(re.findall(rb"/Type\s*/Page[^s]", raw)),
    }

    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
