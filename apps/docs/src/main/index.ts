// Processo principal do AlcinaDocs: janela, atualização, E/S, conversão .docx e PDF.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type FileFilter } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import mammoth from 'mammoth'
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, LevelFormat, BorderStyle } from 'docx'
import { setupAutoUpdates } from '@alcina/updater/main'
import type { DocBlock, DocRun } from '@alcina/editor/docmodel'

const FEED_URL = process.env['ALCINA_UPDATE_URL'] || 'https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/download/docs'

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
    title: 'Alcina Office — Documentos',
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
// Lê as dimensões (px) de um PNG/JPEG/GIF a partir dos bytes; null se não reconhecer.
function sniffSize(buf: Buffer, mime: string): { w: number; h: number } | null {
  try {
    if (mime.includes('png')) {
      if (buf.length >= 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    } else if (mime.includes('gif')) {
      if (buf.length >= 10) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
    } else if (mime.includes('jpeg') || mime.includes('jpg')) {
      let o = 2
      while (o + 9 < buf.length) {
        if (buf[o] !== 0xff) { o++; continue }
        const marker = buf[o + 1]
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) }
        }
        o += 2 + buf.readUInt16BE(o + 2)
      }
    }
  } catch {
    /* ignora */
  }
  return null
}

// Cria um ImageRun a partir de um data: URI; null se não for imagem suportada (nunca lança).
function imageRun(src: string): ImageRun | null {
  try {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(src)
    if (!m) return null
    const mime = m[1].toLowerCase()
    const type = mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('gif') ? 'gif' : mime.includes('bmp') ? 'bmp' : null
    if (!type) return null
    const buf = Buffer.from(m[2], 'base64')
    const dim = sniffSize(buf, mime) ?? { w: 480, h: 320 }
    const maxW = 480
    const scale = dim.w > maxW ? maxW / dim.w : 1
    return new ImageRun({ data: buf, type, transformation: { width: Math.max(1, Math.round(dim.w * scale)), height: Math.max(1, Math.round(dim.h * scale)) } })
  } catch {
    return null
  }
}

function runsOf(rs: DocRun[]): (TextRun | ImageRun)[] {
  const out: (TextRun | ImageRun)[] = []
  for (const r of rs) {
    if (r.image) {
      const img = imageRun(r.image.src)
      if (img) out.push(img)
      continue
    }
    out.push(new TextRun({ text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, break: r.break ? 1 : undefined }))
  }
  return out.length ? out : [new TextRun('')]
}
function blockToChild(b: DocBlock): Paragraph | Table {
  if (b.type === 'table') {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: b.rows.map(
        (row) =>
          new TableRow({
            children: row.map((cell) => new TableCell({ children: cell.blocks.length ? cell.blocks.map(blockToChild) : [new Paragraph('')] }))
          })
      )
    })
  }
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
      ...(b.ordered ? { numbering: { reference: `ord${b.numId ?? 0}`, level: b.level } } : { bullet: { level: b.level } })
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
    // Cada lista numerada de nível superior ganha sua própria referência, para reiniciar a contagem.
    const refs = new Set<number>()
    const scan = (bs: DocBlock[]): void => {
      for (const b of bs) {
        if (b.type === 'listItem' && b.ordered) refs.add(b.numId ?? 0)
        else if (b.type === 'table') for (const row of b.rows) for (const cell of row) scan(cell.blocks)
      }
    }
    scan(blocks)
    const levels = Array.from({ length: 9 }, (_, i) => ({
      level: i,
      format: LevelFormat.DECIMAL,
      text: `%${i + 1}.`,
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } }
    }))
    const config = [...refs].map((id) => ({ reference: `ord${id}`, levels }))
    const doc = new Document({
      ...(config.length ? { numbering: { config } } : {}),
      sections: [{ children: blocks.map(blockToChild) }]
    })
    const buf = await Packer.toBuffer(doc)
    await fs.writeFile(path, buf)
  })

  ipcMain.handle('pdf:print', async (_e, html: string, path: string, opts?: { header?: string; footer?: string; pageNumbers?: boolean }) => {
    const tmp = join(tmpdir(), `alcinadocs-${process.pid}-${Date.now()}.html`)
    await fs.writeFile(tmp, html, 'utf8')
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
    try {
      await win.loadFile(tmp)
      const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const useHF = !!(opts && (opts.header || opts.footer || opts.pageNumbers))
      const pdfOpts: Parameters<typeof win.webContents.printToPDF>[0] = { printBackground: true }
      if (useHF) {
        const pn = opts!.pageNumbers ? ' <span class="pageNumber"></span> / <span class="totalPages"></span>' : ''
        pdfOpts.displayHeaderFooter = true
        pdfOpts.margins = { top: 1.2, bottom: 1.2, left: 0.8, right: 0.8 }
        pdfOpts.headerTemplate = `<div style="font-size:9px;width:100%;text-align:center;color:#666;padding:0 1.5cm;">${esc(opts!.header ?? '')}</div>`
        pdfOpts.footerTemplate = `<div style="font-size:9px;width:100%;text-align:center;color:#666;padding:0 1.5cm;">${esc(opts!.footer ?? '')}${pn}</div>`
      }
      const pdf = await win.webContents.printToPDF(pdfOpts)
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
