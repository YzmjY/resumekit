import { useCallback, useEffect, useRef, useState } from 'react'
import type { AvatarShape } from '@shared/resume'
import { IconClose } from './icons'

export interface CropResult {
  dataUrl: string
  width: number
  height: number
}

interface ImageCropperProps {
  /** 待裁剪图片的 data URL */
  source: string
  initialShape: AvatarShape
  onCancel: () => void
  onApply: (result: CropResult) => void
}

const STAGE_HEIGHT = 300
const MAX_OUTPUT = 560
const STAGE_PADDING = 12
const MIN_ZOOM = 1
const MAX_ZOOM = 4

/**
 * 头像裁剪器：在 canvas 上手动绘制，不依赖任何第三方图形库。
 * 支持拖拽平移、滚轮/滑杆缩放，输出正方形（圆形/圆角在模板中由 CSS 裁切）。
 */
export function ImageCropper({ source, initialShape, onCancel, onApply }: ImageCropperProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const [ready, setReady] = useState(false)
  const [stageWidth, setStageWidth] = useState(520)
  const [shape, setShape] = useState<AvatarShape>(initialShape === 'square' ? 'square' : initialShape)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const dragState = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  /* 舞台宽度随窗口变化 */
  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setStageWidth(element.clientWidth))
    observer.observe(element)
    setStageWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  /* 加载图片 */
  useEffect(() => {
    setReady(false)
    const image = new Image()
    image.onload = () => {
      imageRef.current = image
      setReady(true)
    }
    image.src = source
    return () => {
      imageRef.current = null
    }
  }, [source])

  const frameSize = Math.max(80, Math.min(stageWidth - STAGE_PADDING * 2, STAGE_HEIGHT - STAGE_PADDING * 2))
  const frameLeft = (stageWidth - frameSize) / 2

  /** 图片在舞台上的基准显示尺寸（cover 到裁剪框） */
  const baseSize = useCallback((): { w: number; h: number } => {
    const image = imageRef.current
    if (!image) return { w: frameSize, h: frameSize }
    const scale = Math.max(frameSize / image.naturalWidth, frameSize / image.naturalHeight)
    return { w: image.naturalWidth * scale, h: image.naturalHeight * scale }
  }, [frameSize])

  /** 绘制画布 */
  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !ready) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(stageWidth * dpr)
    canvas.height = Math.round(STAGE_HEIGHT * dpr)
    canvas.style.width = `${stageWidth}px`
    canvas.style.height = `${STAGE_HEIGHT}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, stageWidth, STAGE_HEIGHT)

    const base = baseSize()
    const w = base.w * zoom
    const h = base.h * zoom
    const cx = stageWidth / 2 + offset.x
    const cy = STAGE_HEIGHT / 2 + offset.y
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, cx - w / 2, cy - h / 2, w, h)
  }, [ready, stageWidth, zoom, offset, baseSize])

  /* 平移 */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragState.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    if (!drag) return
    setOffset({ x: drag.ox + (event.clientX - drag.x), y: drag.oy + (event.clientY - drag.y) })
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // 指针已释放
      }
    }
    dragState.current = null
    setDragging(false)
  }

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!ready) return
    event.preventDefault()
    const next = zoom - event.deltaY * 0.0016
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)))
  }

  /* 输出裁剪结果 */
  const apply = () => {
    const image = imageRef.current
    if (!image) return

    const base = baseSize()
    const displayedW = base.w * zoom
    const scaleToSource = image.naturalWidth / displayedW

    // 裁剪框左上角在「显示坐标」中的位置
    const frameDisplayLeft = frameLeft
    const frameDisplayTop = (STAGE_HEIGHT - frameSize) / 2
    const imageDisplayLeft = stageWidth / 2 + offset.x - displayedW / 2
    const imageDisplayTop = STAGE_HEIGHT / 2 + offset.y - (base.h * zoom) / 2

    const sourceX = (frameDisplayLeft - imageDisplayLeft) * scaleToSource
    const sourceY = (frameDisplayTop - imageDisplayTop) * scaleToSource
    const sourceSize = frameSize * scaleToSource

    const output = Math.min(MAX_OUTPUT, Math.round(sourceSize))
    const canvas = document.createElement('canvas')
    canvas.width = output
    canvas.height = output
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, output, output)
    ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, output, output)

    onApply({ dataUrl: canvas.toDataURL('image/png'), width: output, height: output })
  }

  const frameStyle: React.CSSProperties = {
    left: frameLeft,
    top: (STAGE_HEIGHT - frameSize) / 2,
    width: frameSize,
    height: frameSize,
    borderRadius: shape === 'circle' ? '50%' : shape === 'rounded' ? '14%' : '0'
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="裁剪头像">
      <div className="modal__box">
        <div className="modal__head">
          裁剪头像
          <span className="badge">拖动平移 · 滚轮缩放</span>
          <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onCancel} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <div className="modal__body">
          <div className="cropper">
            <div
              ref={stageRef}
              className={`cropper__stage${dragging ? ' cropper__stage--dragging' : ''}`}
              style={{ height: STAGE_HEIGHT }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onWheel={onWheel}
            >
              <canvas ref={canvasRef} className="cropper__canvas" />
              <div
                className={`cropper__frame${shape === 'circle' ? ' cropper__frame--circle' : ''}`}
                style={frameStyle}
              />
            </div>

            <div className="cropper__controls">
              <div className="slider-field">
                <div className="slider-field__top">
                  <span className="slider-field__label">缩放</span>
                  <span className="slider-field__value">{zoom.toFixed(2)}×</span>
                </div>
                <input
                  className="range"
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </div>

              <div className="cropper__shapes">
                {(
                  [
                    ['circle', '圆形'],
                    ['rounded', '圆角'],
                    ['square', '方形']
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip${shape === value ? ' chip--active' : ''}`}
                    onClick={() => setShape(value)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn--sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => {
                    setZoom(1)
                    setOffset({ x: 0, y: 0 })
                  }}
                >
                  重置
                </button>
              </div>

              <div className="field__hint">
                裁剪结果会以 {MAX_OUTPUT}px 以内的正方形 PNG 存入简历文件，导出 PDF 时按模板设定的尺寸与形状显示。
              </div>
            </div>
          </div>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn--primary" onClick={apply} disabled={!ready}>
            应用裁剪
          </button>
        </div>
      </div>
    </div>
  )
}
