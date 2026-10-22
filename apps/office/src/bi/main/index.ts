// IPC e janela do Analytics (BI) dentro do app único "Alcina Office".
// Mantém a janela sem moldura (barra de título própria), múltiplas janelas,
// estado de "documento sujo", configurações, recentes, PDF e consulta a dados.
// O ciclo de vida do processo e o auto-update ficam no bootstrap da suíte.
import { app, BrowserWindow, dialog, ipcMain, net, shell } from 'electron'
import { promises as fs, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { IPC, type OpenDialogOptions, type SaveDialogOptions, type RecentFile, type PdfExportOptions, type DbConnection } from '@shared/ipc'
import { runDbQuery, listDbTables } from './db'

interface WindowState {
  initialFile: string | null
  dirty: boolean
  allowClose: boolean
}

const windows = new Map<number, WindowState>()

// ---------------------------------------------------------------------------
// Configurações persistentes (arquivos recentes, preferências)
// ---------------------------------------------------------------------------

const settingsFile = (): string => join(app.getPath('userData'), 'analytics-settings.json')
let settingsCache: Record<string, unknown> | null = null

async function loadSettings(): Promise<Record<string, unknown>> {
  if (settingsCache) return settingsCache
  try {
    settingsCache = JSON.parse(await fs.readFile(settingsFile(), 'utf8'))
  } catch {
    settingsCache = {}
  }
  return settingsCache!
}

async function saveSettings(): Promise<void> {
  if (!settingsCache) return
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  const tmp = settingsFile() + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(settingsCache, null, 2), 'utf8')
  await fs.rename(tmp, settingsFile())
}

async function recentFiles(): Promise<RecentFile[]> {
  const s = await loadSettings()
  const list = Array.isArray(s.recentFiles) ? (s.recentFiles as RecentFile[]) : []
  return list.filter((r) => r && typeof r.path === 'string')
}

async function addRecent(path: string): Promise<void> {
  const s = await loadSettings()
  const list = (await recentFiles()).filter((r) => r.path.toLowerCase() !== path.toLowerCase())
  list.unshift({ path, name: basename(path, extname(path)), openedAt: Date.now() })
  s.recentFiles = list.slice(0, 20)
  await saveSettings()
  if (process.platform === 'win32') app.addRecentDocument(path)
}

async function removeRecent(path: string): Promise<void> {
  const s = await loadSettings()
  s.recentFiles = (await recentFiles()).filter((r) => r.path.toLowerCase() !== path.toLowerCase())
  await saveSettings()
}

// ---------------------------------------------------------------------------
// Janelas
// ---------------------------------------------------------------------------

function iconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath ?? '', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.png')
  ]
  return candidates.find((p) => existsSync(p))
}

export function openBiWindow(initialFile: string | null = null): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#f3f2f1',
    title: 'Alcina Office — Analytics',
    icon: iconPath(),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#252423',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/bi.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  windows.set(win.webContents.id, { initialFile, dirty: false, allowClose: false })
  const wcId = win.webContents.id

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  win.on('maximize', () => win.webContents.send(IPC.winMaximized, true))
  win.on('unmaximize', () => win.webContents.send(IPC.winMaximized, false))

  win.on('close', (e) => {
    const state = windows.get(wcId)
    if (!state || state.allowClose || !state.dirty) return
    e.preventDefault()
    win.webContents.send(IPC.winCloseRequested)
  })

  win.on('closed', () => {
    windows.delete(wcId)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    e.preventDefault()
  })

  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools()
    }
  })

  const base = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && base) void win.loadURL(`${base}/bi/renderer/index.html`)
  else void win.loadFile(join(__dirname, '../renderer/bi/renderer/index.html'))
  return win
}

// Abre o Analytics a partir da Central: foca uma janela já aberta ou cria a primeira.
// (Dentro do Analytics, "Nova janela" continua criando janelas adicionais quando o usuário quiser.)
export function launchBi(): BrowserWindow {
  const existing = BrowserWindow.getAllWindows().find((w) => windows.has(w.webContents.id))
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return existing
  }
  return openBiWindow()
}

function windowFor(sender: Electron.WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender)
}

async function exportPdf(opts: PdfExportOptions): Promise<void> {
  const tmpHtml = join(tmpdir(), `alcina-analytics-export-${process.pid}-${Date.now()}.html`)
  await fs.writeFile(tmpHtml, opts.html, 'utf8')
  const win = new BrowserWindow({
    show: false,
    width: Math.round(opts.widthPx),
    height: Math.round(opts.heightPx),
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
  })
  try {
    await win.loadFile(tmpHtml)
    // Tamanho da página em polegadas (96 dpi), mantendo a proporção do relatório.
    const pdf = await win.webContents.printToPDF({
      landscape: false,
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: { width: opts.widthPx / 96, height: opts.heightPx / 96 },
      preferCSSPageSize: true
    })
    await fs.writeFile(opts.path, pdf)
  } finally {
    win.destroy()
    await fs.unlink(tmpHtml).catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// IPC do Analytics
// ---------------------------------------------------------------------------

export function registerBiIpc(): void {
  ipcMain.handle(IPC.info, () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData')
  }))

  ipcMain.on(IPC.winMinimize, (e) => windowFor(e.sender)?.minimize())
  ipcMain.on(IPC.winToggleMaximize, (e) => {
    const w = windowFor(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on(IPC.winClose, (e) => windowFor(e.sender)?.close())
  ipcMain.on(IPC.winSetTitle, (e, title: string) => windowFor(e.sender)?.setTitle(String(title)))
  ipcMain.on(IPC.winSetDirty, (e, dirty: boolean) => {
    const st = windows.get(e.sender.id)
    if (st) st.dirty = !!dirty
    windowFor(e.sender)?.setDocumentEdited(!!dirty)
  })
  ipcMain.on(IPC.winConfirmClose, (e) => {
    const st = windows.get(e.sender.id)
    if (st) st.allowClose = true
    windowFor(e.sender)?.close()
  })
  ipcMain.on(IPC.winNew, (_e, path?: string) => {
    openBiWindow(typeof path === 'string' ? path : null)
  })
  ipcMain.handle(IPC.winCapture, async (e, rect: { x: number; y: number; width: number; height: number }) => {
    const img = await e.sender.capturePage({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height))
    })
    const png = img.toPNG()
    return new Uint8Array(png.buffer, png.byteOffset, png.byteLength)
  })

  ipcMain.handle(IPC.dialogOpen, async (e, opts: OpenDialogOptions) => {
    const w = windowFor(e.sender)
    const props: ('openFile' | 'multiSelections')[] = ['openFile']
    if (opts?.multiple) props.push('multiSelections')
    const res = await dialog.showOpenDialog(w!, {
      title: opts?.title,
      filters: opts?.filters,
      defaultPath: opts?.defaultPath,
      properties: props
    })
    return res.canceled ? null : res.filePaths
  })

  ipcMain.handle(IPC.dialogSave, async (e, opts: SaveDialogOptions) => {
    const w = windowFor(e.sender)
    const res = await dialog.showSaveDialog(w!, {
      title: opts?.title,
      defaultPath: opts?.defaultPath,
      filters: opts?.filters
    })
    return res.canceled || !res.filePath ? null : res.filePath
  })

  ipcMain.handle(IPC.fsRead, async (_e, path: string) => {
    const buf = await fs.readFile(path)
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  })

  ipcMain.handle(IPC.fsWrite, async (_e, path: string, data: Uint8Array) => {
    // Escrita atômica: grava em arquivo temporário e renomeia.
    const tmp = `${path}.${process.pid}.tmp`
    await fs.writeFile(tmp, data)
    try {
      await fs.rename(tmp, path)
    } catch (err) {
      await fs.copyFile(tmp, path)
      await fs.unlink(tmp).catch(() => undefined)
      if (!existsSync(path)) throw err
    }
  })

  ipcMain.handle(IPC.fsStat, async (_e, path: string) => {
    try {
      const st = await fs.stat(path)
      return { size: st.size, mtimeMs: st.mtimeMs }
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.fsListDir, async (_e, path: string) => {
    const entries = await fs.readdir(path, { withFileTypes: true })
    const out: { name: string; isDir: boolean; size: number; mtimeMs: number }[] = []
    for (const ent of entries) {
      try {
        const st = await fs.stat(join(path, ent.name))
        out.push({ name: ent.name, isDir: ent.isDirectory(), size: st.size, mtimeMs: st.mtimeMs })
      } catch {
        /* arquivo inacessível: ignora */
      }
    }
    return out
  })

  ipcMain.handle(IPC.netFetch, async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Somente URLs http(s) são suportadas.')
    const res = await net.fetch(url, { redirect: 'follow' })
    const buf = new Uint8Array(await res.arrayBuffer())
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      finalUrl: res.url || url,
      data: buf
    }
  })

  ipcMain.handle(IPC.dbQuery, (_e, conn: DbConnection, sql: string, maxRows?: number) => runDbQuery(conn, sql, maxRows))
  ipcMain.handle(IPC.dbListTables, (_e, conn: DbConnection) => listDbTables(conn))

  ipcMain.handle(IPC.recentList, () => recentFiles())
  ipcMain.handle(IPC.recentAdd, (_e, path: string) => addRecent(path))
  ipcMain.handle(IPC.recentRemove, (_e, path: string) => removeRecent(path))

  ipcMain.handle(IPC.settingsGet, async () => {
    const s = await loadSettings()
    const { recentFiles: _ignored, ...rest } = s
    return rest
  })
  ipcMain.handle(IPC.settingsSet, async (_e, patch: Record<string, unknown>) => {
    const s = await loadSettings()
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (k === 'recentFiles') continue
      s[k] = v
    }
    await saveSettings()
  })

  ipcMain.handle(IPC.initialFile, (e) => {
    const st = windows.get(e.sender.id)
    const f = st?.initialFile ?? null
    if (st) st.initialFile = null
    return f
  })

  ipcMain.handle(IPC.openExternal, async (_e, url: string) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) await shell.openExternal(url)
  })

  ipcMain.handle(IPC.showInFolder, (_e, path: string) => shell.showItemInFolder(path))

  ipcMain.handle(IPC.exportPdf, async (_e, opts: PdfExportOptions) => exportPdf(opts))

  ipcMain.handle(IPC.samplePath, () => {
    const candidates = [join(process.resourcesPath ?? '', 'samples'), join(app.getAppPath(), 'resources', 'samples')]
    return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1]
  })
}
