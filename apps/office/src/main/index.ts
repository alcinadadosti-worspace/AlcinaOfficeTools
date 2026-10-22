// Processo principal do app único "Alcina Office".
// Abre a Central e, a partir dela, cada ferramenta em sua própria janela —
// um só motor Electron, uma só instalação, um só auto-update.
import { app, BrowserWindow, ipcMain, Menu, nativeTheme } from 'electron'
import { setupAutoUpdates } from '@alcina/updater/main'
import { registerCommonIpc } from './common'
import { registerDocsIpc } from '../docs/main'
import { registerPointIpc } from '../point/main'
import { registerBiIpc, launchBi } from '../bi/main'
import { openTool, type ToolKey } from './windows'

const FEED_URL =
  process.env['ALCINA_UPDATE_URL'] ||
  'https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/download/office'

const TOOLS: ToolKey[] = ['sheets', 'docs', 'point', 'notes', 'bi']

// Instância única: a suíte é UM programa só. Uma segunda execução apenas foca a janela já aberta
// (evita dois processos com caches de configurações/recentes concorrentes).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    const w = wins[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    } else {
      openTool('central')
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.alcina.office')
    // A suíte toda usa tema claro (Fluent lightTheme nas ferramentas + barra de título clara do Analytics).
    nativeTheme.themeSource = 'light'
    Menu.setApplicationMenu(null)

    // Canais IPC: compartilhados (uma vez) + específicos de cada ferramenta.
    registerCommonIpc()
    registerDocsIpc()
    registerPointIpc()
    registerBiIpc()

    // A Central pede a abertura de uma ferramenta.
    ipcMain.handle('app:launch', (_e, key: string) => {
      if (!TOOLS.includes(key as ToolKey)) return { ok: false, error: 'Aplicativo desconhecido.' }
      try {
        // O Analytics (BI) tem janela própria (sem moldura, barra de título customizada);
        // reaproveita uma janela já aberta em vez de empilhar várias.
        if (key === 'bi') launchBi()
        else openTool(key as Exclude<ToolKey, 'bi'>)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })

    const central = openTool('central')
    // Um único auto-update para toda a suíte; o status é transmitido a todas as janelas abertas.
    void setupAutoUpdates(central, { feedUrl: FEED_URL })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openTool('central')
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
