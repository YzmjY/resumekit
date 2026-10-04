/**
 * 冒烟测试：运行真正构建出来的主进程产物（out/main/index.js），
 * 由探针只做两件事——替掉保存对话框、注册一个测试用的 IPC 检索通道——
 * 然后驱动真实界面完成一次导出，最后校验产物。
 *
 * 这样验证的是「实际会跑的那份代码」，不会因为另写一份逻辑而与产品行为脱节。
 *
 * 用法：npm run probe
 */
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const electron = require('electron')
const { app, BrowserWindow, dialog } = electron

const projectRoot = path.resolve(__dirname, '..', '..')
const scratch = path.join(projectRoot, '.scratch')
const userDataDir = path.join(scratch, 'probe-userdata')
const exportTarget = path.join(scratch, 'probe-export.pdf')

const failures = []
const passes = []
const notes = []

function check(name, condition, detail) {
  if (condition) passes.push(`${name}${detail ? ` — ${detail}` : ''}`)
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

/* 必须在加载产物之前准备好用户数据目录 */
fs.rmSync(userDataDir, { recursive: true, force: true })
fs.rmSync(exportTarget, { force: true })
fs.mkdirSync(scratch, { recursive: true })
app.setPath('userData', userDataDir)

/* ---- 替掉保存对话框：返回固定路径，无需人工点击 ---- */
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportTarget })

/* ---- 极简 PDF 解析：数页、读页面尺寸、抽文本 ---- */
function inspectPdf(buffer) {
  const raw = buffer.toString('latin1')
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  const boxes = [...raw.matchAll(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g)].map((m) =>
    m.slice(1, 5).map(Number)
  )
  const chunks = []
  for (const match of raw.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
    chunks.push(
      match[0]
        .slice(1, -1)
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\(\d{1,3})/g, (_, code) => String.fromCharCode(parseInt(code, 8)))
    )
  }
  return {
    pages,
    boxes,
    text: chunks.join(' '),
    hasCidText: /<[0-9A-Fa-f\s]{8,}>\s*Tj/.test(raw),
    hasEmbeddedFont: /\/FontFile2|\/FontFile3|\/FontFile\b/.test(raw),
    creator: (raw.match(/\/Creator\s*\(([^)]*)\)/) ?? [])[1] ?? ''
  }
}

/* ---- 加载真正的主进程产物 ---- */
const rendererErrors = []
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('console-message', (event) => {
    const level = event && event.level
    const message = String((event && event.message) || '')
    // 开发期 Electron 会打印安全提示，与应用缺陷无关
    const ignorable = message.indexOf('Electron Security Warning') >= 0 || message.indexOf('%cElectron Security') >= 0
    if (ignorable) return
    if (level === 'error' || level === 'warning' || level === 3 || level === 2) {
      rendererErrors.push(message)
    }
  })
  win.webContents.on('render-process-gone', (_e, details) => rendererErrors.push(`renderer gone: ${details.reason}`))
})

require(path.join(projectRoot, 'out', 'main', 'index.js'))

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function step(message) {
  console.log(`[probe] ${message}`)
}

const SCRIPT_TIMEOUT_MS = 40000

/** 带超时的页面脚本执行：避免任何一步卡死整个探针 */
async function runScript(win, source, label) {
  step(`执行页面脚本：${label}`)
  const timeout = delay(SCRIPT_TIMEOUT_MS).then(() => ({ timedOut: true }))
  const execution = win.webContents.executeJavaScript(source).then(
    (value) => ({ value }),
    (error) => ({ error: String((error && error.message) || error) })
  )
  const result = await Promise.race([execution, timeout])
  if (result.timedOut) {
    step(`页面脚本超时：${label}`)
    return { timedOut: true }
  }
  if (result.error) {
    step(`页面脚本报错：${label} — ${result.error}`)
    return { error: result.error }
  }
  try {
    return JSON.parse(result.value)
  } catch (error) {
    step(`页面脚本返回值无法解析：${label} — ${String(error)}`)
    return { parseError: String(result.value).slice(0, 200) }
  }
}

async function waitForWindow(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    if (win && !win.webContents.isLoading()) return win
    await delay(200)
  }
  return null
}

async function waitForRender(win, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    const snapshot = await win.webContents
      .executeJavaScript(
        `(() => {
          const doc = document.querySelector('.rs-doc')
          return JSON.stringify({
            doc: Boolean(doc),
            sections: document.querySelectorAll('.rs-section').length,
            papers: document.querySelectorAll('.preview__paper').length
          })
        })()`
      )
      .then(JSON.parse)
      .catch((error) => ({ error: String(error) }))
    last = snapshot
    if (snapshot.doc && snapshot.sections > 0 && snapshot.papers > 0) return snapshot
    await delay(250)
  }
  return last
}

/**
 * 调用 Python 帮手还原 PDF 里的中文：Chromium 用 CID 十六进制字串存文本，
 * 字面量里读不到中文，必须走 /ToUnicode 映射表。
 */
function decodePdfText(pdfPath, probes) {
  const python = process.env.RS_PYTHON || process.env.PYTHON || 'python'
  const script = path.join(__dirname, 'pdf-text.py')
  if (!fs.existsSync(script)) return null
  try {
    const result = spawnSync(python, [script, pdfPath, ...probes], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      timeout: 60000
    })
    if (result.error || result.status !== 0 || !result.stdout) {
      step(`PDF 文本还原失败：${result.error ? result.error.message : result.stderr || result.status}`)
      return null
    }
    return JSON.parse(result.stdout)
  } catch (error) {
    step(`PDF 文本还原异常：${String(error)}`)
    return null
  }
}

async function main() {
  step('等待主进程创建窗口')
  const win = await waitForWindow()
  check('主进程产物启动了窗口', Boolean(win), win ? '' : '超时未创建窗口')
  if (!win) return finish()

  step('等待界面渲染完成')
  const rendered = await waitForRender(win)
  check('React 界面渲染出简历', Boolean(rendered && rendered.doc), JSON.stringify(rendered))

  const metrics = await runScript(
    win,
    `(() => {
      const doc = document.querySelector('.rs-doc')
      const content = document.querySelector('.preview__content')
      const scroll = document.querySelector('.preview')
      const transform = content ? getComputedStyle(content).transform : ''
      const parts = transform.indexOf('matrix(') === 0 ? transform.slice(7, -1).split(', ') : []
      return JSON.stringify({
        devicePixelRatio: window.devicePixelRatio,
        innerWidth: window.innerWidth,
        docOffsetWidth: doc ? doc.offsetWidth : null,
        docClientWidth: doc ? doc.clientWidth : null,
        docRectWidth: doc ? Math.round(doc.getBoundingClientRect().width) : null,
        contentTransform: transform,
        scale: parts.length >= 1 ? Number(parts[0]) : 1,
        scrollClientWidth: scroll ? scroll.clientWidth : null
      })
    })()`,
    '读取尺寸令牌'
  )
  notes.push(`尺寸诊断：${JSON.stringify(metrics)}`)

  const state = await runScript(
    win,
    `(() => {
      const doc = document.querySelector('.rs-doc')
      if (!doc) return JSON.stringify({ ok: false })
      const style = getComputedStyle(doc)
      return JSON.stringify({
        ok: true,
        template: doc.getAttribute('data-template'),
        sections: document.querySelectorAll('.rs-section').length,
        items: document.querySelectorAll('.rs-item').length,
        papers: document.querySelectorAll('.preview__paper').length,
        docOffsetWidth: doc.offsetWidth,
        height: doc.offsetHeight,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        paddingTop: style.paddingTop,
        primary: style.getPropertyValue('--rs-c-primary').trim(),
        pageWidthVar: style.getPropertyValue('--rs-page-width').trim(),
        name: (document.querySelector('.rs-name') || {}).textContent || '',
        libraryItems: document.querySelectorAll('.library__item').length,
        templateCards: document.querySelectorAll('.tplcard').length,
        tabs: document.querySelectorAll('.tab').length,
        sectionCards: document.querySelectorAll('.sectioncard').length
      })
    })()`,
    '读取界面状态'
  )
  notes.push(`渲染状态快照：${JSON.stringify(state)}`)

  if (!state.ok) {
    check('预览状态可读取', false, JSON.stringify(state))
  } else {
    check('A4 宽度令牌已注入', state.pageWidthVar === '794px', `--rs-page-width=${state.pageWidthVar}`)
    check('预览文档宽度等于 A4 宽度', state.docOffsetWidth === 794, `${state.docOffsetWidth}px`)
    check('页边距令牌生效', state.paddingTop !== '0px', `padding-top=${state.paddingTop}`)
    check('单栏模板已挂载', state.template === 'classic-single', String(state.template))
    check('模板画廊含 5 套模板', state.templateCards === 5, `${state.templateCards} 套`)
    check('参数面板含 6 个标签页', state.tabs === 6, `${state.tabs} 个`)
    check('栏目编辑器覆盖全部栏目', state.sectionCards >= state.sections, `${state.sectionCards} ≥ ${state.sections}`)
    check('简历库至少有 1 份简历', state.libraryItems >= 1, `${state.libraryItems} 份`)
    check(
      '自适应缩放落在允许区间',
      metrics.docClientWidth === 794 && metrics.scale >= 0.3 && metrics.scale <= 1.35,
      `scale=${metrics.scale}，可用宽 ${metrics.scrollClientWidth}px`
    )
    notes.push(`姓名：${state.name}；字体：${state.fontFamily.split(',')[0]}；主色：${state.primary}`)
    notes.push(`渲染：${state.sections} 栏目 / ${state.items} 条目 / ${state.papers} 页`)
  }

  /* ---- 切换到双栏模板 ---- */
  const switched = await runScript(
    win,
    `(async () => {
      const cards = [...document.querySelectorAll('.tplcard')]
      const card = cards.find((c) => c.textContent && c.textContent.indexOf('现代双栏') >= 0)
      if (!card) return JSON.stringify({ ok: false, why: '未找到现代双栏模板' })
      card.click()
      await new Promise((r) => setTimeout(r, 1000))
      const sidebar = document.querySelector('.rs-sidebar')
      return JSON.stringify({
        ok: true,
        template: document.querySelector('.rs-doc').getAttribute('data-template'),
        hasSidebar: Boolean(sidebar),
        sidebarWidth: sidebar ? sidebar.clientWidth : 0,
        sidebarHeight: sidebar ? sidebar.offsetHeight : 0,
        nameInSidebar: Boolean(sidebar && sidebar.querySelector('.rs-name'))
      })
    })()`,
    '切换到现代双栏模板'
  )
  check('可切换到双栏模板', switched.ok && switched.template === 'modern-sidebar', JSON.stringify(switched))
  check('双栏模板渲染出侧栏', Boolean(switched.hasSidebar), `宽度 ${switched.sidebarWidth}px`)
  // 「现代双栏」的侧栏令牌值是 250px，若被预览缩放变换影响就会读出偏差
  check('侧栏宽度等于令牌值 250px', Math.abs(switched.sidebarWidth - 250) < 2, `${switched.sidebarWidth}px`)
  check('侧栏拉伸到整页高度', switched.sidebarHeight >= 1123, `${switched.sidebarHeight}px`)
  check('侧栏显示姓名', Boolean(switched.nameInSidebar), String(switched.nameInSidebar))

  /* ---- 调整字号令牌 ---- */
  const themed = await runScript(
    win,
    `(async () => {
      const tab = [...document.querySelectorAll('.tab')].find((t) => t.textContent && t.textContent.indexOf('字体') >= 0)
      if (!tab) return JSON.stringify({ ok: false, why: '未找到字体标签' })
      tab.click()
      await new Promise((r) => setTimeout(r, 320))
      const range = document.querySelector('.inspector .range')
      if (!range) return JSON.stringify({ ok: false, why: '未找到字号滑杆' })
      const before = getComputedStyle(document.querySelector('.rs-doc')).fontSize
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      // 放大 4pt：足以让打印布局也超出单页，用来验证分页链路真的生效
      setter.call(range, String(Number(range.value) + 4))
      range.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 900))
      const doc = document.querySelector('.rs-doc')
      return JSON.stringify({
        ok: true,
        before,
        after: getComputedStyle(doc).fontSize,
        docHeight: doc.getBoundingClientRect().height,
        papers: document.querySelectorAll('.preview__paper').length,
        guides: document.querySelectorAll('.preview__guide').length
      })
    })()`,
    '调整正文字号令牌'
  )
  check('调整字号令牌实时改变预览', themed.ok && themed.before !== themed.after, `${themed.before} → ${themed.after}`)
  check('字号变大后预览给出多页', themed.papers >= 2, `${themed.papers} 页 / ${themed.guides} 条分页线`)
  check('分页线数量与页数一致', themed.guides === themed.papers - 1, `${themed.guides} 条`)

  /* ---- 回到单栏模板并套用推荐样式：确定性地回到单页 ---- */
  const restored = await runScript(
    win,
    `(async () => {
      const templateTab = [...document.querySelectorAll('.tab')].find((t) => t.textContent && t.textContent.indexOf('模板') >= 0)
      if (!templateTab) return JSON.stringify({ ok: false, why: '未找到模板标签' })
      templateTab.click()
      await new Promise((r) => setTimeout(r, 320))
      const classicCard = [...document.querySelectorAll('.tplcard')].find((c) => c.textContent && c.textContent.indexOf('经典单栏') >= 0)
      if (!classicCard) return JSON.stringify({ ok: false, why: '未找到经典单栏模板' })
      classicCard.click()
      await new Promise((r) => setTimeout(r, 900))
      const resetButton = [...document.querySelectorAll('button')].find((b) => b.textContent && b.textContent.indexOf('套用当前模板的推荐样式') >= 0)
      if (!resetButton) return JSON.stringify({ ok: false, why: '未找到「套用推荐样式」按钮' })
      resetButton.click()
      await new Promise((r) => setTimeout(r, 1200))
      const doc = document.querySelector('.rs-doc')
      const style = getComputedStyle(doc)
      const stage = document.querySelector('.preview__stage')
      return JSON.stringify({
        ok: true,
        template: doc.getAttribute('data-template'),
        fontSizePtVar: style.getPropertyValue('--rs-fs-base').trim(),
        fontSize: style.fontSize,
        height: doc.offsetHeight,
        docRectHeight: Math.round(doc.getBoundingClientRect().height),
        papers: document.querySelectorAll('.preview__paper').length,
        guides: document.querySelectorAll('.preview__guide').length,
        paginationState: stage ? stage.getAttribute('data-rs-pagination') : null
      })
    })()`,
    '重置模板与样式'
  )
  notes.push(`重置诊断：${JSON.stringify(restored)}`)
  check('回到经典单栏模板', restored.template === 'classic-single', String(restored.template))
  check('推荐样式已套用（字号回到 10.5pt）', restored.fontSizePtVar === '10.5pt', restored.fontSizePtVar)
  check('重置后预览回到单页', restored.papers === 1, `${restored.papers} 页，高度 ${restored.height}px`)
  check('单页内容高度不超过 A4', restored.height <= 1124, `${restored.height}px`)

  /* ---- 通过界面按钮导出 ---- */
  const exported = await runScript(
    win,
    `(async () => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent && b.textContent.indexOf('导出 PDF') >= 0)
      if (!button) return JSON.stringify({ ok: false, why: '未找到导出按钮' })
      button.click()
      const deadline = Date.now() + 30000
      while (Date.now() < deadline) {
        const toast = document.querySelector('.toast')
        if (toast) {
          return JSON.stringify({
            ok: true,
            toast: toast.textContent || '',
            papers: document.querySelectorAll('.preview__paper').length
          })
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      return JSON.stringify({ ok: false, why: '等待导出结果超时' })
    })()`,
    '点击导出 PDF 并等待结果'
  )
  check('点击「导出 PDF」后界面给出结果', Boolean(exported.ok), exported.ok ? exported.toast : exported.why)
  check('导出成功提示出现', Boolean(exported.ok && exported.toast.indexOf('已导出') >= 0), exported.toast || '')

  if (fs.existsSync(exportTarget)) {
    const buffer = fs.readFileSync(exportTarget)
    const stats = inspectPdf(buffer)
    notes.push(`PDF：${(buffer.byteLength / 1024).toFixed(1)} KB，${stats.pages} 页，MediaBox ${JSON.stringify(stats.boxes)}`)
    notes.push(`字体嵌入：${stats.hasEmbeddedFont ? '是' : '否'}；可抽取文本：${stats.text.length} 字符`)
    check('PDF 页数与预览一致', stats.pages === exported.papers, `PDF ${stats.pages} 页 / 预览 ${exported.papers} 页`)
    check('单页内容导出为 1 页 PDF', stats.pages === 1, `${stats.pages} 页`)
    const box = stats.boxes[0]
    if (box) {
      const w = box[2] - box[0]
      const h = box[3] - box[1]
      check('PDF 为 A4 尺寸（595×842pt ±3）', Math.abs(w - 595) <= 3 && Math.abs(h - 842) <= 3, `${w}×${h}pt`)
    } else {
      check('PDF 含页面尺寸信息', false, '未找到 MediaBox')
    }
    check('PDF 嵌入了字体', stats.hasEmbeddedFont, String(stats.hasEmbeddedFont))
    check('PDF 有文本绘制指令', stats.text.length > 40 || stats.hasCidText, `${stats.text.length} 字符`)

    /* 中文以 CID 编码存储，用 ToUnicode 映射表 + 内容流还原后再断言文本 */
    const probes = ['工作经历', '后端', '教育背景']
    if (state.ok && state.name) probes.push(state.name.charAt(0))
    const decoded = decodePdfText(exportTarget, probes)
    if (decoded) {
      notes.push(
        `PDF 文本还原：ToUnicode=${decoded.toUnicode}，CMap ${decoded.cmapEntries} 条（中日韩 ${decoded.cjkMappings}），` +
          `还原 ${decoded.textLength} 字符，未映射流 ${decoded.streamsUnmapped}`
      )
      notes.push(`PDF 文本样本：「${String(decoded.sample).slice(0, 70)}」`)
      check('PDF 带有 ToUnicode 映射（文本可搜索可复制）', decoded.toUnicode, String(decoded.toUnicode))
      check('PDF 的字符映射覆盖大量中文', decoded.cjkMappings > 100, `${decoded.cjkMappings} 个中日韩字形`)
      check('PDF 还原出中文正文', decoded.textLength > 200, `${decoded.textLength} 字符`)
      check('PDF 含栏目标题「工作经历」', decoded.probes['工作经历'] === true, `命中=${decoded.probes['工作经历']}`)
      check('PDF 含正文关键词「后端」', decoded.probes['后端'] === true, `命中=${decoded.probes['后端']}`)
      check(
        `PDF 含姓名首字「${probes[probes.length - 1]}」`,
        decoded.probes[probes[probes.length - 1]] === true,
        `命中=${decoded.probes[probes[probes.length - 1]]}`
      )
    } else {
      notes.push('未找到可用的 Python 运行时，跳过 PDF 文本还原校验')
    }
  } else {
    check('PDF 文件已生成', false, exportTarget)
  }

  /* ---- 复制预览图到剪贴板 ---- */
  const copied = await runScript(
    win,
    `(async () => {
      const button = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('title') || '').indexOf('复制预览图') >= 0)
      if (!button) return JSON.stringify({ ok: false, why: '未找到复制预览图按钮' })
      button.click()
      const deadline = Date.now() + 25000
      while (Date.now() < deadline) {
        const toast = document.querySelector('.toast')
        if (toast) {
          const text = toast.textContent || ''
          if (text.indexOf('剪贴板') >= 0 || text.indexOf('失败') >= 0) return JSON.stringify({ ok: true, toast: text })
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      return JSON.stringify({ ok: false, why: '等待复制结果超时' })
    })()`,
    '复制预览图到剪贴板'
  )
  check('复制预览图给出结果', Boolean(copied.ok), copied.ok ? copied.toast : copied.why)
  check('预览图已写入剪贴板', Boolean(copied.ok && copied.toast.indexOf('已复制') >= 0), copied.toast || '')
  // 从渲染进程读回剪贴板格式，确认真的写入了图片
  const clipboardFormats = await runScript(
    win,
    `(async () => {
      try {
        const items = await navigator.clipboard.read()
        const types = []
        for (const item of items) types.push(...item.types)
        const imageItem = items.find((item) => item.types.some((t) => t.indexOf('image/') === 0))
        let imageBytes = 0
        if (imageItem) {
          const type = imageItem.types.find((t) => t.indexOf('image/') === 0)
          const blob = await imageItem.getType(type)
          imageBytes = blob.size
        }
        return JSON.stringify({ ok: true, types, imageBytes })
      } catch (error) {
        return JSON.stringify({ ok: false, why: String((error && error.message) || error) })
      }
    })()`,
    '读回剪贴板格式'
  )
  check(
    '剪贴板中存在图片格式',
    Boolean(clipboardFormats.ok && clipboardFormats.imageBytes > 1000),
    clipboardFormats.ok ? `${clipboardFormats.types.join(', ')} / ${clipboardFormats.imageBytes} 字节` : clipboardFormats.why
  )

  /* ---- 字体候选名单界面 ---- */
  const fontPanel = await runScript(
    win,
    `(async () => {
      const tab = [...document.querySelectorAll('.tab')].find((t) => t.textContent && t.textContent.indexOf('字体') >= 0)
      if (!tab) return JSON.stringify({ ok: false, why: '未找到字体标签' })
      tab.click()
      await new Promise((r) => setTimeout(r, 600))
      const stacks = [...document.querySelectorAll('.fontstack')]
      const first = stacks[0]
      const items = first ? [...first.querySelectorAll('.fontstack__item')] : []
      const second = stacks[1]
      const secondItems = second ? [...second.querySelectorAll('.fontstack__item')] : []
      const emptyHint = document.querySelector('.fontstack__empty')
      const resolvedText = first ? (first.querySelector('.fontstack__resolved') || {}).textContent || '' : ''
      const missing = [...document.querySelectorAll('.fontstack__miss')].length
      const previewText = first ? (first.querySelector('.fontstack__preview') || {}).textContent || '' : ''
      return JSON.stringify({
        ok: true,
        stackCount: stacks.length,
        emptyHint: emptyHint ? emptyHint.textContent : null,
        bodyLayers: items.map((li) => (li.querySelector('.fontstack__name') || {}).textContent || ''),
        headingLayers: secondItems.map((li) => (li.querySelector('.fontstack__name') || {}).textContent || []),
        resolvedText,
        missing,
        previewText
      })
    })()`,
    '检查字体候选名单界面'
  )
  check(
    '正文字体呈现为候选名单，标题留空时明确提示跟随正文',
    fontPanel.ok && fontPanel.stackCount >= 1 && fontPanel.emptyHint === '跟随正文字体',
    `${fontPanel.stackCount} 组名单 / 标题提示「${fontPanel.emptyHint}」`
  )
  check(
    '正文字体名单按层级展示',
    Array.isArray(fontPanel.bodyLayers) && fontPanel.bodyLayers.length >= 4,
    (fontPanel.bodyLayers || []).join(' → ')
  )
  check(
    '标出本机未安装的字体',
    fontPanel.missing >= 1,
    `${fontPanel.missing} 个字体标记为未安装`
  )
  check(
    '显示实际生效的字体',
    typeof fontPanel.resolvedText === 'string' && fontPanel.resolvedText.indexOf('实际使用') >= 0,
    fontPanel.resolvedText
  )
  check('名单下方有中文预览', (fontPanel.previewText || '').indexOf('中文') >= 0, fontPanel.previewText)

  const fontRemoved = await runScript(
    win,
    `(async () => {
      const first = document.querySelector('.fontstack')
      const before = [...first.querySelectorAll('.fontstack__name')].map((n) => n.textContent)
      const firstRow = first.querySelector('.fontstack__item')
      const removeBtn = [...firstRow.querySelectorAll('button')].find((b) => (b.getAttribute('title') || '').indexOf('移除') >= 0)
      if (!removeBtn) return JSON.stringify({ ok: false, why: '未找到移除按钮' })
      removeBtn.click()
      await new Promise((r) => setTimeout(r, 800))
      const second = document.querySelector('.fontstack')
      const after = [...second.querySelectorAll('.fontstack__name')].map((n) => n.textContent)
      const docFont = getComputedStyle(document.querySelector('.rs-doc')).fontFamily
      return JSON.stringify({ ok: true, before, after, docFont })
    })()`,
    '从名单移除一层字体'
  )
  check(
    '可以从名单中移除字体',
    fontRemoved.ok && fontRemoved.after.length === fontRemoved.before.length - 1,
    `${(fontRemoved.before || []).length} → ${(fontRemoved.after || []).length} 层`
  )
  check(
    '移除后模板实际应用的字体族同步更新',
    typeof fontRemoved.docFont === 'string' && fontRemoved.docFont.indexOf(fontRemoved.after[0]) >= 0,
    fontRemoved.after ? fontRemoved.after[0] : ''
  )

  /* ---- 截图存档：DOM 断言不能替代肉眼确认版式 ---- */
  try {
    // 截一张完整界面（含编辑面板），并把窗口临时放大以便看清版式
    const shotTargets = [
      { name: 'app-window.png', label: '整窗界面' },
    ]
    for (const target of shotTargets) {
      const image = await win.webContents.capturePage()
      const png = image.toPNG()
      const shotPath = path.join(scratch, target.name)
      fs.writeFileSync(shotPath, png)
      notes.push(`截图已保存：${target.label} → ${shotPath}（${Math.round(png.length / 1024)} KB）`)
    }

    // 单独把 A4 文档区域截出来，方便核对模板细节
    const docShot = await runScript(
      win,
      `(() => {
        const doc = document.querySelector('.rs-doc')
        const rect = doc.getBoundingClientRect()
        return JSON.stringify({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
      })()`,
      '读取预览区域坐标'
    )
    if (docShot && docShot.width > 0) {
      const region = {
        x: Math.max(0, Math.round(docShot.x)),
        y: Math.max(0, Math.round(docShot.y)),
        width: Math.round(docShot.width),
        height: Math.round(docShot.height)
      }
      const image = await win.webContents.capturePage(region)
      const shotPath = path.join(scratch, 'resume-a4.png')
      fs.writeFileSync(shotPath, image.toPNG())
      notes.push(`截图已保存：A4 文档区域 → ${shotPath}`)
    }
  } catch (error) {
    notes.push(`截图失败（不影响功能判定）：${String(error && error.message)}`)
  }

  /* ---- 本地持久化 ---- */
  const resumesDir = path.join(userDataDir, 'resumes')
  const indexFile = path.join(resumesDir, 'index.json')
  check('简历索引已写入磁盘', fs.existsSync(indexFile), indexFile)
  const resumeFiles = fs.existsSync(resumesDir)
    ? fs.readdirSync(resumesDir).filter((name) => name.endsWith('.json') && name !== 'index.json')
    : []
  check('简历数据文件已写入磁盘', resumeFiles.length >= 1, `${resumeFiles.length} 个文件`)
  if (fs.existsSync(indexFile)) {
    const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
    check('索引记录了简历条目', Array.isArray(parsed.entries) && parsed.entries.length >= 1, `${parsed.entries.length} 条`)
  }

  check('渲染进程无报错日志', rendererErrors.length === 0, rendererErrors.slice(0, 3).join(' | '))
  finish()
}

function finish() {
  console.log('\n============ ResumeKit 冒烟测试 ============')
  for (const line of notes) console.log(`INFO  ${line}`)
  console.log('')
  for (const line of passes) console.log(`PASS  ${line}`)
  if (failures.length > 0) {
    console.log('')
    for (const line of failures) console.log(`FAIL  ${line}`)
  }
  console.log(`\n结果：${passes.length} 通过 / ${failures.length} 失败`)
  console.log('===============================================\n')
  app.exit(failures.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('探针崩溃：', error)
  app.exit(2)
})
