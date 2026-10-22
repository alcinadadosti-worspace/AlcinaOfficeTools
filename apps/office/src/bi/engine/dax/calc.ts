// Colunas e tabelas calculadas.
import { Column, ColumnBuilder } from '../data/column'
import { DataTable } from '../data/table'
import { type DataType, DateVal, type Scalar } from '../data/types'
import { timeOfDay } from '../data/dates'
import type { ColRT, TableRT } from '../model/runtime'
import { Ctx } from './context'
import { Evaluator } from './evaluator'
import { FilterContext } from './filter'
import { BaseTV, materialize } from './tablevalue'
import { compileNumeric } from './functions/aggregate'

/** Infere o tipo de dado a partir dos valores calculados. */
export function inferValuesType(values: ArrayLike<Scalar>): DataType {
  let hasInt = false
  let hasNum = false
  let hasText = false
  let hasBool = false
  let hasDate = false
  let hasDateTime = false
  let hasTime = false
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === null || v === undefined) continue
    if (typeof v === 'number') {
      if (Number.isInteger(v)) hasInt = true
      else hasNum = true
    } else if (typeof v === 'string') hasText = true
    else if (typeof v === 'boolean') hasBool = true
    else if (v instanceof DateVal) {
      if (v.kind === 'time') hasTime = true
      else if (v.kind === 'date' && timeOfDay(v.ms) === 0) hasDate = true
      else hasDateTime = true
    }
  }
  const kinds = [hasInt || hasNum, hasText, hasBool, hasDate || hasDateTime, hasTime].filter(Boolean).length
  if (kinds === 0) return 'text'
  if (kinds > 1) return 'text'
  if (hasText) return 'text'
  if (hasBool) return 'bool'
  if (hasTime) return 'time'
  if (hasDate || hasDateTime) return hasDateTime ? 'datetime' : 'date'
  return hasNum ? 'number' : 'int'
}

export function columnFromValues(name: string, values: Scalar[], type?: DataType): Column {
  const t = type ?? inferValuesType(values)
  const b = new ColumnBuilder(t, values.length)
  if (t === 'text') for (const v of values) b.push(v === null ? null : typeof v === 'string' ? v : String(v instanceof DateVal ? v.toString() : v))
  else for (const v of values) b.push(v)
  return b.build(name)
}

/** Liga o cálculo de colunas/tabelas calculadas ao modelo. */
export function installCalcHooks(ev: Evaluator): void {
  ev.model.hooks = {
    computeColumn: (col: ColRT) => computeColumn(ev, col),
    computeTable: (t: TableRT) => computeTable(ev, t)
  }
}

function computeColumn(ev: Evaluator, col: ColRT): Column {
  const t = col.table
  const expr = col.def?.expression
  if (!expr) return Column.blank(col.name, col.type, t.rowCount)
  const node = ev.parse(expr)
  const n = t.rowCount
  const tv = new BaseTV(t, t.allRows())
  const fc = FilterContext.empty(ev.model)
  const ctx = new Ctx(fc)
  // Caminho rápido para aritmética simples.
  const fast = compileNumeric(ev, node, tv, ctx)
  if (fast) {
    const vals = new Float64Array(n)
    let allInt = true
    for (let r = 0; r < n; r++) {
      const x = fast(r)
      vals[r] = Number.isFinite(x) ? x : NaN
      if (allInt && x === x && !Number.isInteger(x)) allInt = false
    }
    const b = new ColumnBuilder(allInt ? 'int' : 'number', n)
    for (let r = 0; r < n; r++) b.pushNum(vals[r])
    const out = b.build(col.name)
    if (col.def) col.def.dataType = out.type
    return out
  }
  const values: Scalar[] = new Array(n)
  const frame = { tv, row: 0 }
  const inner = ctx.withFrame(frame)
  for (let r = 0; r < n; r++) {
    frame.row = r
    values[r] = ev.scalar(node, inner)
  }
  // Limpa o cache de medidas: cada linha gera contextos próprios.
  ev.clearCache()
  const out = columnFromValues(col.name, values)
  if (col.def) col.def.dataType = out.type
  return out
}

function computeTable(ev: Evaluator, t: TableRT): DataTable {
  const expr = t.def.expression!
  const node = ev.parse(expr)
  const tv = materialize(ev.table(node, ev.emptyCtx()))
  const used = new Set<string>()
  const cols = tv.cols.map((c, i) => {
    let name = c.name
    let k = 1
    while (used.has(name.toLowerCase())) name = `${c.name}${k++}`
    used.add(name.toLowerCase())
    const type = c.type === 'any' ? undefined : c.type
    return columnFromValues(name, tv.data[i], type ?? inferValuesType(tv.data[i]))
  })
  ev.clearCache()
  return new DataTable(cols, tv.rowCount)
}
