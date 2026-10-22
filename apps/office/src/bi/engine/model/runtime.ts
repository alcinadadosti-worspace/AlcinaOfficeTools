// Modelo em execução: tabelas, colunas, índices de valores e relações.
import { Column, ColumnBuilder } from '../data/column'
import { DataTable } from '../data/table'
import { type DataType, DateVal, type Scalar, isDateType } from '../data/types'
import { convertColumn } from '../data/convert'
import { month as monthOf, quarter as quarterOf, year as yearOf, day as dayOf } from '../data/dates'
import {
  type ColumnDef,
  type DatePartLevel,
  type MeasureDef,
  type ModelDef,
  type RelationshipDef,
  type TableDef,
  DATE_LEVELS,
  datePartColumnName
} from './types'

/** Chave normalizada para comparar valores (texto sem diferenciar maiúsculas). */
export type NormKey = string | number | boolean | null

export function normKey(v: Scalar): NormKey {
  if (v === null) return null
  if (typeof v === 'string') return v.toLowerCase()
  if (v instanceof DateVal) return v.ms
  return v
}

let nextId = 1

// ---------------------------------------------------------------------------
// Índice de valores distintos de uma coluna (CSR: id -> linhas)
// ---------------------------------------------------------------------------

export class ValueIndex {
  /** id distinto de cada linha */
  readonly ids: Int32Array
  /** valor representativo de cada id */
  readonly values: Scalar[]
  readonly keys: NormKey[]
  readonly keyToId: Map<NormKey, number>
  readonly offsets: Int32Array
  readonly rows: Int32Array
  /** id do valor vazio (ou -1) */
  readonly blankId: number

  constructor(col: Column) {
    const n = col.length
    const ids = new Int32Array(n)
    const values: Scalar[] = []
    const keys: NormKey[] = []
    const keyToId = new Map<NormKey, number>()
    const d = col.data
    const idFor = (key: NormKey, v: Scalar): number => {
      let id = keyToId.get(key)
      if (id === undefined) {
        id = values.length
        keyToId.set(key, id)
        values.push(v)
        keys.push(key)
      }
      return id
    }
    if (d.kind === 'text') {
      const codeToId = new Int32Array(d.dict.length).fill(-1)
      for (let i = 0; i < n; i++) {
        const c = d.codes[i]
        if (c < 0) {
          ids[i] = idFor(null, null)
          continue
        }
        let id = codeToId[c]
        if (id < 0) {
          const s = d.dict[c]
          id = idFor(s.toLowerCase(), s)
          codeToId[c] = id
        }
        ids[i] = id
      }
    } else if (d.kind === 'num') {
      const isDate = isDateType(col.type)
      const vals = d.values
      const local = new Map<number, number>()
      for (let i = 0; i < n; i++) {
        const x = vals[i]
        if (x !== x) {
          ids[i] = idFor(null, null)
          continue
        }
        let id = local.get(x)
        if (id === undefined) {
          id = idFor(x, isDate ? new DateVal(x, col.type as 'date') : x)
          local.set(x, id)
        }
        ids[i] = id
      }
    } else {
      for (let i = 0; i < n; i++) {
        const v = col.get(i)
        ids[i] = idFor(normKey(v), v)
      }
    }
    const count = values.length
    const offsets = new Int32Array(count + 1)
    for (let i = 0; i < n; i++) offsets[ids[i] + 1]++
    for (let k = 0; k < count; k++) offsets[k + 1] += offsets[k]
    const fill = offsets.slice(0, count)
    const rows = new Int32Array(n)
    for (let i = 0; i < n; i++) rows[fill[ids[i]]++] = i
    this.ids = ids
    this.values = values
    this.keys = keys
    this.keyToId = keyToId
    this.offsets = offsets
    this.rows = rows
    this.blankId = keyToId.get(null) ?? -1
  }

  get distinctCount(): number {
    return this.values.length
  }

  rowsOf(id: number): Int32Array {
    return this.rows.subarray(this.offsets[id], this.offsets[id + 1])
  }

  countOf(id: number): number {
    return this.offsets[id + 1] - this.offsets[id]
  }

  idOf(v: Scalar): number {
    return this.keyToId.get(normKey(v)) ?? -1
  }

  idOfKey(k: NormKey): number {
    return this.keyToId.get(k) ?? -1
  }
}

// ---------------------------------------------------------------------------
// Colunas, medidas e tabelas
// ---------------------------------------------------------------------------

export type ColumnState = 'ready' | 'pending' | 'computing'

export class ColRT {
  readonly id = nextId++
  state: ColumnState = 'ready'
  private _index: ValueIndex | null = null
  /** Função que calcula a coluna (colunas calculadas). */
  compute: (() => Column) | null = null

  constructor(
    readonly table: TableRT,
    public index: number,
    readonly name: string,
    public def: ColumnDef | null,
    readonly derived: { base: ColRT; level: DatePartLevel } | null = null
  ) {}

  get data(): Column {
    if (this.state !== 'ready') this.table.model.ensureColumn(this)
    return this.table.data.columns[this.index]
  }

  get type(): DataType {
    if (this.derived) return 'int'
    if (this.def) return this.def.dataType
    return this.table.data.columns[this.index]?.type ?? 'any'
  }

  get isCalculated(): boolean {
    return !!this.def?.expression
  }

  get isHidden(): boolean {
    return !!this.derived || !!this.def?.isHidden
  }

  get valueIndex(): ValueIndex {
    if (!this._index) this._index = new ValueIndex(this.data)
    return this._index
  }

  get qualifiedName(): string {
    return `${quoteTable(this.table.name)}[${this.name}]`
  }

  get displayName(): string {
    if (this.derived) return `${this.derived.base.name}.${this.derived.level}`
    return this.name
  }

  invalidate(): void {
    this._index = null
  }
}

export class MeasureRT {
  readonly id = nextId++
  constructor(
    readonly table: TableRT,
    readonly def: MeasureDef
  ) {}
  get name(): string {
    return this.def.name
  }
}

export function quoteTable(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`
}

export class TableRT {
  readonly id = nextId++
  data: DataTable
  readonly columns: ColRT[] = []
  private colByName = new Map<string, ColRT>()
  readonly measures: MeasureRT[] = []
  private allRowsCache: Int32Array | null = null
  private identity: { groupOf: Int32Array; offsets: Int32Array; rows: Int32Array } | null = null
  state: ColumnState = 'ready'
  compute: (() => DataTable) | null = null

  constructor(
    readonly model: ModelRuntime,
    readonly def: TableDef,
    data: DataTable
  ) {
    this.data = data
  }

  get name(): string {
    return this.def.name
  }

  get rowCount(): number {
    if (this.state !== 'ready') this.model.ensureTable(this)
    return this.data.rowCount
  }

  addColumn(col: ColRT): void {
    this.columns.push(col)
    const low = col.name.toLowerCase()
    if (!this.colByName.has(low)) this.colByName.set(low, col)
  }

  resetColumns(): void {
    this.columns.length = 0
    this.colByName = new Map()
  }

  column(name: string): ColRT | undefined {
    return this.colByName.get(name.toLowerCase())
  }

  /** Colunas visíveis ao usuário (exclui derivadas de data). */
  get baseColumns(): ColRT[] {
    return this.columns.filter((c) => !c.derived)
  }

  allRows(): Int32Array {
    const n = this.rowCount
    if (!this.allRowsCache || this.allRowsCache.length !== n) {
      const a = new Int32Array(n)
      for (let i = 0; i < n; i++) a[i] = i
      this.allRowsCache = a
    }
    return this.allRowsCache
  }

  /** Linhas idênticas (em todas as colunas base) à linha r — usado na transição de contexto. */
  identityRows(r: number): Int32Array {
    if (!this.identity) this.buildIdentity()
    const id = this.identity!
    const g = id.groupOf[r]
    return id.rows.subarray(id.offsets[g], id.offsets[g + 1])
  }

  private buildIdentity(): void {
    const n = this.rowCount
    // Somente colunas de origem: colunas calculadas são função da linha e
    // incluí-las criaria dependências circulares (transição de contexto em
    // colunas calculadas).
    let source = this.columns.filter((c) => !c.derived && !c.isCalculated)
    if (source.length === 0) source = this.columns.filter((c) => !c.derived && c.state === 'ready')
    const cols = source.map((c) => c.valueIndex.ids)
    const groupOf = new Int32Array(n)
    const map = new Map<string, number>()
    let groups = 0
    if (cols.length === 0) {
      groupOf.fill(0)
      groups = n > 0 ? 1 : 0
    } else {
      for (let r = 0; r < n; r++) {
        let key = String(cols[0][r])
        for (let c = 1; c < cols.length; c++) key += ',' + cols[c][r]
        let g = map.get(key)
        if (g === undefined) {
          g = groups++
          map.set(key, g)
        }
        groupOf[r] = g
      }
    }
    const offsets = new Int32Array(groups + 1)
    for (let r = 0; r < n; r++) offsets[groupOf[r] + 1]++
    for (let g = 0; g < groups; g++) offsets[g + 1] += offsets[g]
    const fill = offsets.slice(0, groups)
    const rows = new Int32Array(n)
    for (let r = 0; r < n; r++) rows[fill[groupOf[r]]++] = r
    this.identity = { groupOf, offsets, rows }
  }

  invalidate(): void {
    this.allRowsCache = null
    this.identity = null
    for (const c of this.columns) c.invalidate()
  }
}

// ---------------------------------------------------------------------------
// Relações
// ---------------------------------------------------------------------------

export class RelRT {
  readonly id: string
  private _lookup: Int32Array | null = null
  private _unmatched: Int32Array | null = null

  constructor(
    readonly def: RelationshipDef,
    /** lado "muitos" */
    readonly from: ColRT,
    /** lado "um" */
    readonly to: ColRT
  ) {
    this.id = def.id
  }

  get fromTable(): TableRT {
    return this.from.table
  }
  get toTable(): TableRT {
    return this.to.table
  }

  /** Para cada linha do lado "muitos": linha correspondente no lado "um" (ou -1). */
  lookup(): Int32Array {
    if (!this._lookup) {
      const fromIdx = this.from.valueIndex
      const toIdx = this.to.valueIndex
      const idMap = new Int32Array(fromIdx.distinctCount).fill(-1)
      for (let id = 0; id < fromIdx.distinctCount; id++) {
        const key = fromIdx.keys[id]
        if (key === null) continue
        const tid = toIdx.idOfKey(key)
        if (tid >= 0) idMap[id] = toIdx.rowsOf(tid)[0]
      }
      const n = this.from.table.rowCount
      const out = new Int32Array(n)
      const ids = fromIdx.ids
      for (let r = 0; r < n; r++) out[r] = idMap[ids[r]]
      this._lookup = out
    }
    return this._lookup
  }

  /** Linhas do lado "muitos" sem correspondência no lado "um" (vão para a linha em branco). */
  unmatched(): Int32Array {
    if (!this._unmatched) {
      const lk = this.lookup()
      let count = 0
      for (let r = 0; r < lk.length; r++) if (lk[r] < 0) count++
      const out = new Int32Array(count)
      let k = 0
      for (let r = 0; r < lk.length; r++) if (lk[r] < 0) out[k++] = r
      this._unmatched = out
    }
    return this._unmatched
  }

  hasUnmatched(): boolean {
    return this.unmatched().length > 0
  }

  invalidate(): void {
    this._lookup = null
    this._unmatched = null
  }
}

/** Estado de relações ativas (USERELATIONSHIP / CROSSFILTER). */
export interface RelState {
  /** Relações ativadas explicitamente (ids). */
  activate: ReadonlySet<string> | null
  /** Direção sobrescrita por relação. */
  direction: ReadonlyMap<string, 'single' | 'both' | 'none' | 'reverse'> | null
}

export const DEFAULT_REL_STATE: RelState = { activate: null, direction: null }

export function relStateKey(s: RelState): string {
  if (!s.activate && !s.direction) return ''
  const a = s.activate ? [...s.activate].sort().join(',') : ''
  const d = s.direction ? [...s.direction.entries()].map(([k, v]) => `${k}:${v}`).sort().join(',') : ''
  return `${a}|${d}`
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface CalcHooks {
  /** Calcula uma coluna calculada (DAX) e devolve a coluna resultante. */
  computeColumn(col: ColRT): Column
  /** Calcula uma tabela calculada (DAX). */
  computeTable(table: TableRT): DataTable
}

export class ModelRuntime {
  readonly tables: TableRT[] = []
  private tableByName = new Map<string, TableRT>()
  readonly relationships: RelRT[] = []
  private measureByName = new Map<string, MeasureRT>()
  private pathCache = new Map<string, RelRT[] | null>()
  hooks: CalcHooks | null = null
  readonly errors: { table: string; column?: string; message: string }[] = []

  constructor(
    readonly def: ModelDef,
    sources: Map<string, DataTable>
  ) {
    for (const td of def.tables) {
      const t = this.buildTable(td, sources.get(td.name) ?? sources.get(td.queryId ?? '') ?? null)
      this.tables.push(t)
      this.tableByName.set(td.name.toLowerCase(), t)
    }
    for (const t of this.tables) {
      for (const md of t.def.measures) {
        const m = new MeasureRT(t, md)
        t.measures.push(m)
        const low = md.name.toLowerCase()
        if (!this.measureByName.has(low)) this.measureByName.set(low, m)
      }
    }
    for (const rd of def.relationships) {
      const ft = this.table(rd.fromTable)
      const tt = this.table(rd.toTable)
      const fc = ft?.column(rd.fromColumn)
      const tc = tt?.column(rd.toColumn)
      if (!fc || !tc) {
        this.errors.push({ table: rd.fromTable, message: `Relação inválida: ${rd.fromTable}[${rd.fromColumn}] → ${rd.toTable}[${rd.toColumn}]` })
        continue
      }
      this.relationships.push(new RelRT(rd, fc, tc))
    }
  }

  private buildTable(td: TableDef, source: DataTable | null): TableRT {
    const t = new TableRT(this, td, DataTable.empty())
    const isCalcTable = !!td.expression
    const cols: Column[] = []
    let rowCount = source?.rowCount ?? 0
    if (isCalcTable) {
      t.state = 'pending'
      t.compute = () => this.hooks!.computeTable(t)
      rowCount = 0
    }
    td.columns.forEach((cd) => {
      const idx = cols.length
      if (cd.expression) {
        cols.push(Column.blank(cd.name, cd.dataType, rowCount))
        const c = new ColRT(t, idx, cd.name, cd)
        c.state = 'pending'
        c.compute = () => this.hooks!.computeColumn(c)
        t.addColumn(c)
        return
      }
      let col: Column | undefined
      if (!isCalcTable && source) {
        col = source.column(cd.sourceColumn ?? cd.name)
        if (col) {
          if (col.type !== cd.dataType && cd.dataType !== 'any') col = convertColumn(col, cd.dataType)
          col = col.withoutErrors().rename(cd.name)
        }
      }
      if (!col) col = Column.blank(cd.name, cd.dataType, rowCount)
      cols.push(col)
      t.addColumn(new ColRT(t, idx, cd.name, cd))
    })
    t.data = new DataTable(cols, rowCount)
    if (!isCalcTable) this.addDerivedDateColumns(t)
    return t
  }

  /** Adiciona colunas derivadas (Ano/Trimestre/Mês/Dia) para colunas de data. */
  addDerivedDateColumns(t: TableRT): void {
    if (!this.def.autoDateTime) return
    const bases = t.columns.filter((c) => !c.derived && (c.type === 'date' || c.type === 'datetime'))
    for (const base of bases) {
      for (const level of DATE_LEVELS) {
        const name = datePartColumnName(base.name, level)
        if (t.column(name)) continue
        const idx = t.data.columns.length
        const derived = new ColRT(t, idx, name, null, { base, level })
        derived.state = base.state === 'ready' ? 'ready' : 'pending'
        const make = (): Column => {
          const src = base.data
          const n = src.length
          const b = new ColumnBuilder('int', n)
          const fn = level === 'year' ? yearOf : level === 'quarter' ? quarterOf : level === 'month' ? monthOf : dayOf
          for (let i = 0; i < n; i++) {
            const x = src.num(i)
            b.pushNum(x !== x ? NaN : fn(x))
          }
          return b.build(name)
        }
        if (derived.state === 'ready') {
          t.data = new DataTable([...t.data.columns, make()], t.data.rowCount)
        } else {
          t.data = new DataTable([...t.data.columns, Column.blank(name, 'int', t.data.rowCount)], t.data.rowCount)
          derived.compute = make
        }
        t.addColumn(derived)
      }
    }
  }

  table(name: string): TableRT | undefined {
    return this.tableByName.get(name.toLowerCase())
  }

  /** Atualiza medidas e metadados de colunas sem recalcular dados. */
  patchDefinitions(def: ModelDef): void {
    this.measureByName.clear()
    for (const t of this.tables) {
      const td = def.tables.find((x) => x.name.toLowerCase() === t.name.toLowerCase())
      if (!td) continue
      ;(t as { def: TableDef }).def = td
      t.measures.length = 0
      for (const md of td.measures) {
        const m = new MeasureRT(t, md)
        t.measures.push(m)
        const low = md.name.toLowerCase()
        if (!this.measureByName.has(low)) this.measureByName.set(low, m)
      }
      for (const c of t.columns) {
        if (c.derived) continue
        const cd = td.columns.find((x) => x.name.toLowerCase() === c.name.toLowerCase())
        if (cd) {
          // preserva o tipo inferido de colunas calculadas
          if (cd.expression && c.def) cd.dataType = c.def.dataType
          c.def = cd
        }
      }
    }
    ;(this as { def: ModelDef }).def = def
  }

  measure(name: string): MeasureRT | undefined {
    return this.measureByName.get(name.toLowerCase())
  }

  allMeasures(): MeasureRT[] {
    return [...this.measureByName.values()]
  }

  /** Garante que uma coluna calculada/derivada esteja calculada. */
  ensureColumn(c: ColRT): void {
    if (c.state === 'ready') return
    if (c.table.state !== 'ready') this.ensureTable(c.table)
    // ensureTable pode ter calculado a coluna
    if ((c.state as ColumnState) === 'ready') return
    if (c.state === 'computing') {
      throw new Error(`Dependência circular detectada na coluna ${c.qualifiedName}.`)
    }
    c.state = 'computing'
    try {
      let col: Column
      try {
        col = c.compute!()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        this.errors.push({ table: c.table.name, column: c.name, message: msg })
        if (/circular/i.test(msg)) throw e
        col = Column.blank(c.name, c.type, c.table.data.rowCount)
      }
      const cols = [...c.table.data.columns]
      cols[c.index] = col.rename(c.name)
      c.table.data = new DataTable(cols, c.table.data.rowCount)
      c.invalidate()
      c.state = 'ready'
      // Colunas derivadas de data que dependem desta
      for (const d of c.table.columns) if (d.derived?.base === c && d.state === 'pending' && d.compute) this.ensureColumn(d)
    } finally {
      if (c.state === 'computing') c.state = 'pending'
    }
  }

  ensureTable(t: TableRT): void {
    if (t.state === 'ready') return
    if (t.state === 'computing') throw new Error(`Dependência circular detectada na tabela ${quoteTable(t.name)}.`)
    t.state = 'computing'
    try {
      let data: DataTable
      try {
        data = t.compute!()
      } catch (e) {
        if (e instanceof Error && /circular/i.test(e.message)) throw e
        this.errors.push({ table: t.name, message: e instanceof Error ? e.message : String(e) })
        data = new DataTable(
          t.def.columns.map((cd) => Column.blank(cd.name, cd.dataType, 0)),
          0
        )
      }
      // Alinha as colunas da definição com o resultado calculado.
      const cols: Column[] = []
      t.resetColumns()
      data.columns.forEach((col, i) => {
        const cd = t.def.columns.find((d) => d.name.toLowerCase() === col.name.toLowerCase()) ?? null
        const c = new ColRT(t, i, col.name, cd ?? { name: col.name, dataType: col.type, summarizeBy: 'none' })
        cols.push(col)
        t.addColumn(c)
      })
      t.data = new DataTable(cols, data.rowCount)
      t.state = 'ready'
      t.invalidate()
      this.addDerivedDateColumns(t)
    } finally {
      if (t.state === 'computing') t.state = 'pending'
    }
  }

  /** Calcula tudo que estiver pendente (colunas e tabelas calculadas). */
  computeAll(): void {
    for (const t of this.tables) {
      if (t.state !== 'ready') {
        try {
          this.ensureTable(t)
        } catch (e) {
          this.errors.push({ table: t.name, message: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    for (const t of this.tables) {
      for (const c of t.columns) {
        if (c.state !== 'ready') {
          try {
            this.ensureColumn(c)
          } catch (e) {
            this.errors.push({ table: t.name, column: c.name, message: e instanceof Error ? e.message : String(e) })
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------
  // Navegação no grafo de relações
  // --------------------------------------------------------------------

  isRelActive(r: RelRT, s: RelState): boolean {
    if (s.direction?.get(r.id) === 'none') return false
    if (r.def.active) {
      if (!s.activate || s.activate.size === 0) return true
      // Uma relação inativa ativada desativa a ativa entre as mesmas tabelas.
      for (const id of s.activate) {
        const other = this.relationships.find((x) => x.id === id)
        if (
          other &&
          other !== r &&
          ((other.fromTable === r.fromTable && other.toTable === r.toTable) ||
            (other.fromTable === r.toTable && other.toTable === r.fromTable))
        )
          return false
      }
      return true
    }
    return !!s.activate?.has(r.id)
  }

  /** Direção efetiva: 'single' (um filtra muitos), 'both', 'reverse' (muitos filtra um). */
  relDirection(r: RelRT, s: RelState): 'single' | 'both' | 'reverse' {
    const o = s.direction?.get(r.id)
    if (o === 'both' || o === 'single' || o === 'reverse') return o
    return r.def.crossFilter === 'both' ? 'both' : 'single'
  }

  /**
   * Caminho de relações de `from` até `to` seguindo sempre do lado "muitos"
   * para o lado "um" (usado por RELATED e por tabelas expandidas).
   */
  manyToOnePath(from: TableRT, to: TableRT, s: RelState = DEFAULT_REL_STATE): RelRT[] | null {
    if (from === to) return []
    const key = `${from.id}>${to.id}|${relStateKey(s)}`
    if (this.pathCache.has(key)) return this.pathCache.get(key)!
    const prev = new Map<TableRT, RelRT>()
    const visited = new Set<TableRT>([from])
    const queue: TableRT[] = [from]
    let found = false
    while (queue.length && !found) {
      const cur = queue.shift()!
      for (const r of this.relationships) {
        if (!this.isRelActive(r, s)) continue
        let next: TableRT | null = null
        if (r.fromTable === cur && r.def.cardinality !== 'manyToMany') next = r.toTable
        else if (r.toTable === cur && r.def.cardinality === 'oneToOne') next = r.fromTable
        if (!next || visited.has(next)) continue
        visited.add(next)
        prev.set(next, r)
        if (next === to) {
          found = true
          break
        }
        queue.push(next)
      }
    }
    let result: RelRT[] | null = null
    if (found) {
      result = []
      let cur = to
      while (cur !== from) {
        const r = prev.get(cur)!
        result.unshift(r)
        cur = r.toTable === cur ? r.fromTable : r.toTable
      }
    }
    this.pathCache.set(key, result)
    return result
  }

  /** Tabelas alcançáveis do lado "muitos" para o "um" (tabela expandida). */
  expandedTables(t: TableRT, s: RelState = DEFAULT_REL_STATE): TableRT[] {
    const out: TableRT[] = [t]
    for (const o of this.tables) if (o !== t && this.manyToOnePath(t, o, s)) out.push(o)
    return out
  }

  /** Linha relacionada em `to` para a linha `row` de `from` (seguindo muitos→um). */
  relatedRow(from: TableRT, row: number, to: TableRT, s: RelState = DEFAULT_REL_STATE): number {
    const path = this.manyToOnePath(from, to, s)
    if (!path) return -2
    let r = row
    let cur = from
    for (const rel of path) {
      if (r < 0) return -1
      if (rel.fromTable === cur) {
        r = rel.lookup()[r]
        cur = rel.toTable
      } else {
        // 1:1 percorrida ao contrário
        const idx = rel.from.valueIndex
        const key = rel.to.valueIndex.keys[rel.to.valueIndex.ids[r]]
        const id = key === null ? -1 : idx.idOfKey(key)
        r = id >= 0 ? idx.rowsOf(id)[0] : -1
        cur = rel.fromTable
      }
    }
    return r
  }

  clearPathCache(): void {
    this.pathCache.clear()
  }
}

export function isNumericColumn(c: ColRT): boolean {
  const t = c.type
  return t === 'int' || t === 'number' || t === 'currency'
}
