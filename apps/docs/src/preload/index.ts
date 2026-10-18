// Preload do AlcinaDocs.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { UPDATER_CHANNELS, type UpdateStatus } from '@alcina/updater'
import type { DocBlock } from '../shared/docmodel'

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

contextBridge.exposeInMainWorld('alcinaDocx', {
  toHtml: (path: string) => ipcRenderer.invoke('docx:toHtml', path),
  build: (blocks: DocBlock[], path: string) => ipcRenderer.invoke('docx:build', blocks, path),
  printPdf: (html: string, path: string) => ipcRenderer.invoke('pdf:print', html, path)
})
