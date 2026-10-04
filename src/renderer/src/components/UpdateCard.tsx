import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { RELEASE_PAGE_URL, type UpdateState, type UpdateStatus } from '@shared/update'

/** 把字节数格式化成可读大小 */
function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** 把状态映射成界面上的一行主文案 */
function statusLabel(state: UpdateState): string {
  const { status, availableVersion, latestVersion } = state
  switch (status) {
    case 'unsupported':
      return '此版本不支持自动更新'
    case 'checking':
      return '正在检查更新…'
    case 'up-to-date':
      return latestVersion ? `已是最新版本（服务端 ${latestVersion}）` : '已是最新版本'
    case 'downloading':
      return availableVersion ? `正在下载 ${availableVersion}…` : '正在下载…'
    case 'downloaded':
      return availableVersion ? `${availableVersion} 已下载，可重启安装` : '更新已下载，可重启安装'
    case 'error':
      return '检查更新失败'
    default:
      return `当前版本 ${state.currentVersion}`
  }
}

const STATUS_TONE: Record<UpdateStatus, string> = {
  idle: 'update__dot',
  unsupported: 'update__dot update__dot--muted',
  checking: 'update__dot update__dot--busy',
  'up-to-date': 'update__dot update__dot--ok',
  downloading: 'update__dot update__dot--busy',
  downloaded: 'update__dot update__dot--ok',
  error: 'update__dot update__dot--error'
}

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}

export function UpdateCard(): JSX.Element {
  const [state, setState] = useState<UpdateState | null>(null)
  const [busy, setBusy] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.updateState().then((next) => {
      if (alive) setState(next)
    })
    // 主进程是唯一的状态源，这里只订阅
    const unsubscribe = window.api.onUpdateChanged((next) => {
      setState(next)
      setBusy(false)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const check = useCallback(async () => {
    setBusy(true)
    try {
      const next = await window.api.checkUpdate()
      setState(next)
    } finally {
      setBusy(false)
    }
  }, [])

  const install = useCallback(async () => {
    setInstalling(true)
    try {
      await window.api.installUpdate()
      // 安装会重启应用，这里不需要恢复状态
    } catch {
      setInstalling(false)
    }
  }, [])

  if (!state) {
    return (
      <div className="update">
        <div className="update__head">
          <span className="update__dot update__dot--muted" />
          正在读取更新状态…
        </div>
      </div>
    )
  }

  const { status, support, message, progress, bytesPerSecond, checkedAt } = state
  const canCheck = support.supported && status !== 'checking' && status !== 'downloading' && !busy
  const showProgress = status === 'downloading'

  return (
    <div className="update">
      <div className="update__head">
        <span className={STATUS_TONE[status]} />
        <span className="update__label">{statusLabel(state)}</span>
      </div>

      {showProgress ? (
        <>
          <div className="update__bar">
            <span style={{ width: `${progress ?? 0}%` }} />
          </div>
          <div className="update__meta">
            <span>{progress !== null ? `${progress}%` : '准备中'}</span>
            <span>
              {formatBytes(state.transferred)} / {formatBytes(state.total)}
            </span>
            <span>{formatBytes(bytesPerSecond)}/s</span>
          </div>
          <div className="field__hint">下载完成后会提示重启安装，期间可以继续编辑简历。</div>
        </>
      ) : null}

      {message ? <div className="update__message">{message}</div> : null}

      {checkedAt && status !== 'checking' && status !== 'downloading' ? (
        <div className="field__hint">
          上次检查：{new Date(checkedAt).toLocaleTimeString('zh-CN', TIME_FORMAT)}
        </div>
      ) : null}

      <div className="update__actions">
        {status === 'downloaded' ? (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void install()} disabled={installing}>
            {installing ? '正在重启…' : '重启并安装'}
          </button>
        ) : null}

        {support.supported ? (
          <button
            type="button"
            className={`btn btn--sm${status === 'downloaded' ? '' : ' btn--primary'}`}
            onClick={() => void check()}
            disabled={!canCheck}
          >
            {status === 'checking' ? '检查中…' : status === 'downloading' ? '下载中…' : '检查更新'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void window.api.openExternal(RELEASE_PAGE_URL)}
          >
            打开下载页面
          </button>
        )}
      </div>

      {!support.supported ? (
        <div className="field__hint">
          免安装版与开发模式不支持自我更新。安装版会在启动后自动检查，无需手动操作。
        </div>
      ) : (
        <div className="field__hint">
          启动后自动检查；发现新版本会后台下载，下载完成后由你决定何时重启安装。
        </div>
      )}
    </div>
  )
}
