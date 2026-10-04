import type { Resume } from '@shared/resume'
import { TEMPLATES, getTemplateMeta, type TemplateMeta } from './catalog'
import { ClassicSingle, ModernSidebar, CompactTech, ElegantSerif, BoldTimeline } from './designs'
import type { TemplateRenderer } from './types'

const RENDERERS: Record<string, TemplateRenderer> = {
  'classic-single': ClassicSingle,
  'modern-sidebar': ModernSidebar,
  'compact-tech': CompactTech,
  'elegant-serif': ElegantSerif,
  'bold-timeline': BoldTimeline
}

export interface RenderableTemplate {
  meta: TemplateMeta
  Render: TemplateRenderer
}

/** 目录元数据与渲染函数按 id 配对；缺失时回退到第一套模板 */
export function resolveTemplate(id: string): RenderableTemplate {
  const meta = getTemplateMeta(id)
  return { meta, Render: RENDERERS[meta.id] }
}

export function templateList(): RenderableTemplate[] {
  return TEMPLATES.map((meta) => ({ meta, Render: RENDERERS[meta.id] }))
}

/** 渲染一份简历。预览与 PDF 导出共用同一条路径，保证所见即所得。 */
export function renderResume(resume: Resume) {
  const { Render } = resolveTemplate(resume.template)
  return <Render resume={resume} />
}

export { TEMPLATES, getTemplateMeta }
export type { TemplateMeta }
