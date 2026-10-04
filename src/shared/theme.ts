import type {
  FontPresetId,
  Theme,
  TypographyTheme,
  ColorTheme,
  SpacingTheme,
  LayoutTheme,
  AvatarTheme
} from '@shared/resume'

/* ------------------------------------------------------------------ *
 * 字体预设
 * ------------------------------------------------------------------ */

export interface FontPreset {
  id: FontPresetId
  label: string
  hint: string
  /** 正文（含中文回退） */
  body: string
  /** 标题；null 表示与正文相同 */
  heading: string | null
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'modernSans',
    label: '现代无衬线',
    hint: 'Inter / 苹方 / 微软雅黑，屏幕与打印都干净',
    body: "'Inter','PingFang SC','Microsoft YaHei','Hiragino Sans GB','Segoe UI',system-ui,sans-serif",
    heading: null
  },
  {
    id: 'systemCJK',
    label: '中文优先',
    hint: '思源黑体 / 微软雅黑，中文场景最稳',
    body: "'Source Han Sans SC','Noto Sans SC','Microsoft YaHei','PingFang SC','Hiragino Sans GB',sans-serif",
    heading: null
  },
  {
    id: 'humanistSans',
    label: '人文无衬线',
    hint: 'Segoe UI / Lantinghei，字形更柔和',
    body: "'Segoe UI','Lantinghei SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif",
    heading: null
  },
  {
    id: 'classicSerif',
    label: '经典衬线',
    hint: 'Times / 宋体，学术与体制内投递常用',
    body: "'Times New Roman','Songti SC','SimSun','Georgia',serif",
    heading: null
  },
  {
    id: 'elegantSerif',
    label: '典雅衬线',
    hint: 'Georgia / 华文中宋，标题更具书卷气',
    body: "'Georgia','Palatino Linotype','Songti SC','SimSun',serif",
    heading: "'Georgia','Palatino Linotype','Songti SC',serif"
  },
  {
    id: 'mono',
    label: '等宽技术风',
    hint: 'JetBrains Mono / 等线，适合研发岗位',
    body: "'JetBrains Mono','Cascadia Mono','Consolas','Microsoft YaHei',monospace",
    heading: "'JetBrains Mono','Cascadia Mono','Consolas',monospace"
  }
]

export const FONT_PRESET_IDS = FONT_PRESETS.map((p) => p.id)

export function getFontPreset(id: FontPresetId): FontPreset {
  return FONT_PRESETS.find((p) => p.id === id) ?? FONT_PRESETS[0]
}

/** 反查：当前 fontFamily 属于哪个预设（找不到返回 null，说明是自定义） */
export function matchFontPreset(theme: TypographyTheme): FontPresetId | null {
  const found = FONT_PRESETS.find((p) => p.body === theme.fontFamily)
  return found ? found.id : null
}

/* ------------------------------------------------------------------ *
 * 默认令牌
 * ------------------------------------------------------------------ */

export const defaultTypography: TypographyTheme = {
  fontFamily: FONT_PRESETS[0].body,
  headingFontFamily: '',
  baseFontSize: 10.5,
  lineHeight: 1.6,
  letterSpacing: 0,
  h1Size: 15,
  h2Size: 11.5,
  h3Size: 10.8,
  smallSize: 9.2,
  nameSize: 25,
  nameWeight: 700,
  headingWeight: 600,
  headingTransform: 'none',
  headingLetterSpacing: 0.2
}

export const defaultColors: ColorTheme = {
  primary: '#1f4e79',
  accent: '#2f7d8c',
  text: '#1f2430',
  muted: '#5c6672',
  border: '#d8dee6',
  sidebarBg: '#f4f7fa',
  sidebarText: '#243044',
  headerBg: '#ffffff',
  subtleBg: '#eef3f8'
}

export const defaultSpacing: SpacingTheme = {
  pagePaddingX: 46,
  pagePaddingY: 42,
  sidebarPadding: 26,
  sectionGap: 14,
  itemGap: 9,
  paragraphGap: 4,
  bulletGap: 2.5
}

export const defaultLayout: LayoutTheme = {
  sidebarWidth: 250,
  columnGap: 22,
  headingGap: 7,
  headingRuleWidth: 1,
  accentBarWidth: 0,
  avatarSize: 88,
  radius: 0
}

export const defaultAvatar: AvatarTheme = {
  show: false,
  shape: 'circle',
  position: 'right'
}

export function defaultTheme(): Theme {
  return {
    typography: { ...defaultTypography },
    colors: { ...defaultColors },
    spacing: { ...defaultSpacing },
    layout: { ...defaultLayout },
    avatar: { ...defaultAvatar }
  }
}

/* ------------------------------------------------------------------ *
 * 每套模板的推荐初始令牌
 * ------------------------------------------------------------------ */

export type ThemePatch = {
  [K in keyof Theme]?: Partial<Theme[K]>
}

export interface TemplateDefaults {
  theme: ThemePatch
}

/** 把推荐令牌叠加到默认主题上（深合并一层即可，令牌都是扁平结构） */
export function applyThemePatch(base: Theme, patch: ThemePatch): Theme {
  const next: Theme = {
    typography: { ...base.typography },
    colors: { ...base.colors },
    spacing: { ...base.spacing },
    layout: { ...base.layout },
    avatar: { ...base.avatar }
  }
  for (const key of Object.keys(patch) as (keyof Theme)[]) {
    const part = patch[key]
    if (!part) continue
    Object.assign(next[key], part)
  }
  return next
}

/* ------------------------------------------------------------------ *
 * 令牌 → CSS 变量
 * ------------------------------------------------------------------ */

/** 数值转 px；0 保持 0（无单位在某些属性上更稳妥，但统一 px 便于计算） */
function px(value: number): string {
  return `${Number.isFinite(value) ? value : 0}px`
}

/**
 * 生成 CSS 变量声明块（不含选择器）。
 * 模板只使用这些变量，因此任何令牌调整都会立刻作用到所有模板。
 */
export function themeToCssVars(theme: Theme): string {
  const t = theme.typography
  const c = theme.colors
  const s = theme.spacing
  const l = theme.layout
  const a = theme.avatar

  const headingFont = t.headingFontFamily.trim() || t.fontFamily

  return [
    `--rs-font: ${t.fontFamily};`,
    `--rs-font-heading: ${headingFont};`,
    `--rs-fs-base: ${t.baseFontSize}pt;`,
    `--rs-fs-h1: ${t.h1Size}pt;`,
    `--rs-fs-h2: ${t.h2Size}pt;`,
    `--rs-fs-h3: ${t.h3Size}pt;`,
    `--rs-fs-small: ${t.smallSize}pt;`,
    `--rs-fs-name: ${t.nameSize}pt;`,
    `--rs-lh: ${t.lineHeight};`,
    `--rs-ls: ${t.letterSpacing}px;`,
    `--rs-fw-name: ${t.nameWeight};`,
    `--rs-fw-heading: ${t.headingWeight};`,
    `--rs-heading-transform: ${t.headingTransform};`,
    `--rs-heading-ls: ${t.headingLetterSpacing}px;`,

    `--rs-c-primary: ${c.primary};`,
    `--rs-c-accent: ${c.accent};`,
    `--rs-c-text: ${c.text};`,
    `--rs-c-muted: ${c.muted};`,
    `--rs-c-border: ${c.border};`,
    `--rs-c-sidebar-bg: ${c.sidebarBg};`,
    `--rs-c-sidebar-text: ${c.sidebarText};`,
    `--rs-c-header-bg: ${c.headerBg};`,
    `--rs-c-subtle: ${c.subtleBg};`,

    `--rs-pad-x: ${px(s.pagePaddingX)};`,
    `--rs-pad-y: ${px(s.pagePaddingY)};`,
    `--rs-pad-side: ${px(s.sidebarPadding)};`,
    `--rs-gap-section: ${px(s.sectionGap)};`,
    `--rs-gap-item: ${px(s.itemGap)};`,
    `--rs-gap-para: ${px(s.paragraphGap)};`,
    `--rs-gap-bullet: ${px(s.bulletGap)};`,

    `--rs-sidebar-w: ${px(l.sidebarWidth)};`,
    `--rs-col-gap: ${px(l.columnGap)};`,
    `--rs-gap-heading: ${px(l.headingGap)};`,
    `--rs-rule-w: ${px(l.headingRuleWidth)};`,
    `--rs-accent-bar: ${px(l.accentBarWidth)};`,
    `--rs-avatar-size: ${px(l.avatarSize)};`,
    `--rs-radius: ${px(l.radius)};`,

    `--rs-avatar-shape: ${a.shape === 'circle' ? '50%' : a.shape === 'rounded' ? '14%' : '0'};`
  ].join('\n  ')
}
