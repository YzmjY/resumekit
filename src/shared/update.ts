/**
 * 自动更新的共享类型与文案。
 * 主进程负责推进状态，渲染进程只读；两端引用同一份定义，避免字符串漂移。
 */

export type UpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'error'

/** 不支持自动更新的原因 */
export type UpdateUnsupportedReason = 'development' | 'portable'

export interface UpdateSupport {
  supported: boolean
  reason: UpdateUnsupportedReason | null
}

export interface UpdateState {
  status: UpdateStatus
  /** 当前运行的版本 */
  currentVersion: string
  /** 服务端可用的版本（若有） */
  availableVersion: string | null
  /** 服务端最新版本，用于「已是最新」时说明比对对象 */
  latestVersion?: string | null
  /** 下载百分比 0-100 */
  progress: number | null
  bytesPerSecond: number | null
  transferred: number | null
  total: number | null
  /** 面向用户的说明文字（失败原因、不支持原因等） */
  message: string | null
  /** 最近一次检查完成的时间戳 */
  checkedAt: number | null
  support: UpdateSupport
}

/**
 * 不支持自动更新时的说明。
 * 免安装版无法自我更新是 electron-builder 的固有限制：它不会为 portable
 * 目标生成 latest.yml，也没有可替换的安装目录，所以必须引导用户去下载新版本。
 */
export const UPDATE_UNSUPPORTED_REASONS: Record<UpdateUnsupportedReason, string> = {
  development: '开发模式下不检查更新，请使用打包后的版本验证。',
  portable:
    '当前是免安装版，无法自我更新。请到 Release 页面下载新版本（安装版可以自动更新）。'
}

/**
 * 更新源上找不到 latest.yml 时的说明。
 * 这不是「不支持」而是「发布不完整」：electron-builder 只有带上 publish 配置
 * 才会生成 latest.yml，而发布时若没把它上传到 Release，客户端就会 404。
 */
export const UPDATE_MISSING_MANIFEST_MESSAGE =
  '更新源缺少版本清单 latest.yml：该版本发布时未上传更新元数据，请重新发布或改用安装新版本。'

export const RELEASE_PAGE_URL = 'https://github.com/YzmjY/resumekit/releases/latest'
