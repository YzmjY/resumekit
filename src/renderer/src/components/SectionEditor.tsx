import type { ResumeItem, ResumeSection, SectionKind } from '@shared/resume'
import { SECTION_KIND_LABELS } from '@shared/resume'
import { useResumeStore } from '../store/useResumeStore'
import { LineListField, TagsField, TextArea, TextInput } from './fields'
import { IconChevron, IconDown, IconEye, IconEyeOff, IconTrash, IconUp } from './icons'

const SECTION_KINDS: SectionKind[] = [
  'summary',
  'experience',
  'education',
  'projects',
  'skills',
  'certifications',
  'languages',
  'awards',
  'custom'
]

/** 每种栏目需要哪些字段，避免给「技能」显示「要点」这类无关输入 */
const FIELDS_BY_KIND: Record<SectionKind, Array<keyof ResumeItem>> = {
  summary: ['description'],
  experience: ['title', 'subtitle', 'meta', 'extra', 'description', 'highlights'],
  education: ['title', 'subtitle', 'meta', 'extra', 'description', 'highlights'],
  projects: ['title', 'subtitle', 'meta', 'extra', 'description', 'highlights', 'tags'],
  skills: ['title', 'level', 'description'],
  certifications: ['title', 'meta', 'description'],
  languages: ['title', 'level', 'description'],
  awards: ['title', 'meta', 'description'],
  custom: ['title', 'subtitle', 'meta', 'extra', 'description', 'highlights', 'tags']
}

const FIELD_LABELS: Record<string, string> = {
  title: '主标题',
  subtitle: '副标题 / 角色',
  meta: '时间',
  extra: '补充信息',
  description: '描述',
  level: '等级 / 说明',
  highlights: '要点',
  tags: '标签'
}

const FIELD_PLACEHOLDERS: Record<SectionKind, Partial<Record<keyof ResumeItem, string>>> = {
  summary: { description: '一句话概括你的核心优势与目标' },
  experience: { title: '公司名称', subtitle: '职位', meta: '2021.06 – 至今', extra: '城市', description: '负责范围与团队规模' },
  education: { title: '学校名称', subtitle: '专业 · 学历', meta: '2016.09 – 2019.06', extra: 'GPA / 排名' },
  projects: { title: '项目名称', subtitle: '担任角色', meta: '起止时间', extra: '链接 / 成果', description: '项目背景与你的职责' },
  skills: { title: '技能分类', level: '熟练度', description: '具体技术栈' },
  certifications: { title: '证书名称', meta: '取得年份', description: '颁发机构 / 编号' },
  languages: { title: '语言', level: 'CET-6 / 可作为工作语言', description: '' },
  awards: { title: '奖项名称', meta: '获奖时间', description: '获奖原因' },
  custom: {}
}

/* ------------------------------------------------------------------ *
 * 单个条目
 * ------------------------------------------------------------------ */

function ItemEditor({
  section,
  item,
  index,
  total
}: {
  section: ResumeSection
  item: ResumeItem
  index: number
  total: number
}) {
  const updateItem = useResumeStore((s) => s.updateItem)
  const removeItem = useResumeStore((s) => s.removeItem)
  const moveItem = useResumeStore((s) => s.moveItem)

  const fields = FIELDS_BY_KIND[section.kind]
  const patch = (value: Partial<ResumeItem>) => updateItem(section.id, item.id, value)

  return (
    <div className="itemcard">
      <div className="itemcard__head">
        <span className="itemcard__label">
          第 {index + 1} 条{total > 1 ? ` / 共 ${total} 条` : ''}
        </span>
        <button
          type="button"
          className="icon-btn"
          title="上移"
          disabled={index === 0}
          onClick={() => moveItem(section.id, item.id, -1)}
        >
          <IconUp size={13} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="下移"
          disabled={index === total - 1}
          onClick={() => moveItem(section.id, item.id, 1)}
        >
          <IconDown size={13} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          title="删除条目"
          onClick={() => removeItem(section.id, item.id)}
        >
          <IconTrash size={13} />
        </button>
      </div>

      {fields.includes('title') ? (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field__label">{FIELD_LABELS.title}</label>
          <TextInput
            value={item.title}
            placeholder={FIELD_PLACEHOLDERS[section.kind].title}
            onChange={(title) => patch({ title })}
          />
        </div>
      ) : null}

      {fields.includes('subtitle') ? (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field__label">{FIELD_LABELS.subtitle}</label>
          <TextInput
            value={item.subtitle}
            placeholder={FIELD_PLACEHOLDERS[section.kind].subtitle}
            onChange={(subtitle) => patch({ subtitle })}
          />
        </div>
      ) : null}

      {fields.includes('meta') || fields.includes('extra') ? (
        <div className="field__row">
          {fields.includes('meta') ? (
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field__label">{FIELD_LABELS.meta}</label>
              <TextInput
                value={item.meta}
                placeholder={FIELD_PLACEHOLDERS[section.kind].meta}
                onChange={(meta) => patch({ meta })}
              />
            </div>
          ) : null}
          {fields.includes('extra') ? (
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field__label">{FIELD_LABELS.extra}</label>
              <TextInput
                value={item.extra}
                placeholder={FIELD_PLACEHOLDERS[section.kind].extra}
                onChange={(extra) => patch({ extra })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {fields.includes('level') ? (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field__label">{FIELD_LABELS.level}</label>
          <TextInput
            value={item.level}
            placeholder={FIELD_PLACEHOLDERS[section.kind].level}
            onChange={(level) => patch({ level })}
          />
        </div>
      ) : null}

      {fields.includes('description') ? (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field__label">{FIELD_LABELS.description}</label>
          <TextArea
            rows={section.kind === 'summary' || section.kind === 'skills' ? 2 : 3}
            value={item.description}
            placeholder={FIELD_PLACEHOLDERS[section.kind].description}
            onChange={(description) => patch({ description })}
          />
        </div>
      ) : null}

      {fields.includes('highlights') ? (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field__label">要点（每行一条，导出后就是项目符号列表）</label>
          <LineListField
            lines={item.highlights}
            placeholder="用数字说明成果，例如：接口延迟从 420ms 降至 96ms"
            addLabel="添加要点"
            onChange={(highlights) => patch({ highlights })}
          />
        </div>
      ) : null}

      {fields.includes('tags') ? (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field__label">{FIELD_LABELS.tags}</label>
          <TagsField tags={item.tags} onChange={(tags) => patch({ tags })} />
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 单个栏目
 * ------------------------------------------------------------------ */

function SectionEditor({ section, index, total }: { section: ResumeSection; index: number; total: number }) {
  const editingSectionId = useResumeStore((s) => s.editingSectionId)
  const setEditingSection = useResumeStore((s) => s.setEditingSection)
  const updateSection = useResumeStore((s) => s.updateSection)
  const removeSection = useResumeStore((s) => s.removeSection)
  const moveSection = useResumeStore((s) => s.moveSection)
  const addItem = useResumeStore((s) => s.addItem)

  const open = editingSectionId === section.id

  return (
    <div className={`sectioncard${open ? ' sectioncard--editing' : ''}`}>
      <div className="sectioncard__head" onClick={() => setEditingSection(open ? null : section.id)}>
        <IconChevron size={13} className={`group__chevron${open ? ' group__chevron--open' : ''}`} />
        <span className="sectioncard__title" style={{ opacity: section.enabled ? 1 : 0.5 }}>
          {section.title || SECTION_KIND_LABELS[section.kind]}
        </span>
        <span className="badge">{section.items.length} 条</span>
        <div className="sectioncard__tools" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="icon-btn"
            title={section.enabled ? '在简历中隐藏' : '在简历中显示'}
            onClick={() => updateSection(section.id, { enabled: !section.enabled })}
          >
            {section.enabled ? <IconEye size={13} /> : <IconEyeOff size={13} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="上移栏目"
            disabled={index === 0}
            onClick={() => moveSection(section.id, -1)}
          >
            <IconUp size={13} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="下移栏目"
            disabled={index === total - 1}
            onClick={() => moveSection(section.id, 1)}
          >
            <IconDown size={13} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            title="删除栏目"
            onClick={() => removeSection(section.id)}
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="sectioncard__body">
          <div className="field">
            <label className="field__label">栏目标题</label>
            <TextInput
              value={section.title}
              placeholder={SECTION_KIND_LABELS[section.kind]}
              onChange={(title) => updateSection(section.id, { title })}
            />
          </div>

          <div className="field">
            <label className="field__label">所属区域</label>
            <select
              className="select"
              value={section.slot}
              onChange={(event) => updateSection(section.id, { slot: event.target.value as 'main' | 'side' })}
            >
              <option value="main">主栏（单栏模板忽略此项）</option>
              <option value="side">侧栏（仅双栏模板生效）</option>
            </select>
          </div>

          {section.items.map((item, itemIndex) => (
            <ItemEditor
              key={item.id}
              section={section}
              item={item}
              index={itemIndex}
              total={section.items.length}
            />
          ))}

          <button type="button" className="btn btn--sm btn--block" onClick={() => addItem(section.id)}>
            + 添加条目
          </button>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 栏目列表
 * ------------------------------------------------------------------ */

export function SectionList({ sections }: { sections: ResumeSection[] }) {
  const addSection = useResumeStore((s) => s.addSection)

  return (
    <div className="sectionlist">
      {sections.map((section, index) => (
        <SectionEditor key={section.id} section={section} index={index} total={sections.length} />
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <select
          className="select"
          defaultValue=""
          onChange={(event) => {
            const kind = event.target.value as SectionKind
            if (!kind) return
            addSection(kind, true)
            event.target.value = ''
          }}
        >
          <option value="" disabled>
            添加栏目…
          </option>
          {SECTION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {SECTION_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
