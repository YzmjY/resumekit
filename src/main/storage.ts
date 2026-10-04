import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createStarterResume } from '@shared/samples'
import { makeId } from '@shared/ids'
import type { Resume, ResumeIndex, ResumeIndexEntry } from '@shared/resume'

const INDEX_FILE = 'index.json'
const INDEX_VERSION = 1

/**
 * 简历库存储：每份简历一个 JSON 文件，外加一个索引。
 * 采用「写临时文件 + 原子重命名」，避免写到一半断电导致档案损坏。
 */
export class ResumeStore {
  private readonly dir: string
  private readonly mediaDir: string

  constructor(private readonly baseDir: string) {
    this.dir = path.join(baseDir, 'resumes')
    this.mediaDir = path.join(baseDir, 'media')
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    await fs.mkdir(this.mediaDir, { recursive: true })
  }

  private indexPaths(): string {
    return path.join(this.dir, INDEX_FILE)
  }

  private resumePath(id: string): string {
    return path.join(this.dir, `${id}.json`)
  }

  private async writeJson(file: string, data: unknown): Promise<void> {
    const tmp = `${file}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.rename(tmp, file)
  }

  async readIndex(): Promise<ResumeIndex> {
    try {
      const raw = await fs.readFile(this.indexPaths(), 'utf8')
      const parsed = JSON.parse(raw) as ResumeIndex
      if (!parsed || !Array.isArray(parsed.entries)) throw new Error('索引结构无效')
      return {
        version: typeof parsed.version === 'number' ? parsed.version : INDEX_VERSION,
        entries: parsed.entries.filter((e) => e && typeof e.id === 'string'),
        lastOpenedId: parsed.lastOpenedId ?? null
      }
    } catch {
      // 首次启动或索引损坏：重建索引，尽量保留磁盘上已有的简历文件
      const entries = await this.rebuildIndexFromDisk()
      const index: ResumeIndex = { version: INDEX_VERSION, entries, lastOpenedId: null }
      await this.writeJson(this.indexPaths(), index)
      return index
    }
  }

  private async rebuildIndexFromDisk(): Promise<ResumeIndexEntry[]> {
    let files: string[] = []
    try {
      files = await fs.readdir(this.dir)
    } catch {
      return []
    }
    const entries: ResumeIndexEntry[] = []
    for (const file of files) {
      if (!file.endsWith('.json') || file === INDEX_FILE) continue
      try {
        const resume = JSON.parse(await fs.readFile(path.join(this.dir, file), 'utf8')) as Resume
        if (!resume?.id) continue
        const stat = await fs.stat(path.join(this.dir, file))
        entries.push({
          id: resume.id,
          name: resume.name || '未命名简历',
          template: resume.template,
          createdAt: stat.birthtimeMs || stat.mtimeMs,
          updatedAt: stat.mtimeMs
        })
      } catch {
        // 单个文件损坏不影响其余档案
      }
    }
    return entries.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  private async writeIndex(index: ResumeIndex): Promise<void> {
    await this.writeJson(this.indexPaths(), index)
  }

  /** 供主进程直接改写索引（例如记住上次打开的简历） */
  async saveIndex(index: ResumeIndex): Promise<void> {
    await this.writeIndex(index)
  }

  async readResume(id: string): Promise<Resume> {
    const raw = await fs.readFile(this.resumePath(id), 'utf8')
    return JSON.parse(raw) as Resume
  }

  /** 保存简历并同步索引；返回更新后的索引条目 */
  async saveResume(resume: Resume): Promise<ResumeIndexEntry> {
    if (!resume || typeof resume.id !== 'string' || !resume.id) {
      throw new Error('简历数据缺少 id，拒绝保存')
    }
    await this.writeJson(this.resumePath(resume.id), resume)

    const index = await this.readIndex()
    const now = Date.now()
    const existing = index.entries.find((e) => e.id === resume.id)
    const entry: ResumeIndexEntry = {
      id: resume.id,
      name: resume.name || '未命名简历',
      template: resume.template,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    const others = index.entries.filter((e) => e.id !== resume.id)
    index.entries = [entry, ...others].sort((a, b) => b.updatedAt - a.updatedAt)
    index.lastOpenedId = resume.id
    await this.writeIndex(index)
    return entry
  }

  async deleteResume(id: string): Promise<ResumeIndex> {
    try {
      await fs.unlink(this.resumePath(id))
    } catch {
      // 文件不存在也视为删除成功
    }
    const index = await this.readIndex()
    index.entries = index.entries.filter((e) => e.id !== id)
    if (index.lastOpenedId === id) index.lastOpenedId = index.entries[0]?.id ?? null
    await this.writeIndex(index)
    return index
  }

  /** 复制一份简历，名字追加「副本」 */
  async duplicateResume(id: string): Promise<Resume> {
    const source = await this.readResume(id)
    const copy: Resume = JSON.parse(JSON.stringify(source))
    copy.id = makeId('resume')
    copy.name = `${source.name || '未命名简历'} 副本`
    copy.sections = copy.sections.map((section) => ({
      ...section,
      id: makeId('sec'),
      items: section.items.map((item) => ({ ...item, id: makeId('item') }))
    }))
    await this.saveResume(copy)
    return copy
  }

  /** 首次启动时创建一份可立刻导出的示例简历 */
  async createStarter(): Promise<Resume> {
    const resume = createStarterResume()
    await this.saveResume(resume)
    return resume
  }

  /** 保存头像资源，返回可被 <img src> 直接使用的 data URL */
  async saveAvatar(dataUrl: string): Promise<string> {
    if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(dataUrl)) {
      throw new Error('头像格式不受支持，需要 PNG/JPEG/WebP 的 data URL')
    }
    if (dataUrl.length > 12 * 1024 * 1024) {
      throw new Error('头像文件过大（超过约 9MB），请换一张更小的图片')
    }
    return dataUrl
  }

  /** 导出 PDF 的默认目录：放在应用数据目录下的 exports 子目录，方便查找 */
  exportDir(): string {
    return path.join(this.baseDir, 'exports')
  }

  mediaDirectory(): string {
    return this.mediaDir
  }
}
