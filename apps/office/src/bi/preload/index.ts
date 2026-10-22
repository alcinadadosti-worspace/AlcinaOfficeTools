import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AlcinaApi } from '@shared/ipc'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: AlcinaApi = {
  info: () => ipcRenderer.invoke(IPC.info),
  window: {
    minimize: () => ipcRenderer.send(IPC.winMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.winToggleMaximize),
    close: () => ipcRenderer.send(IPC.winClose),
    setTitle: (title) => ipcRenderer.send(IPC.winSetTitle, title),
    setDirty: (dirty) => ipcRenderer.send(IPC.winSetDirty, dirty),
    confirmClose: () => ipcRenderer.send(IPC.winConfirmClose),
    onCloseRequested: (cb) => subscribe(IPC.winCloseRequested, cb),
    onMaximizedChange: (cb) => subscribe<[boolean]>(IPC.winMaximized, cb),
    newWindow: (path) => ipcRenderer.send(IPC.winNew, path),
    capture: (rect) => ipcRenderer.invoke(IPC.winCapture, rect)
  },
  dialog: {
    open: (options) => ipcRenderer.invoke(IPC.dialogOpen, options),
    save: (options) => ipcRenderer.invoke(IPC.dialogSave, options)
  },
  fs: {
    read: (path) => ipcRenderer.invoke(IPC.fsRead, path),
    write: (path, data) => ipcRenderer.invoke(IPC.fsWrite, path, data),
    stat: (path) => ipcRenderer.invoke(IPC.fsStat, path),
    listDir: (path) => ipcRenderer.invoke(IPC.fsListDir, path)
  },
  net: {
    fetch: (url) => ipcRenderer.invoke(IPC.netFetch, url)
  },
  db: {
    query: (connection, sql, maxRows) => ipcRenderer.invoke(IPC.dbQuery, connection, sql, maxRows),
    listTables: (connection) => ipcRenderer.invoke(IPC.dbListTables, connection)
  },
  recent: {
    list: () => ipcRenderer.invoke(IPC.recentList),
    add: (path) => ipcRenderer.invoke(IPC.recentAdd, path),
    remove: (path) => ipcRenderer.invoke(IPC.recentRemove, path)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  app: {
    initialFile: () => ipcRenderer.invoke(IPC.initialFile),
    onOpenFile: (cb) => subscribe<[string]>(IPC.openFile, cb),
    openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
    showInFolder: (path) => ipcRenderer.invoke(IPC.showInFolder, path),
    exportPdf: (options) => ipcRenderer.invoke(IPC.exportPdf, options),
    samplePath: () => ipcRenderer.invoke(IPC.samplePath)
  }
}

contextBridge.exposeInMainWorld('alcina', api)
