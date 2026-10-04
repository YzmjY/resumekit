/**
 * 简历数据模型与主题令牌定义。
 * 该文件同时被主进程与渲染进程引用，必须保持零依赖。
 */

/* ------------------------------------------------------------------ *
 * 主题令牌 —— 所有模板共享的可调参数
 * 令牌会被编译成 CSS 变量，模板只消费变量，因此新增模板自动获得全部参数能力。
 * ------------------------------------------------------------------ */

export type FontPresetId =
  | 'modernSans'
  | 'systemCJK'
  | 'classicSerif'
  | 'elegantSerif'
  | 'mono'
  | 'humanistSans'

export interface TypographyTheme {
  /** 正文字体族（CSS font-family 值） */
  fontFamily: string
  /** 标题字体族；留空则继承正文 */
  headingFontFamily: string
  baseFontSize: number
  lineHeight: number
  letterSpacing: number
  h1Size: number
  h2Size: number
  h3Size: number
  smallSize: number
  nameSize: number
  nameWeight: number
  headingWeight: number
  /** 标题是否大写（含小型大写字母效果） */
  headingTransform: 'none' | 'uppercase' | 'small-caps'
  headingLetterSpacing: number
}

export interface ColorTheme {
  primary: string
  accent: string
  text: string
  muted: string
  border: string
  /** 侧栏/强调块背景 */
  sidebarBg: string
  sidebarText: string
  headerBg: string
  /** 用于浅色装饰（分隔线、时间线） */
  subtleBg: string
}

export interface SpacingTheme {
  /** 页面内边距 */
  pagePaddingX: number
  pagePaddingY: number
  /** 侧栏内边距 */
  sidebarPadding: number
  /** 条目之间的垂直间距 */
  sectionGap: number
  itemGap: number
  /** 段落（岗位描述/要点）行间距 */
  paragraphGap: number
  bulletGap: number
}

export interface LayoutTheme {
  /** 双栏模板的侧栏宽度（px） */
  sidebarWidth: number
  /** 双栏间距 */
  columnGap: number
  /** 标题与内容之间的距离 */
  headingGap: number
  /** 标题下方装饰线粗细，0 为无线 */
  headingRuleWidth: number
  /** 条目内左侧时间线/装饰条宽度 */
  accentBarWidth: number
  /** 头像尺寸（px） */
  avatarSize: number
  /** 全局圆角 */
  radius: number
}

export type AvatarShape = 'circle' | 'square' | 'rounded'
export type AvatarPosition = 'right' | 'left' | 'below'

export interface AvatarTheme {
  show: boolean
  shape: AvatarShape
  position: AvatarPosition
}

export interface Theme {
  typography: TypographyTheme
  colors: ColorTheme
  spacing: SpacingTheme
  layout: LayoutTheme
  avatar: AvatarTheme
}

/* ------------------------------------------------------------------ *
 * 简历内容
 * ------------------------------------------------------------------ */

export type SectionKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'projects'
  | 'skills'
  | 'certifications'
  | 'languages'
  | 'awards'
  | 'custom'

/** 侧栏归属。双栏模板据此把栏目分配到主栏或侧栏。 */
export type SectionSlot = 'main' | 'side'

/**
 * 条目字段刻意保持宽松：编辑器与模板都以字段名读写，
 * 新增一种栏目不需要改动联合类型。
 */
export interface ResumeItem {
  id: string
  /** 主标题：公司 / 学校 / 项目名 */
  title: string
  /** 副标题：岗位 / 专业 / 角色 */
  subtitle: string
  /** 时间：自由文本，如 2021.03 – 2024.06 */
  meta: string
  /** 补充行：地点 / GPA / 链接 */
  extra: string
  /** 概述段落 */
  description: string
  /** 要点列表 */
  highlights: string[]
  /** 标签（技能、技术栈） */
  tags: string[]
  /** 等级，用于语言/技能栏目，如「精通」「CET-6」 */
  level: string
}

export interface ResumeSection {
  id: string
  kind: SectionKind
  /** 栏目标题，用户可改 */
  title: string
  enabled: boolean
  slot: SectionSlot
  items: ResumeItem[]
}

export interface ResumeLink {
  label: string
  url: string
}

export interface ResumeMeta {
  name: string
  title: string
  email: string
  phone: string
  location: string
  /** 头像（data URL），未设置时为空 */
  avatar: string
  links: ResumeLink[]
}

export interface Resume {
  id: string
  /** 简历文件名，用于左侧列表展示 */
  name: string
  template: string
  /** 数据版本，便于后续迁移 */
  version: number
  theme: Theme
  meta: ResumeMeta
  sections: ResumeSection[]
}

export interface ResumeIndexEntry {
  id: string
  name: string
  template: string
  createdAt: number
  updatedAt: number
}

export interface ResumeIndex {
  version: number
  entries: ResumeIndexEntry[]
  lastOpenedId: string | null
}

/* ------------------------------------------------------------------ *
 * PDF 导出
 * ------------------------------------------------------------------ */

export interface ExportPdfRequest {
  /** 渲染好的 HTML 片段 */
  html: string
  /** CSS 变量声明块 */
  cssVars: string
  /** 附加样式 */
  extraCss?: string
  /** 建议文件名，不含扩展名 */
  suggestedName: string
  /** 页面尺寸，默认 A4 */
  pageSize?: 'A4' | 'A3' | 'Letter'
}

export type ExportPdfResult =
  | { ok: true; path: string; bytes: number }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string }

/* ------------------------------------------------------------------ *
 * 通用常量
 * ------------------------------------------------------------------ */

/** A4 在 96dpi 下的 CSS 像素尺寸 */
export const A4_WIDTH_PX = 794
export const A4_HEIGHT_PX = 1123

export const SECTION_KIND_LABELS: Record<SectionKind, string> = {
  summary: '个人简介',
  experience: '工作经历',
  education: '教育背景',
  projects: '项目经历',
  skills: '专业技能',
  certifications: '证书资质',
  languages: '语言能力',
  awards: '荣誉奖项',
  custom: '自定义栏目'
}
