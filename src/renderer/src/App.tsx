import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useResumeStore } from './store/useResumeStore'
import { PreviewPane } from './components/PreviewPane'
import { InspectorPane } from './components/Inspector'
import { SectionList } from './components/SectionEditor'
import { MetaForm } from './components/fields'
import { ImageCropper } from './components/ImageCropper'
import { UpdateCard } from './components/UpdateCard'
import { RELEASE_PAGE_URL } from '@shared/update'
import {
  IconChevron,
  IconCopy,
  IconDownload,
  IconFolder,
  IconImage,
  IconLayers,
  IconPlus,
  IconRedo,
  IconTrash,
  IconUndo
} from './components/icons'

interface Toast {
  kind: 'ok' | 'error' | 'info'
  text: string
  path?: string
  /** 导出成功时提供的「在文件夹中显示」目标 */
  reveal?: string
}

interface AppInfo {
  version: string
  dataDir: string
  defaultDataDir: string
  isCustomDataDir: boolean
}

/* ------------------------------------------------------------------ *
 * 折叠分组
 * ------------------------------------------------------------------ */

function Group({
  title,
  children,
  actions,
  defaultOpen = true
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="group">
      <div className="group__head" onClick={() => setOpen((value) => !value)}>
        <IconChevron size={12} className={`group__chevron${open ? ' group__chevron--open' : ''}`} />
        <span>{title}</span>
        {actions ? (
          <div className="group__head-actions" onClick={(event) => event.stopPropagation()}>
            {actions}
          </div>
        ) : null}
      </div>
      {open ? <div className="group__body">{children}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 简历库
 * ------------------------------------------------------------------ */

function Library({ notify }: { notify: (toast: Toast) => void }) {
  const index = useResumeStore((s) => s.index)
  const resume = useResumeStore((s) => s.resume)
  const openResume = useResumeStore((s) => s.openResume)
  const createResume = useResumeStore((s) => s.createResume)
  const duplicateResume = useResumeStore((s) => s.duplicateResume)
  const deleteResume = useResumeStore((s) => s.deleteResume)

  const entries = index?.entries ?? []

  return (
    <div className="library">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`library__item${entry.id === resume?.id ? ' library__item--active' : ''}`}
          onClick={() => void openResume(entry.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void openResume(entry.id)
          }}
        >
          <span className="library__thumb" />
          <span className="library__meta">
            <span className="library__name">{entry.name}</span>
            <span className="library__sub">
              {entry.template} · {new Date(entry.updatedAt).toLocaleString('zh-CN', { hour12: false })}
            </span>
          </span>
          <span className="library__actions">
            <button
              type="button"
              className="icon-btn"
              title="复制这份简历"
              onClick={(event) => {
                event.stopPropagation()
                void duplicateResume(entry.id)
                notify({ kind: 'info', text: '已复制一份简历' })
              }}
            >
              <IconCopy size={13} />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              title="删除这份简历"
              onClick={(event) => {
                event.stopPropagation()
                if (window.confirm(`确定删除「${entry.name}」？此操作不可撤销。`)) {
                  void deleteResume(entry.id)
                  notify({ kind: 'info', text: `已删除「${entry.name}」` })
                }
              }}
            >
              <IconTrash size={13} />
            </button>
          </span>
        </div>
      ))}

      <button
        type="button"
        className="btn btn--sm btn--block"
        style={{ marginTop: 6 }}
        onClick={() => {
          void createResume()
          notify({ kind: 'info', text: '已新建简历' })
        }}
      >
        <IconPlus size={13} /> 新建简历
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 基本信息（含头像）
 * ------------------------------------------------------------------ */

function MetaPanel({ notify }: { notify: (toast: Toast) => void }) {
  const resume = useResumeStore((s) => s.resume)
  const updateMeta = useResumeStore((s) => s.updateMeta)
  const setAvatar = useResumeStore((s) => s.setAvatar)
  const [cropSource, setCropSource] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!resume) return null

  const onPickFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify({ kind: 'error', text: '请选择图片文件（PNG / JPEG / WebP）' })
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      notify({ kind: 'error', text: '图片过大（超过 12MB），请先压缩' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => setCropSource(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => notify({ kind: 'error', text: '读取图片失败' })
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <MetaForm meta={resume.meta} onChange={updateMeta} />

      <div className="divider" />

      <div className="field__label" style={{ marginBottom: 8 }}>
        头像
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: resume.theme.avatar.shape === 'circle' ? '50%' : resume.theme.avatar.shape === 'rounded' ? 8 : 0,
            overflow: 'hidden',
            background: 'var(--ui-panel-3)',
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
            border: '1px solid var(--ui-border)'
          }}
        >
          {resume.meta.avatar ? (
            <img src={resume.meta.avatar} alt="头像预览" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <IconImage size={20} />
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto' }}>
          <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()}>
            {resume.meta.avatar ? '更换头像' : '上传头像'}
          </button>
          {resume.meta.avatar ? (
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                setAvatar('')
                notify({ kind: 'info', text: '已移除头像' })
              }}
            >
              移除头像
            </button>
          ) : (
            <span className="field__hint">支持 PNG / JPEG / WebP，上传后可裁剪与缩放。</span>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onPickFile(file)
          event.target.value = ''
        }}
      />

      {cropSource ? (
        <ImageCropper
          source={cropSource}
          initialShape={resume.theme.avatar.shape}
          onCancel={() => setCropSource(null)}
          onApply={(result) => {
            setAvatar(result.dataUrl)
            setCropSource(null)
            notify({ kind: 'ok', text: `头像已更新（${result.width}×${result.height}）` })
          }}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 左侧栏
 * ------------------------------------------------------------------ */

function LeftPane({
  notify,
  info
}: {
  notify: (toast: Toast) => void
  info: AppInfo | null
}) {
  const resume = useResumeStore((s) => s.resume)
  const renameResume = useResumeStore((s) => s.renameResume)
  const saveState = useResumeStore((s) => s.saveState)

  /** 换数据目录：主进程负责弹框、校验、迁移，成功后自动重启 */
  const changeDataDir = async () => {
    notify({ kind: 'info', text: '请在弹出的对话框中选择新的数据保存目录…' })
    const result = await window.api.chooseDataDir()
    if (result.ok) {
      notify({ kind: 'info', text: '数据已复制到新目录，应用即将重启…' })
    } else if (result.reason !== 'cancelled') {
      notify({ kind: 'error', text: `更换数据目录失败：${result.reason}` })
    }
  }

  /** 恢复默认数据目录（userData），成功后自动重启 */
  const resetDataDir = async () => {
    const result = await window.api.resetDataDir()
    if (result.ok) notify({ kind: 'info', text: '已恢复默认数据目录，应用即将重启…' })
  }

  if (!resume) return null

  return (
    <aside className="pane pane--left">
      <div className="pane__scroll">
        <Group title="简历库">
          <Library notify={notify} />
        </Group>

        <Group title="基本信息与头像">
          <MetaPanel notify={notify} />
        </Group>

        <Group title="内容栏目">
          <SectionList sections={resume.sections} />
        </Group>

        <div style={{ padding: '10px 14px 24px' }}>
          <div className="field">
            <label className="field__label">简历文件名</label>
            <input
              className="input"
              value={resume.name}
              onChange={(event) => renameResume(event.target.value)}
            />
            <div className="field__hint">
              导出 PDF 时用作默认文件名。当前状态：
              {saveState === 'saving' ? '正在保存…' : saveState === 'saved' ? '已自动保存' : saveState === 'error' ? '保存失败' : '已就绪'}
            </div>
          </div>
        </div>

        <Group title="关于与更新" defaultOpen={false}>
          <UpdateCard />
          <div className="divider" />
          <div className="field__hint">
            <div>版本 {info?.version ?? '—'}</div>
            <div style={{ marginTop: 4, wordBreak: 'break-all' }}>
              数据目录：{info?.dataDir ?? '—'}
              {info?.isCustomDataDir ? '（自定义）' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--sm" onClick={() => void changeDataDir()}>
              更改数据目录…
            </button>
            {info?.isCustomDataDir ? (
              <button type="button" className="btn btn--sm" onClick={() => void resetDataDir()}>
                恢复默认位置
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => void window.api.openExternal('https://github.com/YzmjY/resumekit')}
            >
              项目主页
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => void window.api.openExternal(RELEASE_PAGE_URL)}
            >
              版本历史
            </button>
          </div>
        </Group>
      </div>
    </aside>
  )
}

/* ------------------------------------------------------------------ *
 * 主应用
 * ------------------------------------------------------------------ */

export function App() {
  const resume = useResumeStore((s) => s.resume)
  const loading = useResumeStore((s) => s.loading)
  const error = useResumeStore((s) => s.error)
  const saveState = useResumeStore((s) => s.saveState)
  const scale = useResumeStore((s) => s.scale)
  const zoomMode = useResumeStore((s) => s.zoomMode)
  const setScale = useResumeStore((s) => s.setScale)
  const nudgeScale = useResumeStore((s) => s.nudgeScale)
  const setZoomMode = useResumeStore((s) => s.setZoomMode)
  const undo = useResumeStore((s) => s.undo)
  const redo = useResumeStore((s) => s.redo)
  const canUndo = useResumeStore((s) => s.past.length > 0)
  const canRedo = useResumeStore((s) => s.future.length > 0)
  const bootstrap = useResumeStore((s) => s.bootstrap)
  const saveNow = useResumeStore((s) => s.saveNow)

  const [toast, setToast] = useState<Toast | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [fitScale, setFitScale] = useState(1)

  const notify = useCallback((next: Toast) => setToast(next), [])

  useEffect(() => {
    void bootstrap()
    void window.api.info().then(setInfo)
  }, [bootstrap])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 4500)
    return () => clearTimeout(timer)
  }, [toast])

  /* 自适应模式下，scale 由预览区测算后回写 */
  const effectiveScale = zoomMode === 'fit' ? fitScale : scale

  const handleFitScale = useCallback(
    (next: number) => {
      setFitScale(next)
      setScale(next)
    },
    [setScale]
  )

  /* 快捷键：撤销/重做、导出、缩放 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        redo()
      } else if (key === 's') {
        event.preventDefault()
        void saveNow()
        notify({ kind: 'info', text: '已保存到本地' })
      } else if (key === 'e' || key === 'p') {
        event.preventDefault()
        window.dispatchEvent(new Event('rs:export'))
      } else if (key === 'c' && event.shiftKey) {
        event.preventDefault()
        window.dispatchEvent(new Event('rs:copy-image'))
      } else if (key === '=' || key === '+') {
        event.preventDefault()
        nudgeScale(1.1)
      } else if (key === '-') {
        event.preventDefault()
        nudgeScale(1 / 1.1)
      } else if (key === '0') {
        event.preventDefault()
        setZoomMode('fit')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, saveNow, nudgeScale, setZoomMode, notify])

  const statusText =
    saveState === 'saving'
      ? '正在保存…'
      : saveState === 'saved'
        ? '已自动保存'
        : saveState === 'error'
          ? '保存失败'
          : ''

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">R</span>
          ResumeKit
        </div>

        <div className="topbar__file">
          <button type="button" className="btn btn--icon" title="撤销 (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <IconUndo size={14} />
          </button>
          <button type="button" className="btn btn--icon" title="重做 (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
            <IconRedo size={14} />
          </button>
          <span className={`topbar__status${saveState === 'error' ? ' topbar__status--error' : ''}`}>{statusText}</span>
        </div>

        <div className="topbar__zoom">
          <button type="button" className="btn btn--ghost btn--icon" title="缩小 (Ctrl+-)" onClick={() => nudgeScale(1 / 1.1)}>
            −
          </button>
          <span className="topbar__zoom-value">{Math.round(effectiveScale * 100)}%</span>
          <button type="button" className="btn btn--ghost btn--icon" title="放大 (Ctrl+=)" onClick={() => nudgeScale(1.1)}>
            ＋
          </button>
          <button
            type="button"
            className={`btn btn--ghost btn--sm${zoomMode === 'fit' ? ' btn--primary' : ''}`}
            title="适应宽度 (Ctrl+0)"
            onClick={() => setZoomMode('fit')}
          >
            适应宽度
          </button>
        </div>

        <div className="topbar__spacer" style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn--icon"
            title="复制预览图到剪贴板（可直接粘进聊天窗口或文档）"
            onClick={() => window.dispatchEvent(new Event('rs:copy-image'))}
            disabled={!resume}
          >
            <IconLayers size={14} />
          </button>
          <button
            type="button"
            className="btn btn--icon"
            title={`数据目录：${info?.dataDir ?? ''}`}
            onClick={() => {
              if (info?.dataDir) {
                void window.api.showItem(info.dataDir)
              }
            }}
          >
            <IconFolder size={14} />
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.dispatchEvent(new Event('rs:export'))}
            disabled={!resume}
          >
            <IconDownload size={14} /> 导出 PDF
          </button>
        </div>
      </header>

      <div className="app__body">
        {loading ? (
          <aside className="pane pane--left">
            <div className="empty">
              <span className="spin" />
              <div style={{ marginTop: 10 }}>正在载入简历库…</div>
            </div>
          </aside>
        ) : (
          <LeftPane notify={notify} info={info} />
        )}

        {error ? (
          <div className="pane pane--center">
            <div className="empty">
              <div style={{ color: 'var(--ui-danger)', marginBottom: 8 }}>出错了</div>
              <div>{error}</div>
            </div>
          </div>
        ) : resume ? (
          <PreviewPane
            resume={resume}
            scale={effectiveScale}
            onFitScale={handleFitScale}
            onScaleChange={(next) => nudgeScale(next / effectiveScale)}
            onNotify={notify}
            onExported={(path) => setToast({ kind: 'ok', text: 'PDF 已导出', path, reveal: path })}
          />
        ) : (
          <div className="pane pane--center">
            <div className="preview__blank">
              <IconLayers size={28} />
              <div>还没有简历</div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  void useResumeStore.getState().createResume()
                }}
              >
                <IconPlus size={14} /> 新建一份简历
              </button>
            </div>
          </div>
        )}

        {resume ? <InspectorPane /> : null}
      </div>

      {toast ? (
        <div className={`toast toast--${toast.kind}`}>
          <span className="toast__text">{toast.text}</span>
          {toast.path ? <span className="toast__path">{toast.path}</span> : null}
          {toast.reveal ? (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                if (toast.reveal) void window.api.showItem(toast.reveal)
              }}
            >
              打开所在文件夹
            </button>
          ) : null}
          <button type="button" className="icon-btn" onClick={() => setToast(null)} title="关闭">
            ×
          </button>
        </div>
      ) : null}
    </div>
  )
}
