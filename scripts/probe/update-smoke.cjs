/**
 * 自动更新运行时冒烟测试。
 *
 * 验证的是 out/main/index.js 这份**构建产物**：
 *  - ESM 下 electron-updater 的 CommonJS interop 是否成立（模块能否加载）
 *  - 更新状态机是否推进（checking → up-to-date / error），且不抛异常
 *  - 未打包状态下是否正确判定为「不支持」并给出可读原因
 *  - 跨版本兜底是否能读到服务端 latest.yml（需要联网；离线时只记录不判失败）
 *
 * 用法：electron scripts/probe/update-smoke.cjs
 */
const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow } = require('electron')

const projectRoot = path.resolve(__dirname, '..', '..')
const scratch = path.join(projectRoot, '.scratch', 'update-smoke')
const userDataDir = path.join(scratch, 'userdata')
// bootLog 写的是 <APPDATA>/ResumeKit/boot.log（与应用数据目录无关），
// 因为它在 Electron 就绪之前就要能用，不能依赖 app.getPath。
const bootLogPath = path.join(process.env.APPDATA ?? scratch, 'ResumeKit', 'boot.log')

const failures = []
const passes = []
const notes = []

function check(name, condition, detail) {
  if (condition) passes.push(`${name}${detail ? ` — ${detail}` : ''}`)
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  fs.rmSync(scratch, { recursive: true, force: true })
  fs.mkdirSync(scratch, { recursive: true })
  fs.rmSync(bootLogPath, { force: true })
  app.setPath('userData', userDataDir)
  // 打开启动日志，才能断言更新模块的初始化与「不支持」判定
  process.env.RESUMEKIT_BOOT_LOG = '1'
  await app.whenReady()

  const { autoUpdater } = require('electron-updater')
  const events = []
  for (const name of ['checking-for-update', 'update-available', 'update-not-available', 'error']) {
    autoUpdater.on(name, () => events.push(name))
  }

  let loadError = null
  try {
    // 这一步能走通，就说明 ESM 下 import electron-updater 没有炸
    require(path.join(projectRoot, 'out', 'main', 'index.js'))
  } catch (error) {
    loadError = error
  }
  check('构建产物可被加载（ESM + electron-updater interop）', !loadError, loadError ? String(loadError.message) : '')

  await delay(4000)
  const windows = BrowserWindow.getAllWindows()
  check('主进程创建了窗口', windows.length > 0, `${windows.length} 个窗口`)
  if (windows.length > 0) {
    const title = windows[0].getTitle()
    check('窗口标题正确', /ResumeKit/i.test(title), title)
  }

  // 未打包：应判定为不支持，且给出「开发模式」原因
  if (fs.existsSync(bootLogPath)) {
    const log = fs.readFileSync(bootLogPath, 'utf8')
    check('启动日志记录了更新模块初始化', log.includes('updater/start'), '')
    check('未打包时判定为不支持', /"supported":false/.test(log) && /"reason":"development"/.test(log), '')
    check('未触发任何更新网络事件（开发模式不发请求）', events.length === 0, `事件：${events.join(',') || '无'}`)
  } else {
    notes.push(`启动日志未生成（${bootLogPath}），跳过日志断言`)
  }

  // 跨版本兜底：直接调用同一 URL，验证服务端清单可读
  const url = 'https://github.com/YzmjY/resumekit/releases/latest/download/latest.yml'
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    clearTimeout(timer)
    if (response.ok) {
      const text = await response.text()
      const version = (/^version:\s*(\S+)/m.exec(text) || [])[1] ?? null
      notes.push(`服务端 latest.yml 可读，version=${version}`)
      check('服务端更新清单包含 version 字段', Boolean(version), String(version))
      check('清单包含安装包文件名', /url:\s*\S+\.exe/.test(text), '')
    } else {
      notes.push(`服务端 latest.yml 暂不可用（HTTP ${response.status}）——发布新版本后应可用`)
    }
  } catch (error) {
    notes.push(`检查服务端清单时网络失败：${error.message}（不影响本地结论）`)
  }

  console.log('\n========== 自动更新运行时测试 ==========')
  for (const line of notes) console.log(`INFO  ${line}`)
  console.log('')
  for (const line of passes) console.log(`PASS  ${line}`)
  if (failures.length > 0) {
    console.log('')
    for (const line of failures) console.log(`FAIL  ${line}`)
  }
  console.log(`\n结果：${passes.length} 通过 / ${failures.length} 失败`)
  console.log('=======================================\n')

  app.exit(failures.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('崩溃：', error)
  app.exit(2)
})
