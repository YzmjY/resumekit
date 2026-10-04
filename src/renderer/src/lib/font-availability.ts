import { useCallback, useEffect, useState } from 'react'

/** 明确不存在的字体名，作为「是否命中」的对照基准 */
const GHOST_FONTS = ['__rs_ghost_aaa__', '__rs_ghost_bbb__', '__rs_ghost_ccc__']

/** 不需要探测、也永远可用的通用族与系统关键字 */
export const GENERIC_FAMILIES = [
  { value: 'system-ui', label: '系统界面字体' },
  { value: 'sans-serif', label: '系统无衬线' },
  { value: 'serif', label: '系统衬线' },
  { value: 'monospace', label: '系统等宽' }
]

/** 常见候选字体：覆盖中英文主流，便于用户挑到本机真正存在的那个 */
export const KNOWN_FONTS = [
  'Microsoft YaHei',
  'Microsoft YaHei UI',
  'SimSun',
  'SimHei',
  'KaiTi',
  'FangSong',
  'DengXian',
  'Source Han Sans SC',
  'Noto Sans SC',
  'PingFang SC',
  'Hiragino Sans GB',
  'Lantinghei SC',
  'Songti SC',
  'Inter',
  'Segoe UI',
  'Arial',
  'Helvetica',
  'Helvetica Neue',
  'Verdana',
  'Tahoma',
  'Calibri',
  'Cambria',
  'Georgia',
  'Times New Roman',
  'Palatino Linotype',
  'Garamond',
  'Book Antiqua',
  'Consolas',
  'Cascadia Mono',
  'Courier New',
  'JetBrains Mono',
  'Fira Code',
  'Menlo',
  'Monaco'
]

/** 把 CSS font-family 值拆成字体名数组（去掉引号与空白） */
export function parseFontStack(stack: string): string[] {
  return stack
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter((part) => part.length > 0)
}

/** 把字体名数组拼回 CSS font-family 值；含空格或中文的名字自动加引号 */
export function formatFontStack(families: string[]): string {
  return families
    .map((name) => {
      const trimmed = name.trim()
      if (!trimmed) return ''
      const needsQuote = /[\s\u4e00-\u9fff]/.test(trimmed) || /^[0-9]/.test(trimmed)
      return needsQuote ? `'${trimmed.replace(/'/g, '')}'` : trimmed
    })
    .filter((name) => name.length > 0)
    .join(',')
}

/* ------------------------------------------------------------------ *
 * 字体可用性探测
 * ------------------------------------------------------------------ */

const availabilityCache = new Map<string, boolean>()
let probeElement: HTMLSpanElement | null = null
let ghostWidth = -1

function ensureProbe(): { element: HTMLSpanElement; ghost: number } | null {
  if (typeof document === 'undefined') return null
  if (!probeElement || !probeElement.isConnected) {
    probeElement = document.createElement('span')
    probeElement.setAttribute('aria-hidden', 'true')
    probeElement.style.cssText = [
      'position:absolute',
      'left:-99999px',
      'top:0',
      'font-size:96px',
      'white-space:nowrap',
      'visibility:hidden',
      'pointer-events:none'
    ].join(';')
    probeElement.textContent = '中文字体检测 Wxyzgjpq'
    document.body.appendChild(probeElement)
    ghostWidth = -1
  }
  if (ghostWidth < 0) {
    let widest = 0
    for (const ghost of GHOST_FONTS) {
      probeElement.style.fontFamily = `"${ghost}"`
      widest = Math.max(widest, probeElement.getBoundingClientRect().width)
    }
    ghostWidth = widest
  }
  return { element: probeElement, ghost: ghostWidth }
}

/** 本机是否安装了某个字体（以「渲染宽度不同于缺省字体」为判据） */
export function isFontAvailable(family: string): boolean {
  const cached = availabilityCache.get(family)
  if (cached !== undefined) return cached

  if (GENERIC_FAMILIES.some((item) => item.value === family)) {
    availabilityCache.set(family, true)
    return true
  }

  const probe = ensureProbe()
  if (!probe) return false

  probe.element.style.fontFamily = `"${family}"`
  const width = probe.element.getBoundingClientRect().width
  const available = Math.abs(width - probe.ghost) > 0.5
  availabilityCache.set(family, available)
  return available
}

/** 按顺序返回第一个真正可用的字体名 */
export function resolveFirstAvailable(families: string[]): string | null {
  for (const family of families) {
    if (isFontAvailable(family)) return family
  }
  return null
}

/** 探测用的 hook：挂载后再判定，避免在 document 就绪前测量 */
export function useFontAvailability(families: string[]): {
  availability: Map<string, boolean>
  ready: boolean
} {
  const [ready, setReady] = useState(false)
  const [availability, setAvailability] = useState<Map<string, boolean>>(new Map())

  const evaluate = useCallback(() => {
    const next = new Map<string, boolean>()
    for (const family of families) next.set(family, isFontAvailable(family))
    setAvailability(next)
    setReady(true)
    // families 是数组，调用方需保证引用稳定或内容变化时才调用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families.join('\u0000')])

  useEffect(() => {
    evaluate()
  }, [evaluate])

  return { availability, ready }
}
