import type { ShortlistApi } from '../../shared/ipc'

declare global {
  interface Window {
    shortlist: ShortlistApi
  }
}

export {}
