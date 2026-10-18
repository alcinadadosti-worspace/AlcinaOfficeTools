import type { UpdaterBridge } from '@alcina/updater/renderer'

declare global {
  interface Window {
    alcinaApp: {
      getVersion(): Promise<string>
      getPlatform(): Promise<string>
    }
    alcinaUpdater: UpdaterBridge
  }
}

export {}
