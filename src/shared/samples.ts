import type { Resume, ResumeSection, SectionKind, SectionSlot } from './resume'
import { SECTION_KIND_LABELS } from './resume'
import { makeId, emptyItem, createSection } from './ids'
import { defaultTheme } from './theme'

/** 新建栏目时的默认归属，双栏模板据此把技能类栏目放侧栏 */
function defaultSlot(kind: SectionKind): SectionSlot {
  return kind === 'skills' || kind === 'languages' || kind === 'certifications' ? 'side' : 'main'
}

/** 按栏目种类给出示例条目，让新用户一进来就能看到成品效果 */
function sampleItems(kind: SectionKind): ResumeSection['items'] {
  switch (kind) {
    case 'summary':
      return [
        {
          ...emptyItem(),
          description:
            '示例：6 年后端与数据平台经验，主导过日均千万级请求的网关重构，擅长把模糊业务目标拆解为可交付的技术方案，并推动跨团队落地。'
        }
      ]
    case 'experience':
      return [
        {
          ...emptyItem(),
          title: '某某科技有限公司',
          subtitle: '高级后端工程师',
          meta: '2021.06 – 至今',
          extra: '上海',
          description: '负责核心交易网关与数据同步链路，团队 6 人，主导技术选型与关键模块落地。',
          highlights: [
            '将网关 P99 延迟从 420ms 降至 96ms，单机吞吐提升 3.1 倍',
            '设计增量同步方案，替代全量对账，日节省算力成本约 1.2 万元',
            '推动单元测试覆盖率从 38% 提升到 76%，线上事故同比下降 60%'
          ],
          tags: []
        },
        {
          ...emptyItem(),
          title: '某某网络技术有限公司',
          subtitle: '后端工程师',
          meta: '2019.07 – 2021.05',
          extra: '杭州',
          description: '参与用户中心与风控服务开发，负责接口性能优化与灰度发布流程建设。',
          highlights: ['主导用户中心服务拆分，接口平均响应时间下降 45%', '搭建灰度发布脚本与回滚预案，发布失败恢复时间从 30 分钟缩短至 3 分钟'],
          tags: []
        }
      ]
    case 'education':
      return [
        {
          ...emptyItem(),
          title: '某某大学',
          subtitle: '计算机科学与技术 · 硕士',
          meta: '2016.09 – 2019.06',
          extra: 'GPA 3.8/4.0 · 专业前 5%',
          description: '研究方向为分布式存储，发表 EI 会议论文 1 篇。',
          highlights: []
        },
        {
          ...emptyItem(),
          title: '某某大学',
          subtitle: '软件工程 · 学士',
          meta: '2012.09 – 2016.06',
          extra: 'GPA 3.6/4.0',
          highlights: []
        }
      ]
    case 'projects':
      return [
        {
          ...emptyItem(),
          title: '开源分布式任务调度器',
          subtitle: '项目负责人',
          meta: '2022.03 – 2023.01',
          extra: 'GitHub 1.8k Star',
          description: '面向中小团队的轻量任务调度与可视化运维平台。',
          highlights: ['支持 10 万级定时任务，调度延迟低于 1 秒', '提供 Web 控制台与 OpenAPI，被 30+ 团队采用'],
          tags: ['Go', 'etcd', 'React']
        }
      ]
    case 'skills':
      return [
        {
          ...emptyItem(),
          title: '后端开发',
          description: 'Java / Go / Spring Boot / gRPC',
          tags: [],
          highlights: []
        },
        {
          ...emptyItem(),
          title: '数据与存储',
          description: 'MySQL / Redis / Kafka / ClickHouse',
          tags: [],
          highlights: []
        },
        { ...emptyItem(), title: '工程效能', description: 'Docker / Kubernetes / CI 流水线', tags: [], highlights: [] }
      ]
    case 'certifications':
      return [{ ...emptyItem(), title: 'AWS Certified Solutions Architect', meta: '2023', description: '', highlights: [], tags: [] }]
    case 'languages':
      return [
        { ...emptyItem(), title: '英语', level: 'CET-6 · 可作为工作语言', description: '' },
        { ...emptyItem(), title: '普通话', level: '二级甲等', description: '' }
      ]
    case 'awards':
      return [{ ...emptyItem(), title: '公司年度技术创新奖', meta: '2023', description: '网关性能优化项目' }]
    default:
      return [emptyItem()]
  }
}

/** 新建栏目时使用的标题与示例内容 */
export function createSampleSection(kind: SectionKind): ResumeSection {
  return createSection(kind, {
    title: SECTION_KIND_LABELS[kind],
    slot: defaultSlot(kind),
    items: sampleItems(kind),
    enabled: true
  })
}

/** 新建空白栏目（用户点「添加栏目」时要不要示例内容由这里决定，目前给示例更友好） */
export function createBlankSection(kind: SectionKind): ResumeSection {
  return createSection(kind, {
    title: SECTION_KIND_LABELS[kind],
    slot: defaultSlot(kind),
    items: [emptyItem()],
    enabled: true
  })
}

/** 一份可立刻导出的示例简历 */
export function createStarterResume(template = 'classic-single'): Resume {
  const kinds: SectionKind[] = ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'languages']
  return {
    id: makeId('resume'),
    name: '我的简历',
    template,
    version: 1,
    theme: defaultTheme(),
    meta: {
      name: '李明',
      title: '高级后端工程师',
      email: 'zhang@example.com',
      phone: '138-0000-0000',
      location: '上海 · 浦东新区',
      avatar: '',
      links: [
        { label: 'GitHub', url: 'github.com/example' },
        { label: '个人主页', url: 'example.com' }
      ]
    },
    sections: kinds.map((kind) => createSampleSection(kind))
  }
}
