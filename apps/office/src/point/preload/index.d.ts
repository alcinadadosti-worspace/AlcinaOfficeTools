import type { UpdaterBridge } from '@alcina/updater/renderer'
import type { Deck } from '../shared/deck'

interface FileFilter {
  name: string
  extensions: string[]
}

declare global {
  interface Window {
    alcinaApp: {
      getVersion(): Promise<string>
      getPlatform(): Promise<string>
    }
    alcinaUpdater: UpdaterBridge
    alcinaFiles: {
      openDialog(opts: { filters?: FileFilter[]; defaultPath?: string }): Promise<string | null>
      saveDialog(opts: { filters?: FileFilter[]; defaultPath?: string }): Promise<string | null>
      read(path: string): Promise<Uint8Array>
      write(path: string, data: Uint8Array): Promise<void>
    }
    alcinaPptx: {
      build(deck: Deck, path: string): Promise<void>
      parse(path: string): Promise<Deck>
    }
  }
}

export {}
