import type { ResumeKitApi } from './index'

declare global {
  interface Window {
    api: ResumeKitApi
  }
}

export {}
