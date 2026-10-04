import path from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { ResumeStore } from './storage'
import { generatePdf } from './export-pdf'
import { bootLog } from './boot-log'
import type { ExportPdfRequest, Resume } from '@shared/resume'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
let store: ResumeStore

bootLog('module loaded', {
  isPackaged: app.isPackaged,
  electron: process.versions.electron,
  node: process.versions.node,
  appPath: app.getAppPath(),
  resources: process.resourcesPath,
  args: process.argv.slice(1)
})

process.on('uncaughtException', (error) => {
  bootLog('uncaughtException', { message: error.message, stack: error.stack })
})
process.on('unhandledRejection', (reason) => {
  bootLog('unhandledRejection', { reason: String(reason) })
})

/* ------------------------------------------------------------------ *
 * 窗口
 * ------------------------------------------------------------------ */

function createWindow(): void {
  bootLog('createWindow 开始')
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#eef1f5',
    title: 'ResumeKit',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })
  bootLog('BrowserWindow 已创建')

  mainWindow.once('ready-to-show', () => {
    bootLog('ready-to-show')
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-finish-load', () => bootLog('did-finish-load'))
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) =>
    bootLog('did-fail-load', { code, description, url })
  )
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) =>
    bootLog('preload-error', { preloadPath, message: error.message })
  )
  mainWindow.webContents.on('render-process-gone', (_event, details) => bootLog('render-process-gone', details))

  // 外部链接交给系统浏览器，避免在应用窗口内跳走
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devServerUrl) {
    bootLog('加载开发服务器', devServerUrl)
    void mainWindow.loadURL(devServerUrl)
  } else {
    const target = path.join(__dirname, '../renderer/index.html')
    bootLog('加载本地文件', target)
    void mainWindow.loadFile(target).catch((error) => bootLog('loadFile 失败', { message: String(error) }))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/* ------------------------------------------------------------------ *
 * IPC：简历库
 * ------------------------------------------------------------------ */

function registerIpc(): void {
  ipcMain.handle('resume:list', async () => {
    const index = await store.readIndex()
    if (index.entries.length === 0) {
      const starter = await store.createStarter()
      return { index: await store.readIndex(), starterId: starter.id }
    }
    return { index, starterId: null }
  })

  ipcMain.handle('resume:read', async (_event, id: string) => store.readResume(id))

  ipcMain.handle('resume:save', async (_event, resume: Resume) => store.saveResume(resume))

  ipcMain.handle('resume:delete', async (_event, id: string) => store.deleteResume(id))

  ipcMain.handle('resume:duplicate', async (_event, id: string) => store.duplicateResume(id))

  ipcMain.handle('resume:create', async () => store.createStarter())

  ipcMain.handle('resume:setLastOpened', async (_event, id: string | null) => {
    const index = await store.readIndex()
    index.lastOpenedId = id
    await store.saveIndex(index)
    return true
  })

  ipcMain.handle('media:saveAvatar', async (_event, dataUrl: string) => store.saveAvatar(dataUrl))

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataDir: app.getPath('userData'),
    platform: process.platform,
    dev: isDev
  }))

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (!/^https?:/i.test(url)) throw new Error('只允许打开 http/https 链接')
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle('shell:showItem', (_event, target: string) => {
    shell.showItemInFolder(target)
    return true
  })

  ipcMain.handle('export:pdf', async (event, request: ExportPdfRequest) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return generatePdf(window, request, store.exportDir())
  })
}

/* ------------------------------------------------------------------ *
 * 生命周期
 * ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock()
bootLog('requestSingleInstanceLock', gotLock)

if (!gotLock) {
  bootLog('未拿到单实例锁，退出')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('before-quit', () => bootLog('before-quit'))
  app.on('will-quit', () => bootLog('will-quit'))
  app.on('window-all-closed', () => bootLog('window-all-closed'))

  void app
    .whenReady()
    .then(async () => {
      bootLog('whenReady 触发')
      try {
        store = new ResumeStore(app.getPath('userData'))
        await store.init()
        bootLog('存储层初始化完成', app.getPath('userData'))

        Menu.setApplicationMenu(null)
        registerIpc()
        bootLog('IPC 已注册')

        createWindow()
      } catch (error) {
        bootLog('启动流程抛出异常', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        })
        throw error
      }
    })
    .catch((error) => {
      bootLog('whenReady 链失败', { message: String(error) })
    })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
