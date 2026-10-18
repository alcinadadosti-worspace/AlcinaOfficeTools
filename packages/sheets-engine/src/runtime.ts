// Coerções e utilidades usadas pelo avaliador e pelas funções.
import { type CellValue, type CellError, isError, err } from './types'

/** Argumento de função: um valor ou um intervalo (lista de valores). */
export type ArgValue = CellValue | CellValue[]

export function flatten(args: ArgValue[]): CellValue[] {
  const out: CellValue[] = []
  for (const a of args) {
    if (Array.isArray(a)) out.push(...a)
    else out.push(a)
  }
  return out
}

export function scalar(a: ArgValue): CellValue {
  if (Array.isArray(a)) return a.length ? a[0] : null
  return a
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
  if (typeof v === 'number') return numberToText(v)
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

function numberToText(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return String(n)
}

/** Texto para exibição na grade (com vírgula decimal pt-BR). */
export function displayValue(v: CellValue): string {
  if (isError(v)) return v.error
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '#NÚM!'
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 10 }).format(v)
  }
  return v
}
