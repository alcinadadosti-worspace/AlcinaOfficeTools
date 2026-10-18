// Processo principal do AlcinaPoint: janela, atualização, E/S e exportação .pptx.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type FileFilter } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import pptxgen from 'pptxgenjs'
import { setupAutoUpdates } from '@alcina/updater/main'
import { type Deck, SLIDE_W, SLIDE_H, UNITS_PER_INCH as U } from '../shared/deck'

const FEED_URL = process.env['ALCINA_UPDATE_URL'] || 'https://alcina-office-updates.onrender.com/point'

interface DialogOpts {
  filters?: FileFilter[]
  defaultPath?: string
}

function hex(c: string): string {
  return c.replace('#', '').toUpperCase()
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#f4f7f3',
    title: 'AlcinaPoint',
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
  app.setAppUserModelId('com.alcina.point')
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

  ipcMain.handle('pptx:build', async (_e, deck: Deck, path: string) => {
    const pres = new pptxgen()
    pres.defineLayout({ name: 'ALC', width: SLIDE_W / U, height: SLIDE_H / U })
    pres.layout = 'ALC'
    for (const s of deck.slides) {
      const slide = pres.addSlide()
      slide.background = { color: hex(s.background || '#FFFFFF') }
      for (const el of s.elements) {
        const pos = { x: el.x / U, y: el.y / U, w: el.w / U, h: el.h / U }
        if (el.type === 'text') {
          slide.addText(el.text ?? '', { ...pos, fontSize: el.fontSize ?? 18, bold: el.bold, italic: el.italic, color: hex(el.color ?? '#222222'), align: el.align ?? 'left', valign: 'top' })
        } else if (el.type === 'rect') {
          slide.addShape(pres.ShapeType.rect, { ...pos, fill: { color: hex(el.fill ?? '#0F7A34') } })
        } else if (el.type === 'ellipse') {
          slide.addShape(pres.ShapeType.ellipse, { ...pos, fill: { color: hex(el.fill ?? '#0F7A34') } })
        } else if (el.type === 'image' && el.image) {
          slide.addImage({ data: el.image, ...pos })
        }
      }
    }
    const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer
    await fs.writeFile(path, buf)
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
