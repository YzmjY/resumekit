import type { Resume, ResumeMeta } from '@shared/resume'

/* ------------------------------------------------------------------ *
 * 小工具：受控输入
 * ------------------------------------------------------------------ */

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className = 'input'
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'email' | 'tel' | 'url'
  className?: string
}) {
  return (
    <input
      className={className}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      className="textarea"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** 多行文本 ⇄ 数组：用于「要点」编辑 */
export function LineListField({
  lines,
  onChange,
  placeholder,
  addLabel = '添加一行'
}: {
  lines: string[]
  onChange: (lines: string[]) => void
  placeholder?: string
  addLabel?: string
}) {
  return (
    <div className="mini-list">
      {lines.map((line, index) => (
        <div className="highlight-row" key={index}>
          <TextArea
            rows={2}
            value={line}
            placeholder={placeholder}
            onChange={(value) => {
              const next = [...lines]
              next[index] = value
              onChange(next)
            }}
          />
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            title="删除这一行"
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn--sm" onClick={() => onChange([...lines, ''])}>
        + {addLabel}
      </button>
    </div>
  )
}

/** 逗号/顿号分隔的标签输入 */
export function TagsField({
  tags,
  onChange,
  placeholder = 'React, TypeScript, Node.js'
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}) {
  return (
    <div>
      <input
        className="input"
        value={tags.join(', ')}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(/[,，]/)
              .map((tag) => tag.trim())
              .filter((tag, index, array) => tag.length > 0 || index === array.length - 1)
          )
        }
      />
      <div className="tag-input-hint">用逗号分隔多个标签</div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 基本信息
 * ------------------------------------------------------------------ */

export function MetaForm({
  meta,
  onChange
}: {
  meta: ResumeMeta
  onChange: (patch: Partial<ResumeMeta>) => void
}) {
  return (
    <div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">姓名</label>
          <TextInput value={meta.name} onChange={(name) => onChange({ name })} placeholder="张三" />
        </div>
        <div className="field">
          <label className="field__label">求职意向 / 职位</label>
          <TextInput value={meta.title} onChange={(title) => onChange({ title })} placeholder="高级后端工程师" />
        </div>
      </div>

      <div className="field__row">
        <div className="field">
          <label className="field__label">邮箱</label>
          <TextInput value={meta.email} onChange={(email) => onChange({ email })} placeholder="you@example.com" />
        </div>
        <div className="field">
          <label className="field__label">电话</label>
          <TextInput value={meta.phone} onChange={(phone) => onChange({ phone })} placeholder="138-0000-0000" />
        </div>
      </div>

      <div className="field">
        <label className="field__label">所在城市</label>
        <TextInput value={meta.location} onChange={(location) => onChange({ location })} placeholder="上海 · 浦东新区" />
      </div>

      <div className="divider" />

      <div className="field__label" style={{ marginBottom: 8 }}>
        链接（GitHub / 个人主页 / 作品集）
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => onChange({ links: [...meta.links, { label: '', url: '' }] })}
        >
          + 添加链接
        </button>
      </div>

      {meta.links.length === 0 ? (
        <div className="field__hint">还没有链接。添加后会显示在姓名下方的联系行里。</div>
      ) : (
        <div className="mini-list">
          {meta.links.map((link, index) => (
            <div className="link-row" key={index}>
              <input
                className="input input--link-label"
                value={link.label}
                placeholder="GitHub"
                onChange={(event) => {
                  const links = [...meta.links]
                  links[index] = { ...links[index], label: event.target.value }
                  onChange({ links })
                }}
              />
              <input
                className="input"
                value={link.url}
                placeholder="github.com/you"
                onChange={(event) => {
                  const links = [...meta.links]
                  links[index] = { ...links[index], url: event.target.value }
                  onChange({ links })
                }}
              />
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                title="删除链接"
                onClick={() => onChange({ links: meta.links.filter((_, i) => i !== index) })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export type { Resume }
