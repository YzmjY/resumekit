import { promises as fs } from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, type PrintToPDFOptions } from 'electron'
import { A4_HEIGHT_PX, A4_WIDTH_PX, type ExportPdfRequest, type ExportPdfResult } from '@shared/resume'
// 模板样式是导出结果的一部分，构建期以原始文本内联进主进程
import templateCss from '../renderer/src/styles/template.css?raw'

const PAGE_SIZES = {
  A4: { css: { width: A4_WIDTH_PX, height: A4_HEIGHT_PX }, inch: { width: 8.27, height: 11.69 } },
  A3: { css: { width: 1123, height: 1587 }, inch: { width: 11.69, height: 16.54 } },
  Letter: { css: { width: 816, height: 1056 }, inch: { width: 8.5, height: 11 } }
} as const

type PageSizeName = keyof typeof PAGE_SIZES

function isPageSize(value: unknown): value is PageSizeName {
  return typeof value === 'string' && value in PAGE_SIZES
}

function buildDocument(request: ExportPdfRequest): { html: string; page: { width: number; height: number } } {
  const sizeName: PageSizeName = isPageSize(request.pageSize) ? request.pageSize : 'A4'
  const page = PAGE_SIZES[sizeName].css

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(request.suggestedName)}</title>
<style>
:root {
  ${request.cssVars}
  --rs-page-width: ${page.width}px;
  --rs-page-height: ${page.height}px;
}
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  width: ${page.width}px;
}
.rs-doc {
  box-shadow: none;
}
${templateCss}
${request.extraCss ?? ''}
</style>
</head>
<body><div id="rs-export-root">${request.html}</div></body>
</html>`

  return { html, page }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

/** 把建议文件名规范成安全的文件名片段 */
function safeFileName(raw: string): string {
  const cleaned = (raw || '简历')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 80) || '简历'
}

function waitForLoad(contents: Electron.WebContents, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('打印页面加载超时'))
    }, timeoutMs)
    const onFinish = (): void => {
      cleanup()
      resolve()
    }
    const onFail = (_event: Electron.Event, errorCode: number, errorDescription: string): void => {
      cleanup()
      reject(new Error(`打印页面加载失败：${errorDescription} (${errorCode})`))
    }
    function cleanup(): void {
      clearTimeout(timer)
      contents.off('did-finish-load', onFinish)
      contents.off('did-fail-load', onFail)
    }
    contents.once('did-finish-load', onFinish)
    contents.once('did-fail-load', onFail)
  })
}

/**
 * 用隐藏窗口渲染同一份 HTML，再交给 Chromium 打印成 PDF。
 * 导出与屏幕预览共用模板与样式，保证所见即所得。
 */
export async function generatePdf(
  parent: BrowserWindow | null,
  request: ExportPdfRequest,
  defaultDir: string
): Promise<ExportPdfResult> {
  const sizeName: PageSizeName = isPageSize(request.pageSize) ? request.pageSize : 'A4'
  const { html, page } = buildDocument(request)

  const printWindow = new BrowserWindow({
    show: false,
    width: page.width,
    height: page.height,
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true
    }
  })

  try {
    // 先挂监听再触发加载：data URL 可能在 loadURL 返回前就已经加载完成，
    // 反过来写会永久错过 did-finish-load，导出必然超时。
    const loaded = waitForLoad(printWindow.webContents)
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await loaded
    // 等字体与图片就绪，否则中文可能以回退字体落盘
    await printWindow.webContents.executeJavaScript(
      'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
      true
    )

    const options: PrintToPDFOptions = {
      pageSize: PAGE_SIZES[sizeName].inch,
      printBackground: true,
      // 页面留白完全由模板令牌控制，打印器不得再叠加边距
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false
    }
    const pdf = await printWindow.webContents.printToPDF(options)

    const save = await dialog.showSaveDialog(parent ?? printWindow, {
      title: '导出 PDF',
      defaultPath: path.join(defaultDir, `${safeFileName(request.suggestedName)}.pdf`),
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })

    if (save.canceled || !save.filePath) {
      return { ok: false, canceled: true }
    }

    await fs.mkdir(path.dirname(save.filePath), { recursive: true })
    await fs.writeFile(save.filePath, pdf)
    return { ok: true, path: save.filePath, bytes: pdf.byteLength }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
  }
}

export { buildDocument, safeFileName }
