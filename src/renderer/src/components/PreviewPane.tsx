import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ExportPdfRequest, Resume } from '@shared/resume'
import { A4_HEIGHT_PX, A4_WIDTH_PX } from '@shared/resume'
import { themeToCssVars } from '@shared/theme'
import { renderResume } from '../templates'
import { usePagination } from './usePagination'
import { canvasToPngBlob, findCrossOriginImages, rasterizeElement } from '../lib/canvas-export'

interface PreviewPaneProps {
  resume: Resume
  /** 已经确定好的最终缩放比例 */
  scale: number
  onFitScale: (scale: number) => void
  onScaleChange: (scale: number) => void
  onNotify: (message: { kind: 'ok' | 'error' | 'info'; text: string; path?: string }) => void
  onExported: (path: string) => void
}

const PAGE_W = A4_WIDTH_PX
const PAGE_H = A4_HEIGHT_PX

/** 把主题令牌拆成可直接写在元素 style 上的 CSS 变量对象 */
function cssVarsToStyle(cssVars: string): CSSProperties {
  const style: Record<string, string> = {}
  for (const line of cssVars.split('\n')) {
    const trimmed = line.trim().replace(/;$/, '')
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon < 0) continue
    const name = trimmed.slice(0, colon).trim()
    const value = trimmed.slice(colon + 1).trim()
    if (name.startsWith('--')) style[name] = value
  }
  return style as CSSProperties
}

/**
 * A4 预览：屏幕上渲染的 DOM 与导出 PDF 用的是同一套模板和样式，
 * 因此这里看到的分页位置就是 PDF 的落点。
 */
export function PreviewPane({ resume, scale, onFitScale, onScaleChange, onNotify, onExported }: PreviewPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const fitScaleRef = useRef(1)
  const [exporting, setExporting] = useState(false)

  /* 自适应缩放：按可用宽度计算，留白取自实际计算样式 */
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const compute = () => {
      const style = getComputedStyle(element)
      const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const available = element.clientWidth - paddingX
      const next = Math.min(1.35, Math.max(0.3, available / PAGE_W))
      // 只在真正变化时回写，避免 ResizeObserver 与状态更新互相触发
      if (Math.abs(next - fitScaleRef.current) > 0.002) {
        fitScaleRef.current = next
        onFitScale(Number(next.toFixed(3)))
      }
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(element)
    return () => observer.disconnect()
  }, [onFitScale])

  const cssVars = useMemo(() => themeToCssVars(resume.theme), [resume.theme])
  const varStyle = useMemo(() => {
    const base = cssVarsToStyle(cssVars) as Record<string, string>
    base['--rs-page-width'] = `${PAGE_W}px`
    base['--rs-page-height'] = `${PAGE_H}px`
    return base as CSSProperties
  }, [cssVars])

  const rendered = useMemo(() => renderResume(resume), [resume])

  const pagination = usePagination(docRef, PAGE_W, PAGE_H, [
    resume.sections,
    resume.template,
    resume.theme,
    resume.meta,
    scale
  ])

  /* 双栏模板：把所有页的侧栏背景拉通 */
  useLayoutEffect(() => {
    const doc = docRef.current
    if (!doc) return
    const sidebar = doc.querySelector<HTMLElement>('.rs-sidebar')
    if (!sidebar) return
    sidebar.style.minHeight =
      pagination.pageCount > 1 && pagination.sidebarHeight > 0 ? `${pagination.contentHeight}px` : ''
  }, [pagination.pageCount, pagination.sidebarHeight, pagination.contentHeight, rendered])
  /* Ctrl/⌘ + 滚轮缩放 */
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      onScaleChange(scale - event.deltaY * 0.0015)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [scale, onScaleChange])

  const handleExport = useCallback(async () => {
    const doc = docRef.current
    if (!doc) return
    setExporting(true)
    try {
      // 导出前先落盘，保证 PDF 与档案一致
      await window.api.save(resume)
      const request: ExportPdfRequest = {
        html: doc.innerHTML,
        cssVars,
        suggestedName: `${resume.name}-${resume.meta.name || '简历'}`,
        pageSize: 'A4'
      }
      const result = await window.api.exportPdf(request)
      if (result.ok) {
        onNotify({ kind: 'ok', text: 'PDF 已导出', path: result.path })
        onExported(result.path)
      } else if ('canceled' in result && result.canceled) {
        onNotify({ kind: 'info', text: '已取消导出' })
      } else {
        onNotify({ kind: 'error', text: `导出失败：${'error' in result ? result.error : '未知错误'}` })
      }
    } catch (error) {
      onNotify({ kind: 'error', text: `导出失败：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setExporting(false)
    }
  }, [resume, cssVars, onNotify, onExported])

  /* 顶栏的导出按钮通过事件驱动这里，避免把 DOM 引用提到 App */
  useEffect(() => {
    const handler = () => void handleExport()
    window.addEventListener('rs:export', handler)
    return () => window.removeEventListener('rs:export', handler)
  }, [handleExport])

  const handleCopyImage = useCallback(async () => {
    const doc = docRef.current
    if (!doc) return
    try {
      const offenders = findCrossOriginImages(doc)
      if (offenders.length > 0) {
        onNotify({ kind: 'error', text: `有 ${offenders.length} 张外部图片无法写入图片，请改用 PDF 导出` })
        return
      }
      const { canvas, width, height } = await rasterizeElement(doc, { scale: 2 })
      const blob = await canvasToPngBlob(canvas)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      onNotify({ kind: 'ok', text: `预览图已复制到剪贴板（${width}×${height}）` })
    } catch (error) {
      onNotify({
        kind: 'error',
        text: `复制图片失败：${error instanceof Error ? error.message : String(error)}`
      })
    }
  }, [onNotify])

  useEffect(() => {
    const handler = () => void handleCopyImage()
    window.addEventListener('rs:copy-image', handler)
    return () => window.removeEventListener('rs:copy-image', handler)
  }, [handleCopyImage])

  const stageHeight = Math.max(PAGE_H, pagination.contentHeight) * scale

  return (
    <div className="pane pane--center">
      <div className="preview" ref={scrollRef}>
        <div
          className="preview__stage"
          style={{ width: PAGE_W * scale, height: stageHeight }}
          data-rs-pagination={JSON.stringify({
            pageCount: pagination.pageCount,
            breaks: pagination.breaks.map((value) => Math.round(value)),
            ...pagination.debug
          })}
        >
          <div className="preview__papers">
            {Array.from({ length: pagination.pageCount }).map((_, index) => (
              <div
                key={index}
                className="preview__paper"
                style={{ top: index * PAGE_H * scale, width: PAGE_W * scale, height: PAGE_H * scale }}
              >
                <span className="preview__page-label">
                  {index + 1} / {pagination.pageCount}
                </span>
              </div>
            ))}
          </div>

          <div
            className="preview__content"
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: PAGE_W }}
          >
            <div ref={docRef} style={varStyle}>
              {rendered}
            </div>
          </div>

          {pagination.breaks.length > 0 ? (
            <div className="preview__guides">
              {pagination.breaks.map((position, index) => (
                <div className="preview__guide" key={index} style={{ top: position * scale }}>
                  <span>第 {index + 1} 页结束</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {exporting ? (
        <div className="preview__mask">
          <div className="preview__mask-inner">
            <span className="spin" />
            正在生成 PDF…
          </div>
        </div>
      ) : null}
    </div>
  )
}
