import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { bootLog } from './boot-log'

/**
 * 自定义数据保存目录。
 *
 * 默认数据在 Electron 的 userData（Windows 即 %APPDATA%/ResumeKit）。
 * 用户可在「关于与更新」里把数据目录改到任意位置（例如便携版放在 U 盘、
 * 或同步盘里）。选择记录单独存放在默认 userData 下的设置文件里 ——
 * 启动时先读设置，再决定真正使用的数据目录；设置失效时静默回退默认目录，
 * 保证应用永远能启动。
 */

const SETTINGS_FILE = 'resumekit-settings.json'

function settingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

async function readCustomDataDir(): Promise<string | null> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const dir = (JSON.parse(raw) as { dataDir?: unknown }).dataDir
    if (typeof dir !== 'string' || !dir.trim()) return null
    return dir
  } catch {
    return null
  }
}

/** 目录可用 = 能创建且能写入文件 */
async function isUsableDir(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true })
    const probe = path.join(dir, `.probe-${process.pid}`)
    await fs.writeFile(probe, 'ok', 'utf8')
    await fs.unlink(probe)
    return true
  } catch {
    return false
  }
}

function sameDir(a: string, b: string): boolean {
  const ra = path.resolve(a)
  const rb = path.resolve(b)
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb
}

/** a 是否位于 b 内部（含相等） */
function isInside(a: string, b: string): boolean {
  const rel = path.relative(path.resolve(b), path.resolve(a))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** 启动时解析真正使用的数据目录：自定义设置有效则用之，否则回退默认 */
export async function resolveDataDir(): Promise<{ dir: string; custom: boolean }> {
  const fallback = app.getPath('userData')
  const custom = await readCustomDataDir()
  if (!custom || sameDir(custom, fallback)) return { dir: fallback, custom: false }
  if (!(await isUsableDir(custom))) {
    bootLog('自定义数据目录不可用，回退默认目录', { custom, fallback })
    return { dir: fallback, custom: false }
  }
  return { dir: custom, custom: true }
}

/**
 * 校验候选目录。返回 null 表示可用，否则返回错误原因。
 * 拒绝：与当前目录相同、位于当前目录内部（迁移时会递归复制自身）。
 * 选上级目录是允许的：复制按 resumes/media/exports 子目录逐个进行，不会递归。
 */
export async function validateDataDir(target: string, current: string): Promise<string | null> {
  if (sameDir(target, current)) return '新目录与当前数据目录相同'
  if (isInside(target, current)) return '不能把数据目录改成它自己的子目录'
  if (!(await isUsableDir(target))) return '该目录不可写，请换一个目录'
  return null
}

/** 把旧数据目录的内容复制到新目录（只复制，不删除旧数据） */
export async function migrateStoreData(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true })
  for (const name of ['resumes', 'media', 'exports']) {
    const src = path.join(from, name)
    const dst = path.join(to, name)
    try {
      await fs.cp(src, dst, { recursive: true, force: true })
    } catch {
      // 源子目录不存在（例如从未导出过 PDF）时跳过
    }
  }
}

export async function setCustomDataDir(dir: string): Promise<void> {
  const tmp = `${settingsPath()}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify({ dataDir: dir }, null, 2), 'utf8')
  await fs.rename(tmp, settingsPath())
}

export async function resetCustomDataDir(): Promise<void> {
  await fs.rm(settingsPath(), { force: true })
}
