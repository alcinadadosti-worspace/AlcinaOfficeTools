// Coerções e utilidades usadas pelo avaliador e pelas funções.
import { type CellValue, type CellError, isError, err } from './types'

/** Intervalo bidimensional (ex.: A1:C10) preservando linhas/colunas. */
export interface Matrix {
  kind: 'matrix'
  rows: number
  cols: number
  cells: CellValue[][]
}

/** Argumento de função: um valor único ou um intervalo (matriz). */
export type ArgValue = CellValue | Matrix

export function isMatrix(a: ArgValue): a is Matrix {
  return typeof a === 'object' && a !== null && (a as { kind?: string }).kind === 'matrix'
}

/** Achata qualquer argumento (matriz ou valor) em uma lista de valores. */
export function flatten(args: ArgValue[]): CellValue[] {
  const out: CellValue[] = []
  for (const a of args) {
    if (isMatrix(a)) {
      for (const row of a.cells) for (const v of row) out.push(v)
    } else {
      out.push(a)
    }
  }
  return out
}

/** Lista de valores de um único argumento (matriz vira lista; valor vira [valor]). */
export function toList(a: ArgValue): CellValue[] {
  return isMatrix(a) ? flatten([a]) : [a ?? null]
}

/** Primeiro valor escalar de um argumento (undefined de argumento opcional vira null). */
export function scalar(a: ArgValue): CellValue {
  if (isMatrix(a)) return a.cells[0]?.[0] ?? null
  return a ?? null
}

/** Interpreta um texto como número (aceita 1.234,56 / 1234,56 / 1234.56). */
export function parseNumber(s: string): number | null {
  let t = s.trim().replace(/\s/g, '')
  if (!t) return null
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function toNumber(v: CellValue): number | { error: CellError } {
  if (isError(v)) return v
  if (v === null || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = parseNumber(v)
  return n === null ? err('#VALOR!') : n
}

export function toText(v: CellValue): string {
  if (isError(v)) return v.error
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO'
  if (typeof v === 'number') return Number.isFinite(v) ? new Intl.NumberFormat('pt-BR', { useGrouping: false, maximumFractionDigits: 10 }).format(v) : String(v)
  return v
}

export function toBool(v: CellValue): boolean | { error: CellError } {
  if (isError(v)) return v
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null) return false
  const u = v.trim().toUpperCase()
  if (u === 'VERDADEIRO' || u === 'TRUE') return true
  if (u === 'FALSO' || u === 'FALSE') return false
  return err('#VALOR!')
}

/** Texto para exibição na grade (formato "geral", com vírgula decimal pt-BR). */
export function displayValue(v: CellValue): string {
  if (isError(v)) return v.error
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '#NÚM!'
    return new Intl.NumberFormat('pt-BR', { useGrouping: false, maximumFractionDigits: 10 }).format(v)
  }
  return v
}
