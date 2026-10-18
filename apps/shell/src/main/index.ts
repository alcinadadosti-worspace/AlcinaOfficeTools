// Processo principal do app "Alcina Office" (central da suíte).
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { setupAutoUpdates } from '@alcina/updater/main'

// Feed de atualização (servidor no Render). Pode ser sobrescrito por variável de ambiente.
const FEED_URL = process.env['ALCINA_UPDATE_URL'] || 'https://alcina-office-updates.onrender.com'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 820,
    minHeight: 560,
    show: false,
    backgroundColor: '#f4f7f3',
    title: 'Alcina Office',
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
  app.setAppUserModelId('com.alcina.office')
  Menu.setApplicationMenu(null)
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)
  ipcMain.handle('app:launch', (_e, key: string) => {
    const allowed = ['sheets', 'docs', 'point', 'notes', 'bi']
    if (!allowed.includes(key)) return { ok: false, error: 'Aplicativo desconhecido.' }
    if (app.isPackaged) return { ok: false, error: 'Abra pelo atalho do aplicativo instalado.' }
    try {
      // Em desenvolvimento, abre o app irmão (apps/<key>) em sua própria janela.
      const dir = join(process.cwd(), '..', key)
      spawn('npm', ['run', 'dev'], { cwd: dir, detached: true, stdio: 'ignore', shell: true }).unref()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
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
