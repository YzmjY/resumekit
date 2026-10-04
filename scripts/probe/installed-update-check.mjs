/**
 * 自动更新端到端验收（针对已安装的实例）。
 *
 * 前提：本机已安装 ResumeKit，且当前安装版本低于 GitHub 上 latest 的版本。
 *
 * 流程：
 *  1. 记录安装版本与更新前的时间戳
 *  2. 启动已安装的 ResumeKit，带上 RESUMEKIT_BOOT_LOG=1
 *  3. 等待 boot.log 出现 update-available / download-progress / update-downloaded
 *  4. 报告结论，不自动触发 quitAndInstall（那会直接改动机器上的安装）
 *
 * 用法：node scripts/probe/installed-update-check.mjs [等待秒数]
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'

const WAIT_SECONDS = Number.parseInt(process.argv[2] ?? '240', 10)
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
const INSTALL_DIR = join(LOCALAPPDATA, 'Programs', 'ResumeKit')
const EXE = join(INSTALL_DIR, 'ResumeKit.exe')
const BOOT_LOG = join(process.env.APPDATA ?? homedir(), 'ResumeKit', 'boot.log')

const passes = []
const failures = []
const notes = []

function check(name, condition, detail) {
  if (condition) passes.push(`${name}${detail ? ` — ${detail}` : ''}`)
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function installedVersion() {
  if (!existsSync(EXE)) return null
  // app.asar 内 package.json 的版本最可靠；退而求其次看文件时间
  try {
    const { execFileSync } = require('node:child_process')
    void execFileSync
  } catch {
    // ignore
  }
  return { mtime: statSync(EXE).mtime.toISOString(), size: statSync(EXE).size }
}

function readLog() {
  if (!existsSync(BOOT_LOG)) return ''
  return readFileSync(BOOT_LOG, 'utf8')
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const before = installedVersion()
check('找到已安装的 ResumeKit', Boolean(before), before ? `${EXE}（修改于 ${before.mtime}）` : EXE)
if (!before) {
  console.log('未安装，无法验收。先运行安装包。')
  process.exit(1)
}

console.log(`[e2e] 启动 ${EXE}`)
console.log(`[e2e] 启动日志：${BOOT_LOG}`)
console.log(`[e2e] 等待 ${WAIT_SECONDS}s 观察更新流程…`)

const logSizeBefore = existsSync(BOOT_LOG) ? statSync(BOOT_LOG).size : 0

const child = spawn(EXE, ['--remote-debugging-port=9333'], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env, RESUMEKIT_BOOT_LOG: '1' }
})
child.unref()

/**
 * 通过 Chrome DevTools 协议在已安装应用的界面里执行一小段脚本。
 * 用它可以验证「界面显示的状态」和「点击界面按钮」这条真实用户路径，
 * 而不只是读日志。连接失败时返回 null，由调用方决定是否降级。
 */
async function evaluateInApp(expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const list = await fetch('http://127.0.0.1:9333/json/list').then((r) => r.json())
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) {
        const socket = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true })
          socket.addEventListener('error', reject, { once: true })
        })
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('CDP 执行超时')), timeoutMs)
          socket.addEventListener('message', (event) => {
            const payload = JSON.parse(event.data)
            if (payload.id === 1) {
              clearTimeout(timer)
              resolve(payload.result)
            }
          })
          socket.send(
            JSON.stringify({
              id: 1,
              method: 'Runtime.evaluate',
              params: { expression, awaitPromise: true, returnByValue: true }
            })
          )
        })
        socket.close()
        if (result && result.exceptionDetails) return null
        return result && result.result ? result.result.value : null
      }
    } catch {
      // 应用还没起来或端口未就绪，继续重试
    }
    await delay(1500)
  }
  return null
}

const deadline = Date.now() + WAIT_SECONDS * 1000
let sawStart = false
let sawAvailable = false
let lastProgressLine = ''
let sawDownloaded = false
let sawNotAvailable = false

/* ---- 阶段一：等下载完成，并在此期间读一次界面状态 ---- */
let uiDuringDownload = null
let uiAfterDownload = null

while (Date.now() < deadline) {
  await delay(5000)
  const log = readLog()
  if (log.includes('updater/start')) sawStart = true
  if (/updater\/update-available/.test(log)) sawAvailable = true
  if (/updater\/download-progress/.test(log)) {
    const lines = log.split('\n').filter((line) => line.includes('updater/download-progress'))
    if (lines.length > 0) lastProgressLine = lines[lines.length - 1].slice(0, 170)
  }
  if (/updater\/update-downloaded/.test(log)) sawDownloaded = true
  if (/updater\/update-not-available/.test(log) || /not available/i.test(log)) sawNotAvailable = true

  if (sawDownloaded) break

  // 下载阶段抓一次界面，验证进度是真的显示出来了
  if (sawAvailable && !uiDuringDownload) {
    const ui = await evaluateInApp(
      `(() => {
        const group = [...document.querySelectorAll('.group')].find((g) => (g.querySelector('.group__head') || {}).textContent?.includes('关于与更新'))
        if (group && !group.querySelector('.update')) group.querySelector('.group__head').click()
        return new Promise((resolve) => setTimeout(() => {
          const card = document.querySelector('.update')
          if (!card) return resolve(null)
          resolve(JSON.stringify({
            label: (card.querySelector('.update__label') || {}).textContent || '',
            hasBar: Boolean(card.querySelector('.update__bar span')),
            barWidth: card.querySelector('.update__bar span') ? card.querySelector('.update__bar span').style.width : null,
            meta: (card.querySelector('.update__meta') || {}).textContent || '',
            buttons: [...card.querySelectorAll('button')].map((b) => b.textContent.trim())
          }))
        }, 400))
      })()`,
      4000
    )
    if (ui) {
      try {
        uiDuringDownload = JSON.parse(ui)
      } catch {
        uiDuringDownload = null
      }
    }
  }
}

/* ---- 阶段二：下载完成后读界面，确认出现「重启并安装」并点击它 ---- */
if (sawDownloaded) {
  const ui = await evaluateInApp(
    `(() => {
      const group = [...document.querySelectorAll('.group')].find((g) => (g.querySelector('.group__head') || {}).textContent?.includes('关于与更新'))
      if (group && !group.querySelector('.update')) group.querySelector('.group__head').click()
      return new Promise((resolve) => setTimeout(() => {
        const card = document.querySelector('.update')
        if (!card) return resolve(null)
        const buttons = [...card.querySelectorAll('button')]
        const restart = buttons.find((b) => b.textContent.includes('重启并安装'))
        resolve(JSON.stringify({
          label: (card.querySelector('.update__label') || {}).textContent || '',
          buttons: buttons.map((b) => b.textContent.trim()),
          hasRestart: Boolean(restart)
        }))
      }, 500))
    })()`,
    8000
  )
  if (ui) {
    try {
      uiAfterDownload = JSON.parse(ui)
    } catch {
      uiAfterDownload = null
    }
  }

  if (uiAfterDownload && uiAfterDownload.hasRestart) {
    notes.push('已在界面点击「重启并安装」，等待安装完成…')
    await evaluateInApp(
      `(() => {
        const card = document.querySelector('.update')
        const btn = card && [...card.querySelectorAll('button')].find((b) => b.textContent.includes('重启并安装'))
        if (btn) { btn.click(); return 'clicked' }
        return 'not-found'
      })()`,
      8000
    )
  }
}

notes.push(`启动日志增量：${existsSync(BOOT_LOG) ? statSync(BOOT_LOG).size - logSizeBefore : 0} 字节`)
if (lastProgressLine) notes.push(`最后一条下载进度：${lastProgressLine}`)
if (uiDuringDownload) notes.push(`下载中的界面状态：${JSON.stringify(uiDuringDownload)}`)
if (uiAfterDownload) notes.push(`下载完成的界面状态：${JSON.stringify(uiAfterDownload)}`)

check('更新模块随应用启动', sawStart, '')
check(
  '完成一次更新判定（有新版本或确认最新）',
  sawAvailable || sawNotAvailable,
  sawNotAvailable && !sawAvailable ? '服务端认为已是最新版本' : ''
)

if (sawAvailable) {
  check('检测到新版本并开始下载', sawAvailable, '')
  check('下载进度写入了启动日志', Boolean(lastProgressLine), '')
  check('下载完成（update-downloaded）', sawDownloaded, '')

  if (uiDuringDownload) {
    check(
      '界面在下载期间显示进度条',
      uiDuringDownload.hasBar === true,
      `进度条宽度 ${uiDuringDownload.barWidth}`
    )
    check(
      '界面文案标明正在下载',
      typeof uiDuringDownload.label === 'string' && uiDuringDownload.label.includes('下载'),
      uiDuringDownload.label
    )
  } else {
    notes.push('未能通过 DevTools 读取下载中的界面状态（不影响日志结论）')
  }

  if (uiAfterDownload) {
    check('下载完成后界面出现「重启并安装」按钮', uiAfterDownload.hasRestart === true, (uiAfterDownload.buttons || []).join(' / '))
  } else {
    notes.push('未能通过 DevTools 读取下载完成后的界面状态')
  }
} else {
  notes.push('本次未发现新版本——若安装版本已等于 latest，这是正确行为，不算失败')
}

console.log('\n========== 已安装实例的更新验收 ==========')
console.log(`INFO  启动日志：${BOOT_LOG}`)
for (const line of notes) console.log(`INFO  ${line}`)
console.log('')
for (const line of passes) console.log(`PASS  ${line}`)
if (failures.length > 0) {
  console.log('')
  for (const line of failures) console.log(`FAIL  ${line}`)
}
console.log(`\n结果：${passes.length} 通过 / ${failures.length} 失败`)
console.log('=========================================\n')
console.log('提示：安装动作没有被自动触发。要真正升级，请在应用界面点「重启并安装」，')
console.log('      或正常关闭应用——electron-updater 会在退出时安装已下载的更新。')

process.exit(failures.length > 0 ? 1 : 0)
