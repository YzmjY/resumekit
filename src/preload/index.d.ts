import type { ResumeStudioApi } from './index'

declare global {
  interface Window {
    api: ResumeStudioApi
  }
}

export {}
