// Conversão de valores JavaScript (JSON, drivers de banco) em escalares.
import { Column, ColumnBuilder } from '../data/column'
import { fromLocalDate, timeOfDay } from '../data/dates'
import { type DataType, DateVal, type Scalar } from '../data/types'

export function jsToScalar(v: unknown): Scalar {
  if (v === null || v === undefined) return null
  switch (typeof v) {
    case 'number':
      return Number.isNaN(v) ? null : v
    case 'string':
      return v
    case 'boolean':
      return v
    case 'bigint':
      return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString()
    case 'object': {
      if (v instanceof DateVal) return v
      if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return null
        const ms = fromLocalDate(v)
        return new DateVal(ms, timeOfDay(ms) === 0 ? 'date' : 'datetime')
      }
      if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
        const n = v instanceof ArrayBuffer ? v.byteLength : v.length
        return `[binário: ${n} bytes]`
      }
      try {
        return JSON.stringify(v)
      } catch {
        return String(v)
      }
    }
    default:
      return String(v)
  }
}

/** Escolhe o tipo mais específico que comporta todos os valores. */
export function commonScalarType(values: ArrayLike<Scalar>): DataType {
  let kind: DataType | null = null
  let allInt = true
  let allDate = true
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === null) continue
    let k: DataType
    if (typeof v === 'number') {
      k = 'number'
      if (!Number.isInteger(v)) allInt = false
    } else if (typeof v === 'string') k = 'text'
    else if (typeof v === 'boolean') k = 'bool'
    else {
      k = v.kind === 'time' ? 'time' : 'datetime'
      if (v.kind !== 'date') allDate = false
    }
    if (kind === null) kind = k
    else if (kind !== k) return 'any'
  }
  if (kind === null) return 'any'
  if (kind === 'number') return allInt ? 'int' : 'number'
  if (kind === 'datetime') return allDate ? 'date' : 'datetime'
  return kind
}

/** Cria uma coluna tipada a partir de valores JavaScript. */
export function typedColumnFromValues(name: string, values: unknown[]): Column {
  const scalars = values.map(jsToScalar)
  const type = commonScalarType(scalars)
  const b = new ColumnBuilder(type, scalars.length)
  for (const v of scalars) b.push(type === 'date' && v instanceof DateVal ? new DateVal(v.ms, 'date') : v)
  return b.build(name)
}
