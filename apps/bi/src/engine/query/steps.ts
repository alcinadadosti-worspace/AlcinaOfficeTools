// Implementação das etapas do editor de consultas (funções puras sobre tabelas).
import { Column, ColumnBuilder, type TextData } from '../data/column'
import { DataTable } from '../data/table'
import { type DataType, DateVal, type Scalar, isDateType, isNumericType } from '../data/types'
import { CULTURE_PT_BR, ConversionError, type CultureOptions, convertColumn, convertValue, scalarToText } from '../data/convert'
import {
  DAY_NAMES_PT,
  MONTH_NAMES_PT,
  MS_PER_DAY,
  OLE_EPOCH_MS,
  dateOnly,
  day,
  dayOfYear,
  daysInMonth,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  hour,
  minute,
  month,
  nowNaive,
  quarter,
  second,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  timeOfDay,
  weekday0,
  weekNum,
  year
} from '../data/dates'
import { compareOrdinal, compareScalars, hashKey, roundNumber, rowKeyFn, scalarEquals, sortRanks } from '../data/ops'
import { commonScalarType } from '../io/values'
import { compileMPredicate, evaluateColumnExpression, properCase } from './mexpr'
import { type CondOp, type DatePart, type GroupAggregation, type JsonScalar, type NumberTransform, type RowCondition, type StepOp, type TextTransform, fromJsonScalar } from './types'

/** Contexto de execução das etapas. */
export interface StepContext {
  culture: CultureOptions
  /** Tabela final de outra consulta (as dependências já foram avaliadas). */
  getQuery: (queryId: string) => DataTable
  /** Nome de exibição de uma consulta. */
  queryName: (queryId: string) => string
}

export class StepError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StepError'
  }
}

export function defaultStepContext(partial: Partial<StepContext> = {}): StepContext {
  return {
    culture: partial.culture ?? CULTURE_PT_BR,
    getQuery:
      partial.getQuery ??
      ((id) => {
        throw new StepError(`A consulta "${id}" não está disponível.`)
      }),
    queryName: partial.queryName ?? ((id) => id)
  }
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function requireCol(t: DataTable, name: string, tableLabel?: string): Column {
  const c = t.column(name)
  if (!c) {
    throw new StepError(
      tableLabel ? `A coluna "${name}" da tabela "${tableLabel}" não foi encontrada.` : `A coluna "${name}" da tabela não foi encontrada.`
    )
  }
  return c
}

function copyCell(b: ColumnBuilder, col: Column, r: number): void {
  if (col.hasError(r)) b.pushError(col.errorMessage ?? undefined)
  else b.push(col.get(r))
}

function rowsWhere(n: number, pred: (r: number) => boolean): Int32Array {
  const out: number[] = []
  for (let r = 0; r < n; r++) if (pred(r)) out.push(r)
  return Int32Array.from(out)
}

function assertUniqueName(t: DataTable, name: string, ignore?: string): void {
  const low = name.toLowerCase()
  for (const c of t.columns) {
    if (ignore !== undefined && c.name === ignore) continue
    if (c.name.toLowerCase() === low) throw new StepError(`Já existe uma coluna chamada "${name}".`)
  }
}

function uniqueAmong(base: string, taken: Set<string>): string {
  let name = base
  let k = 1
  while (taken.has(name.toLowerCase())) name = `${base}.${k++}`
  taken.add(name.toLowerCase())
  return name
}

function asText(v: Scalar, culture: CultureOptions): string | null {
  if (v === null) return null
  return typeof v === 'string' ? v : scalarToText(v, culture)
}

/** Mapeia os valores de uma coluna de texto pelo dicionário (com remoção de duplicatas). */
function mapTextDict(col: Column, fn: (s: string) => string | null, name = col.name): Column {
  const d = col.data as TextData
  const dict: string[] = []
  const index = new Map<string, number>()
  const remap = new Int32Array(d.dict.length)
  for (let i = 0; i < d.dict.length; i++) {
    const s = fn(d.dict[i])
    if (s === null) {
      remap[i] = -1
      continue
    }
    let c = index.get(s)
    if (c === undefined) {
      c = dict.length
      dict.push(s)
      index.set(s, c)
    }
    remap[i] = c
  }
  const codes = new Int32Array(d.codes.length)
  for (let r = 0; r < codes.length; r++) {
    const c = d.codes[r]
    codes[r] = c < 0 ? -1 : remap[c]
  }
  return new Column(name, 'text', { kind: 'text', codes, dict }, col.errors, col.errorMessage)
}

/** Aplica uma função de texto a qualquer coluna, retornando coluna do tipo indicado. */
function mapAsText(
  col: Column,
  fn: (s: string) => Scalar,
  outType: DataType,
  culture: CultureOptions,
  name = col.name
): Column {
  if (col.data.kind === 'text' && outType === 'text') {
    return mapTextDict(col, (s) => fn(s) as string | null, name)
  }
  const n = col.length
  const b = new ColumnBuilder(outType, n)
  const d = col.data
  const cache = d.kind === 'text' ? new Map<number, Scalar>() : null
  for (let r = 0; r < n; r++) {
    if (col.hasError(r)) {
      b.pushError(col.errorMessage ?? undefined)
      continue
    }
    if (cache && d.kind === 'text') {
      const code = d.codes[r]
      if (code < 0) {
        b.push(null)
        continue
      }
      let v = cache.get(code)
      if (v === undefined) {
        v = fn(d.dict[code])
        cache.set(code, v)
      }
      b.push(v)
      continue
    }
    const s = asText(col.get(r), culture)
    b.push(s === null ? null : fn(s))
  }
  return b.build(name)
}

// ---------------------------------------------------------------------------
// Condições (filtros e colunas condicionais)
// ---------------------------------------------------------------------------

const TEXT_OPS = new Set<CondOp>(['contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith'])

/** Avalia um operador de comparação com semântica de nulos do M. */
export function evalCompare(op: CondOp, v: Scalar, w: Scalar, caseSensitive: boolean, culture: CultureOptions): boolean | null {
  switch (op) {
    case 'isNull':
      return v === null
    case 'isNotNull':
      return v !== null
    case 'isEmpty':
      return v === null || v === ''
    case 'isNotEmpty':
      return !(v === null || v === '')
    case 'eq':
      return scalarEquals(v, w, caseSensitive)
    case 'ne':
      return !scalarEquals(v, w, caseSensitive)
    case 'gt':
    case 'ge':
    case 'lt':
    case 'le': {
      if (v === null || w === null) return null
      let a = v
      let b = w
      if (!caseSensitive && typeof a === 'string' && typeof b === 'string') {
        a = a.toLowerCase()
        b = b.toLowerCase()
      }
      const sameKind =
        (typeof a === 'number' && typeof b === 'number') ||
        (typeof a === 'string' && typeof b === 'string') ||
        (typeof a === 'boolean' && typeof b === 'boolean') ||
        (a instanceof DateVal && b instanceof DateVal)
      if (!sameKind) return null
      const c = compareOrdinal(a, b)
      return op === 'gt' ? c > 0 : op === 'ge' ? c >= 0 : op === 'lt' ? c < 0 : c <= 0
    }
    default: {
      if (v === null) return null
      let s = asText(v, culture) ?? ''
      let sub = asText(w, culture) ?? ''
      if (!caseSensitive) {
        s = s.toLowerCase()
        sub = sub.toLowerCase()
      }
      switch (op) {
        case 'contains':
          return s.includes(sub)
        case 'notContains':
          return !s.includes(sub)
        case 'startsWith':
          return s.startsWith(sub)
        case 'notStartsWith':
          return !s.startsWith(sub)
        case 'endsWith':
          return s.endsWith(sub)
        case 'notEndsWith':
          return !s.endsWith(sub)
      }
      return null
    }
  }
}

/** Converte o valor de comparação para o tipo da coluna quando possível. */
function typedValue(value: JsonScalar | undefined, col: Column, op: CondOp, culture: CultureOptions): Scalar {
  const v = fromJsonScalar(value)
  if (v === null || TEXT_OPS.has(op)) return v
  if (col.type === 'text' || col.type === 'any') return v
  if (typeof v === 'string' || typeof v === 'number') {
    const c = convertValue(v, col.type, culture)
    if (!(c instanceof ConversionError)) return c
  }
  if (v instanceof DateVal && isDateType(col.type)) {
    const c = convertValue(v, col.type, culture)
    if (!(c instanceof ConversionError)) return c
  }
  return v
}

/** Compila uma condição de linha em predicado de três valores. */
export function compileCondition(cond: RowCondition, t: DataTable, culture: CultureOptions): (r: number) => boolean | null {
  switch (cond.kind) {
    case 'compare': {
      const col = requireCol(t, cond.column)
      const other = cond.valueColumn ? requireCol(t, cond.valueColumn) : null
      const value = other ? null : typedValue(cond.value, col, cond.operator, culture)
      const cs = cond.caseSensitive !== false
      const op = cond.operator
      return (r) => {
        if (col.hasError(r) || (other && other.hasError(r))) return null
        return evalCompare(op, col.get(r), other ? other.get(r) : value, cs, culture)
      }
    }
    case 'in': {
      const col = requireCol(t, cond.column)
      const set = new Set<unknown>()
      for (const raw of cond.values) set.add(hashKey(typedValue(raw, col, 'eq', culture)))
      const neg = !!cond.negate
      return (r) => {
        if (col.hasError(r)) return null
        const has = set.has(hashKey(col.get(r)))
        return neg ? !has : has
      }
    }
    case 'and': {
      const parts = cond.conditions.map((c) => compileCondition(c, t, culture))
      return (r) => {
        let sawNull = false
        for (const p of parts) {
          const v = p(r)
          if (v === false) return false
          if (v === null) sawNull = true
        }
        return sawNull ? null : true
      }
    }
    case 'or': {
      const parts = cond.conditions.map((c) => compileCondition(c, t, culture))
      return (r) => {
        let sawNull = false
        for (const p of parts) {
          const v = p(r)
          if (v === true) return true
          if (v === null) sawNull = true
        }
        return sawNull ? null : false
      }
    }
    case 'not': {
      const p = compileCondition(cond.condition, t, culture)
      return (r) => {
        const v = p(r)
        return v === null ? null : !v
      }
    }
    case 'expression':
      return compileMPredicate(cond.expression, t, culture)
  }
}

// ---------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------

function promoteHeaders(t: DataTable, culture: CultureOptions): DataTable {
  if (t.rowCount === 0) return t
  const taken = new Set<string>()
  const names = t.columns.map((c, i) => {
    const v = c.hasError(0) ? null : c.get(0)
    const raw = v === null ? '' : (asText(v, culture) ?? '')
    const base = raw === '' ? `Column${i + 1}` : raw
    let name = base
    let k = 1
    while (taken.has(name.toLowerCase())) name = `${base}_${k++}`
    taken.add(name.toLowerCase())
    return name
  })
  const body = t.slice(1, t.rowCount)
  return new DataTable(
    body.columns.map((c, i) => c.rename(names[i])),
    body.rowCount
  )
}

function demoteHeaders(t: DataTable): DataTable {
  const n = t.rowCount
  const cols = t.columns.map((c, i) => {
    const b = new ColumnBuilder(c.type === 'text' ? 'text' : 'any', n + 1)
    b.push(c.name)
    for (let r = 0; r < n; r++) copyCell(b, c, r)
    return b.build(`Column${i + 1}`)
  })
  return new DataTable(cols, n + 1)
}

function changeTypes(t: DataTable, op: Extract<StepOp, { op: 'changeTypes' }>, ctx: StepContext): DataTable {
  const culture = op.culture ?? ctx.culture
  const cols = [...t.columns]
  for (const { column, type } of op.columns) {
    const i = t.indexOf(column)
    if (i < 0) throw new StepError(`A coluna "${column}" da tabela não foi encontrada.`)
    cols[i] = convertColumn(cols[i], type, culture)
  }
  return new DataTable(cols, t.rowCount)
}

function removeColumns(t: DataTable, names: string[]): DataTable {
  const drop = new Set<number>()
  for (const n of names) {
    const i = t.indexOf(n)
    if (i < 0) throw new StepError(`A coluna "${n}" da tabela não foi encontrada.`)
    drop.add(i)
  }
  return new DataTable(
    t.columns.filter((_, i) => !drop.has(i)),
    t.rowCount
  )
}

function selectColumns(t: DataTable, names: string[]): DataTable {
  const seen = new Set<number>()
  const cols: Column[] = []
  for (const n of names) {
    const i = t.indexOf(n)
    if (i < 0) throw new StepError(`A coluna "${n}" da tabela não foi encontrada.`)
    if (seen.has(i)) continue
    seen.add(i)
    cols.push(t.columns[i])
  }
  return new DataTable(cols, t.rowCount)
}

function renameColumns(t: DataTable, renames: { from: string; to: string }[]): DataTable {
  const names = t.columnNames()
  for (const { from, to } of renames) {
    const i = t.indexOf(from)
    if (i < 0) throw new StepError(`A coluna "${from}" da tabela não foi encontrada.`)
    if (!to.trim()) throw new StepError('O nome da coluna não pode ficar vazio.')
    names[i] = to
  }
  const seen = new Set<string>()
  for (const n of names) {
    const low = n.toLowerCase()
    if (seen.has(low)) throw new StepError(`Já existe uma coluna chamada "${n}".`)
    seen.add(low)
  }
  return new DataTable(
    t.columns.map((c, i) => (c.name === names[i] ? c : c.rename(names[i]))),
    t.rowCount
  )
}

function reorderColumns(t: DataTable, order: string[]): DataTable {
  const idx = order.map((n) => {
    const i = t.indexOf(n)
    if (i < 0) throw new StepError(`A coluna "${n}" da tabela não foi encontrada.`)
    return i
  })
  const positions = [...new Set(idx)].sort((a, b) => a - b)
  const unique = [...new Set(idx)]
  const cols = [...t.columns]
  positions.forEach((p, k) => {
    cols[p] = t.columns[unique[k]]
  })
  return new DataTable(cols, t.rowCount)
}

function keepRows(t: DataTable, op: Extract<StepOp, { op: 'keepRows' }>): DataTable {
  const n = t.rowCount
  const count = Math.max(0, Math.floor(op.count))
  switch (op.mode) {
    case 'top':
      return t.slice(0, count)
    case 'bottom':
      return t.slice(Math.max(0, n - count), n)
    default: {
      const off = Math.max(0, Math.floor(op.offset ?? 0))
      return t.slice(off, off + count)
    }
  }
}

function removeRows(t: DataTable, op: Extract<StepOp, { op: 'removeRows' }>): DataTable {
  const n = t.rowCount
  switch (op.mode) {
    case 'top':
      return t.slice(Math.max(0, Math.floor(op.count ?? 1)), n)
    case 'bottom':
      return t.slice(0, Math.max(0, n - Math.floor(op.count ?? 1)))
    case 'alternate': {
      const off = Math.max(0, Math.floor(op.offset ?? 0))
      const rem = Math.max(1, Math.floor(op.count ?? 1))
      const keep = Math.max(0, Math.floor(op.keep ?? 1))
      return t.take(rowsWhere(n, (r) => r < off || (r - off) % (rem + keep) >= rem))
    }
    case 'blank': {
      const cols = op.columns?.length ? op.columns.map((c) => requireCol(t, c)) : t.columns
      return t.take(
        rowsWhere(n, (r) => {
          for (const c of cols) {
            if (c.hasError(r)) return true
            const v = c.get(r)
            if (v !== null && v !== '') return true
          }
          return false
        })
      )
    }
    case 'errors': {
      const cols = op.columns?.length ? op.columns.map((c) => requireCol(t, c)) : t.columns
      const withErr = cols.filter((c) => c.errors)
      if (!withErr.length) return t
      return t.take(rowsWhere(n, (r) => !withErr.some((c) => c.hasError(r))))
    }
  }
}

function duplicates(t: DataTable, columns: string[], keepDup: boolean): DataTable {
  const cols = columns.length ? columns.map((c) => requireCol(t, c)) : t.columns
  if (!cols.length) return t
  const key = rowKeyFn(cols)
  const n = t.rowCount
  if (!keepDup) {
    const seen = new Set<unknown>()
    return t.take(
      rowsWhere(n, (r) => {
        const k = key(r)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    )
  }
  const counts = new Map<unknown, number>()
  const keys: unknown[] = new Array(n)
  for (let r = 0; r < n; r++) {
    const k = key(r)
    keys[r] = k
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return t.take(rowsWhere(n, (r) => (counts.get(keys[r]) ?? 0) > 1))
}

function sortRows(t: DataTable, keys: { column: string; desc: boolean }[]): DataTable {
  if (!keys.length) return t
  const ks = keys.map((k) => ({ ranks: sortRanks(requireCol(t, k.column)), desc: k.desc }))
  const idx: number[] = new Array(t.rowCount)
  for (let i = 0; i < idx.length; i++) idx[i] = i
  idx.sort((a, b) => {
    for (const k of ks) {
      const x = k.ranks[a]
      const y = k.ranks[b]
      if (x < y) return k.desc ? 1 : -1
      if (x > y) return k.desc ? -1 : 1
    }
    return a - b
  })
  return t.take(Int32Array.from(idx))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceValues(t: DataTable, op: Extract<StepOp, { op: 'replaceValues' }>, culture: CultureOptions): DataTable {
  const find = fromJsonScalar(op.find)
  const repl = fromJsonScalar(op.replace)
  const cs = op.caseSensitive !== false
  let out = t
  const targets = op.columns.length ? op.columns : t.columnNames()
  for (const name of targets) {
    const col = requireCol(out, name)
    let next: Column
    const textLike = col.type === 'text' || (col.type === 'any' && (typeof find === 'string' || find === null))
    if (textLike && col.data.kind === 'text' && find !== null) {
      const f = asText(find, culture) ?? ''
      const rText = repl === null ? null : (asText(repl, culture) ?? '')
      if (op.matchEntire) {
        next = mapTextDict(col, (s) => (cs ? s === f : s.toLowerCase() === f.toLowerCase()) ? rText : s)
      } else if (!f) {
        next = col
      } else {
        const re = new RegExp(escapeRegExp(f), cs ? 'g' : 'gi')
        const replacement = (rText ?? '').replace(/\$/g, '$$$$')
        next = mapTextDict(col, (s) => s.replace(re, replacement))
      }
    } else {
      // Substituição por valor (inclui nulos e colunas tipadas).
      let typedFind = find
      let typedRepl: Scalar = repl
      let outType: DataType = col.type
      if (col.type !== 'text' && col.type !== 'any') {
        if (find !== null) {
          const c = convertValue(find, col.type, culture)
          typedFind = c instanceof ConversionError ? find : c
        }
        if (repl !== null) {
          const c = convertValue(repl, col.type, culture)
          if (c instanceof ConversionError) outType = 'any'
          else typedRepl = c
        }
      } else if (col.type === 'text' && repl !== null && typeof repl !== 'string') {
        typedRepl = asText(repl, culture)
      }
      const fText = typeof typedFind === 'string' ? typedFind : null
      const re = !op.matchEntire && fText ? new RegExp(escapeRegExp(fText), cs ? 'g' : 'gi') : null
      const n = col.length
      const b = new ColumnBuilder(outType, n)
      for (let r = 0; r < n; r++) {
        if (col.hasError(r)) {
          b.pushError(col.errorMessage ?? undefined)
          continue
        }
        const v = col.get(r)
        if (re && typeof v === 'string') {
          b.push(v.replace(re, (asText(typedRepl, culture) ?? '').replace(/\$/g, '$$$$')))
        } else if (scalarEquals(v, typedFind, cs)) b.push(typedRepl)
        else b.push(v)
      }
      next = b.build(col.name)
    }
    out = out.replaceColumn(col.name, next)
  }
  return out
}

function replaceErrors(t: DataTable, columns: string[], value: JsonScalar, culture: CultureOptions): DataTable {
  const v = fromJsonScalar(value)
  let out = t
  const targets = columns.length ? columns : t.columnNames()
  for (const name of targets) {
    const col = requireCol(out, name)
    if (!col.errors) continue
    let typed: Scalar = v
    let type = col.type
    if (v !== null && type !== 'any') {
      const c = convertValue(v, type, culture)
      if (c instanceof ConversionError) type = 'any'
      else typed = c
    }
    const n = col.length
    const b = new ColumnBuilder(type, n)
    for (let r = 0; r < n; r++) b.push(col.hasError(r) ? typed : col.get(r))
    out = out.replaceColumn(col.name, b.build(col.name))
  }
  return out
}

function fill(t: DataTable, columns: string[], direction: 'down' | 'up'): DataTable {
  let out = t
  const n = t.rowCount
  for (const name of columns) {
    const col = requireCol(out, name)
    const idx = new Int32Array(n)
    let last = -1
    if (direction === 'down') {
      for (let r = 0; r < n; r++) {
        if (!col.isBlank(r) || col.hasError(r)) last = r
        idx[r] = col.isBlank(r) && !col.hasError(r) ? last : r
      }
    } else {
      for (let r = n - 1; r >= 0; r--) {
        if (!col.isBlank(r) || col.hasError(r)) last = r
        idx[r] = col.isBlank(r) && !col.hasError(r) ? last : r
      }
    }
    out = out.replaceColumn(col.name, col.take(idx))
  }
  return out
}

function splitParts(s: string, op: Extract<StepOp, { op: 'splitColumn' }>): string[] {
  switch (op.mode) {
    case 'delimiter': {
      const d = op.delimiter ?? ','
      if (!d) return [s]
      const at = op.at ?? 'each'
      if (at === 'each') return s.split(d)
      const i = at === 'first' ? s.indexOf(d) : s.lastIndexOf(d)
      return i < 0 ? [s] : [s.slice(0, i), s.slice(i + d.length)]
    }
    case 'positions': {
      const ps = [...(op.positions ?? [0])].filter((p) => p >= 0).sort((a, b) => a - b)
      if (!ps.length) return [s]
      return ps.map((p, k) => s.slice(p, k + 1 < ps.length ? ps[k + 1] : undefined))
    }
    case 'length': {
      const L = Math.max(1, Math.floor(op.length ?? 1))
      const parts: string[] = []
      for (let i = 0; i < s.length; i += L) parts.push(s.slice(i, i + L))
      return parts.length ? parts : ['']
    }
  }
}

function splitColumn(t: DataTable, op: Extract<StepOp, { op: 'splitColumn' }>, culture: CultureOptions): DataTable {
  const col = requireCol(t, op.column)
  const pos = t.indexOf(col.name)
  const n = t.rowCount
  const cache = new Map<number, string[]>()
  const d = col.data
  const partsAt = (r: number): string[] | null => {
    if (d.kind === 'text') {
      const code = d.codes[r]
      if (code < 0) return null
      let p = cache.get(code)
      if (!p) {
        p = splitParts(d.dict[code], op)
        cache.set(code, p)
      }
      return p
    }
    const s = asText(col.get(r), culture)
    return s === null ? null : splitParts(s, op)
  }
  if (op.intoRows) {
    const rowIdx: number[] = []
    const b = new ColumnBuilder('text', n)
    for (let r = 0; r < n; r++) {
      if (col.hasError(r)) {
        rowIdx.push(r)
        b.pushError(col.errorMessage ?? undefined)
        continue
      }
      const parts = partsAt(r)
      if (!parts) {
        rowIdx.push(r)
        b.push(null)
        continue
      }
      for (const p of parts) {
        rowIdx.push(r)
        b.push(p)
      }
    }
    const base = t.take(Int32Array.from(rowIdx))
    return base.replaceColumn(col.name, b.build(col.name))
  }
  let nParts = op.parts ?? 0
  if (!nParts) {
    for (let r = 0; r < n; r++) {
      if (col.hasError(r)) continue
      const p = partsAt(r)
      if (p && p.length > nParts) nParts = p.length
    }
  }
  nParts = Math.max(1, nParts)
  const taken = new Set(t.columns.filter((c) => c !== col).map((c) => c.name.toLowerCase()))
  const builders = Array.from({ length: nParts }, () => new ColumnBuilder('text', n))
  for (let r = 0; r < n; r++) {
    if (col.hasError(r)) {
      for (const b of builders) b.pushError(col.errorMessage ?? undefined)
      continue
    }
    const parts = partsAt(r)
    for (let k = 0; k < nParts; k++) builders[k].push(parts && k < parts.length ? parts[k] : null)
  }
  const newCols = builders.map((b, k) => b.build(uniqueAmong(`${col.name}.${k + 1}`, taken)))
  const cols = [...t.columns]
  cols.splice(pos, 1, ...newCols)
  return new DataTable(cols, n)
}

function mergeColumns(t: DataTable, op: Extract<StepOp, { op: 'mergeColumns' }>, culture: CultureOptions): DataTable {
  const cols = op.columns.map((c) => requireCol(t, c))
  if (!cols.length) throw new StepError('Selecione ao menos uma coluna para mesclar.')
  const n = t.rowCount
  const b = new ColumnBuilder('text', n)
  for (let r = 0; r < n; r++) {
    let err: string | null = null
    const parts: string[] = []
    for (const c of cols) {
      if (c.hasError(r)) {
        err = c.errorMessage ?? 'Erro'
        break
      }
      const v = c.get(r)
      parts.push(v === null ? '' : (asText(v, culture) ?? ''))
    }
    if (err !== null) b.pushError(err)
    else b.push(parts.join(op.separator))
  }
  const merged = b.build(op.newName)
  if (op.keepOriginal) {
    assertUniqueName(t, op.newName)
    return t.addColumn(merged)
  }
  const removeIdx = new Set(cols.map((c) => t.indexOf(c.name)))
  const first = Math.min(...removeIdx)
  const remaining: Column[] = []
  let insertAt = 0
  t.columns.forEach((c, i) => {
    if (i === first) insertAt = remaining.length
    if (!removeIdx.has(i)) remaining.push(c)
  })
  const low = op.newName.toLowerCase()
  if (remaining.some((c) => c.name.toLowerCase() === low)) throw new StepError(`Já existe uma coluna chamada "${op.newName}".`)
  remaining.splice(insertAt, 0, merged)
  return new DataTable(remaining, n)
}

function textTransformFn(fn: TextTransform, arg: string | undefined): { f: (s: string) => Scalar; type: DataType } {
  switch (fn) {
    case 'lower':
      return { f: (s) => s.toLowerCase(), type: 'text' }
    case 'upper':
      return { f: (s) => s.toUpperCase(), type: 'text' }
    case 'capitalize':
      return { f: properCase, type: 'text' }
    case 'trim':
      return { f: (s) => s.trim(), type: 'text' }
    case 'clean':
      return { f: (s) => s.replace(/[\u0000-\u001f\u007f]/g, ''), type: 'text' }
    case 'prefix':
      return { f: (s) => (arg ?? '') + s, type: 'text' }
    case 'suffix':
      return { f: (s) => s + (arg ?? ''), type: 'text' }
    case 'length':
      return { f: (s) => s.length, type: 'int' }
    case 'reverse':
      return { f: (s) => [...s].reverse().join(''), type: 'text' }
    case 'removeSpaces':
      return { f: (s) => s.replace(/\s+/g, ''), type: 'text' }
  }
}

function newColumnName(base: string, columns: string[], colName: string): string {
  return columns.length > 1 ? `${base} (${colName})` : base
}

function transformText(t: DataTable, op: Extract<StepOp, { op: 'transformText' }>, culture: CultureOptions): DataTable {
  const { f, type } = textTransformFn(op.fn, op.arg)
  let out = t
  op.columns.forEach((name) => {
    const col = requireCol(t, name)
    if (op.newName) {
      const nn = newColumnName(op.newName, op.columns, col.name)
      assertUniqueName(out, nn)
      out = out.addColumn(mapAsText(col, f, type, culture, nn))
    } else {
      out = out.replaceColumn(col.name, mapAsText(col, f, type, culture))
    }
  })
  return out
}

function numberFn(fn: NumberTransform, arg: number | undefined): (x: number) => number | boolean {
  const a = arg ?? 0
  switch (fn) {
    case 'round':
      return (x) => roundNumber(x, a, 'toEven')
    case 'roundUp':
      return (x) => roundNumber(x, a, 'up')
    case 'roundDown':
      return (x) => roundNumber(x, a, 'down')
    case 'abs':
      return Math.abs
    case 'sqrt':
      return Math.sqrt
    case 'square':
      return (x) => x * x
    case 'add':
      return (x) => x + a
    case 'subtract':
      return (x) => x - a
    case 'multiply':
      return (x) => x * a
    case 'divide':
      return (x) => x / a
    case 'integerDivide':
      return (x) => Math.trunc(x / a)
    case 'mod':
      return (x) => x % a
    case 'power':
      return (x) => Math.pow(x, a)
    case 'negate':
      return (x) => -x
    case 'sign':
      return Math.sign
    case 'log10':
      return Math.log10
    case 'ln':
      return Math.log
    case 'exp':
      return Math.exp
    case 'percentage':
      return (x) => (x * a) / 100
    case 'isEven':
      return (x) => Math.abs(x % 2) === 0
    case 'isOdd':
      return (x) => Math.abs(x % 2) === 1
  }
}

function numberOutType(fn: NumberTransform, arg: number | undefined, src: DataType): DataType {
  const a = arg ?? 0
  const intArg = Number.isInteger(a)
  switch (fn) {
    case 'isEven':
    case 'isOdd':
      return 'bool'
    case 'round':
    case 'roundUp':
    case 'roundDown':
      return a <= 0 ? 'int' : src === 'currency' ? 'currency' : 'number'
    case 'integerDivide':
    case 'sign':
      return 'int'
    case 'abs':
    case 'negate':
    case 'square':
      return src === 'int' ? 'int' : src === 'currency' ? 'currency' : 'number'
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'mod':
      return src === 'int' && intArg ? 'int' : src === 'currency' ? 'currency' : 'number'
    case 'power':
      return src === 'int' && intArg && a >= 0 ? 'int' : 'number'
    default:
      return 'number'
  }
}

function transformNumber(t: DataTable, op: Extract<StepOp, { op: 'transformNumber' }>, culture: CultureOptions): DataTable {
  const f = numberFn(op.fn, op.arg)
  let out = t
  op.columns.forEach((name) => {
    const col = requireCol(t, name)
    const srcType: DataType = isNumericType(col.type) ? col.type : 'number'
    const type = numberOutType(op.fn, op.arg, srcType)
    const n = col.length
    const b = new ColumnBuilder(type, n)
    const numeric = col.data.kind === 'num' && !isDateType(col.type)
    for (let r = 0; r < n; r++) {
      if (col.hasError(r)) {
        b.pushError(col.errorMessage ?? undefined)
        continue
      }
      let x: number
      if (numeric) {
        x = col.num(r)
        if (x !== x) {
          b.push(null)
          continue
        }
      } else {
        const v = col.get(r)
        if (v === null) {
          b.push(null)
          continue
        }
        const c = convertValue(v, 'number', culture)
        if (c instanceof ConversionError || c === null) {
          b.pushError(c instanceof ConversionError ? c.message : undefined)
          continue
        }
        x = c as number
      }
      const y = f(x)
      if (typeof y === 'number' && type === 'int') b.push(Math.round(y))
      else b.push(y)
    }
    const nn = op.newName ? newColumnName(op.newName, op.columns, col.name) : col.name
    if (op.newName) {
      assertUniqueName(out, nn)
      out = out.addColumn(b.build(nn))
    } else out = out.replaceColumn(col.name, b.build(col.name))
  })
  return out
}

function datePartType(part: DatePart, src: DataType): DataType {
  switch (part) {
    case 'monthName':
    case 'dayName':
      return 'text'
    case 'startOfYear':
    case 'endOfYear':
    case 'startOfMonth':
    case 'endOfMonth':
    case 'startOfQuarter':
    case 'endOfQuarter':
    case 'startOfWeek':
    case 'endOfWeek':
      return src === 'datetime' ? 'datetime' : 'date'
    case 'date':
      return 'date'
    case 'time':
      return 'time'
    case 'age':
      return 'number'
    default:
      return 'int'
  }
}

function datePartValue(part: DatePart, d: DateVal): Scalar {
  const ms = d.ms
  const dt = d.kind === 'datetime'
  const endOfDay = (x: number) => (dt ? x + MS_PER_DAY - 1 : x)
  const kindOut = dt ? 'datetime' : 'date'
  switch (part) {
    case 'year':
      return year(ms)
    case 'startOfYear':
      return new DateVal(startOfYear(ms), kindOut)
    case 'endOfYear':
      return new DateVal(endOfDay(endOfYear(ms)), kindOut)
    case 'month':
      return month(ms)
    case 'monthName':
      return MONTH_NAMES_PT[month(ms) - 1]
    case 'startOfMonth':
      return new DateVal(startOfMonth(ms), kindOut)
    case 'endOfMonth':
      return new DateVal(endOfDay(endOfMonth(ms)), kindOut)
    case 'daysInMonth':
      return daysInMonth(year(ms), month(ms))
    case 'quarter':
      return quarter(ms)
    case 'startOfQuarter':
      return new DateVal(startOfQuarter(ms), kindOut)
    case 'endOfQuarter':
      return new DateVal(endOfDay(endOfQuarter(ms)), kindOut)
    case 'weekOfYear':
      return weekNum(ms, 1)
    case 'weekOfMonth': {
      const som = startOfMonth(ms)
      return Math.floor((day(ms) - 1 + weekday0(som)) / 7) + 1
    }
    case 'startOfWeek':
      return new DateVal(dateOnly(ms) - weekday0(ms) * MS_PER_DAY, kindOut)
    case 'endOfWeek':
      return new DateVal(endOfDay(dateOnly(ms) + (6 - weekday0(ms)) * MS_PER_DAY), kindOut)
    case 'day':
      return day(ms)
    case 'dayOfWeek':
      return weekday0(ms)
    case 'dayOfYear':
      return dayOfYear(ms)
    case 'dayName':
      return DAY_NAMES_PT[weekday0(ms)]
    case 'date':
      return new DateVal(dateOnly(ms), 'date')
    case 'time':
      return new DateVal(OLE_EPOCH_MS + timeOfDay(ms), 'time')
    case 'hour':
      return hour(ms)
    case 'minute':
      return minute(ms)
    case 'second':
      return second(ms)
    case 'age':
      return (nowNaive() - ms) / MS_PER_DAY
  }
}

function datePart(t: DataTable, op: Extract<StepOp, { op: 'datePart' }>, culture: CultureOptions): DataTable {
  const col = requireCol(t, op.column)
  const type = datePartType(op.part, col.type)
  const n = col.length
  const b = new ColumnBuilder(type, n)
  for (let r = 0; r < n; r++) {
    if (col.hasError(r)) {
      b.pushError(col.errorMessage ?? undefined)
      continue
    }
    let v = col.get(r)
    if (v === null) {
      b.push(null)
      continue
    }
    if (!(v instanceof DateVal)) {
      const c = convertValue(v, 'datetime', culture)
      if (c instanceof ConversionError || c === null) {
        b.pushError(c instanceof ConversionError ? c.message : undefined)
        continue
      }
      v = c as DateVal
    }
    b.push(datePartValue(op.part, v))
  }
  if (op.newName) {
    assertUniqueName(t, op.newName)
    return t.addColumn(b.build(op.newName))
  }
  return t.replaceColumn(col.name, b.build(col.name))
}

function extractText(t: DataTable, op: Extract<StepOp, { op: 'extractText' }>, culture: CultureOptions): DataTable {
  const col = requireCol(t, op.column)
  let f: (s: string) => Scalar
  let type: DataType = 'text'
  switch (op.mode) {
    case 'length':
      f = (s) => s.length
      type = 'int'
      break
    case 'first': {
      const k = Math.max(0, op.count ?? 1)
      f = (s) => s.slice(0, k)
      break
    }
    case 'last': {
      const k = Math.max(0, op.count ?? 1)
      f = (s) => (k === 0 ? '' : s.slice(-k))
      break
    }
    case 'range': {
      const st = Math.max(0, op.start ?? 0)
      const k = op.count
      f = (s) => (k === undefined ? s.slice(st) : s.slice(st, st + Math.max(0, k)))
      break
    }
    case 'beforeDelimiter': {
      const del = op.delimiter ?? ''
      f = (s) => {
        const i = del ? s.indexOf(del) : -1
        return i < 0 ? s : s.slice(0, i)
      }
      break
    }
    case 'afterDelimiter': {
      const del = op.delimiter ?? ''
      f = (s) => {
        const i = del ? s.indexOf(del) : -1
        return i < 0 ? '' : s.slice(i + del.length)
      }
      break
    }
    case 'betweenDelimiters': {
      const a = op.delimiter ?? ''
      const z = op.endDelimiter ?? ''
      f = (s) => {
        const i = a ? s.indexOf(a) : -1
        if (i < 0) return ''
        const j = z ? s.indexOf(z, i + a.length) : -1
        return j < 0 ? s.slice(i + a.length) : s.slice(i + a.length, j)
      }
      break
    }
  }
  if (op.newName) {
    assertUniqueName(t, op.newName)
    return t.addColumn(mapAsText(col, f, type, culture, op.newName))
  }
  return t.replaceColumn(col.name, mapAsText(col, f, type, culture))
}

function addColumn(t: DataTable, op: Extract<StepOp, { op: 'addColumn' }>, culture: CultureOptions): DataTable {
  if (!op.name.trim()) throw new StepError('Informe o nome da nova coluna.')
  assertUniqueName(t, op.name)
  return t.addColumn(evaluateColumnExpression(op.expression, t, op.name, op.type, culture))
}

function conditionalColumn(t: DataTable, op: Extract<StepOp, { op: 'conditionalColumn' }>, culture: CultureOptions): DataTable {
  if (!op.name.trim()) throw new StepError('Informe o nome da nova coluna.')
  assertUniqueName(t, op.name)
  const rules = op.rules.map((rule) => {
    const col = requireCol(t, rule.column)
    return {
      col,
      op: rule.operator,
      valueCol: rule.valueColumn ? requireCol(t, rule.valueColumn) : null,
      value: rule.valueColumn ? null : typedValue(rule.value, col, rule.operator, culture),
      outCol: rule.outputColumn ? requireCol(t, rule.outputColumn) : null,
      out: fromJsonScalar(rule.output)
    }
  })
  const elseCol = op.otherwiseColumn ? requireCol(t, op.otherwiseColumn) : null
  const elseVal = fromJsonScalar(op.otherwise)
  const n = t.rowCount
  const values: Scalar[] = new Array(n)
  const errs: (string | null)[] = new Array(n).fill(null)
  for (let r = 0; r < n; r++) {
    let decided = false
    for (const rule of rules) {
      if (rule.col.hasError(r) || (rule.valueCol && rule.valueCol.hasError(r))) {
        errs[r] = rule.col.errorMessage ?? 'Erro'
        decided = true
        break
      }
      const ok = evalCompare(rule.op, rule.col.get(r), rule.valueCol ? rule.valueCol.get(r) : rule.value, true, culture)
      if (ok === true) {
        if (rule.outCol && rule.outCol.hasError(r)) errs[r] = rule.outCol.errorMessage ?? 'Erro'
        values[r] = rule.outCol ? rule.outCol.get(r) : rule.out
        decided = true
        break
      }
    }
    if (!decided) {
      if (elseCol && elseCol.hasError(r)) errs[r] = elseCol.errorMessage ?? 'Erro'
      values[r] = elseCol ? elseCol.get(r) : elseVal
    }
    if (values[r] === undefined) values[r] = null
  }
  const type = op.type ?? commonScalarType(values)
  const b = new ColumnBuilder(type, n)
  for (let r = 0; r < n; r++) {
    if (errs[r] !== null) {
      b.pushError(errs[r]!)
      continue
    }
    const v = values[r]
    if (op.type && v !== null) {
      const c = convertValue(v, op.type, culture)
      if (c instanceof ConversionError) b.pushError(c.message)
      else b.push(c)
    } else if (type === 'date' && v instanceof DateVal) b.push(new DateVal(v.ms, 'date'))
    else b.push(v)
  }
  return t.addColumn(b.build(op.name))
}

function indexColumn(t: DataTable, op: Extract<StepOp, { op: 'indexColumn' }>): DataTable {
  assertUniqueName(t, op.name)
  const type: DataType = Number.isInteger(op.start) && Number.isInteger(op.step) ? 'int' : 'number'
  const n = t.rowCount
  const vals = new Float64Array(n)
  for (let i = 0; i < n; i++) vals[i] = op.start + i * op.step
  return t.addColumn(new Column(op.name, type, { kind: 'num', values: vals }))
}

// ---------------------------------------------------------------------------
// Agrupamento
// ---------------------------------------------------------------------------

interface Groups {
  groupOf: Int32Array
  firstRow: number[]
}

function buildGroups(t: DataTable, keyCols: Column[]): Groups {
  const n = t.rowCount
  const groupOf = new Int32Array(n)
  const firstRow: number[] = []
  if (!keyCols.length) {
    if (n > 0) firstRow.push(0)
    return { groupOf, firstRow }
  }
  const key = rowKeyFn(keyCols)
  const map = new Map<unknown, number>()
  for (let r = 0; r < n; r++) {
    const k = key(r)
    let g = map.get(k)
    if (g === undefined) {
      g = firstRow.length
      map.set(k, g)
      firstRow.push(r)
    }
    groupOf[r] = g
  }
  return { groupOf, firstRow }
}

function numericValueOf(col: Column, r: number, culture: CultureOptions): number | null {
  if (col.data.kind === 'num' && !isDateType(col.type)) {
    const x = col.num(r)
    return x !== x ? null : x
  }
  const v = col.get(r)
  if (v === null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const c = convertValue(v, 'number', culture)
  if (c instanceof ConversionError || c === null) throw new StepError(`Não é possível agregar o valor "${asText(v, culture)}" da coluna "${col.name}" como número.`)
  return c as number
}

function aggregate(
  fn: GroupAggregation,
  col: Column | null,
  groups: Groups,
  nGroups: number,
  t: DataTable,
  culture: CultureOptions,
  name: string
): Column {
  const n = groups.groupOf.length
  const g = groups.groupOf
  if (fn === 'count') {
    const counts = new Float64Array(nGroups)
    for (let r = 0; r < n; r++) counts[g[r]]++
    return new Column(name, 'int', { kind: 'num', values: counts })
  }
  if (fn === 'countDistinct') {
    const sets: Set<unknown>[] = Array.from({ length: nGroups }, () => new Set())
    const key = col ? rowKeyFn([col]) : rowKeyFn(t.columns)
    for (let r = 0; r < n; r++) sets[g[r]].add(key(r))
    const out = new Float64Array(nGroups)
    for (let i = 0; i < nGroups; i++) out[i] = sets[i].size
    return new Column(name, 'int', { kind: 'num', values: out })
  }
  if (!col) throw new StepError(`A operação de agregação "${fn}" requer uma coluna.`)
  if (fn === 'countNonBlank') {
    const counts = new Float64Array(nGroups)
    for (let r = 0; r < n; r++) if (!col.isBlank(r)) counts[g[r]]++
    return new Column(name, 'int', { kind: 'num', values: counts })
  }
  if (fn === 'min' || fn === 'max') {
    const best: Scalar[] = new Array(nGroups).fill(null)
    const errs: (string | null)[] = new Array(nGroups).fill(null)
    for (let r = 0; r < n; r++) {
      const gi = g[r]
      if (col.hasError(r)) {
        errs[gi] = col.errorMessage ?? 'Erro'
        continue
      }
      const v = col.get(r)
      if (v === null) continue
      const cur = best[gi]
      if (cur === null) best[gi] = v
      else {
        const c = compareScalars(v, cur)
        if (fn === 'min' ? c < 0 : c > 0) best[gi] = v
      }
    }
    const b = new ColumnBuilder(col.type, nGroups)
    for (let i = 0; i < nGroups; i++) {
      if (errs[i] !== null) b.pushError(errs[i]!)
      else b.push(best[i])
    }
    return b.build(name)
  }
  if (fn === 'median') {
    const lists: number[][] = Array.from({ length: nGroups }, () => [])
    for (let r = 0; r < n; r++) {
      if (col.hasError(r)) continue
      const x = numericValueOf(col, r, culture)
      if (x !== null) lists[g[r]].push(x)
    }
    const out = new Float64Array(nGroups)
    for (let i = 0; i < nGroups; i++) {
      const l = lists[i].sort((a, b) => a - b)
      if (!l.length) out[i] = NaN
      else out[i] = l.length % 2 ? l[(l.length - 1) / 2] : (l[l.length / 2 - 1] + l[l.length / 2]) / 2
    }
    return new Column(name, 'number', { kind: 'num', values: out })
  }
  // sum / avg
  const sums = new Float64Array(nGroups)
  const counts = new Float64Array(nGroups)
  const errs: (string | null)[] = new Array(nGroups).fill(null)
  for (let r = 0; r < n; r++) {
    const gi = g[r]
    if (col.hasError(r)) {
      errs[gi] = col.errorMessage ?? 'Erro'
      continue
    }
    const x = numericValueOf(col, r, culture)
    if (x === null) continue
    sums[gi] += x
    counts[gi]++
  }
  const type: DataType = fn === 'avg' ? 'number' : col.type === 'int' || col.type === 'currency' ? col.type : 'number'
  const b = new ColumnBuilder(type, nGroups)
  for (let i = 0; i < nGroups; i++) {
    if (errs[i] !== null) b.pushError(errs[i]!)
    else if (counts[i] === 0) b.push(null)
    else b.push(fn === 'avg' ? sums[i] / counts[i] : sums[i])
  }
  return b.build(name)
}

function groupBy(t: DataTable, op: Extract<StepOp, { op: 'groupBy' }>, culture: CultureOptions): DataTable {
  const keyCols = op.keys.map((k) => requireCol(t, k))
  const groups = buildGroups(t, keyCols)
  let nGroups = groups.firstRow.length
  if (!keyCols.length && nGroups === 0) nGroups = 1
  const first = Int32Array.from(groups.firstRow)
  const cols: Column[] = keyCols.map((c) => c.take(first))
  const taken = new Set(cols.map((c) => c.name.toLowerCase()))
  for (const a of op.aggregations) {
    if (taken.has(a.name.toLowerCase())) throw new StepError(`Já existe uma coluna chamada "${a.name}".`)
    taken.add(a.name.toLowerCase())
    const col = a.column ? requireCol(t, a.column) : null
    cols.push(aggregate(a.fn, col, groups, nGroups, t, culture, a.name))
  }
  return new DataTable(cols, nGroups)
}

function unpivot(t: DataTable, op: Extract<StepOp, { op: 'unpivot' }>): DataTable {
  const listed = new Set(op.columns.map((c) => t.indexOf(c)))
  for (const c of op.columns) if (t.indexOf(c) < 0) throw new StepError(`A coluna "${c}" da tabela não foi encontrada.`)
  const unp = t.columns.filter((_, i) => (op.mode === 'selected' ? listed.has(i) : !listed.has(i)))
  const keep = t.columns.filter((c) => !unp.includes(c))
  const taken = new Set(keep.map((c) => c.name.toLowerCase()))
  if (taken.has(op.attribute.toLowerCase())) throw new StepError(`Já existe uma coluna chamada "${op.attribute}".`)
  if (taken.has(op.value.toLowerCase()) || op.value.toLowerCase() === op.attribute.toLowerCase()) {
    throw new StepError(`Já existe uma coluna chamada "${op.value}".`)
  }
  const types = new Set(unp.map((c) => c.type))
  let valueType: DataType = 'any'
  if (types.size === 1) valueType = unp[0]?.type ?? 'any'
  else if ([...types].every(isNumericType)) valueType = 'number'
  const n = t.rowCount
  const rowIdx: number[] = []
  const attr = new ColumnBuilder('text', n * Math.max(1, unp.length))
  const val = new ColumnBuilder(valueType, n * Math.max(1, unp.length))
  for (let r = 0; r < n; r++) {
    for (const c of unp) {
      const err = c.hasError(r)
      if (!err && c.isBlank(r)) continue
      rowIdx.push(r)
      attr.push(c.name)
      if (err) val.pushError(c.errorMessage ?? undefined)
      else val.push(c.get(r))
    }
  }
  const idx = Int32Array.from(rowIdx)
  return new DataTable([...keep.map((c) => c.take(idx)), attr.build(op.attribute), val.build(op.value)], idx.length)
}

function pivot(t: DataTable, op: Extract<StepOp, { op: 'pivot' }>, culture: CultureOptions): DataTable {
  const pivCol = requireCol(t, op.column)
  const valCol = requireCol(t, op.valueColumn)
  const others = t.columns.filter((c) => c !== pivCol && c !== valCol)
  const groups = buildGroups(t, others)
  const nGroups = groups.firstRow.length
  const n = t.rowCount
  // Novas colunas: valores distintos (não nulos) na ordem de aparição.
  const nameIndex = new Map<unknown, number>()
  const names: string[] = []
  const pivIdx = new Int32Array(n).fill(-1)
  for (let r = 0; r < n; r++) {
    if (pivCol.hasError(r)) continue
    const v = pivCol.get(r)
    if (v === null) continue
    const k = hashKey(v)
    let i = nameIndex.get(k)
    if (i === undefined) {
      i = names.length
      nameIndex.set(k, i)
      names.push(asText(v, culture) ?? '')
    }
    pivIdx[r] = i
  }
  const taken = new Set(others.map((c) => c.name.toLowerCase()))
  const finalNames = names.map((nm) => uniqueAmong(nm || 'Coluna', taken))
  const cells: number[][][] = names.map(() => Array.from({ length: nGroups }, () => [] as number[]))
  for (let r = 0; r < n; r++) {
    const pi = pivIdx[r]
    if (pi < 0) continue
    cells[pi][groups.groupOf[r]].push(r)
  }
  const fn = op.fn
  const outCols: Column[] = []
  names.forEach((_, pi) => {
    let type: DataType = valCol.type
    if (fn === 'count' || fn === 'countDistinct' || fn === 'countNonBlank') type = 'int'
    else if (fn === 'avg' || fn === 'median') type = 'number'
    else if (fn === 'sum') type = valCol.type === 'int' || valCol.type === 'currency' ? valCol.type : 'number'
    const b = new ColumnBuilder(type, nGroups)
    for (let gi = 0; gi < nGroups; gi++) {
      const rows = cells[pi][gi]
      if (rows.some((r) => valCol.hasError(r))) {
        b.pushError(valCol.errorMessage ?? undefined)
        continue
      }
      switch (fn) {
        case 'none':
          if (rows.length > 1) b.pushError('Há muitos elementos na enumeração para concluir a operação.')
          else b.push(rows.length ? valCol.get(rows[0]) : null)
          break
        case 'count':
          b.push(rows.length)
          break
        case 'countNonBlank':
          b.push(rows.filter((r) => !valCol.isBlank(r)).length)
          break
        case 'countDistinct':
          b.push(new Set(rows.map((r) => hashKey(valCol.get(r)))).size)
          break
        case 'min':
        case 'max': {
          let best: Scalar = null
          for (const r of rows) {
            const v = valCol.get(r)
            if (v === null) continue
            if (best === null || (fn === 'min' ? compareScalars(v, best) < 0 : compareScalars(v, best) > 0)) best = v
          }
          b.push(best)
          break
        }
        default: {
          const nums: number[] = []
          for (const r of rows) {
            const x = numericValueOf(valCol, r, culture)
            if (x !== null) nums.push(x)
          }
          if (!nums.length) b.push(null)
          else if (fn === 'sum') b.push(nums.reduce((s, x) => s + x, 0))
          else if (fn === 'avg') b.push(nums.reduce((s, x) => s + x, 0) / nums.length)
          else {
            nums.sort((a, b2) => a - b2)
            const m = nums.length
            b.push(m % 2 ? nums[(m - 1) / 2] : (nums[m / 2 - 1] + nums[m / 2]) / 2)
          }
        }
      }
    }
    outCols.push(b.build(finalNames[pi]))
  })
  const first = Int32Array.from(groups.firstRow)
  return new DataTable([...others.map((c) => c.take(first)), ...outCols], nGroups)
}

function transpose(t: DataTable): DataTable {
  const n = t.rowCount
  const m = t.columnCount
  const cols: Column[] = []
  for (let j = 0; j < n; j++) {
    const b = new ColumnBuilder('any', m)
    for (let i = 0; i < m; i++) copyCell(b, t.columns[i], j)
    cols.push(b.build(`Column${j + 1}`))
  }
  return new DataTable(cols, m)
}

function merge(t: DataTable, op: Extract<StepOp, { op: 'merge' }>, ctx: StepContext): DataTable {
  const right = ctx.getQuery(op.rightQueryId)
  const rightName = ctx.queryName(op.rightQueryId)
  if (!op.leftKeys.length || op.leftKeys.length !== op.rightKeys.length) {
    throw new StepError('Selecione o mesmo número de colunas correspondentes nas duas tabelas.')
  }
  const lk = op.leftKeys.map((c) => requireCol(t, c))
  const rk = op.rightKeys.map((c) => requireCol(right, c, rightName))
  const lKey = rowKeyFn(lk)
  const rKey = rowKeyFn(rk)
  const leftIdx: number[] = []
  const rightIdx: number[] = []
  const buildIndex = (keyFn: (r: number) => unknown, n: number) => {
    const m = new Map<unknown, number[]>()
    for (let r = 0; r < n; r++) {
      const k = keyFn(r)
      const list = m.get(k)
      if (list) list.push(r)
      else m.set(k, [r])
    }
    return m
  }
  switch (op.join) {
    case 'left':
    case 'inner':
    case 'leftAnti':
    case 'full': {
      const index = buildIndex(rKey, right.rowCount)
      const matchedRight = op.join === 'full' ? new Uint8Array(right.rowCount) : null
      for (let l = 0; l < t.rowCount; l++) {
        const matches = index.get(lKey(l))
        if (op.join === 'leftAnti') {
          if (!matches) {
            leftIdx.push(l)
            rightIdx.push(-1)
          }
          continue
        }
        if (matches) {
          for (const r of matches) {
            leftIdx.push(l)
            rightIdx.push(r)
            if (matchedRight) matchedRight[r] = 1
          }
        } else if (op.join !== 'inner') {
          leftIdx.push(l)
          rightIdx.push(-1)
        }
      }
      if (matchedRight) {
        for (let r = 0; r < right.rowCount; r++) {
          if (!matchedRight[r]) {
            leftIdx.push(-1)
            rightIdx.push(r)
          }
        }
      }
      break
    }
    case 'right':
    case 'rightAnti': {
      const index = buildIndex(lKey, t.rowCount)
      for (let r = 0; r < right.rowCount; r++) {
        const matches = index.get(rKey(r))
        if (op.join === 'rightAnti') {
          if (!matches) {
            leftIdx.push(-1)
            rightIdx.push(r)
          }
          continue
        }
        if (matches) {
          for (const l of matches) {
            leftIdx.push(l)
            rightIdx.push(r)
          }
        } else {
          leftIdx.push(-1)
          rightIdx.push(r)
        }
      }
      break
    }
  }
  const li = Int32Array.from(leftIdx)
  const ri = Int32Array.from(rightIdx)
  const cols = t.columns.map((c) => c.take(li))
  const taken = new Set(cols.map((c) => c.name.toLowerCase()))
  const prefix = op.prefix ?? `${rightName}.`
  for (const name of op.expand) {
    const rc = requireCol(right, name, rightName)
    cols.push(rc.take(ri).rename(uniqueAmong(prefix + rc.name, taken)))
  }
  return new DataTable(cols, li.length)
}

function unifyTypes(types: DataType[]): DataType {
  const set = new Set(types)
  if (set.size === 1) return types[0]
  if ([...set].every(isNumericType)) return 'number'
  if ([...set].every((x) => x === 'date' || x === 'datetime')) return 'datetime'
  return 'any'
}

function append(t: DataTable, op: Extract<StepOp, { op: 'append' }>, ctx: StepContext): DataTable {
  const tables = [t, ...op.queryIds.map((id) => ctx.getQuery(id))]
  const names: string[] = []
  const seen = new Set<string>()
  const lookups = tables.map((tb) => {
    const m = new Map<string, Column>()
    for (const c of tb.columns) {
      if (!m.has(c.name)) m.set(c.name, c)
      if (!seen.has(c.name)) {
        seen.add(c.name)
        names.push(c.name)
      }
    }
    return m
  })
  const total = tables.reduce((s, tb) => s + tb.rowCount, 0)
  const cols = names.map((name) => {
    const present = lookups.map((m) => m.get(name)).filter((c): c is Column => !!c)
    const type = unifyTypes(present.map((c) => c.type))
    const b = new ColumnBuilder(type, total)
    tables.forEach((tb, i) => {
      const c = lookups[i].get(name)
      if (!c) {
        for (let r = 0; r < tb.rowCount; r++) b.push(null)
        return
      }
      const convert = type === 'datetime' && c.type === 'date'
      for (let r = 0; r < tb.rowCount; r++) {
        if (c.hasError(r)) b.pushError(c.errorMessage ?? undefined)
        else {
          const v = c.get(r)
          b.push(convert && v instanceof DateVal ? new DateVal(v.ms, 'datetime') : v)
        }
      }
    })
    return b.build(name)
  })
  return new DataTable(cols, total)
}

// ---------------------------------------------------------------------------
// Despacho
// ---------------------------------------------------------------------------

/** Aplica uma etapa à tabela, produzindo uma nova tabela. */
export function applyStep(t: DataTable, op: StepOp, ctx: StepContext = defaultStepContext()): DataTable {
  const culture = ctx.culture
  switch (op.op) {
    case 'promoteHeaders':
      return promoteHeaders(t, culture)
    case 'demoteHeaders':
      return demoteHeaders(t)
    case 'changeTypes':
      return changeTypes(t, op, ctx)
    case 'removeColumns':
      return removeColumns(t, op.columns)
    case 'selectColumns':
      return selectColumns(t, op.columns)
    case 'renameColumns':
      return renameColumns(t, op.renames)
    case 'reorderColumns':
      return reorderColumns(t, op.columns)
    case 'duplicateColumn': {
      const c = requireCol(t, op.column)
      assertUniqueName(t, op.newName)
      return t.addColumn(c.rename(op.newName))
    }
    case 'filterRows': {
      const pred = compileCondition(op.condition, t, culture)
      return t.take(rowsWhere(t.rowCount, (r) => pred(r) === true))
    }
    case 'keepRows':
      return keepRows(t, op)
    case 'removeRows':
      return removeRows(t, op)
    case 'removeDuplicates':
      return duplicates(t, op.columns, false)
    case 'keepDuplicates':
      return duplicates(t, op.columns, true)
    case 'sort':
      return sortRows(t, op.keys)
    case 'replaceValues':
      return replaceValues(t, op, culture)
    case 'replaceErrors':
      return replaceErrors(t, op.columns, op.value, culture)
    case 'fill':
      return fill(t, op.columns, op.direction)
    case 'splitColumn':
      return splitColumn(t, op, culture)
    case 'mergeColumns':
      return mergeColumns(t, op, culture)
    case 'transformText':
      return transformText(t, op, culture)
    case 'transformNumber':
      return transformNumber(t, op, culture)
    case 'datePart':
      return datePart(t, op, culture)
    case 'extractText':
      return extractText(t, op, culture)
    case 'addColumn':
      return addColumn(t, op, culture)
    case 'conditionalColumn':
      return conditionalColumn(t, op, culture)
    case 'indexColumn':
      return indexColumn(t, op)
    case 'groupBy':
      return groupBy(t, op, culture)
    case 'unpivot':
      return unpivot(t, op)
    case 'pivot':
      return pivot(t, op, culture)
    case 'transpose':
      return transpose(t)
    case 'merge':
      return merge(t, op, ctx)
    case 'append':
      return append(t, op, ctx)
    default:
      throw new StepError(`Etapa desconhecida: ${(op as { op: string }).op}`)
  }
}

/** Consultas referenciadas por uma etapa (dependências). */
export function stepDependencies(op: StepOp): string[] {
  if (op.op === 'merge') return [op.rightQueryId]
  if (op.op === 'append') return [...op.queryIds]
  return []
}
