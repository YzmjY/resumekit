/**
 * 读取 NSIS 安装包 app.asar 内的 package.json，确认版本与是否带 blockmap 支持。
 * 用法：node scripts/probe/installer-version.mjs <安装包路径> [...]
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'

/** 极简 asar 读取：解析头部 JSON，取出指定文件内容 */
function readAsarFile(asarPath, target) {
  const fd = readFileSync(asarPath)
  const headerSize = fd.readUInt32LE(12)
  const header = fd.subarray(16, 16 + headerSize).toString('utf8')
  const jsonEnd = header.lastIndexOf('}')
  const index = JSON.parse(header.slice(16 - 16, jsonEnd + 1))
  const parts = target.split('/')
  let node = index
  for (const part of parts) {
    if (!node || !node.files || !node.files[part]) return null
    node = node.files[part]
  }
  if (!node || node.offset === undefined) return null
  const offset = 16 + headerSize + Number(node.offset)
  return fd.subarray(offset, offset + Number(node.size)).toString('utf8')
}

for (const file of process.argv.slice(2)) {
  if (!existsSync(file)) {
    console.log(`${basename(file)}: 不存在`)
    continue
  }
  const size = statSync(file).size
  try {
    const text = readAsarFile(file, 'package.json')
    if (!text) {
      console.log(`${basename(file)}: 未在包内找到 package.json`)
      continue
    }
    const pkg = JSON.parse(text)
    console.log(`${basename(file)}`)
    console.log(`  size    : ${size}`)
    console.log(`  version : ${pkg.version}`)
    console.log(`  name    : ${pkg.name}`)
    console.log(`  product : ${pkg.productName ?? '(未设置)'}`)
  } catch (error) {
    console.log(`${basename(file)}: 解析失败 — ${error.message}`)
  }
}
