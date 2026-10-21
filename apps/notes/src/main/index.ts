// Processo principal do AlcinaNotes: janela, atualização e E/S de arquivos.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type FileFilter } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setupAutoUpdates } from '@alcina/updater/main'

const FEED_URL = process.env['ALCINA_UPDATE_URL'] || 'https://alcina-office-updates.onrender.com/notes'

interface DialogOpts {
  filters?: FileFilter[]
  defaultPath?: string
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1140,
    height: 780,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#f4f7f3',
    title: 'Alcina Office — Notas',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  void setupAutoUpdates(win, { feedUrl: FEED_URL })
  return win
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.alcina.notes')
  Menu.setApplicationMenu(null)

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)

  ipcMain.handle('dialog:open', async (e, opts: DialogOpts) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(w!, { filters: opts?.filters, properties: ['openFile'] })
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle('dialog:save', async (e, opts: DialogOpts) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showSaveDialog(w!, { filters: opts?.filters, defaultPath: opts?.defaultPath })
    return res.canceled || !res.filePath ? null : res.filePath
  })
  ipcMain.handle('fs:read', async (_e, path: string) => {
    const b = await fs.readFile(path)
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  })
  ipcMain.handle('fs:write', async (_e, path: string, data: Uint8Array) => {
    await fs.writeFile(path, Buffer.from(data))
  })

  ipcMain.handle('pdf:print', async (_e, html: string, path: string) => {
    const tmp = join(tmpdir(), `alcinanotes-${process.pid}-${Date.now()}.html`)
    await fs.writeFile(tmp, html, 'utf8')
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
    try {
      await win.loadFile(tmp)
      const pdf = await win.webContents.printToPDF({ printBackground: true, margins: { top: 1, bottom: 1, left: 0.8, right: 0.8 } })
      await fs.writeFile(path, pdf)
    } finally {
      win.destroy()
      await fs.unlink(tmp).catch(() => undefined)
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
