import type { CSSProperties, ReactElement } from 'react'
import type { Resume } from '@shared/resume'
import type { TemplateMeta } from './catalog'

export type ResumeStyle = CSSProperties

/**
 * 模板渲染函数：只负责布局。
 * 所有视觉参数都通过 CSS 变量（见 @shared/theme 的 themeToCssVars）注入，
 * 因此新增模板会自动获得字体、间距、配色等全部可调项。
 */
export type TemplateRenderer = (props: { resume: Resume }) => ReactElement

export interface ResolvedTemplate {
  meta: TemplateMeta
  Render: TemplateRenderer
}
