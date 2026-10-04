import type { Resume } from '@shared/resume'
import { ResumeHeader, Section, MainStack, SideStack, splitSections } from './blocks'

/**
 * 经典单栏：自上而下，栏目标题带细线，条目左右分栏。
 */
export function ClassicSingle({ resume }: { resume: Resume }) {
  const { main } = splitSections(resume)
  return (
    <div className="rs-doc rs-doc--classic" data-template="classic-single">
      <ResumeHeader resume={resume} slot="main" layout="left" />
      <MainStack>
        {main.map((section, index) => (
          <Section key={section.id} section={section} slot="main" headingVariant="rule" index={index + 1} />
        ))}
      </MainStack>
    </div>
  )
}

/**
 * 现代双栏：左侧浅色栏承载技能/语言/证书，主栏专注经历。
 */
export function ModernSidebar({ resume }: { resume: Resume }) {
  const { main, side } = splitSections(resume)
  return (
    <div className="rs-doc rs-doc--sidebar rs-doc--sidebar-left" data-template="modern-sidebar">
      <aside className="rs-sidebar" data-slot="side">
        <ResumeHeader resume={resume} slot="side" layout="plain" />
        <SideStack>
          {side.map((section) => (
            <Section key={section.id} section={section} slot="side" headingVariant="side" />
          ))}
        </SideStack>
      </aside>
      <div className="rs-main" data-slot="main">
        <ResumeHeader resume={resume} slot="main" layout="left" avatarInHeader={false} />
        <MainStack>
          {main.map((section) => (
            <Section key={section.id} section={section} slot="main" headingVariant="rule" />
          ))}
        </MainStack>
      </div>
    </div>
  )
}

/**
 * 紧凑技术：右侧窄栏压缩技能与证书，主栏高密度排列项目与经历。
 */
export function CompactTech({ resume }: { resume: Resume }) {
  const { main, side } = splitSections(resume)
  return (
    <div className="rs-doc rs-doc--sidebar rs-doc--sidebar-right rs-doc--compact" data-template="compact-tech">
      <div className="rs-main" data-slot="main">
        <ResumeHeader resume={resume} slot="main" layout="left" />
        <MainStack>
          {main.map((section) => (
            <Section key={section.id} section={section} slot="main" headingVariant="bar" />
          ))}
        </MainStack>
      </div>
      <aside className="rs-sidebar" data-slot="side">
        <SideStack>
          {side.map((section) => (
            <Section key={section.id} section={section} slot="side" headingVariant="side" />
          ))}
        </SideStack>
      </aside>
    </div>
  )
}

/**
 * 典雅衬线：居中题头 + 细分隔线，标题采用小型大写。
 */
export function ElegantSerif({ resume }: { resume: Resume }) {
  const { main } = splitSections(resume)
  return (
    <div className="rs-doc rs-doc--elegant" data-template="elegant-serif">
      <ResumeHeader resume={resume} slot="main" layout="center" />
      <MainStack>
        {main.map((section) => (
          <Section key={section.id} section={section} slot="main" headingVariant="underline" />
        ))}
      </MainStack>
    </div>
  )
}

/**
 * 醒目时间线：深色题头 + 左侧色条，侧栏栏目收在文末横向区。
 */
export function BoldTimeline({ resume }: { resume: Resume }) {
  const { main, side } = splitSections(resume)
  return (
    <div className="rs-doc rs-doc--timeline" data-template="bold-timeline">
      <ResumeHeader resume={resume} slot="main" layout="banner" />
      <MainStack>
        {main.map((section) => (
          <Section key={section.id} section={section} slot="main" headingVariant="rule" />
        ))}
      </MainStack>
      {side.length > 0 ? (
        <div className="rs-timeline-footer">
          {side.map((section) => (
            <Section key={section.id} section={section} slot="side" headingVariant="bar" />
          ))}
        </div>
      ) : null}
    </div>
  )
}
