import type { UpdaterBridge } from '@alcina/updater/renderer'
import type { DocBlock } from '@alcina/editor/docmodel'

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
    alcinaDocx: {
      toHtml(path: string): Promise<string>
      build(blocks: DocBlock[], path: string): Promise<void>
      printPdf(html: string, path: string, opts?: { header?: string; footer?: string; pageNumbers?: boolean }): Promise<void>
    }
  }
}

export {}
