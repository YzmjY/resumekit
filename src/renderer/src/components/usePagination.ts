import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface PaginationState {
  /** 内容在打印布局下的高度（页坐标，未缩放） */
  contentHeight: number
  /** 页数，至少 1 */
  pageCount: number
  /** 每页分界线的绝对 Y 位置（页坐标，未缩放） */
  breaks: number[]
  /** 双栏模板侧栏应拉伸到的高度 */
  sidebarHeight: number
  /** 是否超出单页 */
  overflow: boolean
  /** 最近一次打印布局测量值，便于在开发者工具里核对分页判定 */
  debug: {
    /** 打印布局下的内容高度 */
    printHeight: number
    /** 屏幕布局下的内容高度 */
    screenHeight: number
    /** 打印 → 屏幕 的高度换算比例 */
    scale: number
  }
}

export const emptyPagination: PaginationState = {
  contentHeight: 0,
  pageCount: 1,
  breaks: [],
  sidebarHeight: 0,
  overflow: false,
  debug: { printHeight: 0, screenHeight: 0, scale: 1 }
}

interface MeasuredBlock {
  top: number
  bottom: number
}

function flattenBlocks(root: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = []
  for (const child of Array.from(root.children) as HTMLElement[]) {
    if (child.classList.contains('rs-stack--main') || child.classList.contains('rs-stack--side')) {
      result.push(...(Array.from(child.children) as HTMLElement[]))
    } else {
      result.push(child)
    }
  }
  return result
}

/** 把页面里所有样式表的规则拼成一段 CSS 文本（内联进测量用 iframe）
 *
 * document.styleSheets 不保证与文档顺序一致，而打印覆盖必须在模板样式之后，
 * 所以这里先收集内联的 <style>，再收集 <link> 引入的样式表。
 */
function collectCssText(): string {
  const fromInline: string[] = []
  const fromLinks: string[] = []

  const readSheet = (sheet: CSSStyleSheet | null, bucket: string[]): void => {
    if (!sheet) return
    try {
      for (const rule of Array.from(sheet.cssRules)) bucket.push(rule.cssText)
    } catch {
      // 跨域样式表读不到规则，跳过
    }
  }

  for (const node of Array.from(document.querySelectorAll('style'))) {
    readSheet(node.sheet as CSSStyleSheet | null, fromInline)
  }
  for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"]'))) {
    readSheet((node as HTMLLinkElement).sheet, fromLinks)
  }

  return [...fromInline, ...fromLinks].join('\n')
}

/**
 * 分页测量。
 *
 * 关键点：屏幕媒体与打印媒体的排版并不完全相同（行高取整、分页属性等），
 * 直接用屏幕布局推算页数会出现「预览 2 页、导出 1 页」这种偏差。
 * 因此这里把正文克隆进一个隐藏 iframe，让它在真实的打印样式下排版并测量，
 * 得到的页数与分页位置就是 PDF 会得到的结果。
 */
export function usePagination(
  docRef: React.RefObject<HTMLElement | null>,
  pageWidth: number,
  pageHeight: number,
  deps: unknown[]
): PaginationState {
  const [state, setState] = useState<PaginationState>(emptyPagination)
  const frameRef = useRef(0)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const ensureIframe = useCallback((): HTMLIFrameElement => {
    if (iframeRef.current && iframeRef.current.isConnected) return iframeRef.current
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.setAttribute('tabindex', '-1')
    iframe.style.cssText = [
      'position:fixed',
      'left:-100000px',
      'top:0',
      `width:${pageWidth}px`,
      'height:10px',
      'border:0',
      'visibility:hidden',
      'pointer-events:none'
    ].join(';')
    document.body.appendChild(iframe)
    iframeRef.current = iframe
    return iframe
  }, [pageWidth])

  const measure = useCallback(() => {
    const doc = docRef.current
    if (!doc) return

    const iframe = ensureIframe()
    const frameDoc = iframe.contentDocument
    const frameWindow = iframe.contentWindow
    if (!frameDoc || !frameWindow) return

    /* 重建 iframe 文档：所有样式都带 media="print"，让打印规则真正生效 */
    frameDoc.head.innerHTML = ''
    frameDoc.body.innerHTML = ''
    frameDoc.documentElement.setAttribute('lang', 'zh-CN')

    const cssText = collectCssText()
    // 直接把父文档的 CSS 规则内联进来：iframe 里加载外部样式表会被页面 CSP 拦住，
    // 内联规则既不受 CSP 限制，也能确定地按 media="print" 参与打印排版。
    // 同时再写一份不带 media 的副本，避免某些实现下 media="print" 不生效导致完全无样式。
    const printStyle = frameDoc.createElement('style')
    printStyle.setAttribute('media', 'print')
    printStyle.textContent = cssText
    frameDoc.head.appendChild(printStyle)

    const alwaysStyle = frameDoc.createElement('style')
    alwaysStyle.textContent = cssText
    frameDoc.head.appendChild(alwaysStyle)

    const screenStyle = frameWindow.getComputedStyle(doc)
    const clone = doc.cloneNode(true) as HTMLElement
    clone.style.minHeight = '0'
    clone.style.height = 'auto'
    for (const name of Array.from(screenStyle)) {
      if (!name.startsWith('--rs-')) continue
      const value = screenStyle.getPropertyValue(name).trim()
      if (value) clone.style.setProperty(name, value)
    }
    frameDoc.body.style.margin = '0'
    frameDoc.body.style.padding = '0'
    frameDoc.body.appendChild(clone)

    /* 测量 */
    const cloneTop = clone.getBoundingClientRect().top
    const sidebar = clone.querySelector<HTMLElement>('.rs-sidebar')
    const mainRoot = clone.querySelector<HTMLElement>('.rs-main') ?? clone
    const header = clone.querySelector<HTMLElement>('.rs-header')

    const blocks: MeasuredBlock[] = []
    const candidates: HTMLElement[] = []
    // 头部只参与高度统计，不作为可下移区块（避免把姓名挤到第二页）
    if (header) candidates.push(header)
    candidates.push(...flattenBlocks(mainRoot))

    for (const element of candidates) {
      const computed = frameWindow.getComputedStyle(element)
      if (computed.display === 'none' || computed.visibility === 'hidden') continue
      const rect = element.getBoundingClientRect()
      blocks.push({ top: rect.top, bottom: rect.bottom })
    }

    const contentBottom = blocks.reduce((max, block) => Math.max(max, block.bottom), cloneTop)
    const printHeight = Math.max(0, contentBottom - cloneTop)
    const cloneHeight = clone.getBoundingClientRect().height

    /* 分页推算 */
    const breaks: number[] = []
    let page = 1
    let nextThreshold = page * pageHeight
    const paginatable = blocks.slice(header ? 1 : 0)

    for (const block of paginatable) {
      const top = block.top - cloneTop
      const bottom = block.bottom - cloneTop
      const center = (top + bottom) / 2
      const crosses = bottom > nextThreshold && center < nextThreshold && bottom - top <= pageHeight

      if (crosses) {
        breaks.push(nextThreshold)
        page += 1
        nextThreshold = page * pageHeight
        continue
      }

      while (bottom > nextThreshold) {
        breaks.push(nextThreshold)
        page += 1
        nextThreshold = page * pageHeight
      }
    }

    const measuredHeight = Math.max(printHeight, cloneHeight)
    const pageCount = Math.max(
      1,
      breaks.length + 1,
      Math.ceil(measuredHeight / pageHeight - 1e-6)
    )
    while (breaks.length < pageCount - 1) {
      breaks.push((breaks.length + 1) * pageHeight)
    }
    breaks.sort((a, b) => a - b)

    // 分页位置用高度比例映射回屏幕坐标：打印与屏幕行高略有差异，
    // 直接套用会让参考线偏移，按比例换算能落在正确的视觉位置上。
    const screenHeight = Math.max(doc.getBoundingClientRect().height, pageHeight)
    const scale = measuredHeight > 0 ? screenHeight / measuredHeight : 1
    const mappedBreaks = breaks.map((position) => position * scale)

    setState({
      contentHeight: Math.max(pageHeight, measuredHeight * scale),
      pageCount,
      breaks: mappedBreaks,
      sidebarHeight: sidebar ? sidebar.getBoundingClientRect().height : 0,
      overflow: pageCount > 1,
      debug: {
        printHeight: Math.round(measuredHeight),
        screenHeight: Math.round(screenHeight),
        scale: Number(scale.toFixed(4))
      }
    })
  }, [docRef, ensureIframe, pageHeight])

  useLayoutEffect(() => {
    measure()
    // deps 由调用方提供（简历内容 / 令牌 / 模板 / 缩放），任一变化都重新测量
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    const onResize = () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(frameRef.current)
      if (iframeRef.current) {
        iframeRef.current.remove()
        iframeRef.current = null
      }
    }
  }, [measure])

  return state
}
