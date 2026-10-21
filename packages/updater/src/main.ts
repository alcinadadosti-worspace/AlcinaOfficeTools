// Processo principal: configura o electron-updater (provedor genérico no Render)
// e repassa o estado para o renderer. Só age no app empacotado.
import { app, ipcMain, type BrowserWindow } from 'electron'
import { UPDATER_CHANNELS, type UpdateStatus } from './ipc'

export interface UpdaterOptions {
  /** URL do feed de atualização (servidor no Render servindo latest.yml + instaladores). */
  feedUrl?: string
}

// Janela-alvo atual e guarda de inicialização única: setupAutoUpdates pode ser chamado por janela,
// mas os handlers IPC e os listeners do autoUpdater só podem ser registrados uma vez por processo.
let targetWin: BrowserWindow | null = null
let initialized = false
let lastStatus: UpdateStatus | null = null

function send(s: UpdateStatus): void {
  lastStatus = s
  if (targetWin && !targetWin.isDestroyed()) targetWin.webContents.send(UPDATER_CHANNELS.status, s)
}

export async function setupAutoUpdates(win: BrowserWindow, opts: UpdaterOptions = {}): Promise<void> {
  targetWin = win
  if (initialized) {
    if (lastStatus) send(lastStatus) // reenvia o último estado para a janela recém-criada
    return
  }
  initialized = true

  // electron-updater só funciona no aplicativo instalado (não em desenvolvimento).
  if (!app.isPackaged) {
    ipcMain.handle(UPDATER_CHANNELS.check, () => undefined)
    ipcMain.handle(UPDATER_CHANNELS.install, () => undefined)
    send({ state: 'idle', message: 'Atualizações automáticas ficam ativas no aplicativo instalado.' })
    return
  }

  // Import dinâmico: mantém o pacote externo ao bundle e tolera ausência.
  let autoUpdater: {
    autoDownload: boolean
    on: (ev: string, cb: (arg?: unknown) => void) => void
    checkForUpdates: () => Promise<unknown>
    quitAndInstall: () => void
    setFeedURL: (cfg: unknown) => void
  }
  try {
    const mod = (await import('electron-updater')) as unknown as { autoUpdater: typeof autoUpdater }
    autoUpdater = mod.autoUpdater
  } catch {
    send({ state: 'error', message: 'Componente de atualização indisponível.' })
    return
  }

  if (opts.feedUrl) autoUpdater.setFeedURL({ provider: 'generic', url: opts.feedUrl })
  autoUpdater.autoDownload = true

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => send({ state: 'available', version: (i as { version?: string })?.version }))
  autoUpdater.on('update-not-available', () => send({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round((p as { percent?: number })?.percent ?? 0) }))
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: (i as { version?: string })?.version }))
  autoUpdater.on('error', (e) => send({ state: 'error', message: String((e as { message?: string })?.message ?? e) }))

  ipcMain.handle(UPDATER_CHANNELS.check, () => autoUpdater.checkForUpdates())
  ipcMain.handle(UPDATER_CHANNELS.install, () => autoUpdater.quitAndInstall())

  void autoUpdater.checkForUpdates()
}
