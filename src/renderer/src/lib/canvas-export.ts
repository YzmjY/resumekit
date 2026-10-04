/**
 * DOM → 2D canvas 光栅化。
 *
 * 用途：把预览里的简历导出成 PNG（写进剪贴板）。这样做不需要给主进程
 * 增加图片编码依赖，也不需要再走一次打印链路，成本最低。
 *
 * 已知取舍：外部图片（头像 data URL）与内联样式都能正确绘制；
 * 跨域图片与部分 CSS 效果（阴影、滤镜）不会出现在结果里，出图前会做一次
 * 「是否含跨域图片」的检查，避免静默产出缺图的文件。
 */

export interface RasterizeResult {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

export interface RasterizeOptions {
  /** 输出倍率，2 表示 2 倍像素密度 */
  scale?: number
  /** canvas 面积上限（像素平方），用于保护内存 */
  maxArea?: number
}

/** 收集文档里全部 CSS 规则，供 foreignObject 内的 SVG 使用 */
function collectCss(): string {
  const chunks: string[] = []
  const push = (sheet: CSSStyleSheet | null): void => {
    if (!sheet) return
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText)
    } catch {
      // 跨域样式表读不到规则
    }
  }
  for (const node of Array.from(document.querySelectorAll('style'))) {
    push((node as HTMLStyleElement).sheet)
  }
  for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"]'))) {
    push((node as HTMLLinkElement).sheet)
  }
  return chunks.join('\n')
}

/** 找出无法被光栅化的跨域图片，返回它们的地址 */
export function findCrossOriginImages(root: HTMLElement): string[] {
  const offenders: string[] = []
  for (const image of Array.from(root.querySelectorAll('img'))) {
    const src = image.getAttribute('src') ?? ''
    if (!src) continue
    if (src.startsWith('data:') || src.startsWith('blob:')) continue
    try {
      const url = new URL(src, document.baseURI)
      if (url.origin !== window.location.origin) offenders.push(src)
    } catch {
      offenders.push(src)
    }
  }
  return offenders
}

/**
 * 把元素画到 canvas 上。做法是把元素连同样式序列化进 SVG 的 foreignObject，
 * 再用 Image 解码后绘制——这是纯前端可行的通用方案。
 */
export async function rasterizeElement(
  element: HTMLElement,
  options: RasterizeOptions = {}
): Promise<RasterizeResult> {
  const rect = element.getBoundingClientRect()
  const width = Math.ceil(element.offsetWidth || rect.width)
  const height = Math.ceil(element.offsetHeight || rect.height)
  if (width <= 0 || height <= 0) throw new Error('要导出的内容尺寸为 0')

  const maxArea = options.maxArea ?? 40_000_000
  let scale = options.scale ?? 2
  while (width * scale * height * scale > maxArea && scale > 0.5) {
    scale -= 0.25
  }

  const clone = element.cloneNode(true) as HTMLElement
  clone.style.position = 'static'
  clone.style.margin = '0'
  clone.style.transform = 'none'
  clone.style.boxShadow = 'none'

  const css = collectCss()
  const serialized = new XMLSerializer().serializeToString(clone)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml">
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
${serialized}
</div>
</foreignObject>
</svg>`

  // 用 data URL 而不是 blob URL：blob URL 在 canvas 的「同源」判定里会被当作
  // 跨源资源，导致 toBlob/toDataURL 直接抛 TaintedCanvas 错误。
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('预览内容无法转换为图片'))
    img.src = `data:image/svg+xml;base64,${base64EncodeUtf8(svg)}`
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建绘图上下文')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  return { canvas, width: canvas.width, height: canvas.height }
}

/** UTF-8 安全的 base64 编码（btoa 只接受 latin1） */
function base64EncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

/** 生成 PNG 的 data URL */
export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

/** Promise 版 toBlob，便于写进系统剪贴板 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('无法把画布编码为 PNG'))
    }, 'image/png')
  })
}
