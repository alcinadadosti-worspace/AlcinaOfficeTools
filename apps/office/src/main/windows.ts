// Gerenciador de janelas do app único "Alcina Office".
// Cada ferramenta abre em sua própria janela (um processo/instalação só).
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

export type ToolKey = 'central' | 'sheets' | 'docs' | 'point' | 'notes' | 'bi'

interface ToolDef {
  title: string
  width: number
  height: number
  minWidth: number
  minHeight: number
  frame?: boolean
}

const TOOLS: Record<ToolKey, ToolDef> = {
  central: { title: 'Alcina Office', width: 1200, height: 800, minWidth: 820, minHeight: 560 },
  sheets: { title: 'Alcina Office — Planilhas', width: 1280, height: 800, minWidth: 860, minHeight: 560 },
  docs: { title: 'Alcina Office — Documentos', width: 1200, height: 820, minWidth: 800, minHeight: 560 },
  point: { title: 'Alcina Office — Apresentações', width: 1280, height: 820, minWidth: 900, minHeight: 600 },
  notes: { title: 'Alcina Office — Notas', width: 1140, height: 780, minWidth: 760, minHeight: 520 },
  bi: { title: 'Alcina Office — Analytics', width: 1280, height: 820, minWidth: 940, minHeight: 600 }
}

const open = new Map<ToolKey, BrowserWindow>()

function rendererUrl(tool: ToolKey): string {
  // Em dev, o servidor do electron-vite serve a partir da raiz do renderer (src/).
  // Em produção, cada página fica em out/renderer/<tool>/renderer/index.html.
  const base = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && base) return `${base}/${tool}/renderer/index.html`
  return join(__dirname, `../renderer/${tool}/renderer/index.html`)
}

export function openTool(tool: ToolKey): BrowserWindow {
  const existing = open.get(tool)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return existing
  }

  const def = TOOLS[tool]
  const win = new BrowserWindow({
    width: def.width,
    height: def.height,
    minWidth: def.minWidth,
    minHeight: def.minHeight,
    show: false,
    backgroundColor: '#f4f7f3',
    title: def.title,
    frame: def.frame !== false,
    webPreferences: {
      preload: join(__dirname, `../preload/${tool}.js`),
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

  const target = rendererUrl(tool)
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) void win.loadURL(target)
  else void win.loadFile(target)

  open.set(tool, win)
  win.on('closed', () => open.delete(tool))
  return win
}

export function focusedToolCount(): number {
  return open.size
}

export function isToolOpen(tool: ToolKey): boolean {
  const w = open.get(tool)
  return !!w && !w.isDestroyed()
}
