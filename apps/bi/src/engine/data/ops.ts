// Comparação, igualdade e chaves de agrupamento de escalares.
import type { Column } from './column'
import { DateVal, type Scalar } from './types'

/** Ordenação de textos (pt-BR, sensível a acentos e maiúsculas). */
export const textCollator = new Intl.Collator('pt-BR', { sensitivity: 'variant' })

function typeRank(v: Scalar): number {
  if (v === null) return 0
  if (typeof v === 'boolean') return 1
  if (typeof v === 'number') return 2
  if (v instanceof DateVal) return 3
  return 4
}

/** Compara dois escalares: vazio primeiro, depois lógicos, números, datas e textos. */
export function compareScalars(a: Scalar, b: Scalar): number {
  if (a === b) return 0
  const ra = typeRank(a)
  const rb = typeRank(b)
  if (ra !== rb) return ra - rb
  switch (ra) {
    case 0:
      return 0
    case 1:
      return (a ? 1 : 0) - (b ? 1 : 0)
    case 2:
      return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0
    case 3: {
      const x = (a as DateVal).ms
      const y = (b as DateVal).ms
      return x < y ? -1 : x > y ? 1 : 0
    }
    default:
      return textCollator.compare(a as string, b as string)
  }
}

/** Comparação ordinal (estilo M) usada em operadores relacionais. */
export function compareOrdinal(a: Scalar, b: Scalar): number {
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  return compareScalars(a, b)
}

export type RoundMode = 'toEven' | 'up' | 'down' | 'awayFromZero' | 'towardZero'

/** Arredonda com o modo indicado (padrão: para o par mais próximo, como no M). */
export function roundNumber(x: number, digits = 0, mode: RoundMode = 'toEven'): number {
  const f = Math.pow(10, digits)
  const y = x * f
  let r: number
  switch (mode) {
    case 'up':
      r = Math.ceil(y - 1e-9)
      break
    case 'down':
      r = Math.floor(y + 1e-9)
      break
    case 'awayFromZero': {
      const a = Math.abs(y)
      const fl = Math.floor(a)
      r = Math.sign(y) * (a - fl >= 0.5 - 1e-9 ? fl + 1 : fl)
      break
    }
    case 'towardZero':
      r = Math.trunc(y)
      break
    default: {
      const fl = Math.floor(y)
      const diff = y - fl
      if (Math.abs(diff - 0.5) < 1e-9) r = fl % 2 === 0 ? fl : fl + 1
      else r = Math.round(y)
    }
  }
  const out = r / f
  return out === 0 ? 0 : out
}

/** Igualdade de escalares (datas comparadas pelo valor). */
export function scalarEquals(a: Scalar, b: Scalar, caseSensitive = true): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (a instanceof DateVal && b instanceof DateVal) return a.ms === b.ms
  if (!caseSensitive && typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase()
  return false
}

/** Chave de hash para um escalar (distingue tipos). */
export function hashKey(v: Scalar): string | number | boolean | null {
  if (v instanceof DateVal) return `\u0001d${v.ms}`
  return v
}

function keyPart(v: Scalar): string {
  if (v === null) return '\u0000'
  if (typeof v === 'number') return `n${v}`
  if (typeof v === 'string') return `s${v}`
  if (typeof v === 'boolean') return v ? 'b1' : 'b0'
  return `d${v.ms}`
}

/** Função que produz a chave (simples ou composta) de uma linha. */
export function rowKeyFn(cols: Column[], caseSensitive = true): (row: number) => string | number | boolean | null {
  if (cols.length === 1) {
    const c = cols[0]
    const d = c.data
    if (d.kind === 'text') {
      const dict = d.dict
      const codes = d.codes
      if (caseSensitive) return (r) => (codes[r] < 0 ? null : `s${dict[codes[r]]}`)
      return (r) => (codes[r] < 0 ? null : `s${dict[codes[r]].toLowerCase()}`)
    }
    if (d.kind === 'num') {
      const vals = d.values
      if (c.type === 'date' || c.type === 'datetime' || c.type === 'time') {
        // Mesma chave de hashKey(DateVal) para casar com colunas "qualquer".
        return (r) => {
          const x = vals[r]
          return x !== x ? null : `\u0001d${x}`
        }
      }
      return (r) => {
        const x = vals[r]
        return x !== x ? null : x
      }
    }
    return (r) => {
      const v = c.get(r)
      return !caseSensitive && typeof v === 'string' ? `s${v.toLowerCase()}` : typeof v === 'string' ? `s${v}` : hashKey(v)
    }
  }
  return (r) => {
    let k = ''
    for (let i = 0; i < cols.length; i++) {
      let v = cols[i].get(r)
      if (!caseSensitive && typeof v === 'string') v = v.toLowerCase()
      k += (i ? '\u0001' : '') + keyPart(v)
    }
    return k
  }
}

/**
 * Pré-calcula, para uma coluna, um vetor de "postos" numéricos que preserva a
 * ordem de compareScalars (permite ordenar milhões de linhas rapidamente).
 */
export function sortRanks(col: Column): Float64Array {
  const n = col.length
  const out = new Float64Array(n)
  const d = col.data
  if (d.kind === 'num') {
    // Vazio (NaN) vem primeiro.
    for (let i = 0; i < n; i++) {
      const x = d.values[i]
      out[i] = x !== x ? -Infinity : x
    }
    return out
  }
  if (d.kind === 'bool') {
    for (let i = 0; i < n; i++) out[i] = d.values[i] === 2 ? -1 : d.values[i]
    return out
  }
  if (d.kind === 'text') {
    const order = d.dict.map((_, i) => i)
    order.sort((a, b) => textCollator.compare(d.dict[a], d.dict[b]))
    const rank = new Float64Array(d.dict.length)
    let r = 0
    for (let i = 0; i < order.length; i++) {
      if (i > 0 && textCollator.compare(d.dict[order[i - 1]], d.dict[order[i]]) !== 0) r++
      rank[order[i]] = r
    }
    for (let i = 0; i < n; i++) {
      const c = d.codes[i]
      out[i] = c < 0 ? -1 : rank[c]
    }
    return out
  }
  // Coluna "qualquer": ordena os valores distintos e atribui postos.
  const vals = col.toArray()
  const idx = vals.map((_, i) => i)
  idx.sort((a, b) => compareScalars(vals[a], vals[b]))
  let r = 0
  for (let i = 0; i < idx.length; i++) {
    if (i > 0 && compareScalars(vals[idx[i - 1]], vals[idx[i]]) !== 0) r++
    out[idx[i]] = r
  }
  return out
}
