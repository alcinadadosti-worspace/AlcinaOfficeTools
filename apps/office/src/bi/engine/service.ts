// Serviço do motor: concentra consultas, modelo, DAX e visuais (roda no Worker).
import { DataTable } from './data/table'
import type { DataType, Scalar } from './data/types'
import { formatScalar } from './data/format'
import { CULTURE_PT_BR } from './data/convert'
import { QueryRunner } from './query/run'
import { autoSteps } from './io/headers'
import { listExcelSheets } from './io/excel'
import { profileColumn, previewRows } from './query/profile'
import { applyStep } from './query/steps'
import { toJsonScalar, fromJsonScalar, type JsonScalar, type QueryDef, type QueryPreview, type SourceDef, type SourceHost, type StepDef } from './query/types'
import { ModelRuntime, normKey, type TableRT } from './model/runtime'
import type { ModelDef, RelationshipDef } from './model/types'
import { detectRelationships } from './model/autodetect'
import { BaseTV, Evaluator, FUNCS, installCalcHooks, parseDax, parseDaxQuery, DaxError, materialize, Ctx } from './dax'
import { sortCompare } from './dax/values'
import { VisualQueryEngine } from './vq/execute'
import type { FieldRef, VQFilter, VQResult, VisualQuery } from './vq/types'
import { deserializeTable, serializeTable } from './serialize'

export interface RefreshItem {
  queryId: string
  name: string
  rowCount: number
  columns: { name: string; type: DataType }[]
  error?: string
}

export interface ModelInfoTable {
  name: string
  rowCount: number
  columns: { name: string; type: DataType; isCalculated: boolean; error?: string }[]
  error?: string
}

export interface ModelInfo {
  tables: ModelInfoTable[]
  errors: { table: string; column?: string; message: string }[]
  elapsedMs: number
}

export interface TableDataResult {
  columns: { name: string; type: DataType; format?: string; isCalculated: boolean }[]
  rows: JsonScalar[][]
  rowCount: number
  offset: number
}

export interface DaxQueryResult {
  columns: { name: string; type: DataType }[]
  rows: JsonScalar[][]
  rowCount: number
  elapsedMs: number
  error?: string
}

export interface FunctionInfo {
  name: string
  sig: string
  desc: string
  category: string
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Assinatura estrutural do modelo (o que exige recalcular dados). */
function structuralKey(def: ModelDef): string {
  return JSON.stringify({
    t: def.tables.map((t) => ({
      n: t.name,
      q: t.queryId,
      e: t.expression,
      c: t.columns.map((c) => [c.name, c.expression ? 'calc' : c.dataType, c.expression ?? '', c.sourceColumn ?? ''])
    })),
    r: def.relationships.map((r) => [r.fromTable, r.fromColumn, r.toTable, r.toColumn, r.cardinality, r.crossFilter, r.active]),
    a: def.autoDateTime
  })
}

export class EngineService {
  readonly runner: QueryRunner
  /** Resultado das consultas carregadas (por id da consulta). */
  readonly loaded = new Map<string, DataTable>()
  model: ModelRuntime | null = null
  ev: Evaluator | null = null
  vq: VisualQueryEngine | null = null
  private modelKey = ''
  private sortCache = new Map<string, Int32Array>()

  constructor(readonly host: SourceHost) {
    this.runner = new QueryRunner(host, CULTURE_PT_BR)
  }

  ping(): string {
    return 'ok'
  }

  // --------------------------------------------------------------------
  // Consultas
  // --------------------------------------------------------------------

  previewQuery(queries: QueryDef[], queryId: string, stepIndex: number, maxRows = 1000): Promise<QueryPreview> {
    return this.runner.preview(queries, queryId, stepIndex, maxRows)
  }

  async excelSheets(path: string): Promise<string[]> {
    return listExcelSheets(await this.host.readFile(path))
  }

  /** Lê uma fonte, sugere etapas automáticas e devolve a visualização. */
  async inspectSource(source: SourceDef, opts: { maxRows?: number; allowPromote?: boolean } = {}): Promise<{ steps: StepDef[]; preview: QueryPreview }> {
    const t0 = performance.now()
    const raw = await this.runner.loadSource(source)
    const steps = autoSteps(raw, CULTURE_PT_BR, { allowPromote: opts.allowPromote ?? (source.kind === 'csv' || source.kind === 'excel' || source.kind === 'web') })
    let t = raw
    for (const s of steps) t = applyStep(t, s.op)
    const maxRows = opts.maxRows ?? 200
    return {
      steps,
      preview: {
        queryId: '',
        stepIndex: steps.length - 1,
        columns: t.columns.map((c) => ({ name: c.name, type: c.type })),
        rows: previewRows(t, maxRows),
        rowCount: t.rowCount,
        profiles: t.columns.map((c) => profileColumn(c)),
        formula: '',
        elapsedMs: performance.now() - t0
      }
    }
  }

  /** Executa as consultas indicadas e guarda os resultados para o modelo. */
  async refresh(queries: QueryDef[], ids: string[] | 'all'): Promise<RefreshItem[]> {
    const targets = queries.filter((q) => q.load && (ids === 'all' || ids.includes(q.id)))
    if (ids === 'all') this.runner.invalidate()
    else for (const q of targets) if ('path' in q.source && typeof q.source.path === 'string') this.runner.invalidate(q.source.path)
    const out: RefreshItem[] = []
    for (const q of targets) {
      try {
        const t = await this.runner.evaluate(queries, q.id)
        // Colunas com erro: valores com erro viram vazio no modelo.
        const clean = new DataTable(
          t.columns.map((c) => (c.errors ? c.withoutErrors() : c)),
          t.rowCount
        )
        this.loaded.set(q.id, clean)
        out.push({ queryId: q.id, name: q.name, rowCount: t.rowCount, columns: t.columns.map((c) => ({ name: c.name, type: c.type === 'any' ? 'text' : c.type })) })
      } catch (e) {
        out.push({ queryId: q.id, name: q.name, rowCount: 0, columns: [], error: errMsg(e) })
      }
    }
    // Remove dados de consultas que não existem mais
    for (const id of [...this.loaded.keys()]) if (!queries.some((q) => q.id === id && q.load)) this.loaded.delete(id)
    this.modelKey = ''
    return out
  }

  dropQuery(queryId: string): void {
    this.loaded.delete(queryId)
    this.modelKey = ''
  }

  // --------------------------------------------------------------------
  // Modelo
  // --------------------------------------------------------------------

  /** Constrói (ou atualiza) o modelo em execução. */
  syncModel(def: ModelDef): ModelInfo {
    const t0 = performance.now()
    const key = structuralKey(def)
    if (this.model && key === this.modelKey) {
      this.model.patchDefinitions(def)
      this.ev!.clearCache()
      return this.modelInfo(t0)
    }
    const sources = new Map<string, DataTable>()
    for (const t of def.tables) if (t.queryId && this.loaded.has(t.queryId)) sources.set(t.name, this.loaded.get(t.queryId)!)
    const model = new ModelRuntime(def, sources)
    const ev = new Evaluator(model)
    installCalcHooks(ev)
    model.computeAll()
    this.model = model
    this.ev = ev
    this.vq = new VisualQueryEngine(ev)
    this.modelKey = key
    this.sortCache.clear()
    return this.modelInfo(t0)
  }

  private modelInfo(t0: number): ModelInfo {
    const m = this.model!
    return {
      tables: m.tables.map((t) => ({
        name: t.name,
        rowCount: t.rowCount,
        columns: t.columns
          .filter((c) => !c.derived)
          .map((c) => ({
            name: c.name,
            type: c.type,
            isCalculated: c.isCalculated,
            error: m.errors.find((e) => e.table === t.name && e.column === c.name)?.message
          })),
        error: m.errors.find((e) => e.table === t.name && !e.column)?.message
      })),
      errors: [...m.errors],
      elapsedMs: performance.now() - t0
    }
  }

  suggestRelationships(def: ModelDef): RelationshipDef[] {
    const data = new Map<string, DataTable>()
    for (const t of def.tables) {
      if (t.queryId && this.loaded.has(t.queryId)) {
        const src = this.loaded.get(t.queryId)!
        // aplica os nomes do modelo
        const cols = t.columns
          .filter((c) => !c.expression)
          .map((c) => src.column(c.sourceColumn ?? c.name)?.rename(c.name))
          .filter((c): c is NonNullable<typeof c> => !!c)
        data.set(t.name, new DataTable(cols, src.rowCount))
      } else if (this.model?.table(t.name)) {
        const rt = this.model.table(t.name)!
        data.set(t.name, new DataTable(rt.baseColumns.map((c) => c.data), rt.rowCount))
      }
    }
    return detectRelationships(def, data)
  }

  private requireModel(): { model: ModelRuntime; ev: Evaluator; vq: VisualQueryEngine } {
    if (!this.model || !this.ev || !this.vq) throw new Error('O modelo ainda não foi carregado.')
    return { model: this.model, ev: this.ev, vq: this.vq }
  }

  // --------------------------------------------------------------------
  // Visuais e DAX
  // --------------------------------------------------------------------

  executeVisual(q: VisualQuery): VQResult {
    return this.requireModel().vq.execute(q)
  }

  executeVisuals(qs: VisualQuery[]): ({ ok: true; result: VQResult } | { ok: false; error: string })[] {
    return qs.map((q) => {
      try {
        return { ok: true as const, result: this.executeVisual(q) }
      } catch (e) {
        return { ok: false as const, error: errMsg(e) }
      }
    })
  }

  /** Valida uma expressão DAX (sintaxe + avaliação no contexto vazio). */
  checkDax(expr: string, kind: 'measure' | 'column' | 'table', tableName?: string): { ok: boolean; error?: string; preview?: string; type?: DataType } {
    try {
      const node = parseDax(expr)
      if (!this.model || !this.ev) return { ok: true }
      if (kind === 'measure') {
        this.ev.clearCache()
        const v = this.ev.evalExpression(node, this.ev.emptyCtx().fc)
        return { ok: true, preview: formatScalar(v) }
      }
      if (kind === 'table') {
        const tv = this.ev.table(node, this.ev.emptyCtx())
        return { ok: true, preview: `${tv.rowCount} linha(s), ${tv.cols.length} coluna(s)` }
      }
      // coluna calculada: avalia na primeira linha
      const t = tableName ? this.model.table(tableName) : undefined
      if (t && t.rowCount > 0) {
        const tv = new BaseTV(t, t.allRows())
        const v = this.ev.scalar(node, new Ctx(this.ev.emptyCtx().fc).withFrame({ tv, row: 0 }))
        return { ok: true, preview: formatScalar(v) }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  }

  daxQuery(text: string, maxRows = 5000): DaxQueryResult {
    const t0 = performance.now()
    try {
      const { ev } = this.requireModel()
      const q = parseDaxQuery(text)
      ev.queryMeasures.clear()
      let ctx = ev.emptyCtx()
      for (const d of q.defines) {
        if (d.kind === 'measure') ev.queryMeasures.set(d.name.toLowerCase(), { table: d.table ? (ev.model.table(d.table) ?? null) : null, name: d.name, node: d.e })
        else if (d.kind === 'var') ctx = ctx.withVar(d.name, ev.any(d.e, ctx))
        else if (d.kind === 'table') ctx = ctx.withVar(d.name.toUpperCase(), ev.table(d.e, ctx))
      }
      ev.clearCache()
      const last = q.evaluates[q.evaluates.length - 1]
      let tv = materialize(ev.table(last.e, ctx))
      if (last.orderBy.length) {
        const keys = last.orderBy.map((o) => ({ vals: ev.mapRows(tv, o.e, ctx), desc: o.desc }))
        const idx = Array.from({ length: tv.rowCount }, (_, i) => i)
        idx.sort((a, b) => {
          for (const k of keys) {
            const c = sortCompare(k.vals[a], k.vals[b])
            if (c) return k.desc ? -c : c
          }
          return a - b
        })
        tv = tv.pick(idx)
      }
      const n = Math.min(tv.rowCount, maxRows)
      const rows: JsonScalar[][] = []
      for (let r = 0; r < n; r++) rows.push(tv.rowValues(r).map(toJsonScalar))
      ev.queryMeasures.clear()
      return {
        columns: tv.cols.map((c) => ({ name: c.lineage ? `${c.lineage.table.name}[${c.name}]` : `[${c.name}]`, type: c.type })),
        rows,
        rowCount: tv.rowCount,
        elapsedMs: performance.now() - t0
      }
    } catch (e) {
      return { columns: [], rows: [], rowCount: 0, elapsedMs: performance.now() - t0, error: errMsg(e) }
    }
  }

  functions(): FunctionInfo[] {
    return [...FUNCS.values()].map((f) => ({ name: f.name, sig: f.sig, desc: f.desc, category: f.category })).sort((a, b) => a.name.localeCompare(b.name))
  }

  // --------------------------------------------------------------------
  // Exibição de dados
  // --------------------------------------------------------------------

  private table(name: string): TableRT {
    const t = this.requireModel().model.table(name)
    if (!t) throw new DaxError(`A tabela "${name}" não existe.`)
    return t
  }

  tableData(tableName: string, offset: number, limit: number, sort?: { column: string; desc: boolean }): TableDataResult {
    const t = this.table(tableName)
    const cols = t.columns.filter((c) => !c.derived)
    let order: Int32Array | null = null
    if (sort) {
      const key = `${t.id}|${sort.column}|${sort.desc}`
      order = this.sortCache.get(key) ?? null
      if (!order) {
        const col = t.column(sort.column)
        if (col) {
          const n = t.rowCount
          const idx = Array.from({ length: n }, (_, i) => i)
          const data = col.data
          idx.sort((a, b) => {
            const c = sortCompare(data.get(a), data.get(b))
            return (sort.desc ? -c : c) || a - b
          })
          order = Int32Array.from(idx)
          this.sortCache.set(key, order)
        }
      }
    }
    const end = Math.min(t.rowCount, offset + limit)
    const rows: JsonScalar[][] = []
    for (let i = offset; i < end; i++) {
      const r = order ? order[i] : i
      rows.push(cols.map((c) => toJsonScalar(c.data.get(r))))
    }
    return {
      columns: cols.map((c) => ({ name: c.name, type: c.type, format: c.def?.formatString, isCalculated: c.isCalculated })),
      rows,
      rowCount: t.rowCount,
      offset
    }
  }

  /** Valores distintos de uma coluna (para filtros e segmentações), visíveis sob os filtros. */
  columnValues(field: FieldRef, filters: VQFilter[] = [], search = '', limit = 1000): { values: JsonScalar[]; total: number } {
    const { vq } = this.requireModel()
    const col = vq.resolveColumn(field)
    const fc = vq.buildContext(filters)
    const values = vq.ev.distinctValues(col, fc, true).data[0]
    const s = search.trim().toLowerCase()
    let list: Scalar[] = values
    if (s) list = values.filter((v) => v !== null && formatScalar(v, col.def?.formatString).toLowerCase().includes(s))
    const sortCol = col.def?.sortByColumn ? col.table.column(col.def.sortByColumn) : undefined
    if (sortCol) {
      const idx = col.valueIndex
      const sk = (v: Scalar) => {
        const id = idx.idOf(v)
        return id >= 0 ? sortCol.data.get(idx.rowsOf(id)[0]) : null
      }
      list = [...list].sort((a, b) => sortCompare(sk(a), sk(b)))
    } else list = [...list].sort(sortCompare)
    return { values: list.slice(0, limit).map(toJsonScalar), total: list.length }
  }

  /** Mínimo e máximo de uma coluna (segmentação "entre"). */
  columnRange(field: FieldRef, filters: VQFilter[] = []): { min: JsonScalar; max: JsonScalar } {
    const { vq } = this.requireModel()
    const col = vq.resolveColumn(field)
    const fc = vq.buildContext(filters)
    const rows = fc.visibleRows(col.table)
    let min: Scalar = null
    let max: Scalar = null
    for (let i = 0; i < rows.length; i++) {
      const v = col.data.get(rows[i])
      if (v === null) continue
      if (min === null || sortCompare(v, min) < 0) min = v
      if (max === null || sortCompare(v, max) > 0) max = v
    }
    return { min: toJsonScalar(min), max: toJsonScalar(max) }
  }

  /** Linhas de detalhe que compõem um ponto de dados ("Mostrar como tabela" / detalhamento). */
  detailRows(tableName: string, filters: VQFilter[], limit = 1000): TableDataResult {
    const { vq } = this.requireModel()
    const t = this.table(tableName)
    const fc = vq.buildContext(filters)
    const visible = fc.visibleRows(t)
    const cols = t.columns.filter((c) => !c.derived)
    const rows: JsonScalar[][] = []
    for (let i = 0; i < Math.min(limit, visible.length); i++) rows.push(cols.map((c) => toJsonScalar(c.data.get(visible[i]))))
    return {
      columns: cols.map((c) => ({ name: c.name, type: c.type, format: c.def?.formatString, isCalculated: c.isCalculated })),
      rows,
      rowCount: visible.length,
      offset: 0
    }
  }

  // --------------------------------------------------------------------
  // Persistência
  // --------------------------------------------------------------------

  exportData(): { queryId: string; data: Uint8Array }[] {
    return [...this.loaded.entries()].map(([queryId, t]) => ({ queryId, data: serializeTable(t) }))
  }

  importData(items: { queryId: string; data: Uint8Array }[]): number {
    this.loaded.clear()
    for (const it of items) this.loaded.set(it.queryId, deserializeTable(it.data))
    this.modelKey = ''
    return this.loaded.size
  }

  reset(): void {
    this.loaded.clear()
    this.model = null
    this.ev = null
    this.vq = null
    this.modelKey = ''
    this.runner.invalidate()
  }

  /** Normaliza um valor do filtro (texto) para comparação. */
  keyOf(v: JsonScalar): string {
    return String(normKey(fromJsonScalar(v)))
  }
}
