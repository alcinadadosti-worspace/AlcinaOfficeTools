// Processo principal do AlcinaPoint: janela, atualização, E/S e exportação .pptx.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type FileFilter } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import pptxgen from 'pptxgenjs'
import JSZip from 'jszip'
import { setupAutoUpdates } from '@alcina/updater/main'
import { type Deck, type Slide, type SlideElement, type ElementType, SLIDE_W, SLIDE_H, UNITS_PER_INCH as U } from '../shared/deck'

const FEED_URL = process.env['ALCINA_UPDATE_URL'] || 'https://alcina-office-updates.onrender.com/point'

interface DialogOpts {
  filters?: FileFilter[]
  defaultPath?: string
}

function hex(c: string): string {
  return c.replace('#', '').toUpperCase()
}

// --- Leitura de .pptx (OOXML, via jszip) ---
function joinParas(sp: string): string {
  const paras = sp.split(/<a:p>/).slice(1)
  return paras.map((p) => [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((x) => x[1]).join('')).join('\n')
}
function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}
function shapeFromPrst(prst: string): ElementType {
  switch (prst) {
    case 'ellipse':
    case 'oval':
      return 'ellipse'
    case 'roundRect':
      return 'rounded'
    case 'triangle':
    case 'isoscelesTriangle':
      return 'triangle'
    case 'line':
    case 'straightConnector1':
      return 'line'
    case 'rightArrow':
      return 'arrow'
    default:
      return 'rect'
  }
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
          slide.addText(el.text ?? '', { ...pos, fontSize: el.fontSize ?? 18, bold: el.bold, italic: el.italic, fontFace: el.fontFamily, color: hex(el.color ?? '#222222'), align: el.align ?? 'left', valign: 'top' })
        } else if (el.type === 'image' && el.image) {
          slide.addImage({ data: el.image, ...pos })
        } else if (el.type === 'chart' && el.chart) {
          const labels = el.chart.categories
          const data = el.chart.series.map((s) => ({ name: s.name, labels, values: s.data }))
          const t = el.chart.type
          const ctype = t === 'line' ? pres.ChartType.line : t === 'pie' ? pres.ChartType.pie : pres.ChartType.bar
          slide.addChart(ctype, data, { ...pos, barDir: t === 'bar' ? 'bar' : 'col', showLegend: el.chart.series.length > 1 })
        } else if (el.type === 'line' || el.type === 'arrow') {
          const st = el.type === 'arrow' ? pres.ShapeType.rightArrow : pres.ShapeType.line
          slide.addShape(st, { ...pos, line: { color: hex(el.stroke ?? el.fill ?? '#0F7A34'), width: el.strokeWidth ?? 3 } })
        } else {
          const st = el.type === 'rounded' ? pres.ShapeType.roundRect : el.type === 'ellipse' ? pres.ShapeType.ellipse : el.type === 'triangle' ? pres.ShapeType.triangle : pres.ShapeType.rect
          slide.addShape(st, { ...pos, fill: { color: hex(el.fill ?? '#0F7A34') }, ...(el.stroke ? { line: { color: hex(el.stroke), width: el.strokeWidth ?? 1 } } : {}) })
        }
      }
      if (s.notes) slide.addNotes(s.notes)
    }
    const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer
    await fs.writeFile(path, buf)
  })

  ipcMain.handle('pptx:parse', async (_e, path: string) => {
    const buf = await fs.readFile(path)
    const zip = await JSZip.loadAsync(buf)
    const presXml = (await zip.file('ppt/presentation.xml')?.async('string')) ?? ''
    const szM = /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(presXml)
    const CX = szM ? +szM[1] : 12192000
    const CY = szM ? +szM[2] : 6858000
    const slideFiles = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))
    let seq = 0
    const uid = (p: string): string => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`
    const sx = (v: number): number => Math.round((v / CX) * SLIDE_W)
    const sy = (v: number): number => Math.round((v / CY) * SLIDE_H)
    const slides: Slide[] = []
    for (const sf of slideFiles) {
      const xml = (await zip.file(sf)?.async('string')) ?? ''
      const relsXml = (await zip.file(sf.replace('slides/', 'slides/_rels/') + '.rels')?.async('string')) ?? ''
      const rels: Record<string, string> = {}
      for (const m of relsXml.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) rels[m[1]] = m[2]
      const elements: SlideElement[] = []
      for (const m of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
        const b = m[1]
        const off = /<a:off x="(-?\d+)" y="(-?\d+)"/.exec(b)
        const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(b)
        const x = off ? sx(+off[1]) : 80
        const y = off ? sy(+off[2]) : 80
        const w = ext ? sx(+ext[1]) : 300
        const h = ext ? sy(+ext[2]) : 120
        const text = decodeXml(joinParas(b)).trim()
        if (text) {
          const szr = /<a:rPr[^>]*\ssz="(\d+)"/.exec(b)
          const algn = /algn="(ctr|l|r|just)"/.exec(b)
          const colr = /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(b)
          elements.push({ id: uid('e'), type: 'text', x, y, w, h, text, fontSize: szr ? Math.round(+szr[1] / 100) : 18, bold: /<a:rPr[^>]*\sb="1"/.test(b), color: colr ? `#${colr[1]}` : '#222222', align: algn ? (algn[1] === 'ctr' ? 'center' : algn[1] === 'r' ? 'right' : 'left') : 'left' })
        } else {
          const prst = /<a:prstGeom prst="(\w+)"/.exec(b)
          const fill = /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(b)
          elements.push({ id: uid('e'), type: shapeFromPrst(prst ? prst[1] : 'rect'), x, y, w, h, fill: fill ? `#${fill[1]}` : '#0F7A34' })
        }
      }
      for (const m of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
        const b = m[1]
        const embed = /<a:blip[^>]*r:embed="(rId\d+)"/.exec(b)
        if (!embed || !rels[embed[1]]) continue
        const target = rels[embed[1]].replace('../', 'ppt/')
        const file = zip.file(target)
        if (!file) continue
        const off = /<a:off x="(-?\d+)" y="(-?\d+)"/.exec(b)
        const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(b)
        const ex = (target.split('.').pop() ?? 'png').toLowerCase()
        const mime = ex === 'jpg' || ex === 'jpeg' ? 'image/jpeg' : ex === 'svg' ? 'image/svg+xml' : `image/${ex}`
        elements.push({ id: uid('e'), type: 'image', x: off ? sx(+off[1]) : 80, y: off ? sy(+off[2]) : 80, w: ext ? sx(+ext[1]) : 320, h: ext ? sy(+ext[2]) : 200, image: `data:${mime};base64,${await file.async('base64')}` })
      }
      slides.push({ id: uid('s'), background: '#ffffff', elements })
    }
    if (!slides.length) slides.push({ id: uid('s'), background: '#ffffff', elements: [] })
    return { version: 1, app: 'alcina-point', slides } as Deck
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
