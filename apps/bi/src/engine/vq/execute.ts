// Execução das consultas dos visuais.
import type { Node } from '../dax/ast'
import { Ctx } from '../dax/context'
import type { Evaluator } from '../dax/evaluator'
import { DaxError } from '../dax/parser'
import { FilterContext, ValuesFilter, type Filter } from '../dax/filter'
import { compareOp, sortCompare } from '../dax/values'
import { type DataType, DateVal, type Scalar } from '../data/types'
import { MS_PER_DAY, addMonths, dateOnly, endOfMonth, endOfQuarter, endOfYear, startOfMonth, startOfQuarter, startOfWeek, startOfYear, todayNaive } from '../data/dates'
import { type ColRT, type NormKey, type TableRT, normKey } from '../model/runtime'
import { DATE_LEVEL_LABEL, datePartColumnName } from '../model/types'
import { fromJsonScalar, toJsonScalar, type JsonScalar } from '../query/types'
import { AGGREGATION_LABEL, type Aggregation, type AdvancedOp, type FieldRef, type VQColumn, type VQFilter, type VQResult, type VQSetResult, type VisualQuery } from './types'

const POS = { start: 0, end: 0 }

function refNode(table: string, name: string): Node {
  return { k: 'ref', table, name, pos: POS }
}

const AGG_FN: Record<Exclude<Aggregation, 'none'>, string> = {
  sum: 'SUM',
  avg: 'AVERAGE',
  min: 'MIN',
  max: 'MAX',
  count: 'COUNTA',
  countDistinct: 'DISTINCTCOUNT',
  median: 'MEDIAN',
  stdev: 'STDEV.S',
  variance: 'VAR.S',
  first: 'MIN',
  last: 'MAX'
}

export interface ResolvedValue {
  node: Node
  name: string
  type: DataType
  format?: string
}

function textMatch(op: AdvancedOp, v: Scalar, target: string): boolean {
  const s = v === null ? '' : String(v instanceof DateVal ? v.toString() : v).toLowerCase()
  const t = target.toLowerCase()
  switch (op) {
    case 'contains':
      return s.includes(t)
    case 'notContains':
      return !s.includes(t)
    case 'startsWith':
      return s.startsWith(t)
    case 'notStartsWith':
      return !s.startsWith(t)
    case 'endsWith':
      return s.endsWith(t)
    default:
      return false
  }
}

export function testCondition(op: AdvancedOp, v: Scalar, target: Scalar): boolean {
  switch (op) {
    case 'isBlank':
      return v === null
    case 'isNotBlank':
      return v !== null
    case 'isEmpty':
      return v === null || v === ''
    case 'isNotEmpty':
      return v !== null && v !== ''
    case 'contains':
    case 'notContains':
    case 'startsWith':
    case 'notStartsWith':
    case 'endsWith':
      return textMatch(op, v, target === null ? '' : String(target))
    default: {
      if (v === null && op !== 'eq' && op !== 'ne') return false
      const sym = { eq: '=', ne: '<>', gt: '>', ge: '>=', lt: '<', le: '<=' }[op]
      try {
        return compareOp(sym, v, target)
      } catch {
        return op === 'ne'
      }
    }
  }
}

export class VisualQueryEngine {
  constructor(readonly ev: Evaluator) {}

  get model() {
    return this.ev.model
  }

  table(name: string): TableRT {
    const t = this.model.table(name)
    if (!t) throw new DaxError(`A tabela "${name}" não existe no modelo.`)
    return t
  }

  resolveColumn(f: FieldRef): ColRT {
    const t = this.table(f.table)
    if (!f.column) throw new DaxError('Campo sem coluna.')
    const name = f.level ? datePartColumnName(f.column, f.level) : f.column
    const c = t.column(name)
    if (!c) throw new DaxError(`A coluna "${f.column}"${f.level ? ` (${DATE_LEVEL_LABEL[f.level]})` : ''} não existe na tabela "${t.name}".`)
    return c
  }

  fieldName(f: FieldRef): string {
    if (f.measure) return f.measure
    const base = f.level ? DATE_LEVEL_LABEL[f.level] : (f.column ?? '')
    if (!f.aggregation || f.aggregation === 'none') return base
    const label = AGGREGATION_LABEL[f.aggregation]
    return `${label} de ${base}`
  }

  resolveValue(f: FieldRef): ResolvedValue {
    if (f.measure) {
      const t = this.table(f.table)
      const m = t.measures.find((x) => x.name.toLowerCase() === f.measure!.toLowerCase()) ?? this.model.measure(f.measure)
      if (!m) throw new DaxError(`A medida "${f.measure}" não existe.`)
      return { node: refNode(m.table.name, m.name), name: m.name, type: 'number', format: m.def.formatString }
    }
    const col = this.resolveColumn(f)
    const agg = f.aggregation && f.aggregation !== 'none' ? f.aggregation : col.type === 'text' || col.type === 'bool' ? 'count' : 'sum'
    const node: Node = { k: 'call', name: AGG_FN[agg], args: [refNode(col.table.name, col.name)], pos: POS }
    const keepsType = agg === 'min' || agg === 'max' || agg === 'first' || agg === 'last'
    const isCount = agg === 'count' || agg === 'countDistinct'
    const type: DataType = keepsType ? col.type : isCount ? 'int' : 'number'
    const format = isCount ? '#,0' : keepsType || agg === 'sum' || agg === 'avg' ? col.def?.formatString : undefined
    return { node, name: this.fieldName({ ...f, aggregation: agg }), type, format }
  }

  // --------------------------------------------------------------------
  // Filtros
  // --------------------------------------------------------------------

  private distinctWithBlank(col: ColRT): { values: Scalar[]; keys: NormKey[] } {
    const idx = col.valueIndex
    const values = [...idx.values]
    const keys = [...idx.keys]
    if (idx.blankId < 0 && this.ev.hasBlankRow(col.table)) {
      values.push(null)
      keys.push(null)
    }
    return { values, keys }
  }

  private valueFilter(col: ColRT, pred: (v: Scalar) => boolean): ValuesFilter {
    const { values, keys } = this.distinctWithBlank(col)
    const keep: NormKey[] = []
    values.forEach((v, i) => {
      if (pred(v)) keep.push(keys[i])
    })
    return ValuesFilter.single(col, keep)
  }

  relativeRange(f: Extract<VQFilter, { kind: 'relativeDate' }>): [number, number] {
    const today = todayNaive()
    const n = Math.max(1, Math.floor(f.count || 1))
    const shift = (ms: number, k: number): number => {
      switch (f.unit) {
        case 'day':
          return ms + k * MS_PER_DAY
        case 'week':
          return ms + k * 7 * MS_PER_DAY
        case 'month':
          return addMonths(ms, k)
        case 'quarter':
          return addMonths(ms, 3 * k)
        default:
          return addMonths(ms, 12 * k)
      }
    }
    if (f.mode === 'this') {
      switch (f.unit) {
        case 'day':
          return [today, today]
        case 'week':
          return [startOfWeek(today), startOfWeek(today) + 6 * MS_PER_DAY]
        case 'month':
          return [startOfMonth(today), endOfMonth(today)]
        case 'quarter':
          return [startOfQuarter(today), endOfQuarter(today)]
        default:
          return [startOfYear(today), endOfYear(today)]
      }
    }
    if (f.mode === 'last') {
      const hi = f.includeToday === false ? today - MS_PER_DAY : today
      return [shift(hi, -n) + MS_PER_DAY, hi]
    }
    const lo = f.includeToday === false ? today + MS_PER_DAY : today
    return [lo, shift(lo, n) - MS_PER_DAY]
  }

  buildFilter(vf: VQFilter, fc: FilterContext): Filter | null {
    switch (vf.kind) {
      case 'in': {
        const col = this.resolveColumn(vf.field)
        const keys = vf.values.map((v) => normKey(fromJsonScalar(v)))
        if (!vf.not) return ValuesFilter.single(col, keys)
        const ex = new Set(keys)
        return this.valueFilter(col, (v) => !ex.has(normKey(v)))
      }
      case 'tuple': {
        const cols = vf.fields.map((f) => this.resolveColumn(f))
        const tuples = vf.tuples.map((t) => t.map((v) => normKey(fromJsonScalar(v))))
        if (cols.length === 1) return ValuesFilter.single(cols[0], tuples.map((t) => t[0]))
        return new ValuesFilter(cols, tuples)
      }
      case 'advanced': {
        const col = this.resolveColumn(vf.field)
        const conds = vf.conditions.filter((c) => c.op)
        if (!conds.length) return null
        return this.valueFilter(col, (v) => {
          const r = conds.map((c) => testCondition(c.op, v, fromJsonScalar(c.value ?? null)))
          return vf.logic === 'or' ? r.some(Boolean) : r.every(Boolean)
        })
      }
      case 'range': {
        const col = this.resolveColumn(vf.field)
        const lo = vf.min === undefined || vf.min === null ? null : fromJsonScalar(vf.min)
        const hi = vf.max === undefined || vf.max === null ? null : fromJsonScalar(vf.max)
        if (lo === null && hi === null) return null
        return this.valueFilter(col, (v) => {
          if (v === null) return false
          try {
            if (lo !== null && compareOp('<', v, lo)) return false
            if (hi !== null && compareOp('>', v, hi)) return false
          } catch {
            return false
          }
          return true
        })
      }
      case 'relativeDate': {
        const col = this.resolveColumn(vf.field)
        const [lo, hi] = this.relativeRange(vf)
        return this.valueFilter(col, (v) => {
          if (!(v instanceof DateVal)) return false
          const x = dateOnly(v.ms)
          return x >= lo && x <= hi
        })
      }
      case 'topN': {
        const col = this.resolveColumn(vf.field)
        const by = this.resolveValue(vf.by)
        const values = this.ev.distinctValues(col, fc, true).data[0]
        const scored: { v: Scalar; s: Scalar }[] = []
        for (const v of values) {
          const g = ValuesFilter.single(col, [normKey(v)])
          const s = this.ev.scalar(by.node, new Ctx(fc.addFilters([g])))
          if (s !== null) scored.push({ v, s })
        }
        scored.sort((a, b) => (vf.bottom ? sortCompare(a.s, b.s) : -sortCompare(a.s, b.s)))
        const n = Math.max(0, Math.floor(vf.n))
        let end = Math.min(n, scored.length)
        while (end < scored.length && end > 0 && sortCompare(scored[end].s, scored[end - 1].s) === 0) end++
        return ValuesFilter.single(
          col,
          scored.slice(0, end).map((x) => normKey(x.v))
        )
      }
      case 'measure':
        return null
    }
  }

  buildContext(filters: VQFilter[]): FilterContext {
    let fc = FilterContext.empty(this.model)
    const normal = filters.filter((f) => f.kind !== 'topN' && f.kind !== 'measure')
    const topn = filters.filter((f) => f.kind === 'topN')
    const fs: Filter[] = []
    for (const f of normal) {
      const x = this.buildFilter(f, fc)
      if (x) fs.push(x)
    }
    fc = fc.addFilters(fs)
    for (const f of topn) {
      const x = this.buildFilter(f, fc)
      if (x) fc = fc.addFilters([x])
    }
    return fc
  }

  // --------------------------------------------------------------------
  // Grupos
  // --------------------------------------------------------------------

  private findBridge(tables: TableRT[], fc: FilterContext): TableRT | null {
    let best: TableRT | null = null
    for (const f of this.model.tables) {
      if (!tables.every((t) => t === f || this.model.manyToOnePath(f, t, fc.rel))) continue
      if (!best || f.rowCount > best.rowCount) best = f
    }
    return best
  }

  private combos(cols: ColRT[], fc: FilterContext, allCombos: boolean): Scalar[][] {
    if (cols.length === 0) return [[]]
    const tables = [...new Set(cols.map((c) => c.table))]
    const perTable = (t: TableRT, tcols: ColRT[], visibleOnly: boolean): Scalar[][] => {
      const rows = visibleOnly ? fc.visibleRows(t) : t.allRows()
      const idx = tcols.map((c) => c.valueIndex)
      const seen = new Set<string>()
      const out: Scalar[][] = []
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        let k = ''
        for (let c = 0; c < tcols.length; c++) k += (c ? ',' : '') + idx[c].ids[r]
        if (seen.has(k)) continue
        seen.add(k)
        out.push(tcols.map((_, c) => idx[c].values[idx[c].ids[r]]))
      }
      if ((visibleOnly ? this.ev.blankRowVisible(t, fc) : this.ev.hasBlankRow(t)) && !out.some((v) => v.every((x) => x === null))) {
        out.push(tcols.map(() => null))
      }
      return out
    }
    const cross = (visibleOnly: boolean): Scalar[][] => {
      let acc: { vals: Scalar[]; order: ColRT[] } [] = [{ vals: [], order: [] }]
      for (const t of tables) {
        const tcols = cols.filter((c) => c.table === t)
        const part = perTable(t, tcols, visibleOnly)
        const next: { vals: Scalar[]; order: ColRT[] }[] = []
        for (const a of acc) for (const p of part) next.push({ vals: [...a.vals, ...p], order: [...a.order, ...tcols] })
        if (next.length > 200_000) throw new DaxError('O visual tem combinações demais para exibir. Aplique filtros.')
        acc = next
      }
      // reordena as colunas para a ordem pedida
      return acc.map((a) => cols.map((c) => a.vals[a.order.indexOf(c)]))
    }
    if (allCombos) return cross(false)
    if (tables.length === 1) {
      const out = perTable(tables[0], cols, true)
      return out
    }
    const bridge = this.findBridge(tables, fc)
    if (!bridge) return cross(true)
    // Combinações existentes na tabela ponte (fato).
    const rows = fc.visibleRows(bridge)
    const lookups = cols.map((c) => {
      if (c.table === bridge) return null
      const n = bridge.rowCount
      const lk = new Int32Array(n)
      for (let r = 0; r < n; r++) lk[r] = this.model.relatedRow(bridge, r, c.table, fc.rel)
      return lk
    })
    const idx = cols.map((c) => c.valueIndex)
    const seen = new Set<string>()
    const out: Scalar[][] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      let k = ''
      const vals: Scalar[] = []
      for (let c = 0; c < cols.length; c++) {
        const lk = lookups[c]
        const rr = lk ? lk[r] : r
        const id = rr < 0 ? -1 : idx[c].ids[rr]
        k += (c ? ',' : '') + id
        vals.push(rr < 0 ? null : idx[c].values[id])
      }
      if (seen.has(k)) continue
      seen.add(k)
      out.push(vals)
    }
    return out
  }

  private sortKeyFn(col: ColRT): (v: Scalar) => Scalar {
    const sb = col.def?.sortByColumn ? col.table.column(col.def.sortByColumn) : undefined
    if (!sb) return (v) => v
    const idx = col.valueIndex
    const map = new Map<NormKey, Scalar>()
    for (let id = 0; id < idx.distinctCount; id++) {
      const rows = idx.rowsOf(id)
      map.set(idx.keys[id], rows.length ? sb.data.get(rows[0]) : null)
    }
    return (v) => (map.has(normKey(v)) ? map.get(normKey(v))! : v)
  }

  // --------------------------------------------------------------------
  // Execução
  // --------------------------------------------------------------------

  execute(q: VisualQuery): VQResult {
    const t0 = performance.now()
    this.ev.clearCache()
    const groupCols = q.groupBy.map((f) => this.resolveColumn(f))
    const values = q.values.map((f) => this.resolveValue(f))
    const baseRaw = this.buildContext(q.filters)
    const base = baseRaw.withShadow(baseRaw)
    const filterCache = new Map<number, Map<NormKey, ValuesFilter>>()
    const groupFilter = (col: ColRT, v: Scalar): ValuesFilter => {
      let m = filterCache.get(col.id)
      if (!m) {
        m = new Map()
        filterCache.set(col.id, m)
      }
      const k = normKey(v)
      let f = m.get(k)
      if (!f) {
        f = ValuesFilter.single(col, [k])
        f.isGroup = true
        m.set(k, f)
      }
      return f
    }
    const evalValues = (fc: FilterContext): Scalar[] => values.map((v) => this.ev.scalar(v.node, new Ctx(fc)))

    let combos = this.combos(groupCols, base, !!q.showItemsWithNoData)
    let rows: { keys: Scalar[]; values: Scalar[] }[] = []
    for (const combo of combos) {
      const fc = groupCols.length ? base.addFilters(groupCols.map((c, i) => groupFilter(c, combo[i]))) : base
      const vals = evalValues(fc)
      if (values.length && !q.showItemsWithNoData && vals.every((v) => v === null)) continue
      rows.push({ keys: combo, values: vals })
    }
    combos = []

    // Filtros sobre medidas (nível do visual)
    const measureFilters = q.filters.filter((f): f is Extract<VQFilter, { kind: 'measure' }> => f.kind === 'measure')
    for (const mf of measureFilters) {
      const rv = this.resolveValue(mf.field)
      const target = fromJsonScalar(mf.value ?? null)
      rows = rows.filter((r) => {
        const fc = groupCols.length ? base.addFilters(groupCols.map((c, i) => groupFilter(c, r.keys[i]))) : base
        const v = this.ev.scalar(rv.node, new Ctx(fc))
        return testCondition(mf.op, v, target)
      })
    }

    // Ordenação
    const sortFns = groupCols.map((c) => this.sortKeyFn(c))
    const sortKeys = rows.map((r) => r.keys.map((k, i) => sortFns[i](k)))
    const orderIdx = rows.map((_, i) => i)
    const orderBy = q.orderBy && q.orderBy.length ? q.orderBy : groupCols.map((_, i) => ({ kind: 'group' as const, index: i, desc: false }))
    orderIdx.sort((a, b) => {
      for (const o of orderBy) {
        const va = o.kind === 'group' ? sortKeys[a][o.index] : rows[a].values[o.index]
        const vb = o.kind === 'group' ? sortKeys[b][o.index] : rows[b].values[o.index]
        const c = sortCompare(va ?? null, vb ?? null)
        if (c) return o.desc ? -c : c
      }
      return a - b
    })
    const rowCount = orderIdx.length
    const limit = q.limit ?? 100_000
    const truncated = rowCount > limit
    const finalIdx = truncated ? orderIdx.slice(0, limit) : orderIdx
    const finalRows = finalIdx.map((i) => rows[i])

    // Realce (destaque cruzado)
    let highlights: JsonScalar[][] | undefined
    if (q.highlight && q.highlight.length) {
      const hs: Filter[] = []
      for (const h of q.highlight) {
        const f = this.buildFilter(h, base)
        if (f) hs.push(f)
      }
      const hbase = base.addFilters(hs)
      highlights = finalRows.map((r) => {
        const fc = groupCols.length ? hbase.addFilters(groupCols.map((c, i) => groupFilter(c, r.keys[i]))) : hbase
        return evalValues(fc).map(toJsonScalar)
      })
    }

    // Conjuntos de agrupamento (totais e subtotais)
    const sets: VQSetResult[] = []
    for (const set of q.groupingSets ?? []) {
      const idxs = [...set].sort((a, b) => a - b)
      const seen = new Map<string, Scalar[]>()
      for (const r of finalRows) {
        const keys = idxs.map((i) => r.keys[i])
        const k = keys.map((v) => String(normKey(v))).join('\u0001')
        if (!seen.has(k)) seen.set(k, keys)
      }
      const out: VQSetResult['rows'] = []
      for (const keys of seen.values()) {
        const fc = idxs.length ? base.addFilters(idxs.map((gi, j) => groupFilter(groupCols[gi], keys[j]))) : base
        out.push({ keys: keys.map(toJsonScalar), values: evalValues(fc).map(toJsonScalar) })
      }
      sets.push({ indexes: idxs, rows: out })
    }

    const columns: VQColumn[] = [
      ...groupCols.map((c, i) => ({
        name: this.fieldName(q.groupBy[i]),
        kind: 'group' as const,
        type: c.type,
        format: c.derived ? undefined : c.def?.formatString,
        field: q.groupBy[i]
      })),
      ...values.map((v, i) => ({ name: v.name, kind: 'value' as const, type: v.type, format: v.format, field: q.values[i] }))
    ]
    const result: VQResult = {
      columns,
      rows: finalRows.map((r) => [...r.keys.map(toJsonScalar), ...r.values.map(toJsonScalar)]),
      highlights,
      sortKeys: groupCols.some((c) => c.def?.sortByColumn) ? finalIdx.map((i) => sortKeys[i].map(toJsonScalar)) : undefined,
      sets,
      rowCount,
      truncated,
      elapsedMs: performance.now() - t0
    }
    return result
  }
}
