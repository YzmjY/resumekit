/**
 * 专项验证：双栏模板内容超过一页时，侧栏栏目的实际分布。
 *
 * 用法：electron scripts/probe/multipage-sidebar.cjs
 *
 * 存在的意义：README「已知限制」里有一条「侧栏栏目只在第一页出现」。
 * 这条结论必须能被复现，而不是靠推断——本脚本切到双栏模板、把字号推到 14pt 造出两页，
 * 然后逐页统计侧栏里可见的栏目，并把截图存到 .scratch/multipage/。
 */
const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, dialog } = require('electron')

const projectRoot = path.resolve(__dirname, '..', '..')
const scratch = path.join(projectRoot, '.scratch', 'multipage')
const userDataDir = path.join(scratch, 'userdata')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runScript(win, source) {
  const outcome = await win.webContents.executeJavaScript(source).then(
    (value) => ({ value }),
    (error) => ({ error: String((error && error.message) || error) })
  )
  if (outcome.error) return { error: outcome.error }
  try {
    return JSON.parse(outcome.value)
  } catch {
    return { parseError: String(outcome.value).slice(0, 200) }
  }
}

async function main() {
  fs.rmSync(scratch, { recursive: true, force: true })
  fs.mkdirSync(scratch, { recursive: true })
  app.setPath('userData', userDataDir)
  await app.whenReady()

  dialog.showSaveDialog = async () => ({ canceled: true })

  require(path.join(projectRoot, 'out', 'main', 'index.js'))

  let win = null
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed()) ?? null
    if (win && !win.webContents.isLoading()) break
    await delay(250)
  }
  if (!win) {
    console.log('未拿到窗口')
    app.exit(1)
    return
  }

  // 等界面渲染
  for (let index = 0; index < 60; index += 1) {
    const ready = await runScript(
      win,
      `JSON.stringify({ ready: Boolean(document.querySelector('.rs-doc') && document.querySelectorAll('.preview__paper').length) })`
    )
    if (ready.ready) break
    await delay(250)
  }

  // 切到双栏模板并把字号调到很大，制造多页
  const setup = await runScript(
    win,
    `(async () => {
      const tab = [...document.querySelectorAll('.tab')].find((t) => t.textContent && t.textContent.indexOf('模板') >= 0)
      tab.click()
      await new Promise((r) => setTimeout(r, 300))
      const card = [...document.querySelectorAll('.tplcard')].find((c) => c.textContent && c.textContent.indexOf('现代双栏') >= 0)
      card.click()
      await new Promise((r) => setTimeout(r, 900))

      const fontTab = [...document.querySelectorAll('.tab')].find((t) => t.textContent && t.textContent.indexOf('字体') >= 0)
      fontTab.click()
      await new Promise((r) => setTimeout(r, 400))
      const range = document.querySelector('.inspector .range')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(range, '14')
      range.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 1200))
      return JSON.stringify({ ok: true })
    })()`
  )
  if (setup.error || setup.parseError) {
    console.log('设置失败', JSON.stringify(setup))
    app.exit(1)
    return
  }

  const report = await runScript(
    win,
    `(() => {
      const stage = document.querySelector('.preview__stage')
      const state = stage ? JSON.parse(stage.getAttribute('data-rs-pagination') || '{}') : {}
      const doc = document.querySelector('.rs-doc')
      const sidebar = document.querySelector('.rs-sidebar')
      const main = document.querySelector('.rs-main')
      const pageH = 1123
      const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null
      const docRect = doc.getBoundingClientRect()
      const scale = docRect.height > 0 ? docRect.height / (state.screenHeight || docRect.height) : 1

      // 侧栏内容在后续页面上是否出现（把每页区间内是否有侧栏栏目算出来）
      const sections = sidebar ? [...sidebar.querySelectorAll('.rs-section')] : []
      const perPage = []
      for (let page = 0; page < (state.pageCount || 1); page += 1) {
        const top = page * pageH
        const bottom = top + pageH
        const visible = sections.filter((section) => {
          const rect = section.getBoundingClientRect()
          const sectionTop = (rect.top - docRect.top) / scale
          const sectionBottom = (rect.bottom - docRect.top) / scale
          return sectionBottom > top && sectionTop < bottom
        })
        perPage.push({ page: page + 1, sidebarSections: visible.map((s) => (s.querySelector('.rs-h2__text') || {}).textContent || '') })
      }

      return JSON.stringify({
        template: doc.getAttribute('data-template'),
        pageCount: state.pageCount,
        printHeight: state.printHeight,
        docCssHeight: doc.offsetHeight,
        sidebarMinHeight: sidebar ? sidebar.style.minHeight : null,
        sidebarCssHeight: sidebarRect ? Math.round(sidebarRect.height / scale) : null,
        sidebarBgReachesFullDoc: sidebarRect ? Math.round((sidebarRect.bottom - docRect.top) / scale) : null,
        mainCssHeight: main ? Math.round(main.getBoundingClientRect().height / scale) : null,
        perPage
      })
    })()`
  )

  console.log('=== 多页双栏实测 ===')
  console.log(JSON.stringify(report, null, 2))

  try {
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(scratch, 'multipage-sidebar.png'), image.toPNG())
    console.log('截图：', path.join(scratch, 'multipage-sidebar.png'))
  } catch {
    // 截图失败不影响结论
  }

  win.destroy()
  app.exit(0)
}

main().catch((error) => {
  console.error('探针崩溃：', error)
  app.exit(2)
})
