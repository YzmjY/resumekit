import electronUpdater from 'electron-updater'
import { app } from 'electron'
import { bootLog } from './boot-log'
import {
  UPDATE_MISSING_MANIFEST_MESSAGE,
  UPDATE_UNSUPPORTED_REASONS,
  type UpdateState,
  type UpdateSupport,
  type UpdateUnsupportedReason
} from '@shared/update'

/**
 * 自动更新。
 *
 * 依赖 electron-builder 生成的 app-update.yml（打包时写入 resources），
 * 该文件由 package.json 的 build.publish 推导而来，所以不要调用 setFeedURL。
 *
 * ESM 兼容：electron-updater 是 CommonJS 包，具名导入在 ESM 下不可靠，
 * 必须从默认导出上解构，这是官方给出的写法。
 */
const { autoUpdater } = electronUpdater

/** 「发现更新后自动下载」——但安装时机交给用户确认，不打断当前工作 */
autoUpdater.autoDownload = true
/** 用户选择「退出时安装」之后，即使没点重启按钮也会在退出时装上 */
autoUpdater.autoInstallOnAppQuit = true

/**
 * 更新源上找不到版本清单时的兜底版本。
 *
 * 起因：0.1.0 发布时还没有 publish 配置，Release 里既没有 latest.yml，
 * 也没有可供 electron-updater 使用的更新元数据；那些用户永远收不到提示。
 * 从 0.1.1 起才有完整更新链路，所以只要服务端最新版达到这个哨兵版本，
 * 就打开一次性跨版本通道（allowDowngrade 会让 electron-updater 接受
 * 「非新于当前版本」的更新，从而把 0.1.0 的用户也带上来）。
 */
const CROSS_VERSION_SENTINEL = '0.1.1'
const UPDATE_INFO_URL = 'https://github.com/YzmjY/resumekit/releases/latest/download/latest.yml'
const UPDATE_INFO_TIMEOUT_MS = 12000

/* ------------------------------------------------------------------ *
 * 可更新性判断
 * ------------------------------------------------------------------ */

/**
 * 比较两个语义化版本号，返回 -1 / 0 / 1。
 * 只处理 x.y.z 形式，忽略预发布后缀以外的复杂情况。
 */
function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0)

  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

/**
 * 读取服务端最新版本号，用于判断是否需要打开跨版本通道。
 * 失败不影响正常更新流程，返回 null 即可。
 */
async function fetchLatestServerVersion(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPDATE_INFO_TIMEOUT_MS)
    const response = await fetch(UPDATE_INFO_URL, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
      redirect: 'follow'
    })
    clearTimeout(timer)
    if (!response.ok) {
      bootLog('updater/sentinel-probe', { ok: false, status: response.status })
      return null
    }
    const text = await response.text()
    const match = /^version:\s*(\S+)/m.exec(text)
    const version = match ? match[1] : null
    bootLog('updater/sentinel-probe', { ok: true, version })
    return version
  } catch (error) {
    bootLog('updater/sentinel-probe', {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}

/**
 * 免安装版（portable）无法自我更新：electron-builder 不会为它生成
 * latest.yml，且运行目录往往在 U 盘或下载目录里。必须在界面上说明白，
 * 而不是让用户点一个永远失败的按钮。
 */
export function detectSupport(): UpdateSupport {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  const portableFile = process.env.PORTABLE_EXECUTABLE_FILE

  if (!app.isPackaged) {
    return { supported: false, reason: 'development' }
  }
  if (portableDir || portableFile) {
    return { supported: false, reason: 'portable' }
  }
  return { supported: true, reason: null }
}

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  progress: null,
  bytesPerSecond: null,
  transferred: null,
  total: null,
  message: null,
  checkedAt: null,
  support: { supported: true, reason: null }
}

type Listener = (next: UpdateState) => void
const listeners = new Set<Listener>()

function publish(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) {
    try {
      listener(state)
    } catch {
      // 订阅者异常不能影响更新流程
    }
  }
}

export function getUpdateState(): UpdateState {
  return state
}

export function onUpdateState(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  // 最常见的两种情况给出可读解释，而不是把英文栈丢给用户
  if (/404|Cannot find latest|ENOENT.*latest/i.test(raw)) {
    return `${UPDATE_MISSING_MANIFEST_MESSAGE}（${raw}）`
  }
  if (/net::|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|socket hang up/i.test(raw)) {
    return `网络不可用，稍后会自动重试（${raw}）`
  }
  return raw
}

/* ------------------------------------------------------------------ *
 * 事件接线
 * ------------------------------------------------------------------ */

let wired = false

function wire(): void {
  if (wired) return
  wired = true

  autoUpdater.logger = {
    info: (message?: unknown) => bootLog('updater/info', message),
    warn: (message?: unknown) => bootLog('updater/warn', message),
    error: (message?: unknown) => bootLog('updater/error', message),
    debug: (message?: unknown) => bootLog('updater/debug', message)
  }

  // 0.1.0 的 Release 缺少 latest.yml，其用户默认收不到更新。
  // 这里在确认服务端已具备更新链路后，打开一次跨版本通道。
  void applyCrossVersionFallback()

  autoUpdater.on('checking-for-update', () => {
    publish({ status: 'checking', message: null })
  })

  autoUpdater.on('update-available', (info) => {
    bootLog('updater/update-available', { version: info?.version })
    publish({
      status: 'downloading',
      availableVersion: info?.version ?? null,
      progress: 0,
      message: null
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    publish({
      status: 'up-to-date',
      availableVersion: null,
      progress: null,
      bytesPerSecond: null,
      transferred: null,
      total: null,
      message: null,
      checkedAt: Date.now(),
      // 顺带记录服务端最新版本，便于排查「为什么没提示更新」
      latestVersion: info?.version ?? null
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    publish({
      status: 'downloading',
      progress: typeof progress?.percent === 'number' ? Math.round(progress.percent * 10) / 10 : null,
      bytesPerSecond: progress?.bytesPerSecond ?? null,
      transferred: progress?.transferred ?? null,
      total: progress?.total ?? null
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    bootLog('updater/update-downloaded', { version: info?.version })
    publish({
      status: 'downloaded',
      availableVersion: info?.version ?? state.availableVersion,
      progress: 100,
      message: null
    })
  })

  autoUpdater.on('update-cancelled', () => {
    publish({ status: 'idle', progress: null, message: '更新下载已取消' })
  })

  autoUpdater.on('error', (error) => {
    bootLog('updater/error-event', { message: error?.message })
    publish({
      status: 'error',
      progress: null,
      message: describeError(error),
      checkedAt: Date.now()
    })
  })
}

/* ------------------------------------------------------------------ *
 * 对外动作
 * ------------------------------------------------------------------ */

let inFlight = false
let crossVersionChecked = false

/**
 * 打开跨版本通道。
 *
 * 只在「当前版本早于哨兵版本」且「服务端已经具备更新清单」时开启：
 * allowDowngrade 会让 electron-updater 接受并非严格更新的版本，
 * 因此绝不能长期打开，否则用户可能被推回旧版本。
 */
async function applyCrossVersionFallback(): Promise<void> {
  if (crossVersionChecked) return
  crossVersionChecked = true

  if (compareVersions(app.getVersion(), CROSS_VERSION_SENTINEL) >= 0) return

  const serverVersion = await fetchLatestServerVersion()
  if (!serverVersion) return
  if (compareVersions(serverVersion, CROSS_VERSION_SENTINEL) < 0) return

  autoUpdater.allowDowngrade = true
  bootLog('updater/cross-version-enabled', {
    current: app.getVersion(),
    server: serverVersion,
    sentinel: CROSS_VERSION_SENTINEL
  })
}

/** 检查更新；自动下载由 autoDownload 接管 */
export async function checkForUpdates(manual = false): Promise<UpdateState> {
  const support = detectSupport()
  publish({ support })

  if (!support.supported) {
    publish({
      status: 'unsupported',
      message: UPDATE_UNSUPPORTED_REASONS[support.reason as UpdateUnsupportedReason],
      checkedAt: Date.now()
    })
    return state
  }

  if (inFlight) {
    // 已有检查在进行：不重复请求，也不覆盖当前进度
    return state
  }

  wire()
  inFlight = true
  try {
    if (manual) publish({ status: 'checking', message: null })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    bootLog('updater/check-failed', { message: error instanceof Error ? error.message : String(error) })
    publish({
      status: 'error',
      progress: null,
      message: describeError(error),
      checkedAt: Date.now()
    })
  } finally {
    inFlight = false
  }

  return state
}

/** 下载完成后重启并安装 */
export function installUpdate(): boolean {
  if (state.status !== 'downloaded') return false
  bootLog('updater/quitAndInstall')
  // isSilent=false 让用户能看到安装进度；isForceRunAfter=true 装完自动拉起
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return true
}

/* ------------------------------------------------------------------ *
 * 启动时检查 + 定时轮询
 * ------------------------------------------------------------------ */

const STARTUP_DELAY_MS = 5000
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000

let timers: ReturnType<typeof setTimeout>[] = []

export function startAutoUpdate(): void {
  const support = detectSupport()
  publish({ support })
  bootLog('updater/start', { supported: support.supported, reason: support.reason, version: app.getVersion() })

  if (!support.supported) {
    publish({ status: 'unsupported', message: UPDATE_UNSUPPORTED_REASONS[support.reason as UpdateUnsupportedReason] })
    return
  }

  // 延后启动检查：不与首屏渲染、简历库加载抢网络与主线程
  timers.push(
    setTimeout(() => {
      void checkForUpdates(false)
    }, STARTUP_DELAY_MS)
  )

  const poll = setInterval(() => {
    void checkForUpdates(false)
  }, POLL_INTERVAL_MS)
  // 后台轮询不应阻止进程退出
  if (typeof poll.unref === 'function') poll.unref()
  timers.push(poll as unknown as ReturnType<typeof setTimeout>)
}

export function stopAutoUpdate(): void {
  for (const timer of timers) {
    clearTimeout(timer)
    clearInterval(timer as unknown as ReturnType<typeof setInterval>)
  }
  timers = []
}
