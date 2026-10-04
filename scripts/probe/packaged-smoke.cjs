/**
 * 打包产物冒烟测试：用 Electron 打开 release/win-unpacked 里的 app.asar，
 * 让打包后的主进程真正跑起来，再检查界面与导出链路。
 *
 * 用法：electron scripts/probe/packaged-smoke.cjs
 *
 * 与 probe.cjs 的区别：probe 验证的是源码构建产物（out/），
 * 这个脚本验证的是**打包进 asar 之后**的那一份，能抓到「打包遗漏文件」这类问题。
 */
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const electron = require('electron')
const { app, BrowserWindow, dialog } = electron

const projectRoot = path.resolve(__dirname, '..', '..')
const asarPath = path.join(projectRoot, 'release', 'win-unpacked', 'resources', 'app.asar')
const scratch = path.join(projectRoot, '.scratch', 'packaged')
const userDataDir = path.join(scratch, 'userdata')
const exportTarget = path.join(scratch, 'packaged-export.pdf')

const failures = []
const passes = []
const notes = []

function check(name, condition, detail) {
  if (condition) passes.push(`${name}${detail ? ` — ${detail}` : ''}`)
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function step(message) {
  console.log(`[packaged] ${message}`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runScript(win, source, label) {
  const timeout = delay(40000).then(() => ({ timedOut: true }))
  const execution = win.webContents.executeJavaScript(source).then(
    (value) => ({ value }),
    (error) => ({ error: String((error && error.message) || error) })
  )
  const result = await Promise.race([execution, timeout])
  if (result.timedOut) return { timedOut: true }
  if (result.error) return { error: result.error }
  try {
    return JSON.parse(result.value)
  } catch {
    return { parseError: String(result.value).slice(0, 200) }
  }
}

function decodePdfText(pdfPath, probes) {
  const python = process.env.RS_PYTHON || process.env.PYTHON || 'python'
  const script = path.join(__dirname, 'pdf-text.py')
  try {
    const result = spawnSync(python, [script, pdfPath, ...probes], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      timeout: 60000
    })
    if (result.error || result.status !== 0 || !result.stdout) return null
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

async function main() {
  fs.rmSync(scratch, { recursive: true, force: true })
  fs.mkdirSync(scratch, { recursive: true })

  /* ---- 1. 产物结构 ---- */
  check('app.asar 存在', fs.existsSync(asarPath), asarPath)
  const exePath = path.join(projectRoot, 'release', 'win-unpacked', 'ResumeKit.exe')
  check('可执行文件存在', fs.existsSync(exePath), exePath ? path.basename(exePath) : '')
  if (fs.existsSync(exePath)) {
    const size = fs.statSync(exePath).size
    check('可执行文件体积合理（>100MB 说明带了 Electron 运行时）', size > 100 * 1024 * 1024, `${(size / 1024 / 1024).toFixed(1)} MB`)
  }

  /* ---- 2. 从 asar 里加载打包后的主进程 ---- */
  app.setPath('userData', userDataDir)
  await app.whenReady()

  step('从 app.asar 内部加载主进程')
  const mainEntry = path.join(asarPath, 'out', 'main', 'index.js')
  check('asar 内包含主进程入口', fs.existsSync(mainEntry), 'out/main/index.js')
  check('asar 内包含渲染层入口', fs.existsSync(path.join(asarPath, 'out', 'renderer', 'index.html')), 'out/renderer/index.html')
  check('asar 内包含预加载脚本(.cjs)', fs.existsSync(path.join(asarPath, 'out', 'preload', 'index.cjs')), 'out/preload/index.cjs')

  // 替换保存对话框，让导出不需要人工点击
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportTarget })

  // 让打包后的主进程自己创建窗口（它会用 app.isPackaged 决定加载方式）
  require(mainEntry)

  const rendererErrors = []
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('console-message', (event) => {
      const level = event && event.level
      const message = String((event && event.message) || '')
      if (message.indexOf('Electron Security Warning') >= 0 || message.indexOf('%cElectron Security') >= 0) return
      if (level === 'error' || level === 'warning' || level === 3 || level === 2) rendererErrors.push(message)
    })
    win.webContents.on('render-process-gone', (_e, details) => rendererErrors.push(`renderer gone: ${details.reason}`))
  })

  let win = null
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed()) ?? null
    if (win && !win.webContents.isLoading()) break
    await delay(250)
  }
  check('打包后的主进程创建了窗口', Boolean(win))
  if (!win) return finish()

  /* ---- 3. 界面是否真的渲染出来 ---- */
  step('等待打包后的界面渲染')
  let state = null
  const renderDeadline = Date.now() + 25000
  while (Date.now() < renderDeadline) {
    state = await runScript(
      win,
      `(() => {
        const doc = document.querySelector('.rs-doc')
        if (!doc) return JSON.stringify({ ok: false, body: document.body.innerText.slice(0, 200) })
        return JSON.stringify({
          ok: true,
          hasApi: typeof window.api === 'object' && window.api !== null,
          apiKeys: window.api ? Object.keys(window.api).length : 0,
          template: doc.getAttribute('data-template'),
          sections: document.querySelectorAll('.rs-section').length,
          templateCards: document.querySelectorAll('.tplcard').length,
          tabs: document.querySelectorAll('.tab').length,
          docWidth: doc.offsetWidth,
          name: (document.querySelector('.rs-name') || {}).textContent || '',
          fontFamily: getComputedStyle(doc).fontFamily
        })
      })()`,
      '读取打包后界面状态'
    )
    if (state && state.ok) break
    await delay(300)
  }

  check('打包后界面渲染出简历', Boolean(state && state.ok), state && state.ok ? `${state.sections} 个栏目` : JSON.stringify(state))
  if (state && state.ok) {
    check('打包后 preload 桥可用', state.hasApi && state.apiKeys >= 8, `${state.apiKeys} 个方法`)
    check('打包后 A4 宽度正确', state.docWidth === 794, `${state.docWidth}px`)
    check('打包后模板画廊完整', state.templateCards === 5, `${state.templateCards} 套`)
    check('打包后参数面板完整', state.tabs === 6, `${state.tabs} 个`)
    notes.push(`姓名：${state.name}；字体：${state.fontFamily.split(',')[0]}`)
  }

  /* ---- 4. 打包后能否导出 PDF（验证 ?raw 内联的模板样式确实进了 asar） ---- */
  step('在打包产物里执行一次导出')
  const exported = await runScript(
    win,
    `(async () => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent && b.textContent.indexOf('导出 PDF') >= 0)
      if (!button) return JSON.stringify({ ok: false, why: '未找到导出按钮' })
      button.click()
      const deadline = Date.now() + 30000
      while (Date.now() < deadline) {
        const toast = document.querySelector('.toast')
        if (toast) return JSON.stringify({ ok: true, toast: toast.textContent || '', papers: document.querySelectorAll('.preview__paper').length })
        await new Promise((r) => setTimeout(r, 200))
      }
      return JSON.stringify({ ok: false, why: '等待导出结果超时' })
    })()`,
    '打包产物导出 PDF'
  )
  check('打包产物导出成功', Boolean(exported.ok && exported.toast.indexOf('已导出') >= 0), exported.toast || exported.why)

  if (fs.existsSync(exportTarget)) {
    const buffer = fs.readFileSync(exportTarget)
    const raw = buffer.toString('latin1')
    const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length
    const box = [...raw.matchAll(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g)][0]
    const hasFont = /\/FontFile2|\/FontFile3|\/FontFile\b/.test(raw)
    notes.push(`打包产物 PDF：${(buffer.byteLength / 1024).toFixed(1)} KB，${pages} 页，字体嵌入=${hasFont}`)
    check('打包产物 PDF 页数与预览一致', pages === exported.papers, `PDF ${pages} 页 / 预览 ${exported.papers} 页`)
    check('打包产物 PDF 为 A4', Boolean(box), box ? `${Number(box[3]) - Number(box[1])}pt 高` : '无 MediaBox')
    check('打包产物 PDF 嵌入了字体', hasFont, String(hasFont))

    const decoded = decodePdfText(exportTarget, ['工作经历'])
    if (decoded) {
      check('打包产物 PDF 含中文且可搜索', decoded.cjkMappings > 100 && decoded.probes['工作经历'] === true, `${decoded.cjkMappings} 个中日韩字形`)
    }
  } else {
    check('打包产物生成了 PDF 文件', false, exportTarget)
  }

  /* ---- 5. 截图存档 ---- */
  try {
    const image = await win.webContents.capturePage()
    const shotPath = path.join(scratch, 'packaged-window.png')
    fs.writeFileSync(shotPath, image.toPNG())
    notes.push(`截图：${shotPath}`)
  } catch {
    // 截图失败不影响判定
  }

  check('打包产物运行期无报错日志', rendererErrors.length === 0, rendererErrors.slice(0, 3).join(' | '))
  finish()
}

function finish() {
  console.log('\n========== 打包产物冒烟测试 ==========')
  for (const line of notes) console.log(`INFO  ${line}`)
  console.log('')
  for (const line of passes) console.log(`PASS  ${line}`)
  if (failures.length > 0) {
    console.log('')
    for (const line of failures) console.log(`FAIL  ${line}`)
  }
  console.log(`\n结果：${passes.length} 通过 / ${failures.length} 失败`)
  console.log('=====================================\n')
  app.exit(failures.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('打包产物测试崩溃：', error)
  app.exit(2)
})
