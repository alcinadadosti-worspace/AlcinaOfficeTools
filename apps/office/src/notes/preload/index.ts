// Preload do AlcinaNotes.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { UpdateStatus } from '@alcina/updater'

// Canais do atualizador inlinados (não importados) de propósito: mantém este preload autocontido,
// evitando que o Rollup extraia um chunk compartilhado — require("./chunks/...") é proibido em
// preload com sandbox:true. Fonte da verdade: packages/updater/src/ipc.ts.
const UPDATER_CHANNELS = {
  status: 'alcina-updater:status',
  check: 'alcina-updater:check',
  install: 'alcina-updater:install'
} as const

interface DialogOpts {
  filters?: { name: string; extensions: string[] }[]
  defaultPath?: string
}

contextBridge.exposeInMainWorld('alcinaApp', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform')
})

contextBridge.exposeInMainWorld('alcinaUpdater', {
  onStatus: (cb: (s: UpdateStatus) => void) => {
    const listener = (_e: IpcRendererEvent, s: UpdateStatus): void => cb(s)
    ipcRenderer.on(UPDATER_CHANNELS.status, listener)
    return () => ipcRenderer.removeListener(UPDATER_CHANNELS.status, listener)
  },
  check: () => ipcRenderer.invoke(UPDATER_CHANNELS.check),
  install: () => ipcRenderer.invoke(UPDATER_CHANNELS.install)
})

contextBridge.exposeInMainWorld('alcinaFiles', {
  openDialog: (opts: DialogOpts) => ipcRenderer.invoke('dialog:open', opts),
  saveDialog: (opts: DialogOpts) => ipcRenderer.invoke('dialog:save', opts),
  read: (path: string) => ipcRenderer.invoke('fs:read', path),
  write: (path: string, data: Uint8Array) => ipcRenderer.invoke('fs:write', path, data)
})

contextBridge.exposeInMainWorld('alcinaPdf', {
  print: (html: string, path: string) => ipcRenderer.invoke('pdf:print', html, path)
})
