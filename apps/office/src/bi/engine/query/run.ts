// Executor de consultas: lê fontes, aplica etapas e mantém caches.
import { Column, ColumnBuilder } from '../data/column'
import { DataTable } from '../data/table'
import { CULTURE_PT_BR, ConversionError, type CultureOptions, convertValue } from '../data/convert'
import { parseCsv } from '../io/csv'
import { listExcelSheets, readExcelSheet } from '../io/excel'
import { parseJsonTable } from '../io/json'
import { looksLikeHeaderRow } from '../io/headers'
import { typedColumnFromValues } from '../io/values'
import { sourceFormula, stepFormula } from './mcode'
import { SOURCE_STEP_NAME } from './names'
import { profileColumn, previewRows } from './profile'
import { applyStep, stepDependencies, type StepContext } from './steps'
import type { QueryDef, QueryPreview, SourceDef, SourceHost } from './types'

/** Erro de avaliação de consulta, com a etapa onde ocorreu. */
export class QueryError extends Error {
  constructor(
    message: string,
    readonly queryId?: string,
    readonly stepId?: string,
    readonly stepName?: string
  ) {
    super(message)
    this.name = 'QueryError'
  }
}

class Lru<T> {
  private map = new Map<string, T>()
  constructor(private readonly max: number) {}
  get(k: string): T | undefined {
    const v = this.map.get(k)
    if (v !== undefined) {
      this.map.delete(k)
      this.map.set(k, v)
    }
    return v
  }
  set(k: string, v: T): void {
    this.map.delete(k)
    this.map.set(k, v)
    while (this.map.size > this.max) {
      const first = this.map.keys().next().value as string
      this.map.delete(first)
    }
  }
  clear(): void {
    this.map.clear()
  }
  deleteWhere(pred: (v: T) => boolean): void {
    for (const [k, v] of [...this.map]) if (pred(v)) this.map.delete(k)
  }
  get size(): number {
    return this.map.size
  }
}

/** Hash de 53 bits (cyrb53) para chaves de cache compactas. */
function hashString(str: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + str.length.toString(36)
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

const EXCEL_EXT = ['.xlsx', '.xlsm', '.xlsb', '.xls', '.ods']

function normExt(ext: string): string {
  const e = ext.trim().toLowerCase().replace(/^\*/, '')
  return e.startsWith('.') ? e : `.${e}`
}

function joinPath(dir: string, name: string): string {
  const base = dir.replace(/[\\/]+$/, '')
  const sep = base.includes('/') && !base.includes('\\') ? '/' : '\\'
  return `${base}${sep}${name}`
}

function sourcePaths(source: SourceDef): string[] {
  switch (source.kind) {
    case 'csv':
    case 'excel':
    case 'json':
    case 'parquet':
    case 'folder':
      return [source.path]
    default:
      return []
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class QueryRunner {
  private readonly sources = new Lru<{ table: DataTable; paths: string[] }>(12)
  private readonly stepCache = new Lru<DataTable>(32)
  private volatileEpoch = 0

  constructor(
    private readonly host: SourceHost,
    private readonly culture: CultureOptions = CULTURE_PT_BR
  ) {}

  /** Avalia a consulta até a etapa indicada (inclusive; -1 = somente a fonte). */
  async evaluate(queries: QueryDef[], queryId: string, uptoStep?: number): Promise<DataTable> {
    return (await this.evalQuery(queries, queryId, uptoStep, [])).table
  }

  /** Lê apenas a fonte (sem etapas). */
  async loadSource(source: SourceDef, queries: QueryDef[] = []): Promise<DataTable> {
    return (await this.loadSourceKeyed(source, queries, [])).table
  }

  /** Descarta caches (de um arquivo/pasta específico ou todos). */
  invalidate(path?: string): void {
    this.volatileEpoch++
    if (!path) {
      this.sources.clear()
      this.stepCache.clear()
      return
    }
    const low = path.toLowerCase()
    this.sources.deleteWhere((e) => e.paths.some((p) => p.toLowerCase() === low || low.startsWith(p.toLowerCase())))
    this.stepCache.clear()
  }

  /** Visualização prévia (primeiras linhas, perfil das colunas e fórmula da etapa). */
  async preview(queries: QueryDef[], queryId: string, stepIndex: number, maxRows = 1000): Promise<QueryPreview> {
    const t0 = now()
    const q = queries.find((x) => x.id === queryId)
    let formula = ''
    let idx = stepIndex
    if (q) {
      idx = Math.min(stepIndex, q.steps.length - 1)
      formula =
        idx < 0
          ? sourceFormula(q.source, queries)
          : stepFormula(q.steps[idx], idx === 0 ? SOURCE_STEP_NAME : q.steps[idx - 1].name, queries)
    }
    try {
      const table = await this.evaluate(queries, queryId, idx)
      return {
        queryId,
        stepIndex: idx,
        columns: table.columns.map((c) => ({ name: c.name, type: c.type })),
        rows: previewRows(table, maxRows),
        rowCount: table.rowCount,
        profiles: table.columns.map((c) => profileColumn(c)),
        formula,
        elapsedMs: now() - t0
      }
    } catch (err) {
      return {
        queryId,
        stepIndex: idx,
        columns: [],
        rows: [],
        rowCount: 0,
        profiles: [],
        error: errorMessage(err),
        formula,
        elapsedMs: now() - t0
      }
    }
  }

  private async evalQuery(
    queries: QueryDef[],
    queryId: string,
    uptoStep: number | undefined,
    stack: string[]
  ): Promise<{ table: DataTable; key: string }> {
    const q = queries.find((x) => x.id === queryId)
    if (!q) throw new QueryError(`A consulta "${queryId}" não foi encontrada.`, queryId)
    if (stack.includes(queryId)) {
      const names = [...stack, queryId].map((id) => queries.find((x) => x.id === id)?.name ?? id)
      throw new QueryError(`Referência circular detectada entre consultas: ${names.join(' → ')}.`, queryId)
    }
    const nextStack = [...stack, queryId]
    let src: { table: DataTable; key: string }
    try {
      src = await this.loadSourceKeyed(q.source, queries, nextStack)
    } catch (err) {
      if (err instanceof QueryError) throw err
      throw new QueryError(errorMessage(err), q.id, undefined, SOURCE_STEP_NAME)
    }
    let table = src.table
    let key = src.key
    const last = uptoStep === undefined ? q.steps.length - 1 : Math.min(uptoStep, q.steps.length - 1)
    for (let i = 0; i <= last; i++) {
      const step = q.steps[i]
      const deps = new Map<string, DataTable>()
      let depKey = ''
      for (const id of stepDependencies(step.op)) {
        try {
          const r = await this.evalQuery(queries, id, undefined, nextStack)
          deps.set(id, r.table)
          depKey += `|${id}:${r.key}`
        } catch (err) {
          const name = queries.find((x) => x.id === id)?.name ?? id
          const msg = errorMessage(err)
          throw new QueryError(
            msg.startsWith('Referência circular') ? msg : `A consulta "${name}" contém um erro: ${msg}`,
            q.id,
            step.id,
            step.name
          )
        }
      }
      key = hashString(`${key}\u0002${JSON.stringify(step.op)}${depKey}`)
      const cached = this.stepCache.get(key)
      if (cached) {
        table = cached
        continue
      }
      const ctx: StepContext = {
        culture: this.culture,
        getQuery: (id) => {
          const t = deps.get(id)
          if (!t) throw new QueryError(`A consulta "${id}" não está disponível.`, q.id, step.id, step.name)
          return t
        },
        queryName: (id) => queries.find((x) => x.id === id)?.name ?? id
      }
      try {
        table = applyStep(table, step.op, ctx)
      } catch (err) {
        if (err instanceof QueryError) throw err
        throw new QueryError(errorMessage(err), q.id, step.id, step.name)
      }
      this.stepCache.set(key, table)
    }
    return { table, key }
  }

  private async loadSourceKeyed(source: SourceDef, queries: QueryDef[], stack: string[]): Promise<{ table: DataTable; key: string }> {
    if (source.kind === 'reference') {
      try {
        const r = await this.evalQuery(queries, source.queryId, undefined, stack)
        return { table: r.table, key: hashString(`ref:${r.key}`) }
      } catch (err) {
        const msg = errorMessage(err)
        if (msg.startsWith('Referência circular')) throw err
        const name = queries.find((x) => x.id === source.queryId)?.name ?? source.queryId
        throw new QueryError(`A consulta "${name}" contém um erro: ${msg}`)
      }
    }
    const fingerprint = await this.sourceFingerprint(source)
    const key = hashString(`${JSON.stringify(this.culture)}\u0003${JSON.stringify(source)}\u0003${fingerprint}`)
    const hit = this.sources.get(key)
    if (hit) return { table: hit.table, key }
    const table = await this.readSource(source)
    this.sources.set(key, { table, paths: sourcePaths(source) })
    return { table, key }
  }

  private async sourceFingerprint(source: SourceDef): Promise<string> {
    switch (source.kind) {
      case 'csv':
      case 'excel':
      case 'json':
      case 'parquet': {
        const st = await this.host.statFile(source.path)
        if (!st) throw new Error(`O arquivo "${source.path}" não foi encontrado.`)
        return `${st.size}:${st.mtimeMs}`
      }
      case 'folder': {
        const ext = normExt(source.extension)
        const list = await this.host.listDir(source.path)
        return list
          .filter((f) => !f.isDir && f.name.toLowerCase().endsWith(ext))
          .map((f) => `${f.name}:${f.size}:${f.mtimeMs}`)
          .join('|')
      }
      case 'web':
      case 'database':
        return `v${this.volatileEpoch}`
      default:
        return ''
    }
  }

  private async readSource(source: SourceDef): Promise<DataTable> {
    switch (source.kind) {
      case 'csv':
        return parseCsv(await this.host.readFile(source.path), {
          delimiter: source.delimiter,
          encoding: source.encoding,
          quoted: source.quoted
        })
      case 'excel':
        return readExcelSheet(await this.host.readFile(source.path), source.sheet)
      case 'json':
        return parseJsonTable(await this.host.readFile(source.path))
      case 'parquet':
        throw new Error('A leitura de arquivos Parquet ainda não é suportada nesta versão.')
      case 'web': {
        const res = await this.host.fetchUrl(source.url)
        if (res.status >= 400) throw new Error(`A requisição para "${source.url}" falhou (HTTP ${res.status}).`)
        const isJson =
          source.format === 'json' ||
          (source.format === 'auto' && (/json/i.test(res.contentType) || /\.json(\?|#|$)/i.test(source.url)))
        return isJson ? parseJsonTable(res.data) : parseCsv(res.data, { delimiter: source.delimiter ?? 'auto' })
      }
      case 'enterData': {
        const n = source.rows.length
        const cols = source.columns.map((c, j) => {
          const b = new ColumnBuilder(c.type, n)
          for (const row of source.rows) {
            const raw = row[j] ?? null
            if (raw === null) {
              b.push(null)
              continue
            }
            const v = convertValue(raw, c.type, this.culture)
            if (v instanceof ConversionError) b.pushError(v.message)
            else b.push(v)
          }
          return b.build(c.name)
        })
        return new DataTable(cols, n)
      }
      case 'database': {
        const res = await this.host.dbQuery(source.connection, source.sql)
        const cols = res.columns.map((c, i) =>
          typedColumnFromValues(
            c.name,
            res.rows.map((r) => r[i])
          )
        )
        return new DataTable(cols, res.rows.length)
      }
      case 'folder':
        return this.readFolder(source)
      case 'blank':
        return new DataTable([], 0)
      default:
        throw new Error('Tipo de fonte desconhecido.')
    }
  }

  private async readFolder(source: Extract<SourceDef, { kind: 'folder' }>): Promise<DataTable> {
    const ext = normExt(source.extension)
    const entries = (await this.host.listDir(source.path))
      .filter((e) => !e.isDir && e.name.toLowerCase().endsWith(ext) && !e.name.startsWith('~$'))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    if (!entries.length) throw new Error(`Nenhum arquivo "${ext}" foi encontrado na pasta "${source.path}".`)
    const isExcel = EXCEL_EXT.includes(ext)
    const isJson = ext === '.json'
    const tables: DataTable[] = []
    let promote: boolean | null = null
    for (const e of entries) {
      const bytes = await this.host.readFile(joinPath(source.path, e.name))
      let t: DataTable
      if (isExcel) {
        const sheets = listExcelSheets(bytes)
        t = sheets.length ? readExcelSheet(bytes, sheets[0]) : new DataTable([], 0)
      } else if (isJson) t = parseJsonTable(bytes)
      else t = parseCsv(bytes, { delimiter: source.delimiter ?? 'auto' })
      if (!isJson) {
        if (promote === null) promote = looksLikeHeaderRow(t)
        if (promote) t = applyStep(t, { op: 'promoteHeaders' })
      }
      tables.push(new DataTable([Column.constant('Source.Name', 'text', e.name, t.rowCount), ...t.columns], t.rowCount))
    }
    if (tables.length === 1) return tables[0]
    const ctx: StepContext = {
      culture: this.culture,
      getQuery: (id) => tables[Number(id)],
      queryName: (id) => entries[Number(id)]?.name ?? id
    }
    return applyStep(tables[0], { op: 'append', queryIds: tables.slice(1).map((_, i) => String(i + 1)) }, ctx)
  }

  /** Quantidade de entradas em cache (diagnóstico). */
  cacheStats(): { sources: number; steps: number } {
    return { sources: this.sources.size, steps: this.stepCache.size }
  }
}
