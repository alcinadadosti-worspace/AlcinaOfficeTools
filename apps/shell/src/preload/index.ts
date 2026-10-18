// Preload: expõe APIs seguras do app e da atualização ao renderer.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { UPDATER_CHANNELS, type UpdateStatus } from '@alcina/updater'

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

contextBridge.exposeInMainWorld('alcinaSuite', {
  launch: (key: string) => ipcRenderer.invoke('app:launch', key)
})
