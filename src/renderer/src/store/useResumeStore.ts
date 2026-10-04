import { create } from 'zustand'
import type {
  Resume,
  ResumeIndex,
  ResumeIndexEntry,
  ResumeItem,
  ResumeMeta,
  ResumeSection,
  SectionKind,
  Theme
} from '@shared/resume'
import { A4_HEIGHT_PX, A4_WIDTH_PX } from '@shared/resume'
import { applyThemePatch, defaultTheme } from '@shared/theme'
import { getTemplateMeta } from '../templates/catalog'
import { createBlankSection, createSampleSection } from '@shared/samples'
import { emptyItem } from '@shared/ids'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Snapshot {
  resume: Resume
  label: string
}

interface ResumeStudioState {
  /* ---- 数据 ---- */
  index: ResumeIndex | null
  resume: Resume | null
  loading: boolean
  error: string | null
  saveState: SaveState

  /* ---- 历史 ---- */
  past: Snapshot[]
  future: Snapshot[]

  /* ---- 界面 ---- */
  zoomMode: 'fit' | 'manual'
  scale: number
  inspectorTab: 'template' | 'typography' | 'spacing' | 'layout' | 'colors' | 'sections'
  editingSectionId: string | null

  /* ---- 简历库操作 ---- */
  bootstrap: () => Promise<void>
  openResume: (id: string) => Promise<void>
  createResume: () => Promise<void>
  duplicateResume: (id: string) => Promise<void>
  deleteResume: (id: string) => Promise<void>
  renameResume: (name: string) => void
  saveNow: () => Promise<void>

  /* ---- 文档操作 ---- */
  patchResume: (patch: Partial<Pick<Resume, 'name' | 'template'>>, label: string) => void
  setTemplate: (templateId: string) => void
  resetThemeToTemplate: () => void
  setTheme: <K extends keyof Theme>(group: K, patch: Partial<Theme[K]>, label?: string) => void
  updateMeta: (patch: Partial<ResumeMeta>) => void
  setAvatar: (dataUrl: string) => void

  /* ---- 栏目与条目 ---- */
  addSection: (kind: SectionKind, withSample: boolean) => void
  removeSection: (sectionId: string) => void
  updateSection: (sectionId: string, patch: Partial<Omit<ResumeSection, 'id' | 'items'>>) => void
  moveSection: (sectionId: string, direction: -1 | 1) => void
  addItem: (sectionId: string) => void
  updateItem: (sectionId: string, itemId: string, patch: Partial<ResumeItem>) => void
  removeItem: (sectionId: string, itemId: string) => void
  moveItem: (sectionId: string, itemId: string, direction: -1 | 1) => void

  /* ---- 历史 ---- */
  undo: () => void
  redo: () => void

  /* ---- 界面 ---- */
  setZoomMode: (mode: 'fit' | 'manual') => void
  setScale: (scale: number) => void
  nudgeScale: (delta: number) => void
  setInspectorTab: (tab: ResumeStudioState['inspectorTab']) => void
  setEditingSection: (id: string | null) => void
}

/* ------------------------------------------------------------------ *
 * 自动保存
 * ------------------------------------------------------------------ */

const SAVE_DELAY = 450
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(get: () => ResumeStudioState, set: (partial: Partial<ResumeStudioState>) => void): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushSave(get, set)
  }, SAVE_DELAY)
}

async function flushSave(
  get: () => ResumeStudioState,
  set: (partial: Partial<ResumeStudioState>) => void
): Promise<void> {
  const { resume } = get()
  if (!resume) return
  set({ saveState: 'saving' })
  try {
    const entry = await window.api.save(resume)
    const current = get()
    if (!current.index) {
      set({ saveState: 'saved' })
      return
    }
    const entries: ResumeIndexEntry[] = [
      entry,
      ...current.index.entries.filter((e) => e.id !== entry.id)
    ].sort((a, b) => b.updatedAt - a.updatedAt)
    set({ index: { ...current.index, entries, lastOpenedId: resume.id }, saveState: 'saved' })
  } catch (error) {
    set({ saveState: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}

/** 立即落盘（切换简历、导出前、卸载时调用，避免丢最后一次编辑） */
async function flushPendingSave(
  get: () => ResumeStudioState,
  set: (partial: Partial<ResumeStudioState>) => void
): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    await flushSave(get, set)
  }
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

const HISTORY_LIMIT = 60

function withHistory(
  state: ResumeStudioState,
  resume: Resume,
  label: string
): Pick<ResumeStudioState, 'resume' | 'past' | 'future'> {
  const past = [...state.past, { resume: state.resume as Resume, label }].slice(-HISTORY_LIMIT)
  return { resume, past, future: [] }
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export const useResumeStore = create<ResumeStudioState>((set, get) => {
  const commit = (nextResume: Resume, label: string): void => {
    set(withHistory(get(), nextResume, label))
    scheduleSave(get, set)
  }

  return {
    index: null,
    resume: null,
    loading: true,
    error: null,
    saveState: 'idle',

    past: [],
    future: [],

    zoomMode: 'fit',
    scale: 1,
    inspectorTab: 'template',
    editingSectionId: null,

    /* ---------------- 简历库 ---------------- */

    bootstrap: async () => {
      set({ loading: true, error: null })
      try {
        const { index, starterId } = await window.api.list()
        set({ index })
        const target =
          starterId ??
          index.lastOpenedId ??
          index.entries[0]?.id ??
          null
        if (!target) {
          set({ loading: false, resume: null })
          return
        }
        const resume = await window.api.read(target)
        set({ resume, loading: false, past: [], future: [], editingSectionId: resume.sections[0]?.id ?? null })
        if (index.lastOpenedId !== target) await window.api.setLastOpened(target)
      } catch (error) {
        set({ loading: false, error: error instanceof Error ? error.message : String(error) })
      }
    },

    openResume: async (id) => {
      await flushPendingSave(get, set)
      try {
        const resume = await window.api.read(id)
        set({
          resume,
          past: [],
          future: [],
          error: null,
          saveState: 'idle',
          editingSectionId: resume.sections[0]?.id ?? null
        })
        const index = get().index
        if (index) set({ index: { ...index, lastOpenedId: id } })
        await window.api.setLastOpened(id)
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) })
      }
    },

    createResume: async () => {
      await flushPendingSave(get, set)
      const resume = await window.api.create()
      const next = await window.api.list()
      set({ index: next.index, resume, past: [], future: [], editingSectionId: resume.sections[0]?.id ?? null })
    },

    duplicateResume: async (id) => {
      const copy = await window.api.duplicate(id)
      const next = await window.api.list()
      set({ index: next.index })
      await get().openResume(copy.id)
    },

    deleteResume: async (id) => {
      const index = await window.api.remove(id)
      set({ index })
      if (get().resume?.id === id) {
        const nextId = index.entries[0]?.id ?? null
        if (nextId) {
          await get().openResume(nextId)
        } else {
          const resume = await window.api.create()
          const refreshed = await window.api.list()
          set({ index: refreshed.index, resume, past: [], future: [] })
        }
      }
    },

    renameResume: (name) => {
      const resume = get().resume
      if (!resume) return
      commit({ ...resume, name }, '重命名')
    },

    saveNow: async () => {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      await flushSave(get, set)
    },

    /* ---------------- 文档 ---------------- */

    patchResume: (patch, label) => {
      const resume = get().resume
      if (!resume) return
      commit({ ...resume, ...patch }, label)
    },

    setTemplate: (templateId) => {
      const resume = get().resume
      if (!resume || resume.template === templateId) return
      commit({ ...resume, template: templateId }, '切换模板')
    },

    /** 用户主动「套用模板推荐样式」时才覆盖当前令牌 */
    resetThemeToTemplate: () => {
      const resume = get().resume
      if (!resume) return
      const meta = getTemplateMeta(resume.template)
      const theme = applyThemePatch(defaultTheme(), meta.defaults)
      commit({ ...resume, theme }, '套用推荐样式')
    },

    setTheme: (group, patch, label) => {
      const resume = get().resume
      if (!resume) return
      const theme: Theme = { ...resume.theme, [group]: { ...resume.theme[group], ...patch } }
      commit({ ...resume, theme }, label ?? `调整${String(group)}`)
    },

    updateMeta: (patch) => {
      const resume = get().resume
      if (!resume) return
      commit({ ...resume, meta: { ...resume.meta, ...patch } }, '编辑基本信息')
    },

    setAvatar: (dataUrl) => {
      const resume = get().resume
      if (!resume) return
      const theme: Theme =
        dataUrl && !resume.theme.avatar.show
          ? { ...resume.theme, avatar: { ...resume.theme.avatar, show: true } }
          : resume.theme
      commit({ ...resume, meta: { ...resume.meta, avatar: dataUrl }, theme }, '更新头像')
    },

    /* ---------------- 栏目与条目 ---------------- */

    addSection: (kind, withSample) => {
      const resume = get().resume
      if (!resume) return
      const section = withSample ? createSampleSection(kind) : createBlankSection(kind)
      commit({ ...resume, sections: [...resume.sections, section] }, '添加栏目')
      set({ editingSectionId: section.id, inspectorTab: 'sections' })
    },

    removeSection: (sectionId) => {
      const resume = get().resume
      if (!resume) return
      commit({ ...resume, sections: resume.sections.filter((s) => s.id !== sectionId) }, '删除栏目')
      if (get().editingSectionId === sectionId) set({ editingSectionId: null })
    },

    updateSection: (sectionId, patch) => {
      const resume = get().resume
      if (!resume) return
      commit(
        {
          ...resume,
          sections: resume.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s))
        },
        '修改栏目'
      )
    },

    moveSection: (sectionId, direction) => {
      const resume = get().resume
      if (!resume) return
      const sections = [...resume.sections]
      const index = sections.findIndex((s) => s.id === sectionId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= sections.length) return
      const [moved] = sections.splice(index, 1)
      sections.splice(target, 0, moved)
      commit({ ...resume, sections }, '调整栏目顺序')
    },

    addItem: (sectionId) => {
      const resume = get().resume
      if (!resume) return
      commit(
        {
          ...resume,
          sections: resume.sections.map((s) =>
            s.id === sectionId ? { ...s, items: [...s.items, emptyItem()] } : s
          )
        },
        '添加条目'
      )
    },

    updateItem: (sectionId, itemId, patch) => {
      const resume = get().resume
      if (!resume) return
      commit(
        {
          ...resume,
          sections: resume.sections.map((s) =>
            s.id === sectionId
              ? { ...s, items: s.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }
              : s
          )
        },
        '编辑条目'
      )
    },

    removeItem: (sectionId, itemId) => {
      const resume = get().resume
      if (!resume) return
      commit(
        {
          ...resume,
          sections: resume.sections.map((s) =>
            s.id === sectionId ? { ...s, items: s.items.filter((item) => item.id !== itemId) } : s
          )
        },
        '删除条目'
      )
    },

    moveItem: (sectionId, itemId, direction) => {
      const resume = get().resume
      if (!resume) return
      commit(
        {
          ...resume,
          sections: resume.sections.map((s) => {
            if (s.id !== sectionId) return s
            const items = [...s.items]
            const index = items.findIndex((item) => item.id === itemId)
            const target = index + direction
            if (index < 0 || target < 0 || target >= items.length) return s
            const [moved] = items.splice(index, 1)
            items.splice(target, 0, moved)
            return { ...s, items }
          })
        },
        '调整条目顺序'
      )
    },

    /* ---------------- 历史 ---------------- */

    undo: () => {
      const { past, future, resume } = get()
      if (past.length === 0 || !resume) return
      const previous = past[past.length - 1]
      set({
        resume: previous.resume,
        past: past.slice(0, -1),
        future: [{ resume, label: previous.label }, ...future].slice(0, HISTORY_LIMIT)
      })
      scheduleSave(get, set)
    },

    redo: () => {
      const { past, future, resume } = get()
      if (future.length === 0 || !resume) return
      const next = future[0]
      set({
        resume: next.resume,
        past: [...past, { resume, label: next.label }].slice(-HISTORY_LIMIT),
        future: future.slice(1)
      })
      scheduleSave(get, set)
    },

    /* ---------------- 界面 ---------------- */

    setZoomMode: (mode) => set({ zoomMode: mode }),
    /** 自适应布局算出的比例：只在「适应宽度」模式下真正改变显示比例 */
    setScale: (scale) => {
      const clamped = Math.min(2, Math.max(0.3, scale))
      set((state) => (state.zoomMode === 'fit' ? { scale: clamped } : { scale: state.scale }))
    },
    /** 手动缩放（按钮或 Ctrl+滚轮）：切到 manual 模式并更新比例 */
    nudgeScale: (delta) => {
      set((state) => ({
        zoomMode: 'manual',
        scale: Math.min(2, Math.max(0.3, (state.zoomMode === 'manual' ? state.scale : state.scale) * delta))
      }))
    },
    setInspectorTab: (tab) => set({ inspectorTab: tab }),
    setEditingSection: (id) => set({ editingSectionId: id })
  }
})

/** 导出前调用，确保磁盘上那份与屏幕上一致 */
export async function ensureSaved(): Promise<void> {
  const state = useResumeStore.getState()
  if (state.saveState === 'saving') return
  await state.saveNow()
}

export const A4 = { width: A4_WIDTH_PX, height: A4_HEIGHT_PX }
