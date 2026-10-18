// Análise de texto e conversão de tipos (com detecção de cultura).
import { Column, ColumnBuilder } from './column'
import { type DataType, DateVal, type Scalar, isDateType } from './types'
import { MS_PER_DAY, OLE_EPOCH_MS, dateOnly, isValidYmd, makeDate, monthFromName, msToSerial, serialToMs, timeOfDay } from './dates'

export interface CultureOptions {
  /** Separador decimal dos textos de origem. */
  decimalSep: ',' | '.'
  /** Datas no formato dia/mês (true) ou mês/dia (false). */
  dayFirst: boolean
}

export const CULTURE_PT_BR: CultureOptions = { decimalSep: ',', dayFirst: true }
export const CULTURE_EN_US: CultureOptions = { decimalSep: '.', dayFirst: false }

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

const NUM_COMMA = /^(?:\d{1,3}(?:\.\d{3})+|\d+)?(?:,\d*)?(?:[eE][+-]?\d+)?$/
const NUM_DOT = /^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d*)?(?:[eE][+-]?\d+)?$/
const CURRENCY_PREFIX = /^(?:R\$|US\$|\$|€|£|¥)\s*/
const CURRENCY_SUFFIX = /\s*(?:R\$|€|£|¥|BRL|USD|EUR)$/

interface NumberParts {
  body: string
  neg: boolean
  pct: boolean
  currency: boolean
}

function splitNumber(raw: string): NumberParts | undefined {
  let s = raw.trim()
  if (!s) return undefined
  let neg = false
  let currency = false
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true
    s = s.slice(1, -1).trim()
  }
  if (s[0] === '-' || s[0] === '−') {
    neg = !neg
    s = s.slice(1).trim()
  } else if (s[0] === '+') s = s.slice(1).trim()
  if (CURRENCY_PREFIX.test(s)) {
    currency = true
    s = s.replace(CURRENCY_PREFIX, '')
    if (s[0] === '-') {
      neg = !neg
      s = s.slice(1).trim()
    }
  }
  if (CURRENCY_SUFFIX.test(s)) {
    currency = true
    s = s.replace(CURRENCY_SUFFIX, '')
  }
  let pct = false
  if (s.endsWith('%')) {
    pct = true
    s = s.slice(0, -1).trim()
  }
  if (s.endsWith('-')) {
    neg = !neg
    s = s.slice(0, -1)
  }
  s = s.replace(/[\s  ']/g, '')
  if (!s || !/\d/.test(s)) return undefined
  return { body: s, neg, pct, currency }
}

/** Converte texto em número; undefined se inválido. */
export function parseNumber(raw: string, decimalSep: ',' | '.' = ','): number | undefined {
  const p = splitNumber(raw)
  if (!p) return undefined
  let s = p.body
  if (decimalSep === ',') {
    if (!NUM_COMMA.test(s)) return undefined
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    if (!NUM_DOT.test(s)) return undefined
    s = s.replace(/,/g, '')
  }
  if (s === '.' || s === '') return undefined
  let v = Number(s)
  if (!Number.isFinite(v)) return undefined
  if (p.pct) v = v / 100
  return p.neg ? -v : v
}

type DecimalEvidence = ',' | '.' | 'ambiguous' | 'none' | 'invalid'

/** Indica qual separador decimal o texto sugere. */
function decimalEvidence(raw: string): DecimalEvidence {
  const p = splitNumber(raw)
  if (!p) return 'invalid'
  const s = p.body
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  const okComma = NUM_COMMA.test(s)
  const okDot = NUM_DOT.test(s)
  if (!okComma && !okDot) return 'invalid'
  if (!hasComma && !hasDot) return 'none'
  if (hasComma && hasDot) return s.lastIndexOf(',') > s.lastIndexOf('.') ? (okComma ? ',' : 'invalid') : okDot ? '.' : 'invalid'
  if (hasComma) {
    const parts = s.split(',')
    if (parts.length > 2) return okDot ? '.' : 'invalid'
    if (parts[1].length === 3 && parts[0].length > 0 && parts[0].length <= 3 && okDot) return 'ambiguous'
    return okComma ? ',' : 'invalid'
  }
  const parts = s.split('.')
  if (parts.length > 2) return okComma ? ',' : 'invalid'
  if (parts[1].length === 3 && parts[0].length > 0 && parts[0].length <= 3 && okComma) return 'ambiguous'
  return okDot ? '.' : 'invalid'
}

// ---------------------------------------------------------------------------
// Datas e horas
// ---------------------------------------------------------------------------

export interface ParsedDate {
  ms: number
  hasDate: boolean
  hasTime: boolean
  /** true se o texto é inequivocamente dia-primeiro, false se mês-primeiro, null se ambíguo. */
  dayFirstEvidence: boolean | null
}

const RE_ISO =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,7}))?)?\s*(?:Z|[+-]\d{2}:?\d{2})?)?$/i
const RE_DMY =
  /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,7}))?)?\s*([AaPp]\.?[Mm]\.?)?)?$/
const RE_D_MON_Y =
  /^(\d{1,2})(?:º)?[\s\-/.]+(?:de\s+)?([A-Za-zÀ-ÿ]{3,})\.?[\s\-/.,]+(?:de\s+)?(\d{4}|\d{2})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/i
const RE_MON_D_Y = /^([A-Za-zÀ-ÿ]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/i
const RE_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,7}))?)?\s*([AaPp]\.?[Mm]\.?)?$/

function fullYear(y: string): number {
  const n = Number(y)
  if (y.length === 4) return n
  return n < 50 ? 2000 + n : 1900 + n
}

function hours12(h: number, ampm: string | undefined): number {
  if (!ampm) return h
  const pm = ampm[0].toLowerCase() === 'p'
  if (h === 12) return pm ? 12 : 0
  return pm ? h + 12 : h
}

function fraction(f: string | undefined): number {
  if (!f) return 0
  return Math.round(Number(`0.${f}`) * 1000)
}

export function parseDateTime(raw: string, dayFirst = true): ParsedDate | undefined {
  const s = raw.trim()
  if (s.length < 4 || s.length > 40) return undefined
  let m = RE_ISO.exec(s)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (!isValidYmd(y, mo, d)) return undefined
    const hasTime = m[4] !== undefined
    const hh = hasTime ? Number(m[4]) : 0
    const mi = hasTime ? Number(m[5]) : 0
    const ss = m[6] ? Number(m[6]) : 0
    if (hh > 23 || mi > 59 || ss > 59) return undefined
    return { ms: makeDate(y, mo, d, hh, mi, ss, fraction(m[7])), hasDate: true, hasTime, dayFirstEvidence: null }
  }
  m = RE_DMY.exec(s)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const y = fullYear(m[3])
    let d: number
    let mo: number
    let evidence: boolean | null = null
    if (a > 12 && b <= 12) {
      d = a
      mo = b
      evidence = true
    } else if (b > 12 && a <= 12) {
      d = b
      mo = a
      evidence = false
    } else if (dayFirst) {
      d = a
      mo = b
    } else {
      d = b
      mo = a
    }
    if (!isValidYmd(y, mo, d)) return undefined
    const hasTime = m[4] !== undefined
    const hh = hasTime ? hours12(Number(m[4]), m[8]) : 0
    const mi = hasTime ? Number(m[5]) : 0
    const ss = m[6] ? Number(m[6]) : 0
    if (hh > 23 || mi > 59 || ss > 59) return undefined
    return { ms: makeDate(y, mo, d, hh, mi, ss, fraction(m[7])), hasDate: true, hasTime, dayFirstEvidence: evidence }
  }
  m = RE_D_MON_Y.exec(s)
  if (m) {
    const mo = monthFromName(m[2])
    if (!mo) return undefined
    const d = Number(m[1])
    const y = fullYear(m[3])
    if (!isValidYmd(y, mo, d)) return undefined
    const hasTime = m[4] !== undefined
    const hh = hasTime ? hours12(Number(m[4]), m[7]) : 0
    const mi = hasTime ? Number(m[5]) : 0
    const ss = m[6] ? Number(m[6]) : 0
    return { ms: makeDate(y, mo, d, hh, mi, ss), hasDate: true, hasTime, dayFirstEvidence: null }
  }
  m = RE_MON_D_Y.exec(s)
  if (m) {
    const mo = monthFromName(m[1])
    if (!mo) return undefined
    const d = Number(m[2])
    const y = Number(m[3])
    if (!isValidYmd(y, mo, d)) return undefined
    const hasTime = m[4] !== undefined
    const hh = hasTime ? hours12(Number(m[4]), m[7]) : 0
    const mi = hasTime ? Number(m[5]) : 0
    const ss = m[6] ? Number(m[6]) : 0
    return { ms: makeDate(y, mo, d, hh, mi, ss), hasDate: true, hasTime, dayFirstEvidence: null }
  }
  m = RE_TIME.exec(s)
  if (m) {
    const hh = hours12(Number(m[1]), m[5])
    const mi = Number(m[2])
    const ss = m[3] ? Number(m[3]) : 0
    if (hh > 23 || mi > 59 || ss > 59) return undefined
    return {
      ms: OLE_EPOCH_MS + hh * 3_600_000 + mi * 60_000 + ss * 1000 + fraction(m[4]),
      hasDate: false,
      hasTime: true,
      dayFirstEvidence: null
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Booleanos
// ---------------------------------------------------------------------------

const TRUE_WORDS = new Set(['true', 'verdadeiro', 'sim', 'yes', 'y', 's', 'v'])
const FALSE_WORDS = new Set(['false', 'falso', 'não', 'nao', 'no', 'n', 'f'])
const STRICT_BOOL = new Set(['true', 'false', 'verdadeiro', 'falso'])

export function parseBool(raw: string): boolean | undefined {
  const s = raw.trim().toLowerCase()
  if (TRUE_WORDS.has(s) || s === '1') return true
  if (FALSE_WORDS.has(s) || s === '0') return false
  return undefined
}

// ---------------------------------------------------------------------------
// Conversão de valores
// ---------------------------------------------------------------------------

export class ConversionError {
  constructor(readonly message: string) {}
}

function roundHalfEven(x: number): number {
  const r = Math.round(x)
  if (Math.abs(x % 1) === 0.5 && r % 2 !== 0) return r - 1
  return r
}

export function numberToText(n: number, decimalSep: ',' | '.' = ','): string {
  if (!Number.isFinite(n)) return String(n)
  let s = Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(15)))
  if (s.includes('e')) s = n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 })
  return decimalSep === ',' ? s.replace('.', ',') : s
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function dateToText(v: DateVal, dayFirst = true): string {
  const d = new Date(v.ms)
  const date = dayFirst
    ? `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
    : `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}/${d.getUTCFullYear()}`
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
  if (v.kind === 'date') return date
  if (v.kind === 'time') return time
  return `${date} ${time}`
}

export function scalarToText(v: Scalar, culture: CultureOptions = CULTURE_PT_BR): string | null {
  if (v === null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number') return numberToText(v, culture.decimalSep)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return dateToText(v, culture.dayFirst)
}

/** Converte um valor para o tipo de destino. Retorna ConversionError em caso de falha. */
export function convertValue(v: Scalar, target: DataType, culture: CultureOptions = CULTURE_PT_BR): Scalar | ConversionError {
  if (v === null) return null
  switch (target) {
    case 'any':
      return v
    case 'text':
      return scalarToText(v, culture)
    case 'int':
    case 'number':
    case 'currency': {
      let n: number
      if (typeof v === 'number') n = v
      else if (typeof v === 'boolean') n = v ? 1 : 0
      else if (v instanceof DateVal) n = msToSerial(v.ms)
      else {
        const t = v.trim()
        if (!t) return null
        const p = parseNumber(t, culture.decimalSep)
        if (p === undefined) return new ConversionError(`Não foi possível converter "${v}" em número.`)
        n = p
      }
      if (target === 'int') return roundHalfEven(n)
      if (target === 'currency') return Math.round(n * 10000) / 10000
      return n
    }
    case 'bool': {
      if (typeof v === 'boolean') return v
      if (typeof v === 'number') return v !== 0
      if (typeof v === 'string') {
        if (!v.trim()) return null
        const b = parseBool(v)
        if (b === undefined) return new ConversionError(`Não foi possível converter "${v}" em Verdadeiro/Falso.`)
        return b
      }
      return new ConversionError('Não é possível converter data em Verdadeiro/Falso.')
    }
    case 'date':
    case 'datetime':
    case 'time': {
      let ms: number
      if (v instanceof DateVal) ms = v.ms
      else if (typeof v === 'number') ms = serialToMs(v)
      else if (typeof v === 'boolean') return new ConversionError('Não é possível converter Verdadeiro/Falso em data.')
      else {
        const t = v.trim()
        if (!t) return null
        const p = parseDateTime(t, culture.dayFirst)
        if (!p) return new ConversionError(`Não foi possível converter "${v}" em ${target === 'time' ? 'hora' : 'data'}.`)
        if (target === 'time' && !p.hasTime && p.hasDate) return new ConversionError(`"${v}" não contém hora.`)
        ms = p.ms
      }
      if (target === 'date') return new DateVal(dateOnly(ms), 'date')
      if (target === 'time') return new DateVal(OLE_EPOCH_MS + timeOfDay(ms), 'time')
      return new DateVal(ms, 'datetime')
    }
  }
}

/** Converte uma coluna inteira (com memoização por valor de dicionário). */
export function convertColumn(col: Column, target: DataType, culture: CultureOptions = CULTURE_PT_BR): Column {
  if (col.type === target && !(target === 'any')) return col
  const n = col.length
  const b = new ColumnBuilder(target, n)
  const d = col.data
  if (d.kind === 'text') {
    const cache: (Scalar | ConversionError | undefined)[] = new Array(d.dict.length)
    for (let i = 0; i < n; i++) {
      if (col.hasError(i)) {
        b.pushError(col.errorMessage ?? undefined)
        continue
      }
      const c = d.codes[i]
      if (c < 0) {
        b.push(null)
        continue
      }
      let r = cache[c]
      if (r === undefined) {
        r = convertValue(d.dict[c], target, culture)
        cache[c] = r
      }
      if (r instanceof ConversionError) b.pushError(r.message)
      else b.push(r)
    }
  } else if (d.kind === 'num' && (target === 'int' || target === 'number' || target === 'currency') && !isDateType(col.type)) {
    for (let i = 0; i < n; i++) {
      if (col.hasError(i)) {
        b.pushError(col.errorMessage ?? undefined)
        continue
      }
      const x = d.values[i]
      if (x !== x) b.pushNum(NaN)
      else if (target === 'int') b.pushNum(roundHalfEven(x))
      else if (target === 'currency') b.pushNum(Math.round(x * 10000) / 10000)
      else b.pushNum(x)
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (col.hasError(i)) {
        b.pushError(col.errorMessage ?? undefined)
        continue
      }
      const r = convertValue(col.get(i), target, culture)
      if (r instanceof ConversionError) b.pushError(r.message)
      else b.push(r)
    }
  }
  return b.build(col.name)
}

// ---------------------------------------------------------------------------
// Detecção de tipo
// ---------------------------------------------------------------------------

export interface TypeGuess {
  type: DataType
  decimalSep: ',' | '.'
  dayFirst: boolean
}

type Kind = 'bool' | 'int' | 'dec' | 'date' | 'datetime' | 'time' | 'text'

function classifyText(s: string, ev: { comma: number; dot: number; dayFirst: number; monthFirst: number }): Kind {
  const t = s.trim()
  if (STRICT_BOOL.has(t.toLowerCase())) return 'bool'
  if (/^[+-]?\d+$/.test(t)) {
    const digits = t.replace(/^[+-]/, '')
    if (digits.length > 1 && digits[0] === '0') return 'text' // códigos com zero à esquerda
    if (digits.length > 15) return 'text'
    return 'int'
  }
  const e = decimalEvidence(t)
  if (e !== 'invalid') {
    if (e === ',') ev.comma++
    else if (e === '.') ev.dot++
    return 'dec'
  }
  const pd = parseDateTime(t, true)
  if (pd) {
    if (pd.dayFirstEvidence === true) ev.dayFirst++
    else if (pd.dayFirstEvidence === false) ev.monthFirst++
    if (!pd.hasDate) return 'time'
    if (pd.hasTime && timeOfDay(pd.ms) !== 0) return 'datetime'
    return pd.hasTime ? 'datetime' : 'date'
  }
  return 'text'
}

function decideKinds(kinds: Set<Kind>): DataType {
  if (kinds.size === 0) return 'text'
  if (kinds.has('text')) return 'text'
  const only = (...ks: Kind[]) => [...kinds].every((k) => ks.includes(k))
  if (only('int')) return 'int'
  if (only('int', 'dec')) return 'number'
  if (only('bool')) return 'bool'
  if (only('date')) return 'date'
  if (only('date', 'datetime')) return 'datetime'
  if (only('time')) return 'time'
  return 'text'
}

/** Detecta o tipo mais adequado para uma coluna (texto ou qualquer). */
export function inferColumnType(col: Column, defaults: CultureOptions = CULTURE_PT_BR, sampleLimit = 5000): TypeGuess {
  const ev = { comma: 0, dot: 0, dayFirst: 0, monthFirst: 0 }
  const kinds = new Set<Kind>()
  const d = col.data
  let seen = 0
  const consider = (v: Scalar) => {
    if (v === null) return
    if (typeof v === 'string') {
      if (!v.trim()) return
      kinds.add(classifyText(v, ev))
    } else if (typeof v === 'number') kinds.add(Number.isInteger(v) ? 'int' : 'dec')
    else if (typeof v === 'boolean') kinds.add('bool')
    else if (v instanceof DateVal) {
      if (v.kind === 'time') kinds.add('time')
      else kinds.add(v.kind === 'date' || timeOfDay(v.ms) === 0 ? 'date' : 'datetime')
    }
    seen++
  }
  if (d.kind === 'text') {
    // O dicionário contém valores distintos, mas pode ter entradas não usadas
    // (após filtros/fatiamento): considera só as referenciadas.
    const used = new Uint8Array(d.dict.length)
    for (let i = 0; i < d.codes.length; i++) {
      const c = d.codes[i]
      if (c >= 0) used[c] = 1
    }
    let considered = 0
    for (let i = 0; i < d.dict.length && considered < sampleLimit; i++) {
      if (!used[i]) continue
      considered++
      consider(d.dict[i])
    }
  } else {
    const n = col.length
    for (let i = 0; i < n && seen < sampleLimit; i++) consider(col.get(i))
  }
  let type = decideKinds(kinds)
  // Coluna sem nenhum valor preenchido: mantém texto (ou o tipo atual).
  if (seen === 0) type = d.kind === 'text' || col.type === 'any' ? 'text' : col.type
  let decimalSep = defaults.decimalSep
  if (ev.comma > ev.dot) decimalSep = ','
  else if (ev.dot > ev.comma) decimalSep = '.'
  let dayFirst = defaults.dayFirst
  if (ev.dayFirst > ev.monthFirst) dayFirst = true
  else if (ev.monthFirst > ev.dayFirst) dayFirst = false
  return { type, decimalSep, dayFirst }
}

export { MS_PER_DAY }
