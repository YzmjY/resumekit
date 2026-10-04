import type { ThemePatch } from '@shared/theme'

export type TemplateCategory = '通用' | '技术' | '学术' | '创意'

export type SidebarPlacement = 'left' | 'right'

export interface TemplateMeta {
  id: string
  name: string
  category: TemplateCategory
  /** 一句话适用场景，展示在模板卡片上 */
  description: string
  tags: string[]
  /** 单栏 / 双栏 */
  columns: 1 | 2
  /** 双栏模板的侧栏位置 */
  sidebar?: SidebarPlacement
  /** 该模板的推荐令牌，选中时作为初始参数；用户后续修改会被保留 */
  defaults: ThemePatch
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'classic-single',
    name: '经典单栏',
    category: '通用',
    description: '自上而下的传统结构，黑白灰为主，适合国企、体制内与大多数常规投递。',
    tags: ['单栏', '稳重', '打印友好'],
    columns: 1,
    defaults: {
      typography: {
        fontFamily:
          "'Inter','PingFang SC','Microsoft YaHei','Hiragino Sans GB','Segoe UI',system-ui,sans-serif",
        baseFontSize: 10.5,
        lineHeight: 1.6,
        h2Size: 11.5,
        nameSize: 24,
        headingTransform: 'none'
      },
      colors: {
        primary: '#1f3a5f',
        accent: '#3b5f8a',
        text: '#20252e',
        muted: '#59626f',
        border: '#d9dee5',
        headerBg: '#ffffff'
      },
      spacing: { pagePaddingX: 52, pagePaddingY: 46, sectionGap: 14, itemGap: 9 },
      layout: { headingRuleWidth: 1, headingGap: 7, accentBarWidth: 0, radius: 0 }
    }
  },
  {
    id: 'modern-sidebar',
    name: '现代双栏',
    category: '通用',
    description: '浅色侧栏承载技能、语言与证书，主栏专注经历叙述，信息密度与可读性平衡。',
    tags: ['双栏', '侧栏', '信息密集'],
    columns: 2,
    sidebar: 'left',
    defaults: {
      typography: {
        fontFamily:
          "'Inter','PingFang SC','Microsoft YaHei','Hiragino Sans GB','Segoe UI',system-ui,sans-serif",
        baseFontSize: 10,
        lineHeight: 1.58,
        h2Size: 11,
        nameSize: 23,
        headingTransform: 'uppercase',
        headingLetterSpacing: 0.6
      },
      colors: {
        primary: '#1b3a57',
        accent: '#2f7d8c',
        text: '#1f2430',
        muted: '#5c6672',
        border: '#dfe5ec',
        sidebarBg: '#f2f6fa',
        sidebarText: '#22303f'
      },
      spacing: { pagePaddingX: 34, pagePaddingY: 38, sidebarPadding: 24, sectionGap: 13, itemGap: 9 },
      layout: { sidebarWidth: 244, columnGap: 24, headingRuleWidth: 0, headingGap: 6, radius: 4 }
    }
  },
  {
    id: 'compact-tech',
    name: '紧凑技术',
    category: '技术',
    description: '等宽标题、标签化技能、紧凑行距，把更多项目与技术栈压进一页。',
    tags: ['技术', '紧凑', '标签'],
    columns: 2,
    sidebar: 'right',
    defaults: {
      typography: {
        fontFamily:
          "'Inter','PingFang SC','Microsoft YaHei','Hiragino Sans GB','Segoe UI',system-ui,sans-serif",
        headingFontFamily: "'JetBrains Mono','Cascadia Mono','Consolas','Microsoft YaHei',monospace",
        baseFontSize: 9.8,
        lineHeight: 1.5,
        h2Size: 10.4,
        nameSize: 21,
        smallSize: 8.8,
        headingTransform: 'uppercase',
        headingLetterSpacing: 0.8
      },
      colors: {
        primary: '#0f766e',
        accent: '#0891b2',
        text: '#1b2430',
        muted: '#5b6673',
        border: '#dbe3e8',
        sidebarBg: '#f1f5f7',
        sidebarText: '#1d2b33',
        subtleBg: '#e6f2f1'
      },
      spacing: { pagePaddingX: 32, pagePaddingY: 34, sidebarPadding: 22, sectionGap: 11, itemGap: 7, paragraphGap: 3 },
      layout: { sidebarWidth: 250, columnGap: 20, headingRuleWidth: 2, headingGap: 5, radius: 3 }
    }
  },
  {
    id: 'elegant-serif',
    name: '典雅衬线',
    category: '学术',
    description: '居中题头配衬线字体与装饰分隔，适合学术、教育、法务与咨询方向的申请。',
    tags: ['衬线', '居中', '学术'],
    columns: 1,
    defaults: {
      typography: {
        fontFamily: "'Georgia','Palatino Linotype','Songti SC','SimSun',serif",
        headingFontFamily: "'Georgia','Palatino Linotype','Songti SC',serif",
        baseFontSize: 10.6,
        lineHeight: 1.68,
        h1Size: 15,
        h2Size: 12,
        nameSize: 27,
        nameWeight: 600,
        headingTransform: 'small-caps',
        headingLetterSpacing: 0.8
      },
      colors: {
        primary: '#4a3b2a',
        accent: '#8a6d3b',
        text: '#2a2622',
        muted: '#6b6259',
        border: '#ddd4c6',
        subtleBg: '#f7f3ec'
      },
      spacing: { pagePaddingX: 58, pagePaddingY: 50, sectionGap: 16, itemGap: 10 },
      layout: { headingRuleWidth: 1, headingGap: 8, radius: 0 }
    }
  },
  {
    id: 'bold-timeline',
    name: '醒目时间线',
    category: '创意',
    description: '左侧色条贯穿经历，栏目编号与深色题头带来强视觉节奏，适合互联网与设计岗位。',
    tags: ['时间线', '强对比', '编号'],
    columns: 1,
    defaults: {
      typography: {
        fontFamily: "'Inter','PingFang SC','Microsoft YaHei','Hiragino Sans GB','Segoe UI',system-ui,sans-serif",
        baseFontSize: 10.4,
        lineHeight: 1.62,
        h1Size: 15,
        h2Size: 11.6,
        nameSize: 26,
        nameWeight: 800,
        headingWeight: 700,
        headingTransform: 'none'
      },
      colors: {
        primary: '#1d4ed8',
        accent: '#f97316',
        text: '#111827',
        muted: '#5b6472',
        border: '#e0e5ec',
        headerBg: '#f8fafc',
        subtleBg: '#eef2ff'
      },
      spacing: { pagePaddingX: 44, pagePaddingY: 40, sectionGap: 16, itemGap: 11, paragraphGap: 4 },
      layout: { headingRuleWidth: 3, headingGap: 8, accentBarWidth: 3, radius: 0 }
    }
  }
]

export function getTemplateMeta(id: string): TemplateMeta {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}
