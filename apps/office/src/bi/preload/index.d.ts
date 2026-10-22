import type { AlcinaApi } from '../shared/ipc'

declare global {
  interface Window {
    alcina: AlcinaApi
  }
}

export {}
