// Contexto de filtro: filtros por valores/linhas e propagação pelas relações.
import {
  type ColRT,
  type ModelRuntime,
  type NormKey,
  type RelRT,
  type RelState,
  type TableRT,
  DEFAULT_REL_STATE,
  relStateKey
} from '../model/runtime'

/** Conjunto de linhas: `rows` ordenado (null = todas) e se a "linha em branco" virtual passa. */
export interface RowSel {
  rows: Int32Array | null
  blank: boolean
}

export const ALL_SEL: RowSel = { rows: null, blank: true }

let filterSeq = 1
let ctxSeq = 1

export function tupleKey(keys: NormKey[]): string {
  let s = ''
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    if (i > 0) s += '\u0001'
    s += k === null ? '\u0002' : typeof k === 'string' ? 's' + k : typeof k === 'number' ? 'n' + k : k ? 'T' : 'F'
  }
  return s
}

export class ValuesFilter {
  readonly kind = 'values' as const
  readonly id = filterSeq++
  readonly cache = new Map<string, RowSel>()
  readonly keySet: Set<NormKey> | null
  readonly tupleSet: Set<string> | null
  /** Filtro de agrupamento de um visual (usado por ISINSCOPE). */
  isGroup = false

  constructor(
    readonly cols: ColRT[],
    /** Para uma coluna: valores; para várias: tuplas. */
    readonly tuples: NormKey[][],
    /** Gerado por inteligência de tempo / data: remove filtros da tabela de datas. */
    readonly dateFilter = false
  ) {
    if (cols.length === 1) {
      this.keySet = new Set(tuples.map((t) => t[0]))
      this.tupleSet = null
    } else {
      this.keySet = null
      this.tupleSet = new Set(tuples.map(tupleKey))
    }
  }

  static single(col: ColRT, keys: Iterable<NormKey>, dateFilter = false): ValuesFilter {
    const arr: NormKey[][] = []
    for (const k of keys) arr.push([k])
    return new ValuesFilter([col], arr, dateFilter)
  }

  hasKey(k: NormKey): boolean {
    return this.keySet!.has(k)
  }

  get size(): number {
    return this.tuples.length
  }

  /** Projeta o filtro nas colunas restantes (remove `drop`). */
  project(keep: ColRT[]): ValuesFilter | null {
    if (keep.length === 0) return null
    if (keep.length === this.cols.length) return this
    const idx = keep.map((c) => this.cols.indexOf(c))
    const seen = new Set<string>()
    const out: NormKey[][] = []
    for (const t of this.tuples) {
      const p = idx.map((i) => t[i])
      const k = tupleKey(p)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(p)
    }
    return new ValuesFilter(keep, out, this.dateFilter)
  }
}

export class RowsFilter {
  readonly kind = 'rows' as const
  readonly id = filterSeq++
  readonly cache = new Map<string, RowSel>()

  constructor(
    readonly table: TableRT,
    /** Linhas ordenadas da tabela. */
    readonly rows: Int32Array,
    /** Filtro de tabela expandida (argumento de tabela do CALCULATE). */
    readonly expanded: boolean
  ) {}
}

export type Filter = ValuesFilter | RowsFilter

// ---------------------------------------------------------------------------
// Operações com conjuntos de linhas
// ---------------------------------------------------------------------------

function lowerBound(a: Int32Array, x: number, lo = 0): number {
  let hi = a.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (a[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function intersectLists(a: Int32Array, b: Int32Array): Int32Array {
  if (a.length > b.length) [a, b] = [b, a]
  if (a.length === 0) return a
  const out = new Int32Array(a.length)
  let k = 0
  if (a.length * 8 < b.length) {
    let pos = 0
    for (let i = 0; i < a.length; i++) {
      pos = lowerBound(b, a[i], pos)
      if (pos < b.length && b[pos] === a[i]) out[k++] = a[i]
    }
  } else {
    let i = 0
    let j = 0
    while (i < a.length && j < b.length) {
      const x = a[i]
      const y = b[j]
      if (x === y) {
        out[k++] = x
        i++
        j++
      } else if (x < y) i++
      else j++
    }
  }
  return k === out.length ? out : out.slice(0, k)
}

export function intersectSel(a: RowSel, b: RowSel): RowSel {
  if (a.rows === null) return b.rows === null ? { rows: null, blank: a.blank && b.blank } : { rows: b.rows, blank: a.blank && b.blank }
  if (b.rows === null) return { rows: a.rows, blank: a.blank && b.blank }
  return { rows: intersectLists(a.rows, b.rows), blank: a.blank && b.blank }
}

/** Ordena e remove duplicatas de uma lista de linhas. */
export function sortUnique(list: Int32Array | number[], n: number): Int32Array {
  const len = list.length
  if (len === 0) return new Int32Array(0)
  if (len > n / 8) {
    const mark = new Uint8Array(n)
    let count = 0
    for (let i = 0; i < len; i++) {
      const r = list[i]
      if (!mark[r]) {
        mark[r] = 1
        count++
      }
    }
    const out = new Int32Array(count)
    let k = 0
    for (let r = 0; r < n; r++) if (mark[r]) out[k++] = r
    return out
  }
  const arr = Int32Array.from(list)
  arr.sort()
  let k = 0
  for (let i = 0; i < arr.length; i++) if (i === 0 || arr[i] !== arr[i - 1]) arr[k++] = arr[i]
  return k === arr.length ? arr : arr.slice(0, k)
}

export function selCount(sel: RowSel, t: TableRT): number {
  return sel.rows === null ? t.rowCount : sel.rows.length
}

export function selRows(sel: RowSel, t: TableRT): Int32Array {
  return sel.rows ?? t.allRows()
}

// ---------------------------------------------------------------------------
// Propagação
// ---------------------------------------------------------------------------

interface Edge {
  rel: RelRT
  /** 'down' = do lado um para o lado muitos; 'up' = do muitos para o um */
  dir: 'down' | 'up'
  from: TableRT
  to: TableRT
}

function edgesFrom(model: ModelRuntime, t: TableRT, s: RelState): Edge[] {
  const out: Edge[] = []
  for (const r of model.relationships) {
    if (!model.isRelActive(r, s)) continue
    const d = model.relDirection(r, s)
    if (r.toTable === t && (d === 'single' || d === 'both')) out.push({ rel: r, dir: 'down', from: t, to: r.fromTable })
    if (r.fromTable === t && (d === 'both' || d === 'reverse')) out.push({ rel: r, dir: 'up', from: t, to: r.toTable })
  }
  return out
}

const flowPathCache = new WeakMap<ModelRuntime, Map<string, Edge[] | null>>()

/** Caminho pelo qual um filtro em `src` alcança `dst`. */
function flowPath(model: ModelRuntime, src: TableRT, dst: TableRT, s: RelState): Edge[] | null {
  if (src === dst) return []
  let cache = flowPathCache.get(model)
  if (!cache) {
    cache = new Map()
    flowPathCache.set(model, cache)
  }
  const key = `${src.id}>${dst.id}|${relStateKey(s)}`
  if (cache.has(key)) return cache.get(key)!
  const prev = new Map<TableRT, Edge>()
  const visited = new Set<TableRT>([src])
  const queue: TableRT[] = [src]
  let found = false
  while (queue.length && !found) {
    const cur = queue.shift()!
    for (const e of edgesFrom(model, cur, s)) {
      if (visited.has(e.to)) continue
      visited.add(e.to)
      prev.set(e.to, e)
      if (e.to === dst) {
        found = true
        break
      }
      queue.push(e.to)
    }
  }
  let path: Edge[] | null = null
  if (found) {
    path = []
    let cur = dst
    while (cur !== src) {
      const e = prev.get(cur)!
      path.unshift(e)
      cur = e.from
    }
  }
  cache.set(key, path)
  return path
}

export function clearFlowCache(model: ModelRuntime): void {
  flowPathCache.delete(model)
}

function propagateEdge(e: Edge, sel: RowSel): RowSel {
  const rel = e.rel
  if (e.dir === 'down') {
    // do lado "um" (rel.to) para o lado "muitos" (rel.from)
    const many = rel.fromTable
    if (sel.rows === null) {
      if (sel.blank) return ALL_SEL
      const un = rel.unmatched()
      if (un.length === 0) return { rows: null, blank: false }
      const n = many.rowCount
      const out = new Int32Array(n - un.length)
      let k = 0
      let j = 0
      for (let r = 0; r < n; r++) {
        if (j < un.length && un[j] === r) {
          j++
          continue
        }
        out[k++] = r
      }
      return { rows: out, blank: false }
    }
    const toIdx = rel.to.valueIndex
    const fromIdx = rel.from.valueIndex
    const seen = new Uint8Array(toIdx.distinctCount)
    const parts: Int32Array[] = []
    let total = 0
    for (let i = 0; i < sel.rows.length; i++) {
      const id = toIdx.ids[sel.rows[i]]
      if (seen[id]) continue
      seen[id] = 1
      const key = toIdx.keys[id]
      if (key === null) continue
      const fid = fromIdx.idOfKey(key)
      if (fid < 0) continue
      const rows = fromIdx.rowsOf(fid)
      parts.push(rows)
      total += rows.length
    }
    if (sel.blank) {
      const un = rel.unmatched()
      parts.push(un)
      total += un.length
    }
    const all = new Int32Array(total)
    let k = 0
    for (const p of parts) {
      all.set(p, k)
      k += p.length
    }
    return { rows: sortUnique(all, many.rowCount), blank: sel.blank }
  } else {
    // do lado "muitos" (rel.from) para o lado "um" (rel.to)
    const one = rel.toTable
    if (sel.rows === null) return ALL_SEL
    const fromIdx = rel.from.valueIndex
    const toIdx = rel.to.valueIndex
    const seen = new Uint8Array(fromIdx.distinctCount)
    const parts: Int32Array[] = []
    let total = 0
    let blank = false
    for (let i = 0; i < sel.rows.length; i++) {
      const id = fromIdx.ids[sel.rows[i]]
      if (seen[id]) continue
      seen[id] = 1
      const key = fromIdx.keys[id]
      const tid = key === null ? -1 : toIdx.idOfKey(key)
      if (tid < 0) {
        blank = true
        continue
      }
      const rows = toIdx.rowsOf(tid)
      parts.push(rows)
      total += rows.length
    }
    const all = new Int32Array(total)
    let k = 0
    for (const p of parts) {
      all.set(p, k)
      k += p.length
    }
    return { rows: sortUnique(all, one.rowCount), blank }
  }
}

function propagate(model: ModelRuntime, seedTable: TableRT, seed: RowSel, target: TableRT, s: RelState): RowSel {
  if (seedTable === target) return seed
  const path = flowPath(model, seedTable, target, s)
  if (!path) return ALL_SEL
  let sel = seed
  for (const e of path) {
    sel = propagateEdge(e, sel)
    if (sel.rows === null && sel.blank) return ALL_SEL
  }
  return sel
}

/** Linhas da própria tabela da coluna que satisfazem um filtro de valores (1 coluna). */
function seedSingle(f: ValuesFilter): RowSel {
  const col = f.cols[0]
  const t = col.table
  const idx = col.valueIndex
  const keys = f.keySet!
  const blank = keys.has(null)
  if (keys.size === 0) return { rows: new Int32Array(0), blank: false }
  // Se o filtro contém todos os valores distintos, não restringe.
  let total = 0
  const ids: number[] = []
  for (const k of keys) {
    const id = idx.idOfKey(k)
    if (id >= 0) {
      ids.push(id)
      total += idx.countOf(id)
    }
  }
  if (ids.length === idx.distinctCount) return { rows: null, blank }
  const n = t.rowCount
  if (total > n / 4) {
    const allowed = new Uint8Array(idx.distinctCount)
    for (const id of ids) allowed[id] = 1
    const out = new Int32Array(total)
    let k = 0
    const rowIds = idx.ids
    for (let r = 0; r < n; r++) if (allowed[rowIds[r]]) out[k++] = r
    return { rows: out, blank }
  }
  if (ids.length === 1) return { rows: idx.rowsOf(ids[0]), blank }
  const all = new Int32Array(total)
  let k = 0
  for (const id of ids) {
    const rows = idx.rowsOf(id)
    all.set(rows, k)
    k += rows.length
  }
  all.sort()
  return { rows: all, blank }
}

function allowedValues(model: ModelRuntime, f: ValuesFilter, t: TableRT, s: RelState): RowSel {
  if (f.cols.length === 1) {
    const col = f.cols[0]
    if (col.table === t) return seedSingle(f)
    const seedKey = `seed|${relStateKey(s)}`
    let seed = f.cache.get(seedKey)
    if (!seed) {
      seed = seedSingle(f)
      f.cache.set(seedKey, seed)
    }
    return propagate(model, col.table, seed, t, s)
  }
  // Filtro de várias colunas: projeta nas colunas alcançáveis a partir de t.
  const reachable: { col: ColRT; pos: number }[] = []
  f.cols.forEach((c, pos) => {
    if (c.table === t || model.manyToOnePath(t, c.table, s)) reachable.push({ col: c, pos })
  })
  if (reachable.length === 0) {
    // Tenta propagar a partir de cada tabela envolvida.
    let sel: RowSel = ALL_SEL
    const byTable = new Map<TableRT, ColRT[]>()
    for (const c of f.cols) {
      const arr = byTable.get(c.table) ?? []
      arr.push(c)
      byTable.set(c.table, arr)
    }
    for (const [tbl, cols] of byTable) {
      const p = f.project(cols)
      if (!p) continue
      const seed = allowedValues(model, p, tbl, s)
      sel = intersectSel(sel, propagate(model, tbl, seed, t, s))
    }
    return sel
  }
  const proj = reachable.length === f.cols.length ? f : f.project(reachable.map((r) => r.col))!
  const projCols = proj.cols
  const n = t.rowCount
  const lookups = projCols.map((c) => {
    if (c.table === t) return null
    const path = model.manyToOnePath(t, c.table, s)!
    // linha relacionada para cada linha de t
    const out = new Int32Array(n)
    for (let r = 0; r < n; r++) out[r] = model.relatedRow(t, r, c.table, s)
    void path
    return out
  })
  const indexes = projCols.map((c) => c.valueIndex)
  const out = new Int32Array(n)
  let k = 0
  const keys: NormKey[] = new Array(projCols.length)
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < projCols.length; i++) {
      const lk = lookups[i]
      const rr = lk ? lk[r] : r
      keys[i] = rr < 0 ? null : indexes[i].keys[indexes[i].ids[rr]]
    }
    if (proj.cols.length === 1 ? proj.keySet!.has(keys[0]) : proj.tupleSet!.has(tupleKey(keys))) out[k++] = r
  }
  return { rows: out.slice(0, k), blank: false }
}

function allowedRows(model: ModelRuntime, f: RowsFilter, t: TableRT, s: RelState): RowSel {
  const src = f.table
  const seed: RowSel = { rows: f.rows, blank: false }
  if (src === t) return seed
  let sel: RowSel = ALL_SEL
  // Propagação normal (do filtro para os lados "muitos" / bidirecional).
  const direct = flowPath(model, src, t, s)
  if (direct) sel = propagate(model, src, seed, t, s)
  if (f.expanded) {
    // Tabela expandida: filtra também as tabelas do lado "um" e o que elas filtram.
    for (const dim of model.expandedTables(src, s)) {
      if (dim === src) continue
      if (dim !== t && !flowPath(model, dim, t, s)) continue
      const path = model.manyToOnePath(src, dim, s)!
      let dimSel: RowSel = seed
      let cur = src
      for (const rel of path) {
        const e: Edge =
          rel.fromTable === cur
            ? { rel, dir: 'up', from: cur, to: rel.toTable }
            : { rel, dir: 'down', from: cur, to: rel.fromTable }
        dimSel = propagateEdge(e, dimSel)
        cur = e.to
      }
      sel = intersectSel(sel, propagate(model, dim, dimSel, t, s))
    }
  }
  return sel
}

export function allowedFor(model: ModelRuntime, f: Filter, t: TableRT, s: RelState): RowSel {
  const key = `${t.id}|${relStateKey(s)}`
  let r = f.cache.get(key)
  if (!r) {
    r = f.kind === 'values' ? allowedValues(model, f, t, s) : allowedRows(model, f, t, s)
    f.cache.set(key, r)
  }
  return r
}

// ---------------------------------------------------------------------------
// Contexto de filtro
// ---------------------------------------------------------------------------

export class FilterContext {
  readonly id = ctxSeq++
  private visCache = new Map<number, RowSel>()
  private _sig: string | null = null

  constructor(
    readonly model: ModelRuntime,
    readonly filters: readonly Filter[],
    readonly rel: RelState = DEFAULT_REL_STATE,
    /** Contexto do qual este foi derivado apenas adicionando filtros. */
    readonly parent: FilterContext | null = null,
    readonly added: readonly Filter[] | null = null,
    /** Contexto "selecionado" (para ALLSELECTED). */
    readonly shadow: FilterContext | null = null
  ) {}

  static empty(model: ModelRuntime): FilterContext {
    return new FilterContext(model, [])
  }

  get sig(): string {
    if (this._sig === null) {
      const ids = this.filters.map((f) => f.id).sort((a, b) => a - b)
      this._sig = ids.join(',') + '|' + relStateKey(this.rel)
    }
    return this._sig
  }

  get isEmpty(): boolean {
    return this.filters.length === 0
  }

  visible(t: TableRT): RowSel {
    if (t.state !== 'ready') t.model.ensureTable(t)
    let v = this.visCache.get(t.id)
    if (v) return v
    if (this.parent && this.added && this.parent.rel === this.rel) {
      v = this.parent.visible(t)
      for (const f of this.added) {
        v = intersectSel(v, allowedFor(this.model, f, t, this.rel))
        if (v.rows && v.rows.length === 0) break
      }
    } else {
      v = ALL_SEL
      for (const f of this.filters) {
        v = intersectSel(v, allowedFor(this.model, f, t, this.rel))
        if (v.rows && v.rows.length === 0) break
      }
    }
    this.visCache.set(t.id, v)
    return v
  }

  visibleRows(t: TableRT): Int32Array {
    return selRows(this.visible(t), t)
  }

  visibleCount(t: TableRT): number {
    return selCount(this.visible(t), t)
  }

  /** Adiciona filtros mantendo os existentes (interseção). */
  addFilters(fs: Filter[]): FilterContext {
    if (fs.length === 0) return this
    return new FilterContext(this.model, [...this.filters, ...fs], this.rel, this, fs, this.shadow)
  }

  withFilters(fs: Filter[]): FilterContext {
    return new FilterContext(this.model, fs, this.rel, null, null, this.shadow)
  }

  withRel(rel: RelState): FilterContext {
    return new FilterContext(this.model, this.filters, rel, null, null, this.shadow)
  }

  withShadow(shadow: FilterContext | null): FilterContext {
    return new FilterContext(this.model, this.filters, this.rel, this.parent, this.added, shadow)
  }

  /** Colunas filtradas diretamente. */
  filteredColumns(): Set<ColRT> {
    const out = new Set<ColRT>()
    for (const f of this.filters) {
      if (f.kind === 'values') f.cols.forEach((c) => out.add(c))
      else f.table.columns.forEach((c) => out.add(c))
    }
    return out
  }

  isColumnFiltered(c: ColRT): boolean {
    for (const f of this.filters) {
      if (f.kind === 'values' && f.cols.includes(c)) return true
      if (f.kind === 'rows' && f.table === c.table) return true
    }
    return false
  }

  /** Filtros que afetam diretamente uma coluna. */
  filtersOn(c: ColRT): Filter[] {
    return this.filters.filter((f) => (f.kind === 'values' ? f.cols.includes(c) : f.table === c.table))
  }
}

/** Remove de uma lista de filtros as colunas indicadas (projetando filtros de várias colunas). */
export function removeColumnsFrom(filters: readonly Filter[], cols: Set<ColRT>, tables: Set<TableRT>): Filter[] {
  const out: Filter[] = []
  for (const f of filters) {
    if (f.kind === 'rows') {
      if (tables.has(f.table)) continue
      out.push(f)
      continue
    }
    const keep = f.cols.filter((c) => !cols.has(c) && !tables.has(c.table))
    if (keep.length === f.cols.length) out.push(f)
    else {
      const p = f.project(keep)
      if (p) out.push(p)
    }
  }
  return out
}

/** Colunas "cobertas" por um filtro (que ele sobrescreve no CALCULATE). */
export function coverage(model: ModelRuntime, f: Filter, s: RelState): { cols: Set<ColRT>; tables: Set<TableRT> } {
  const cols = new Set<ColRT>()
  const tables = new Set<TableRT>()
  if (f.kind === 'rows') {
    if (f.expanded) for (const t of model.expandedTables(f.table, s)) tables.add(t)
    else tables.add(f.table)
    return { cols, tables }
  }
  for (const c of f.cols) {
    cols.add(c)
    // Coluna de data: remove filtros das colunas derivadas e, se for chave de
    // data (tabela de datas marcada ou chave de relação), de toda a tabela.
    if (c.type === 'date' || c.type === 'datetime') {
      for (const d of c.table.columns) if (d.derived?.base === c) cols.add(d)
      const marked = c.table.def.dateColumn && c.table.def.dateColumn.toLowerCase() === c.name.toLowerCase()
      const isKey = model.relationships.some((r) => r.to === c)
      if (marked || isKey || f.dateFilter) {
        if (marked || isKey) tables.add(c.table)
      }
    }
  }
  return { cols, tables }
}
