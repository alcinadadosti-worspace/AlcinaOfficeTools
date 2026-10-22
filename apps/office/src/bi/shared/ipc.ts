// Contrato entre o processo principal (Electron) e a interface (renderer).

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenDialogOptions {
  title?: string
  filters?: FileFilter[]
  multiple?: boolean
  defaultPath?: string
}

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
}

export interface FileStat {
  size: number
  mtimeMs: number
}

export interface RecentFile {
  path: string
  name: string
  openedAt: number
}

export interface FetchResult {
  status: number
  contentType: string
  finalUrl: string
  data: Uint8Array
}

export interface PdfExportOptions {
  path: string
  /** HTML completo a imprimir (páginas do relatório renderizadas como imagens). */
  html: string
  landscape: boolean
  widthPx: number
  heightPx: number
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  userDataPath: string
}

export type DbKind = 'postgres' | 'mysql' | 'sqlserver'

export interface DbConnection {
  kind: DbKind
  host: string
  port?: number
  database: string
  user: string
  password: string
  ssl?: boolean
}

export interface DbQueryResult {
  columns: { name: string; type: string }[]
  rows: unknown[][]
}

export interface AlcinaApi {
  info(): Promise<AppInfo>
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    setTitle(title: string): void
    setDirty(dirty: boolean): void
    /** Confirma que a janela pode fechar (após salvar ou descartar). */
    confirmClose(): void
    onCloseRequested(cb: () => void): () => void
    onMaximizedChange(cb: (maximized: boolean) => void): () => void
    newWindow(path?: string): void
    /** Captura uma região da janela como PNG. */
    capture(rect: { x: number; y: number; width: number; height: number }): Promise<Uint8Array>
  }
  dialog: {
    open(options: OpenDialogOptions): Promise<string[] | null>
    save(options: SaveDialogOptions): Promise<string | null>
  }
  fs: {
    read(path: string): Promise<Uint8Array>
    write(path: string, data: Uint8Array): Promise<void>
    stat(path: string): Promise<FileStat | null>
    listDir(path: string): Promise<{ name: string; isDir: boolean; size: number; mtimeMs: number }[]>
  }
  net: {
    fetch(url: string): Promise<FetchResult>
  }
  db: {
    query(connection: DbConnection, sql: string, maxRows?: number): Promise<DbQueryResult>
    listTables(connection: DbConnection): Promise<{ schema: string; name: string }[]>
  }
  recent: {
    list(): Promise<RecentFile[]>
    add(path: string): Promise<void>
    remove(path: string): Promise<void>
  }
  settings: {
    get(): Promise<Record<string, unknown>>
    set(patch: Record<string, unknown>): Promise<void>
  }
  app: {
    /** Arquivo passado na linha de comando / associação de arquivo. */
    initialFile(): Promise<string | null>
    onOpenFile(cb: (path: string) => void): () => void
    openExternal(url: string): Promise<void>
    showInFolder(path: string): Promise<void>
    exportPdf(options: PdfExportOptions): Promise<void>
    samplePath(): Promise<string>
  }
}

export const IPC = {
  info: 'app:info',
  winMinimize: 'win:minimize',
  winToggleMaximize: 'win:toggle-maximize',
  winClose: 'win:close',
  winSetTitle: 'win:set-title',
  winSetDirty: 'win:set-dirty',
  winConfirmClose: 'win:confirm-close',
  winCloseRequested: 'win:close-requested',
  winMaximized: 'win:maximized',
  winNew: 'win:new',
  winCapture: 'win:capture',
  dialogOpen: 'bi:dialog:open',
  dialogSave: 'bi:dialog:save',
  fsRead: 'bi:fs:read',
  fsWrite: 'bi:fs:write',
  fsStat: 'fs:stat',
  fsListDir: 'fs:list-dir',
  netFetch: 'net:fetch',
  dbQuery: 'db:query',
  dbListTables: 'db:list-tables',
  recentList: 'recent:list',
  recentAdd: 'recent:add',
  recentRemove: 'recent:remove',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  initialFile: 'app:initial-file',
  openFile: 'app:open-file',
  openExternal: 'app:open-external',
  showInFolder: 'app:show-in-folder',
  exportPdf: 'app:export-pdf',
  samplePath: 'app:sample-path'
} as const
