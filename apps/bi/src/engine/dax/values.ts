// Semântica de valores escalares do DAX (BLANK, conversões, operadores).
import { DateVal, type Scalar } from '../data/types'
import { MS_PER_DAY, msToSerial, serialToMs } from '../data/dates'
import { formatDate, formatGeneral } from '../data/format'
import { parseDateTime, parseNumber } from '../data/convert'
import { DaxError } from './parser'

const collator = new Intl.Collator('pt-BR', { sensitivity: 'accent', numeric: false })

export function isBlank(v: Scalar): v is null {
  return v === null
}

export function typeName(v: Scalar): string {
  if (v === null) return 'Blank'
  if (typeof v === 'number') return Number.isInteger(v) ? 'Integer' : 'Number'
  if (typeof v === 'string') return 'Text'
  if (typeof v === 'boolean') return 'True/False'
  return 'Date'
}

/** Converte para número (BLANK = 0). Datas viram número serial (dias). */
export function toNumber(v: Scalar): number {
  if (v === null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof DateVal) return msToSerial(v.ms)
  const t = v.trim()
  if (t === '') return 0
  let n = Number(t)
  if (Number.isNaN(n)) n = parseNumber(t, ',') ?? parseNumber(t, '.') ?? NaN
  if (Number.isNaN(n)) throw new DaxError(`Não é possível converter o valor "${v}" do tipo Texto para o tipo Número.`)
  return n
}

/** Número ou null (para agregações que ignoram vazios). */
export function toNumberOrNull(v: Scalar): number | null {
  if (v === null) return null
  return toNumber(v)
}

export function toText(v: Scalar): string {
  if (v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return formatGeneral(v)
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  return formatDate(v.ms, undefined, v.kind)
}

export function toBool(v: Scalar): boolean {
  if (v === null) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v instanceof DateVal) return v.ms !== 0
  const t = v.trim().toLowerCase()
  if (t === 'true' || t === 'verdadeiro') return true
  if (t === 'false' || t === 'falso' || t === '') return false
  throw new DaxError(`Não é possível converter o valor "${v}" do tipo Texto para Verdadeiro/Falso.`)
}

export function toDate(v: Scalar): DateVal | null {
  if (v === null) return null
  if (v instanceof DateVal) return v
  if (typeof v === 'number') return new DateVal(serialToMs(v), Number.isInteger(v) ? 'date' : 'datetime')
  if (typeof v === 'boolean') throw new DaxError('Não é possível converter Verdadeiro/Falso em data.')
  const p = parseDateTime(v, true)
  if (!p) throw new DaxError(`Não é possível converter o texto "${v}" em data.`)
  return new DateVal(p.ms, p.hasTime ? 'datetime' : 'date')
}

/** Data em ms (BLANK = null). */
export function toMs(v: Scalar): number | null {
  const d = toDate(v)
  return d ? d.ms : null
}

function dateResult(ms: number, kind: 'date' | 'datetime' | 'time'): DateVal {
  return new DateVal(ms, kind === 'time' ? 'time' : kind)
}

export function arith(op: '+' | '-' | '*' | '/' | '^', a: Scalar, b: Scalar): Scalar {
  if (op === '+' || op === '-') {
    if (a === null && b === null) return null
    const ad = a instanceof DateVal
    const bd = b instanceof DateVal
    if (ad && !bd) {
      const days = toNumber(b)
      const ms = a.ms + (op === '+' ? days : -days) * MS_PER_DAY
      return dateResult(Math.round(ms), Number.isInteger(days) ? a.kind : 'datetime')
    }
    if (bd && !ad && op === '+') {
      const days = toNumber(a)
      return dateResult(Math.round(b.ms + days * MS_PER_DAY), Number.isInteger(days) ? b.kind : 'datetime')
    }
    if (ad && bd) {
      if (op === '-') return (a.ms - b.ms) / MS_PER_DAY
      return dateResult(a.ms + b.ms - Date.UTC(1899, 11, 30), 'datetime')
    }
    const x = toNumber(a)
    const y = toNumber(b)
    return op === '+' ? x + y : x - y
  }
  if (op === '*') {
    if (a === null || b === null) return null
    return toNumber(a) * toNumber(b)
  }
  if (op === '/') {
    if (a === null && b === null) return null
    const x = toNumber(a)
    const y = toNumber(b)
    if (y === 0) {
      if (a === null) return null
      if (x === 0) return NaN
      return x > 0 ? Infinity : -Infinity
    }
    if (a === null) return null
    return x / y
  }
  // ^
  if (a === null && b === null) return null
  return Math.pow(toNumber(a), toNumber(b))
}

export function concat(a: Scalar, b: Scalar): Scalar {
  if (a === null && b === null) return ''
  return toText(a) + toText(b)
}

type Kind = 'num' | 'text' | 'bool' | 'date' | 'blank'

function kindOf(v: Scalar): Kind {
  if (v === null) return 'blank'
  if (typeof v === 'number') return 'num'
  if (typeof v === 'string') return 'text'
  if (typeof v === 'boolean') return 'bool'
  return 'date'
}

/**
 * Compara dois valores com as regras do DAX. BLANK é tratado como 0, "" ou
 * FALSE conforme o outro operando. Texto não diferencia maiúsculas.
 */
export function compareValues(a: Scalar, b: Scalar): number {
  let ka = kindOf(a)
  let kb = kindOf(b)
  if (ka === 'blank' && kb === 'blank') return 0
  if (ka === 'blank') {
    a = kb === 'text' ? '' : kb === 'bool' ? false : 0
    ka = kb === 'date' ? 'num' : kb
    if (kb === 'date') b = msToSerial((b as DateVal).ms)
    kb = kb === 'date' ? 'num' : kb
  } else if (kb === 'blank') {
    b = ka === 'text' ? '' : ka === 'bool' ? false : 0
    kb = ka === 'date' ? 'num' : ka
    if (ka === 'date') a = msToSerial((a as DateVal).ms)
    ka = ka === 'date' ? 'num' : ka
  }
  if (ka === 'date' && kb === 'date') {
    const x = (a as DateVal).ms
    const y = (b as DateVal).ms
    return x < y ? -1 : x > y ? 1 : 0
  }
  if ((ka === 'num' || ka === 'date' || ka === 'bool') && (kb === 'num' || kb === 'date' || kb === 'bool')) {
    if ((ka === 'bool') !== (kb === 'bool')) {
      throw new DaxError(`As operações de comparação do DAX não dão suporte à comparação de valores do tipo ${typeName(a)} com valores do tipo ${typeName(b)}.`)
    }
    const x = toNumber(a)
    const y = toNumber(b)
    return x < y ? -1 : x > y ? 1 : 0
  }
  if (ka === 'text' && kb === 'text') return collator.compare(a as string, b as string)
  throw new DaxError(
    `As operações de comparação do DAX não dão suporte à comparação de valores do tipo ${typeName(a)} com valores do tipo ${typeName(b)}. Considere usar VALUE ou FORMAT para converter um dos valores.`
  )
}

export function compareOp(op: string, a: Scalar, b: Scalar): boolean {
  if (op === '==') {
    // Igualdade estrita: BLANK só é igual a BLANK.
    if (a === null || b === null) return a === null && b === null
    return compareValues(a, b) === 0
  }
  const c = compareValues(a, b)
  switch (op) {
    case '=':
      return c === 0
    case '<>':
      return c !== 0
    case '<':
      return c < 0
    case '>':
      return c > 0
    case '<=':
      return c <= 0
    default:
      return c >= 0
  }
}

/** Comparação para ordenação (BLANK primeiro, tipos mistos por tipo). */
export function sortCompare(a: Scalar, b: Scalar): number {
  if (a === null) return b === null ? 0 : -1
  if (b === null) return 1
  const ka = kindOf(a)
  const kb = kindOf(b)
  if (ka !== kb) {
    const order: Record<Kind, number> = { blank: 0, bool: 1, num: 2, date: 3, text: 4 }
    if (!((ka === 'num' && kb === 'date') || (ka === 'date' && kb === 'num'))) return order[ka] - order[kb]
  }
  if (ka === 'text') return collator.compare(a as string, b as string)
  if (ka === 'bool') return (a ? 1 : 0) - (b ? 1 : 0)
  const x = a instanceof DateVal ? a.ms : (a as number)
  const y = b instanceof DateVal ? b.ms : (b as number)
  return x < y ? -1 : x > y ? 1 : 0
}

export { collator }
