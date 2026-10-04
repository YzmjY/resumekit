import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * 打包后双击启动出现问题时，控制台是看不到的，因此把启动步骤写进一个日志文件。
 *
 * 默认关闭。打开方式：
 *   - 设置环境变量 RESUMEKIT_BOOT_LOG=1
 *
 * 日志位置：<APPDATA>/ResumeKit/boot.log
 */
let target: string | null = null
let resolved = false

function resolveTarget(): string | null {
  if (resolved) return target
  resolved = true
  if (process.env.RESUMEKIT_BOOT_LOG !== '1') return null
  try {
    // 刻意不依赖 electron：启动最早期就要能用，避免引入循环依赖
    const base = process.env.APPDATA ?? process.env.XDG_CONFIG_HOME ?? process.env.HOME ?? process.cwd()
    const dir = path.join(base, 'ResumeKit')
    mkdirSync(dir, { recursive: true })
    target = path.join(dir, 'boot.log')
  } catch {
    target = null
  }
  return target
}

/** 记录一条启动日志；未开启时是空操作，不产生任何 I/O */
export function bootLog(step: string, detail?: unknown): void {
  const file = resolveTarget()
  if (!file) return
  let line = `[${new Date().toISOString()}] ${step}`
  if (detail !== undefined) {
    try {
      line += ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
    } catch {
      line += ' [无法序列化]'
    }
  }
  try {
    appendFileSync(file, `${line}\n`)
  } catch {
    // 日志写入失败不能影响应用启动
  }
}
