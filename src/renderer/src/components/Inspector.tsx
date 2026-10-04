import { useMemo } from 'react'
import type { ColorTheme, LayoutTheme, SpacingTheme, Theme, TypographyTheme } from '@shared/resume'
import { FONT_PRESETS, matchFontPreset } from '@shared/theme'
import { useResumeStore } from '../store/useResumeStore'
import { templateList } from '../templates'
import type { TemplateMeta } from '../templates/catalog'
import { FontStackField } from './FontStackField'

/* ------------------------------------------------------------------ *
 * 通用控件
 * ------------------------------------------------------------------ */

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = 'px',
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="slider-field">
      <div className="slider-field__top">
        <span className="slider-field__label">{label}</span>
        <span className="slider-field__value">
          {Number.isInteger(value) ? value : value.toFixed(1)}
          {unit}
        </span>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

export function ColorField({
  label,
  value,
  presets = [],
  onChange
}: {
  label: string
  value: string
  presets?: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <div className="color-row">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input
          className="input"
          value={value}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {presets.length > 0 ? (
        <div className="swatch-presets">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              title={preset}
              className={`swatch${preset.toLowerCase() === value.toLowerCase() ? ' swatch--active' : ''}`}
              style={{ background: preset }}
              onClick={() => onChange(preset)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 模板选择
 * ------------------------------------------------------------------ */

function TemplateThumb({ meta }: { meta: TemplateMeta }) {
  if (meta.columns === 2) {
    return (
      <div className={`thumb thumb--two${meta.id === 'compact-tech' ? ' thumb--compact' : ''}`}>
        {meta.sidebar === 'left' ? <div className="thumb__side" /> : null}
        <div className="thumb__main">
          <div className="thumb__name" />
          <div className="thumb__sub" />
          <div className="thumb__heading" />
          <div className="thumb__block">
            <div className="thumb__line" />
            <div className="thumb__line thumb__line--short" />
          </div>
          <div className="thumb__heading" />
          <div className="thumb__block">
            <div className="thumb__line" />
            <div className="thumb__line thumb__line--short" />
          </div>
        </div>
        {meta.sidebar === 'right' ? <div className="thumb__side" /> : null}
      </div>
    )
  }

  return (
    <div
      className={`thumb${meta.id === 'elegant-serif' ? ' thumb--elegant' : ''}${
        meta.id === 'bold-timeline' ? ' thumb--timeline' : ''
      }`}
    >
      <div className="thumb__name" />
      <div className="thumb__sub" />
      <div className="thumb__heading" />
      <div className="thumb__block">
        <div className="thumb__line" />
        <div className="thumb__line thumb__line--short" />
        <div className="thumb__line" />
      </div>
      <div className="thumb__heading" />
      <div className="thumb__block">
        <div className="thumb__line" />
        <div className="thumb__line thumb__line--short" />
      </div>
    </div>
  )
}

function TemplatePanel() {
  const resume = useResumeStore((s) => s.resume)
  const setTemplate = useResumeStore((s) => s.setTemplate)
  const resetThemeToTemplate = useResumeStore((s) => s.resetThemeToTemplate)
  if (!resume) return null

  const templates = templateList()
  const active = templates.find((t) => t.meta.id === resume.template)

  return (
    <div className="inspector">
      <div className="inspector__section-title">模板</div>
      <div className="gallery">
        {templates.map(({ meta }) => (
          <button
            key={meta.id}
            type="button"
            className={`tplcard${meta.id === resume.template ? ' tplcard--active' : ''}`}
            onClick={() => setTemplate(meta.id)}
          >
            <span className="tplcard__thumb">
              <TemplateThumb meta={meta} />
            </span>
            <span className="tplcard__info">
              <span className="tplcard__name">
                {meta.name}
                <span className="badge">{meta.columns === 2 ? '双栏' : '单栏'}</span>
              </span>
              <span className="tplcard__desc">{meta.description}</span>
              <span className="tplcard__tags">
                {meta.tags.map((tag) => (
                  <span className="badge badge--accent" key={tag}>
                    {tag}
                  </span>
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="divider" />

      <div className="field__hint">
        切换模板会保留你当前的字体、间距与配色设置。
        {active ? `若想回到「${active.meta.name}」的原始设计，点下面的按钮。` : ''}
      </div>
      <button type="button" className="btn btn--block" style={{ marginTop: 8 }} onClick={resetThemeToTemplate}>
        套用当前模板的推荐样式
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 字体与字号
 * ------------------------------------------------------------------ */

const HEADING_TRANSFORMS: Array<{ value: TypographyTheme['headingTransform']; label: string }> = [
  { value: 'none', label: '保持原样' },
  { value: 'uppercase', label: '全大写' },
  { value: 'small-caps', label: '小型大写' }
]

function TypographyPanel() {
  const resume = useResumeStore((s) => s.resume)
  const setTheme = useResumeStore((s) => s.setTheme)
  if (!resume) return null

  const t = resume.theme.typography
  const presetId = matchFontPreset(t)

  const setTypo = (patch: Partial<TypographyTheme>) => setTheme('typography', patch)

  return (
    <div className="inspector">
      <div className="inspector__section-title">字体</div>

      <div className="field">
        <label className="field__label">字体方案</label>
        <select
          className="select"
          value={presetId ?? 'custom'}
          onChange={(event) => {
            const preset = FONT_PRESETS.find((p) => p.id === event.target.value)
            if (!preset) return
            setTypo({ fontFamily: preset.body, headingFontFamily: preset.heading ?? '' })
          }}
        >
          {FONT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          {presetId === null ? <option value="custom">自定义（当前）</option> : null}
        </select>
        <div className="field__hint">
          {presetId
            ? `${FONT_PRESETS.find((p) => p.id === presetId)?.hint}。选中预设会覆盖下面的候选名单。`
            : '当前是自定义字体名单，可从上方选回预设。'}
        </div>
      </div>

      <FontStackField
        label="正文字体候选名单"
        value={t.fontFamily}
        onChange={(next) => setTypo({ fontFamily: next })}
        hint="浏览器（以及导出 PDF 时的渲染器）会从上往下找第一个本机装了的字体，所以名单越长，换台电脑后越不容易走样。前几个没有的会自动跳过，不需要手动删。"
        previewText="中文排版 AaBbGg 0123"
        previewSize={13.5}
      />

      <FontStackField
        label="标题字体候选名单"
        value={t.headingFontFamily}
        allowEmpty
        onChange={(next) => setTypo({ headingFontFamily: next })}
        hint="标题（姓名、栏目标题）单独使用这套名单，留空则与正文相同。"
        previewText="姓名与栏目标题 AaBb 01"
        previewSize={19}
      />

      <div className="divider" />
      <div className="inspector__section-title">字号</div>

      <SliderField label="正文" value={t.baseFontSize} min={8} max={14} step={0.1} unit="pt" onChange={(v) => setTypo({ baseFontSize: v })} />
      <SliderField label="姓名" value={t.nameSize} min={16} max={40} step={0.5} unit="pt" onChange={(v) => setTypo({ nameSize: v })} />
      <SliderField label="一级标题" value={t.h1Size} min={11} max={22} step={0.5} unit="pt" onChange={(v) => setTypo({ h1Size: v })} />
      <SliderField label="栏目标题" value={t.h2Size} min={9} max={18} step={0.1} unit="pt" onChange={(v) => setTypo({ h2Size: v })} />
      <SliderField label="条目标题" value={t.h3Size} min={9} max={16} step={0.1} unit="pt" onChange={(v) => setTypo({ h3Size: v })} />
      <SliderField label="辅助文字" value={t.smallSize} min={7} max={12} step={0.1} unit="pt" onChange={(v) => setTypo({ smallSize: v })} />

      <div className="divider" />
      <div className="inspector__section-title">字距与行距</div>

      <SliderField label="行高" value={t.lineHeight} min={1.1} max={2.2} step={0.01} unit="×" onChange={(v) => setTypo({ lineHeight: v })} />
      <SliderField label="正文书字距" value={t.letterSpacing} min={-0.5} max={2} step={0.05} unit="px" onChange={(v) => setTypo({ letterSpacing: v })} />
      <SliderField label="标题字距" value={t.headingLetterSpacing} min={-0.5} max={4} step={0.05} unit="px" onChange={(v) => setTypo({ headingLetterSpacing: v })} />
      <SliderField label="姓名字重" value={t.nameWeight} min={300} max={900} step={50} unit="" onChange={(v) => setTypo({ nameWeight: v })} />
      <SliderField label="标题字重" value={t.headingWeight} min={300} max={900} step={50} unit="" onChange={(v) => setTypo({ headingWeight: v })} />

      <div className="field">
        <label className="field__label">栏目标题样式</label>
        <select
          className="select"
          value={t.headingTransform}
          onChange={(event) => setTypo({ headingTransform: event.target.value as TypographyTheme['headingTransform'] })}
        >
          {HEADING_TRANSFORMS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 间距
 * ------------------------------------------------------------------ */

function SpacingPanel() {
  const resume = useResumeStore((s) => s.resume)
  const setTheme = useResumeStore((s) => s.setTheme)
  if (!resume) return null

  const s = resume.theme.spacing
  const setSpacing = (patch: Partial<SpacingTheme>) => setTheme('spacing', patch)

  return (
    <div className="inspector">
      <div className="inspector__section-title">页边距</div>
      <SliderField label="左右留白" value={s.pagePaddingX} min={16} max={90} unit="px" onChange={(v) => setSpacing({ pagePaddingX: v })} />
      <SliderField label="上下留白" value={s.pagePaddingY} min={16} max={90} unit="px" onChange={(v) => setSpacing({ pagePaddingY: v })} />
      <SliderField label="侧栏内边距" value={s.sidebarPadding} min={10} max={56} unit="px" onChange={(v) => setSpacing({ sidebarPadding: v })} />

      <div className="divider" />
      <div className="inspector__section-title">栏目间距</div>
      <SliderField label="栏目之间" value={s.sectionGap} min={4} max={40} unit="px" onChange={(v) => setSpacing({ sectionGap: v })} />
      <SliderField label="条目之间" value={s.itemGap} min={2} max={28} unit="px" onChange={(v) => setSpacing({ itemGap: v })} />

      <div className="divider" />
      <div className="inspector__section-title">段落与列表</div>
      <SliderField label="段落间距" value={s.paragraphGap} min={0} max={16} step={0.5} unit="px" onChange={(v) => setSpacing({ paragraphGap: v })} />
      <SliderField label="要点行距" value={s.bulletGap} min={0} max={14} step={0.5} unit="px" onChange={(v) => setSpacing({ bulletGap: v })} />

      <div className="field__hint" style={{ marginTop: 10 }}>
        内容超过一页时，缩小字号与间距通常比删内容更有效；预览区的红色虚线标出了分页位置。
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 版式
 * ------------------------------------------------------------------ */

function LayoutPanel() {
  const resume = useResumeStore((s) => s.resume)
  const setTheme = useResumeStore((s) => s.setTheme)
  if (!resume) return null

  const l = resume.theme.layout
  const meta = templateList().find((t) => t.meta.id === resume.template)?.meta
  const isTwoColumn = meta?.columns === 2

  const setLayout = (patch: Partial<LayoutTheme>) => setTheme('layout', patch)

  return (
    <div className="inspector">
      <div className="inspector__section-title">栏目结构</div>

      {!isTwoColumn ? (
        <div className="field__hint" style={{ marginBottom: 12 }}>
          当前模板是单栏，侧栏宽度与栏间距不生效。切到「现代双栏」或「紧凑技术」即可使用。
        </div>
      ) : null}

      <SliderField label="侧栏宽度" value={l.sidebarWidth} min={160} max={340} unit="px" onChange={(v) => setLayout({ sidebarWidth: v })} />
      <SliderField label="栏间距" value={l.columnGap} min={0} max={60} unit="px" onChange={(v) => setLayout({ columnGap: v })} />

      <div className="divider" />
      <div className="inspector__section-title">装饰</div>
      <SliderField label="标题与内容间距" value={l.headingGap} min={0} max={24} unit="px" onChange={(v) => setLayout({ headingGap: v })} />
      <SliderField label="标题装饰线粗细" value={l.headingRuleWidth} min={0} max={6} step={0.5} unit="px" onChange={(v) => setLayout({ headingRuleWidth: v })} />
      <SliderField label="条目色条宽度" value={l.accentBarWidth} min={0} max={8} step={0.5} unit="px" onChange={(v) => setLayout({ accentBarWidth: v })} />
      <SliderField label="全局圆角" value={l.radius} min={0} max={16} unit="px" onChange={(v) => setLayout({ radius: v })} />

      <div className="divider" />
      <div className="inspector__section-title">头像</div>
      <div className="field field--inline">
        <label className="field__label" style={{ flex: '0 0 auto' }}>
          在简历中显示头像
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={resume.theme.avatar.show}
            onChange={(event) => setTheme('avatar', { show: event.target.checked })}
          />
          <span>{resume.theme.avatar.show ? '显示' : '隐藏'}</span>
        </label>
      </div>
      <SliderField label="头像尺寸" value={l.avatarSize} min={48} max={160} unit="px" onChange={(v) => setLayout({ avatarSize: v })} />
      <div className="field">
        <label className="field__label">头像形状</label>
        <select
          className="select"
          value={resume.theme.avatar.shape}
          onChange={(event) => setTheme('avatar', { shape: event.target.value as Theme['avatar']['shape'] })}
        >
          <option value="circle">圆形</option>
          <option value="rounded">圆角</option>
          <option value="square">方形</option>
        </select>
      </div>
      <div className="field">
        <label className="field__label">头像位置</label>
        <select
          className="select"
          value={resume.theme.avatar.position}
          onChange={(event) => setTheme('avatar', { position: event.target.value as Theme['avatar']['position'] })}
        >
          <option value="right">姓名右侧</option>
          <option value="left">姓名左侧</option>
          <option value="below">姓名下方</option>
        </select>
      </div>
      {!resume.meta.avatar ? (
        <div className="field__hint">还没有上传头像，左侧「基本信息」里可以上传并裁剪。</div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 配色
 * ------------------------------------------------------------------ */

const PRESET_PALETTES: Array<{ name: string; colors: ColorTheme }> = [
  {
    name: '商务蓝',
    colors: {
      primary: '#1f3a5f',
      accent: '#3b5f8a',
      text: '#20252e',
      muted: '#59626f',
      border: '#d9dee5',
      sidebarBg: '#f2f6fa',
      sidebarText: '#22303f',
      headerBg: '#ffffff',
      subtleBg: '#eef3f8'
    }
  },
  {
    name: '墨黑',
    colors: {
      primary: '#111827',
      accent: '#4b5563',
      text: '#111827',
      muted: '#6b7280',
      border: '#e5e7eb',
      sidebarBg: '#f9fafb',
      sidebarText: '#111827',
      headerBg: '#ffffff',
      subtleBg: '#f3f4f6'
    }
  },
  {
    name: '松绿',
    colors: {
      primary: '#0f766e',
      accent: '#0891b2',
      text: '#1b2430',
      muted: '#5b6673',
      border: '#dbe3e8',
      sidebarBg: '#f1f7f6',
      sidebarText: '#1d2b33',
      headerBg: '#ffffff',
      subtleBg: '#e6f2f1'
    }
  },
  {
    name: '酒红',
    colors: {
      primary: '#7f1d3f',
      accent: '#b45309',
      text: '#2a1f24',
      muted: '#6f5b63',
      border: '#e8dade',
      sidebarBg: '#fbf4f6',
      sidebarText: '#3a2029',
      headerBg: '#ffffff',
      subtleBg: '#f7e9ee'
    }
  },
  {
    name: '石板',
    colors: {
      primary: '#334155',
      accent: '#0284c7',
      text: '#1e293b',
      muted: '#64748b',
      border: '#dbe2ea',
      sidebarBg: '#f1f5f9',
      sidebarText: '#1e293b',
      headerBg: '#ffffff',
      subtleBg: '#e9eff5'
    }
  }
]

const COLOR_PRESETS = [
  '#1f3a5f',
  '#1f4e79',
  '#0f766e',
  '#111827',
  '#7f1d3f',
  '#334155',
  '#4a3b2a',
  '#1d4ed8',
  '#b45309',
  '#2f7d8c',
  '#6d28d9',
  '#be123c'
]

function ColorsPanel() {
  const resume = useResumeStore((s) => s.resume)
  const setTheme = useResumeStore((s) => s.setTheme)
  if (!resume) return null

  const c = resume.theme.colors
  const setColors = (patch: Partial<ColorTheme>) => setTheme('colors', patch)

  const activePalette = useMemo(
    () => PRESET_PALETTES.find((palette) => palette.colors.primary.toLowerCase() === c.primary.toLowerCase()),
    [c.primary]
  )

  return (
    <div className="inspector">
      <div className="inspector__section-title">配色方案</div>
      <div className="swatch-presets" style={{ marginBottom: 14 }}>
        {PRESET_PALETTES.map((palette) => (
          <button
            key={palette.name}
            type="button"
            className={`chip${activePalette?.name === palette.name ? ' chip--active' : ''}`}
            onClick={() => setColors(palette.colors)}
            title={palette.name}
          >
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: 3,
                background: palette.colors.primary,
                marginRight: 6,
                verticalAlign: 'middle'
              }}
            />
            {palette.name}
          </button>
        ))}
      </div>

      <div className="inspector__section-title">逐项微调</div>
      <ColorField label="主色（姓名、栏目标题）" value={c.primary} presets={COLOR_PRESETS} onChange={(primary) => setColors({ primary })} />
      <ColorField label="强调色（要点符号、装饰）" value={c.accent} presets={COLOR_PRESETS} onChange={(accent) => setColors({ accent })} />
      <ColorField label="正文颜色" value={c.text} onChange={(text) => setColors({ text })} />
      <ColorField label="辅助文字颜色" value={c.muted} onChange={(muted) => setColors({ muted })} />
      <ColorField label="分隔线颜色" value={c.border} onChange={(border) => setColors({ border })} />
      <ColorField label="侧栏背景" value={c.sidebarBg} onChange={(sidebarBg) => setColors({ sidebarBg })} />
      <ColorField label="侧栏文字" value={c.sidebarText} onChange={(sidebarText) => setColors({ sidebarText })} />
      <ColorField label="头部背景" value={c.headerBg} onChange={(headerBg) => setColors({ headerBg })} />
      <ColorField label="浅色装饰背景" value={c.subtleBg} onChange={(subtleBg) => setColors({ subtleBg })} />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 栏目管理
 * ------------------------------------------------------------------ */

function SectionsPanel() {
  const resume = useResumeStore((s) => s.resume)
  const updateSection = useResumeStore((s) => s.updateSection)
  const moveSection = useResumeStore((s) => s.moveSection)
  const setEditingSection = useResumeStore((s) => s.setEditingSection)
  if (!resume) return null

  return (
    <div className="inspector">
      <div className="inspector__section-title">栏目顺序与归属</div>
      <div className="field__hint" style={{ marginBottom: 10 }}>
        「侧栏」只对双栏模板生效；单栏模板会把所有栏目按顺序自上而下排列。
      </div>

      <div className="mini-list">
        {resume.sections.map((section, index) => (
          <div className="itemcard" key={section.id} style={{ gap: 6 }}>
            <div className="itemcard__head">
              <label className="checkbox" style={{ marginRight: 2 }}>
                <input
                  type="checkbox"
                  checked={section.enabled}
                  onChange={(event) => updateSection(section.id, { enabled: event.target.checked })}
                />
              </label>
              <input
                className="input"
                value={section.title}
                onChange={(event) => updateSection(section.id, { title: event.target.value })}
              />
              <button
                type="button"
                className="icon-btn"
                title="上移"
                disabled={index === 0}
                onClick={() => moveSection(section.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn"
                title="下移"
                disabled={index === resume.sections.length - 1}
                onClick={() => moveSection(section.id, 1)}
              >
                ↓
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="select"
                style={{ width: 130 }}
                value={section.slot}
                onChange={(event) => updateSection(section.id, { slot: event.target.value as 'main' | 'side' })}
              >
                <option value="main">主栏</option>
                <option value="side">侧栏</option>
              </select>
              <span className="badge">{section.items.length} 条</span>
              <button
                type="button"
                className="btn btn--sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => setEditingSection(section.id)}
              >
                编辑内容
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 面板容器
 * ------------------------------------------------------------------ */

const TABS = [
  { id: 'template', label: '模板' },
  { id: 'typography', label: '字体' },
  { id: 'spacing', label: '间距' },
  { id: 'layout', label: '版式' },
  { id: 'colors', label: '配色' },
  { id: 'sections', label: '栏目' }
] as const

export function InspectorPane() {
  const tab = useResumeStore((s) => s.inspectorTab)
  const setTab = useResumeStore((s) => s.setInspectorTab)

  return (
    <aside className="pane pane--right">
      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab${tab === item.id ? ' tab--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pane__scroll">
        {tab === 'template' ? <TemplatePanel /> : null}
        {tab === 'typography' ? <TypographyPanel /> : null}
        {tab === 'spacing' ? <SpacingPanel /> : null}
        {tab === 'layout' ? <LayoutPanel /> : null}
        {tab === 'colors' ? <ColorsPanel /> : null}
        {tab === 'sections' ? <SectionsPanel /> : null}
      </div>
    </aside>
  )
}
