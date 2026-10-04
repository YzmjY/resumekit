import { contextBridge, ipcRenderer } from 'electron'
import type {
  ExportPdfRequest,
  ExportPdfResult,
  Resume,
  ResumeIndex,
  ResumeIndexEntry
} from '@shared/resume'

/**
 * 渲染进程唯一的原生能力入口。
 * 只暴露经过收敛的窄接口：没有 fs、没有任意 IPC 通道、没有 node 集成。
 */
const api = {
  /* 简历库 */
  list: (): Promise<{ index: ResumeIndex; starterId: string | null }> => ipcRenderer.invoke('resume:list'),
  read: (id: string): Promise<Resume> => ipcRenderer.invoke('resume:read', id),
  save: (resume: Resume): Promise<ResumeIndexEntry> => ipcRenderer.invoke('resume:save', resume),
  remove: (id: string): Promise<ResumeIndex> => ipcRenderer.invoke('resume:delete', id),
  duplicate: (id: string): Promise<Resume> => ipcRenderer.invoke('resume:duplicate', id),
  create: (): Promise<Resume> => ipcRenderer.invoke('resume:create'),
  setLastOpened: (id: string | null): Promise<boolean> => ipcRenderer.invoke('resume:setLastOpened', id),

  /* 头像 */
  saveAvatar: (dataUrl: string): Promise<string> => ipcRenderer.invoke('media:saveAvatar', dataUrl),

  /* 导出 */
  exportPdf: (request: ExportPdfRequest): Promise<ExportPdfResult> => ipcRenderer.invoke('export:pdf', request),

  /* 应用信息与系统集成 */
  info: (): Promise<{ version: string; dataDir: string; platform: string; dev: boolean }> =>
    ipcRenderer.invoke('app:info'),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  showItem: (target: string): Promise<boolean> => ipcRenderer.invoke('shell:showItem', target)
}

export type ResumeStudioApi = typeof api

contextBridge.exposeInMainWorld('api', api)
