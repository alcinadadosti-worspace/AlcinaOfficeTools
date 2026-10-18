// Processo principal do AlcinaDocs: janela, atualização, E/S, conversão .docx e PDF.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type FileFilter } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import mammoth from 'mammoth'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, BorderStyle } from 'docx'
import { setupAutoUpdates } from '@alcina/updater/main'
import type { DocBlock, DocRun } from '@alcina/editor/docmodel'

const FEED_URL = process.env['ALCINA_UPDATE_URL'] || 'https://alcina-office-updates.onrender.com/docs'

interface DialogOpts {
  filters?: FileFilter[]
  defaultPath?: string
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    show: false,
    backgroundColor: '#f4f7f3',
    title: 'AlcinaDocs',
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

// --- Conversão para .docx ---
function alignOf(a?: string): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (a === 'center') return AlignmentType.CENTER
  if (a === 'right') return AlignmentType.RIGHT
  if (a === 'justify') return AlignmentType.JUSTIFIED
  return AlignmentType.LEFT
}
function headingOf(n: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  return n === 1 ? HeadingLevel.HEADING_1 : n === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
}
function runsOf(rs: DocRun[]): TextRun[] {
  if (!rs.length) return [new TextRun('')]
  return rs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined }))
}
function blockToParagraph(b: DocBlock): Paragraph {
  if (b.type === 'hr') {
    return new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } } })
  }
  if (b.type === 'heading') {
    return new Paragraph({ heading: headingOf(b.level), alignment: alignOf(b.align), children: runsOf(b.runs) })
  }
  if (b.type === 'listItem') {
    return new Paragraph({
      alignment: alignOf(b.align),
      children: runsOf(b.runs),
      ...(b.ordered ? { numbering: { reference: 'ord', level: b.level } } : { bullet: { level: b.level } })
    })
  }
  return new Paragraph({ alignment: alignOf(b.align), children: runsOf(b.runs) })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.alcina.docs')
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

  ipcMain.handle('docx:toHtml', async (_e, path: string) => {
    const r = await mammoth.convertToHtml({ path })
    return r.value
  })
  ipcMain.handle('docx:build', async (_e, blocks: DocBlock[], path: string) => {
    const doc = new Document({
      numbering: { config: [{ reference: 'ord', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }] }] },
      sections: [{ children: blocks.map(blockToParagraph) }]
    })
    const buf = await Packer.toBuffer(doc)
    await fs.writeFile(path, buf)
  })

  ipcMain.handle('pdf:print', async (_e, html: string, path: string) => {
    const tmp = join(tmpdir(), `alcinadocs-${process.pid}-${Date.now()}.html`)
    await fs.writeFile(tmp, html, 'utf8')
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
    try {
      await win.loadFile(tmp)
      const pdf = await win.webContents.printToPDF({ printBackground: true })
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
