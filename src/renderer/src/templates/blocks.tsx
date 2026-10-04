import type { ReactNode } from 'react'
import type {
  Resume,
  ResumeItem,
  ResumeSection,
  AvatarTheme,
  Theme
} from '@shared/resume'

export interface BlockProps {
  resume: Resume
  slot: 'main' | 'side'
}

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

/** 去掉协议前缀，让联系行更短 */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/** 把多行文本转成段落数组 */
export function paragraphs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const AVATAR_SHAPE_CLASS: Record<AvatarTheme['shape'], string> = {
  circle: 'rs-avatar--circle',
  square: 'rs-avatar--square',
  rounded: 'rs-avatar--rounded'
}

export function Avatar({ meta, theme, className = '' }: { meta: Resume['meta']; theme: Theme; className?: string }) {
  if (!theme.avatar.show || !meta.avatar) return null
  const shape = AVATAR_SHAPE_CLASS[theme.avatar.shape] ?? 'rs-avatar--circle'
  return (
    <div className={`rs-avatar ${shape} ${className}`.trim()}>
      <img src={meta.avatar} alt={meta.name} />
    </div>
  )
}

/** 联系信息行：邮箱 · 电话 · 城市 · 链接 */
export function ContactLine({ meta, className = '' }: { meta: Resume['meta']; className?: string }) {
  const parts: string[] = []
  if (meta.email.trim()) parts.push(meta.email.trim())
  if (meta.phone.trim()) parts.push(meta.phone.trim())
  if (meta.location.trim()) parts.push(meta.location.trim())
  for (const link of meta.links) {
    if (link.url.trim()) parts.push(link.label.trim() ? `${link.label.trim()}：${shortUrl(link.url.trim())}` : shortUrl(link.url.trim()))
  }
  if (parts.length === 0) return null
  return (
    <div className={`rs-contact ${className}`.trim()}>
      {parts.map((part, index) => (
        <span className="rs-contact__part" key={`${part}-${index}`}>
          {index > 0 ? <span className="rs-contact__sep">·</span> : null}
          {part}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 头部
 * ------------------------------------------------------------------ */

export type HeaderLayout = 'left' | 'center' | 'banner' | 'plain'

export interface ResumeHeaderProps extends BlockProps {
  layout?: HeaderLayout
  /** 是否在头部显示头像（部分模板把头像放在侧栏） */
  avatarInHeader?: boolean
}

export function ResumeHeader({ resume, slot, layout = 'left', avatarInHeader = true }: ResumeHeaderProps) {
  const { meta, theme } = resume
  const showAvatar = avatarInHeader && theme.avatar.show && Boolean(meta.avatar)
  const avatarPos = theme.avatar.position

  const identity = (
    <div className="rs-identity">
      <h1 className="rs-name">{meta.name || '姓名'}</h1>
      {meta.title.trim() ? <div className="rs-title">{meta.title}</div> : null}
      <ContactLine meta={meta} />
    </div>
  )

  if (layout === 'plain') {
    return (
      <header className={`rs-header rs-header--plain rs-slot-${slot}`} data-slot={slot}>
        {identity}
      </header>
    )
  }

  if (layout === 'center') {
    return (
      <header className={`rs-header rs-header--center rs-slot-${slot}`} data-slot={slot}>
        {showAvatar ? <Avatar meta={meta} theme={theme} /> : null}
        {identity}
      </header>
    )
  }

  if (layout === 'banner') {
    return (
      <header className={`rs-header rs-header--banner rs-slot-${slot}`} data-slot={slot}>
        {showAvatar && avatarPos === 'left' ? <Avatar meta={meta} theme={theme} /> : null}
        {identity}
        {showAvatar && avatarPos !== 'left' ? <Avatar meta={meta} theme={theme} /> : null}
      </header>
    )
  }

  return (
    <header className={`rs-header rs-header--left rs-slot-${slot}`} data-slot={slot}>
      {showAvatar && avatarPos === 'left' ? <Avatar meta={meta} theme={theme} /> : null}
      {identity}
      {showAvatar && avatarPos !== 'left' ? <Avatar meta={meta} theme={theme} /> : null}
    </header>
  )
}

/* ------------------------------------------------------------------ *
 * 栏目标题
 * ------------------------------------------------------------------ */

export type HeadingVariant = 'rule' | 'plain' | 'underline' | 'bar' | 'side'

export function SectionHeading({
  title,
  variant = 'rule',
  index
}: {
  title: string
  variant?: HeadingVariant
  index?: number
}) {
  const numbered = typeof index === 'number'
  return (
    <h2 className={`rs-h2 rs-h2--${variant}`}>
      {numbered ? <span className="rs-h2__index">{String(index).padStart(2, '0')}</span> : null}
      <span className="rs-h2__text">{title}</span>
      {variant === 'rule' ? <span className="rs-h2__line" /> : null}
    </h2>
  )
}

/* ------------------------------------------------------------------ *
 * 条目
 * ------------------------------------------------------------------ */

export interface ItemProps {
  item: ResumeItem
  kind: ResumeSection['kind']
  /** 侧栏版式更紧凑 */
  slot?: 'main' | 'side'
  /** 标题与时间是否同行（两栏式） */
  metaInline?: boolean
}

export function ItemHeader({ item, metaInline = true }: ItemProps) {
  const hasTitle = item.title.trim().length > 0
  const hasMeta = item.meta.trim().length > 0
  if (!hasTitle && !hasMeta) return null

  if (metaInline) {
    return (
      <div className="rs-item__head">
        <div className="rs-item__head-main">
          {hasTitle ? <span className="rs-item__title">{item.title}</span> : null}
          {item.subtitle.trim() ? <span className="rs-item__subtitle">{item.subtitle}</span> : null}
        </div>
        {hasMeta ? <div className="rs-item__meta">{item.meta}</div> : null}
      </div>
    )
  }

  return (
    <div className="rs-item__head rs-item__head--stacked">
      {hasTitle ? <div className="rs-item__title">{item.title}</div> : null}
      {item.subtitle.trim() ? <div className="rs-item__subtitle">{item.subtitle}</div> : null}
      {hasMeta || item.extra.trim() ? (
        <div className="rs-item__meta">
          {hasMeta ? <span>{item.meta}</span> : null}
          {item.extra.trim() ? <span>{item.extra}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

export function ItemExtra({ item }: { item: ResumeItem }) {
  if (!item.extra.trim()) return null
  return <div className="rs-item__extra">{item.extra}</div>
}

export function ItemDescription({ item }: { item: ResumeItem }) {
  const lines = paragraphs(item.description)
  if (lines.length === 0) return null
  return (
    <div className="rs-item__desc">
      {lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  )
}

export function Highlights({ item }: { item: ResumeItem }) {
  const list = item.highlights.map((h) => h.trim()).filter(Boolean)
  if (list.length === 0) return null
  return (
    <ul className="rs-bullets">
      {list.map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ul>
  )
}

export function Tags({ item }: { item: ResumeItem }) {
  const list = item.tags.map((t) => t.trim()).filter(Boolean)
  if (list.length === 0) return null
  return (
    <div className="rs-tags">
      {list.map((tag, index) => (
        <span className="rs-tag" key={index}>
          {tag}
        </span>
      ))}
    </div>
  )
}

/** 通用条目：标题 + 时间 + 概述 + 要点 + 标签 */
export function Item({ item, kind, slot = 'main', metaInline = true }: ItemProps) {
  return (
    <article className="rs-item" data-item-id={item.id}>
      <ItemHeader item={item} kind={kind} slot={slot} metaInline={metaInline} />
      {metaInline ? <ItemExtra item={item} /> : null}
      <ItemDescription item={item} />
      <Highlights item={item} />
      <Tags item={item} />
    </article>
  )
}

/* ------------------------------------------------------------------ *
 * 分类栏目
 * ------------------------------------------------------------------ */

/** 概述类：只有段落 */
export function SummaryBlock({ section }: { section: ResumeSection }) {
  return (
    <div className="rs-block rs-block--summary">
      {section.items.map((item) => (
        <div className="rs-item rs-item--plain" key={item.id} data-item-id={item.id}>
          <ItemDescription item={item} />
        </div>
      ))}
    </div>
  )
}

/** 技能类：名称 + 等级/说明 */
export function SkillBlock({ section }: { section: ResumeSection; slot?: 'main' | 'side' }) {
  return (
    <div className="rs-block rs-block--skill">
      {section.items.map((item) => (
        <div className="rs-skill" key={item.id} data-item-id={item.id}>
          {item.title.trim() ? <span className="rs-skill__name">{item.title}</span> : null}
          {item.level.trim() ? <span className="rs-skill__level">{item.level}</span> : null}
          {item.description.trim() ? <span className="rs-skill__desc">{item.description}</span> : null}
          <Tags item={item} />
        </div>
      ))}
    </div>
  )
}

/** 语言类：名称 + 等级，横向排列 */
export function LanguageBlock({ section }: { section: ResumeSection }) {
  return (
    <div className="rs-block rs-block--lang">
      {section.items.map((item) => (
        <div className="rs-lang" key={item.id} data-item-id={item.id}>
          <span className="rs-lang__name">{item.title}</span>
          {item.level.trim() ? <span className="rs-lang__level">{item.level}</span> : null}
          {item.description.trim() ? <span className="rs-lang__desc">{item.description}</span> : null}
        </div>
      ))}
    </div>
  )
}

/** 证书类：一行一条，名称 + 时间 */
export function CertBlock({ section }: { section: ResumeSection }) {
  return (
    <div className="rs-block rs-block--cert">
      {section.items.map((item) => (
        <div className="rs-cert" key={item.id} data-item-id={item.id}>
          <span className="rs-cert__name">{item.title}</span>
          {item.meta.trim() ? <span className="rs-cert__meta">{item.meta}</span> : null}
          {item.description.trim() ? <span className="rs-cert__desc">{item.description}</span> : null}
        </div>
      ))}
    </div>
  )
}

/** 按栏目类型分发内容块 */
export function SectionBody({ section, slot = 'main' }: { section: ResumeSection; slot?: 'main' | 'side' }) {
  switch (section.kind) {
    case 'summary':
      return <SummaryBlock section={section} />
    case 'skills':
      return <SkillBlock section={section} slot={slot} />
    case 'languages':
      return <LanguageBlock section={section} />
    case 'certifications':
      return <CertBlock section={section} />
    default:
      return (
        <div className="rs-block rs-block--items">
          {section.items.map((item) => (
            <Item key={item.id} item={item} kind={section.kind} slot={slot} />
          ))}
        </div>
      )
  }
}

/** 一个完整栏目：标题 + 内容 */
export function Section({
  section,
  slot = 'main',
  headingVariant = 'rule',
  index
}: {
  section: ResumeSection
  slot?: 'main' | 'side'
  headingVariant?: HeadingVariant
  index?: number
}) {
  if (!section.enabled) return null
  const hasContent = section.items.some((item) => {
    return (
      item.title.trim() ||
      item.subtitle.trim() ||
      item.meta.trim() ||
      item.extra.trim() ||
      item.description.trim() ||
      item.level.trim() ||
      item.highlights.some((h) => h.trim()) ||
      item.tags.some((t) => t.trim())
    )
  })
  if (!hasContent) return null

  return (
    <section className={`rs-section rs-section--${section.kind} rs-slot-${slot}`} data-section-id={section.id}>
      <SectionHeading title={section.title || '未命名栏目'} variant={headingVariant} index={index} />
      <SectionBody section={section} slot={slot} />
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * 布局工具
 * ------------------------------------------------------------------ */

/** 模板组件统一接收 resume，此类型用于允许模板自行追加无参属性 */
export type TemplateExtras = Record<string, never>

/** 按 slot 拆分栏目，并保持用户在编辑器中的排列顺序 */
export function splitSections(resume: Resume): { main: ResumeSection[]; side: ResumeSection[] } {
  const enabled = resume.sections.filter((section) => section.enabled)
  return {
    main: enabled.filter((section) => section.slot !== 'side'),
    side: enabled.filter((section) => section.slot === 'side')
  }
}

/** 单栏模板的内容容器 */
export function MainStack({ children }: { children: ReactNode }) {
  return <div className="rs-stack rs-stack--main">{children}</div>
}

/** 双栏模板侧栏的内容容器 */
export function SideStack({ children }: { children: ReactNode }) {
  return <div className="rs-stack rs-stack--side">{children}</div>
}
