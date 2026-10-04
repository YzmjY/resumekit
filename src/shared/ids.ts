import type { Resume, ResumeSection, ResumeItem } from './resume'

let counter = 0

/** 轻量 id：足以在单文档内唯一，且不引入 uuid 依赖 */
export function makeId(prefix = 'id'): string {
  counter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${rand}`
}

export function emptyItem(): ResumeItem {
  return {
    id: makeId('item'),
    title: '',
    subtitle: '',
    meta: '',
    extra: '',
    description: '',
    highlights: [],
    tags: [],
    level: ''
  }
}

export function createSection(kind: ResumeSection['kind'], overrides: Partial<ResumeSection> = {}): ResumeSection {
  return {
    id: makeId('sec'),
    kind,
    title: '',
    enabled: true,
    slot: kind === 'skills' || kind === 'languages' || kind === 'certifications' ? 'side' : 'main',
    items: [emptyItem()],
    ...overrides
  }
}

/** 深拷贝一份简历并换新 id，用于「复制简历」 */
export function cloneResume(source: Resume, name: string): Resume {
  const copy: Resume = JSON.parse(JSON.stringify(source))
  copy.id = makeId('resume')
  copy.name = name
  copy.sections = copy.sections.map((section) => ({
    ...section,
    id: makeId('sec'),
    items: section.items.map((item) => ({ ...item, id: makeId('item') }))
  }))
  return copy
}
