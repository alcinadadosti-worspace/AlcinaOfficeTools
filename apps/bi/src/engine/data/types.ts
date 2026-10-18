// Tipos fundamentais de dados do motor AlcinaBi.

export type DataType =
  | 'text'
  | 'int' // número inteiro
  | 'number' // número decimal
  | 'currency' // decimal fixo (moeda)
  | 'bool'
  | 'date'
  | 'datetime'
  | 'time'
  | 'any' // tipo indefinido (apenas no editor de consultas)

export const DATA_TYPES: DataType[] = ['text', 'int', 'number', 'currency', 'bool', 'date', 'datetime', 'time', 'any']

export const DATA_TYPE_LABEL: Record<DataType, string> = {
  text: 'Texto',
  int: 'Número inteiro',
  number: 'Número decimal',
  currency: 'Número decimal fixo',
  bool: 'Verdadeiro/Falso',
  date: 'Data',
  datetime: 'Data/Hora',
  time: 'Hora',
  any: 'Qualquer'
}

export function isNumericType(t: DataType): boolean {
  return t === 'int' || t === 'number' || t === 'currency'
}

export function isDateType(t: DataType): boolean {
  return t === 'date' || t === 'datetime' || t === 'time'
}

/** Tipos armazenados como Float64Array (NaN = vazio). */
export function isNumStorageType(t: DataType): boolean {
  return isNumericType(t) || isDateType(t)
}

export type DateKind = 'date' | 'datetime' | 'time'

/**
 * Valor de data/hora "ingênuo" (sem fuso): milissegundos desde 1970-01-01
 * interpretados em UTC apenas como representação.
 */
export class DateVal {
  constructor(
    readonly ms: number,
    readonly kind: DateKind = 'datetime'
  ) {}
  valueOf(): number {
    return this.ms
  }
  toString(): string {
    return new Date(this.ms).toISOString()
  }
}

/** Valor escalar: null representa BLANK/vazio. */
export type Scalar = null | number | string | boolean | DateVal

export function isDateVal(v: unknown): v is DateVal {
  return v instanceof DateVal
}

/** Chave canônica para usar escalares em Map/Set. */
export function scalarKey(v: Scalar): string | number | boolean | null {
  if (v instanceof DateVal) return `\u0001d${v.ms}`
  return v
}

export function scalarTypeOf(v: Scalar): DataType {
  if (v === null) return 'any'
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'number'
  if (typeof v === 'string') return 'text'
  if (typeof v === 'boolean') return 'bool'
  return v.kind
}
