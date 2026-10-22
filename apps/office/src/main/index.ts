// Processo principal do app único "Alcina Office".
// Abre a Central e, a partir dela, cada ferramenta em sua própria janela —
// um só motor Electron, uma só instalação, um só auto-update.
import { app, BrowserWindow, ipcMain, Menu, nativeTheme } from 'electron'
import { existsSync } from 'node:fs'
import { setupAutoUpdates } from '@alcina/updater/main'
import { registerCommonIpc } from './common'
import { registerDocsIpc } from '../docs/main'
import { registerPointIpc } from '../point/main'
import { registerBiIpc, launchBi } from '../bi/main'
import { openTool, isToolOpen, type ToolKey } from './windows'

// Extensões de planilha que abrem no Planilhas (via "Abrir com" do Windows / associação de arquivo).
const SHEET_EXTS = new Set(['alcsheet', 'xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'csv', 'txt'])

// Arquivo a entregar ao Planilhas quando a janela ainda não existe (consumido pelo renderer ao montar).
let pendingSheetFile: string | null = null

// Procura, entre os argumentos de linha de comando, um arquivo de planilha existente.
// O Windows passa o caminho do arquivo ao abrir pelo "Abrir com"/duplo-clique.
function fileFromArgv(argv: string[]): string | null {
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-')) continue
    const ext = (a.split('.').pop() ?? '').toLowerCase()
    if (SHEET_EXTS.has(ext) && existsSync(a)) return a
  }
  return null
}

// Abre o arquivo no Planilhas. Se a janela já existe (renderer montado), empurra o caminho;
// se não, guarda como pendente e o renderer o consome ao montar (sem corrida).
function openSheetFile(file: string): void {
  if (isToolOpen('sheets')) {
    const win = openTool('sheets')
    win.webContents.send('tool:open-file', file)
  } else {
    pendingSheetFile = file
    openTool('sheets')
  }
}

const FEED_URL =
  process.env['ALCINA_UPDATE_URL'] ||
  'https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/download/office'

const TOOLS: ToolKey[] = ['sheets', 'docs', 'point', 'notes', 'bi']

// Instância única: a suíte é UM programa só. Uma segunda execução apenas foca a janela já aberta
// (evita dois processos com caches de configurações/recentes concorrentes).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    // Abriram outra planilha pelo "Abrir com" enquanto o app já estava rodando.
    const file = fileFromArgv(argv)
    if (file) {
      openSheetFile(file)
      return
    }
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

    // Arquivo inicial do Planilhas: o renderer consome uma vez ao montar (abertura via "Abrir com").
    ipcMain.handle('tool:initial-file', () => {
      const f = pendingSheetFile
      pendingSheetFile = null
      return f
    })

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

    // Se o app foi iniciado a partir de um arquivo (duplo-clique / "Abrir com"), abre direto no
    // Planilhas; caso contrário, abre a Central.
    const initial = fileFromArgv(process.argv)
    let firstWin: BrowserWindow
    if (initial) {
      pendingSheetFile = initial
      firstWin = openTool('sheets')
    } else {
      firstWin = openTool('central')
    }
    // Um único auto-update para toda a suíte; o status é transmitido a todas as janelas abertas.
    void setupAutoUpdates(firstWin, { feedUrl: FEED_URL })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openTool('central')
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
