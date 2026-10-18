// Formatação de valores com cadeias de formato no estilo Excel/.NET/VB.
import { type DataType, DateVal, type Scalar } from './types'
import {
  DAY_ABBR_EN,
  DAY_ABBR_PT,
  DAY_NAMES_EN,
  DAY_NAMES_PT,
  MONTH_ABBR_EN,
  MONTH_ABBR_PT,
  MONTH_NAMES_EN,
  MONTH_NAMES_PT,
  timeOfDay
} from './dates'

export type Locale = 'pt-BR' | 'en-US'

interface LocaleInfo {
  decimal: string
  group: string
  currency: string
  months: string[]
  monthsAbbr: string[]
  days: string[]
  daysAbbr: string[]
  trueText: string
  falseText: string
  blank: string
  units: [number, string][]
  shortDate: string
  longDate: string
  shortTime: string
  longTime: string
}

const LOCALES: Record<Locale, LocaleInfo> = {
  'pt-BR': {
    decimal: ',',
    group: '.',
    currency: 'R$',
    months: MONTH_NAMES_PT,
    monthsAbbr: MONTH_ABBR_PT,
    days: DAY_NAMES_PT,
    daysAbbr: DAY_ABBR_PT,
    trueText: 'Verdadeiro',
    falseText: 'Falso',
    blank: '',
    units: [
      [1e12, ' Tri'],
      [1e9, ' Bi'],
      [1e6, ' Mi'],
      [1e3, ' Mil']
    ],
    shortDate: 'dd/MM/yyyy',
    longDate: "dddd, d 'de' MMMM 'de' yyyy",
    shortTime: 'HH:mm',
    longTime: 'HH:mm:ss'
  },
  'en-US': {
    decimal: '.',
    group: ',',
    currency: '$',
    months: MONTH_NAMES_EN,
    monthsAbbr: MONTH_ABBR_EN,
    days: DAY_NAMES_EN,
    daysAbbr: DAY_ABBR_EN,
    trueText: 'True',
    falseText: 'False',
    blank: '',
    units: [
      [1e12, 'T'],
      [1e9, 'bn'],
      [1e6, 'M'],
      [1e3, 'K']
    ],
    shortDate: 'M/d/yyyy',
    longDate: 'dddd, MMMM d, yyyy',
    shortTime: 'h:mm tt',
    longTime: 'h:mm:ss tt'
  }
}

let currentLocale: Locale = 'pt-BR'

export function setLocale(l: Locale): void {
  currentLocale = l
}
export function getLocale(): Locale {
  return currentLocale
}
export function localeInfo(l: Locale = currentLocale): LocaleInfo {
  return LOCALES[l]
}

// ---------------------------------------------------------------------------
// Formatos numéricos
// ---------------------------------------------------------------------------

type NumTok =
  | { t: 'lit'; s: string }
  | { t: 'digit'; zero: boolean }
  | { t: 'point' }
  | { t: 'percent' }
  | { t: 'permille' }
  | { t: 'exp'; plus: boolean; digits: number; upper: boolean }

interface NumSection {
  int: NumTok[] // tokens antes do ponto decimal
  frac: NumTok[] // tokens depois do ponto decimal
  hasPoint: boolean
  grouping: boolean
  scale: number // divisões por 1000 (vírgulas finais)
  percent: number // multiplicador por % / ‰
  exp: { plus: boolean; digits: number; upper: boolean } | null
  minInt: number
  minFrac: number
  maxFrac: number
  hasDigits: boolean
}

function parseNumSection(fmt: string): NumSection {
  const toks: NumTok[] = []
  let i = 0
  let grouping = false
  let scale = 0
  let percent = 1
  let exp: NumSection['exp'] = null
  while (i < fmt.length) {
    const c = fmt[i]
    if (c === '"') {
      const j = fmt.indexOf('"', i + 1)
      const end = j < 0 ? fmt.length : j
      toks.push({ t: 'lit', s: fmt.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (c === "'") {
      const j = fmt.indexOf("'", i + 1)
      const end = j < 0 ? fmt.length : j
      toks.push({ t: 'lit', s: fmt.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (c === '\\') {
      toks.push({ t: 'lit', s: fmt[i + 1] ?? '' })
      i += 2
      continue
    }
    if (c === '0' || c === '#') {
      toks.push({ t: 'digit', zero: c === '0' })
      i++
      continue
    }
    if (c === '.') {
      toks.push({ t: 'point' })
      i++
      continue
    }
    if (c === ',') {
      // Vírgula entre dígitos = agrupamento; vírgulas finais = escala.
      let j = i
      while (fmt[j] === ',') j++
      const next = fmt[j]
      const prevDigit = toks.length > 0 && toks[toks.length - 1].t === 'digit'
      if (prevDigit && (next === '0' || next === '#')) {
        grouping = true
      } else if (prevDigit) {
        scale += j - i
      }
      i = j
      continue
    }
    if (c === '%') {
      percent *= 100
      toks.push({ t: 'percent' })
      i++
      continue
    }
    if (c === '‰') {
      percent *= 1000
      toks.push({ t: 'permille' })
      i++
      continue
    }
    if ((c === 'E' || c === 'e') && (fmt[i + 1] === '+' || fmt[i + 1] === '-') && (fmt[i + 2] === '0' || fmt[i + 2] === '#')) {
      let j = i + 2
      while (fmt[j] === '0' || fmt[j] === '#') j++
      exp = { plus: fmt[i + 1] === '+', digits: j - (i + 2), upper: c === 'E' }
      toks.push({ t: 'exp', ...exp })
      i = j
      continue
    }
    toks.push({ t: 'lit', s: c })
    i++
  }
  const pointIdx = toks.findIndex((t) => t.t === 'point')
  const int = pointIdx >= 0 ? toks.slice(0, pointIdx) : toks
  const frac = pointIdx >= 0 ? toks.slice(pointIdx + 1) : []
  let minInt = 0
  let minFrac = 0
  let maxFrac = 0
  let hasDigits = false
  for (const t of int) if (t.t === 'digit') {
    hasDigits = true
    if (t.zero) minInt++
  }
  for (const t of frac) if (t.t === 'digit') {
    hasDigits = true
    maxFrac++
    if (t.zero) minFrac = maxFrac
  }
  return { int, frac, hasPoint: pointIdx >= 0, grouping, scale, percent, exp, minInt, minFrac, maxFrac, hasDigits }
}

interface NumFormat {
  sections: NumSection[]
}

const numFormatCache = new Map<string, NumFormat>()

function splitSections(fmt: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote: string | null = null
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i]
    if (inQuote) {
      cur += c
      if (c === inQuote) inQuote = null
      continue
    }
    if (c === '"' || c === "'") {
      inQuote = c
      cur += c
      continue
    }
    if (c === '\\') {
      cur += c + (fmt[i + 1] ?? '')
      i++
      continue
    }
    if (c === ';') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

function getNumFormat(fmt: string): NumFormat {
  let f = numFormatCache.get(fmt)
  if (!f) {
    f = { sections: splitSections(fmt).map(parseNumSection) }
    numFormatCache.set(fmt, f)
  }
  return f
}

function groupDigits(digits: string, sep: string): string {
  if (digits.length <= 3) return digits
  let out = ''
  let count = 0
  for (let i = digits.length - 1; i >= 0; i--) {
    out = digits[i] + out
    count++
    if (count % 3 === 0 && i > 0) out = sep + out
  }
  return out
}

function toFixedSafe(x: number, digits: number): string {
  if (Math.abs(x) >= 1e21) return x.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: digits })
  // Arredondamento "meio para cima" estável (evita 1.005 -> 1.00).
  const s = x.toFixed(digits)
  const shifted = Number(`${x}e${digits}`)
  if (Number.isFinite(shifted)) {
    const r = Math.round(shifted)
    const alt = Number(`${r}e-${digits}`)
    if (Number.isFinite(alt)) return alt.toFixed(digits)
  }
  return s
}

function applyNumSection(sec: NumSection, value: number, loc: LocaleInfo, negSignNeeded: boolean): string {
  let x = Math.abs(value) * sec.percent
  for (let k = 0; k < sec.scale; k++) x /= 1000
  if (!sec.hasDigits) {
    // Seção somente com texto literal.
    return sec.int
      .concat(sec.frac)
      .map((t) => (t.t === 'lit' ? t.s : t.t === 'percent' ? '%' : t.t === 'permille' ? '‰' : ''))
      .join('')
  }
  let expStr = ''
  if (sec.exp) {
    let e = 0
    if (x !== 0) {
      const intDigits = Math.max(1, sec.minInt || 1)
      e = Math.floor(Math.log10(x)) - (intDigits - 1)
      x = x / Math.pow(10, e)
      if (Number(toFixedSafe(x, sec.maxFrac)) >= Math.pow(10, intDigits)) {
        x /= 10
        e += 1
      }
    }
    const sign = e < 0 ? '-' : sec.exp.plus ? '+' : ''
    expStr = (sec.exp.upper ? 'E' : 'e') + sign + String(Math.abs(e)).padStart(sec.exp.digits, '0')
  }
  const fixed = toFixedSafe(x, sec.maxFrac)
  let [intDigits, fracDigits = ''] = fixed.split('.')
  if (intDigits === '0' && sec.minInt === 0) intDigits = ''
  // Remove zeros finais opcionais (#).
  if (fracDigits.length > sec.minFrac) {
    let end = fracDigits.length
    while (end > sec.minFrac && fracDigits[end - 1] === '0') end--
    fracDigits = fracDigits.slice(0, end)
  }
  if (intDigits.length < sec.minInt) intDigits = intDigits.padStart(sec.minInt, '0')

  // Parte inteira: preenche da direita para a esquerda (suporta literais no meio).
  const intToks = sec.int
  const hasMiddleLiteral = (() => {
    let seenDigit = false
    let litAfterDigit = false
    for (const t of intToks) {
      if (t.t === 'digit') {
        if (litAfterDigit) return true
        seenDigit = true
      } else if (seenDigit && t.t === 'lit') litAfterDigit = true
    }
    return false
  })()
  let intOut = ''
  if (!hasMiddleLiteral) {
    const digitsStr = sec.grouping ? groupDigits(intDigits, loc.group) : intDigits
    let placed = false
    for (const t of intToks) {
      if (t.t === 'digit') {
        if (!placed) {
          intOut += digitsStr
          placed = true
        }
      } else if (t.t === 'lit') intOut += t.s
      else if (t.t === 'percent') intOut += '%'
      else if (t.t === 'permille') intOut += '‰'
    }
  } else {
    let di = intDigits.length - 1
    const parts: string[] = []
    let firstDigitIdx = intToks.findIndex((t) => t.t === 'digit')
    for (let k = intToks.length - 1; k >= 0; k--) {
      const t = intToks[k]
      if (t.t === 'digit') {
        if (di >= 0) {
          let chunk = intDigits[di--]
          if (k === firstDigitIdx && di >= 0) {
            chunk = intDigits.slice(0, di + 1) + chunk
            di = -1
          }
          parts.unshift(chunk)
        } else if (t.zero) parts.unshift('0')
      } else if (t.t === 'lit') parts.unshift(t.s)
      else if (t.t === 'percent') parts.unshift('%')
      else if (t.t === 'permille') parts.unshift('‰')
    }
    intOut = parts.join('')
  }

  let fracOut = ''
  if (sec.hasPoint) {
    let fi = 0
    for (const t of sec.frac) {
      if (t.t === 'digit') {
        if (fi < fracDigits.length) fracOut += fracDigits[fi]
        fi++
      } else if (t.t === 'lit') fracOut += t.s
      else if (t.t === 'percent') fracOut += '%'
      else if (t.t === 'permille') fracOut += '‰'
      else if (t.t === 'exp') fracOut += expStr
    }
    if (fracDigits.length > 0) fracOut = loc.decimal + fracOut
    else {
      // Sem casas: mantém apenas literais da parte fracionária.
      fracOut = sec.frac
        .map((t) => (t.t === 'lit' ? t.s : t.t === 'percent' ? '%' : t.t === 'permille' ? '‰' : t.t === 'exp' ? expStr : ''))
        .join('')
    }
  } else if (sec.exp) {
    intOut = intOut.replace(/$/, '')
    fracOut = expStr
  }
  if (intOut === '' && fracOut.startsWith(loc.decimal)) intOut = '0'
  const body = intOut + fracOut
  return negSignNeeded ? '-' + body : body
}

function translateNamedNumber(fmt: string, loc: LocaleInfo): string | null {
  switch (fmt.toLowerCase()) {
    case 'general number':
    case 'g':
      return null
    case 'currency':
    case 'c':
      return `"${loc.currency}" #,0.00`
    case 'fixed':
    case 'f':
      return '0.00'
    case 'standard':
    case 'n':
      return '#,0.00'
    case 'percent':
    case 'p':
      return '0.00%'
    case 'scientific':
    case 'e':
      return '0.00E+00'
    default:
      return fmt
  }
}

export function formatNumber(value: number, fmt: string | undefined, locale: Locale = currentLocale): string {
  const loc = LOCALES[locale]
  if (!Number.isFinite(value)) {
    if (value !== value) return 'NaN'
    return value > 0 ? '∞' : '-∞'
  }
  const named = fmt ? translateNamedNumber(fmt, loc) : null
  if (!fmt || named === null) return formatGeneral(value, locale)
  const f = getNumFormat(named)
  const s = f.sections
  if (value < 0 && s.length >= 2 && s[1].int.length + s[1].frac.length > 0) return applyNumSection(s[1], value, loc, false)
  if (value === 0 && s.length >= 3) return applyNumSection(s[2], value, loc, false)
  const out = applyNumSection(s[0], value, loc, false)
  if (value < 0) {
    // Evita "-0" quando o arredondamento zera o número.
    return /[1-9]/.test(out) ? '-' + out : out
  }
  return out
}

/** Formato geral: até 15 dígitos significativos, sem agrupamento. */
export function formatGeneral(value: number, locale: Locale = currentLocale): string {
  const loc = LOCALES[locale]
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value)
  let s = String(Number(value.toPrecision(15)))
  if (s.includes('e')) {
    return s.replace('.', loc.decimal)
  }
  return s.replace('.', loc.decimal)
}

/** Formata com agrupamento e casas decimais fixas. */
export function formatFixed(value: number, decimals: number, locale: Locale = currentLocale, grouping = true): string {
  const fmt = (grouping ? '#,0' : '0') + (decimals > 0 ? '.' + '0'.repeat(decimals) : '')
  return formatNumber(value, fmt, locale)
}

// ---------------------------------------------------------------------------
// Unidades de exibição (Mil, Mi, Bi...)
// ---------------------------------------------------------------------------

export type DisplayUnits = 'auto' | 'none' | 'thousands' | 'millions' | 'billions' | 'trillions'

export function unitFor(maxAbs: number, units: DisplayUnits): number {
  switch (units) {
    case 'none':
      return 1
    case 'thousands':
      return 1e3
    case 'millions':
      return 1e6
    case 'billions':
      return 1e9
    case 'trillions':
      return 1e12
    default:
      if (maxAbs >= 1e12) return 1e12
      if (maxAbs >= 1e9) return 1e9
      if (maxAbs >= 1e6) return 1e6
      if (maxAbs >= 1e3) return 1e3
      return 1
  }
}

export function unitSuffix(unit: number, locale: Locale = currentLocale): string {
  const loc = LOCALES[locale]
  for (const [u, s] of loc.units) if (u === unit) return s
  return ''
}

/**
 * Formata um número de forma compacta (ex.: 1,2 Mi). Se `fmt` for informado,
 * a parte numérica é formatada com ele (mantendo %, moeda etc.).
 */
export function formatCompact(
  value: number,
  opts: { units?: DisplayUnits; decimals?: number; fmt?: string; reference?: number; locale?: Locale } = {}
): string {
  const locale = opts.locale ?? currentLocale
  const ref = Math.abs(opts.reference ?? value)
  const isPercent = opts.fmt ? /%/.test(opts.fmt.replace(/"[^"]*"/g, '')) : false
  if (isPercent) {
    const dec = opts.decimals ?? (Math.abs(value) < 0.1 ? 1 : 0)
    return formatNumber(value, '0' + (dec > 0 ? '.' + '0'.repeat(dec) : '') + '%', locale)
  }
  const unit = unitFor(ref, opts.units ?? 'auto')
  const scaled = value / unit
  let dec = opts.decimals
  if (dec === undefined) {
    const a = Math.abs(scaled)
    if (unit === 1) dec = Number.isInteger(value) ? 0 : a < 10 ? 2 : a < 1000 ? 1 : 0
    else dec = a < 10 ? 2 : a < 100 ? 1 : 0
  }
  let prefix = ''
  let suffix = ''
  if (opts.fmt) {
    const m = /^([^#0.,]*?)[#0]/.exec(opts.fmt.split(';')[0])
    if (m) prefix = m[1].replace(/"/g, '')
    const m2 = /[#0]([^#0.,%]*)$/.exec(opts.fmt.split(';')[0])
    if (m2) suffix = m2[1].replace(/"/g, '')
  }
  const core = formatNumber(Math.abs(scaled), '#,0' + (dec > 0 ? '.' + '0'.repeat(dec) : ''), locale)
  const sign = scaled < 0 && /[1-9]/.test(core) ? '-' : ''
  return sign + prefix + core + unitSuffix(unit, locale) + suffix
}

// ---------------------------------------------------------------------------
// Formatos de data
// ---------------------------------------------------------------------------

type DateTok = { t: 'lit'; s: string } | { t: 'f'; f: string }

const dateFormatCache = new Map<string, DateTok[]>()

function parseDateFormat(fmt: string): DateTok[] {
  const cached = dateFormatCache.get(fmt)
  if (cached) return cached
  const toks: DateTok[] = []
  let i = 0
  while (i < fmt.length) {
    const c = fmt[i]
    if (c === '"' || c === "'") {
      const j = fmt.indexOf(c, i + 1)
      const end = j < 0 ? fmt.length : j
      toks.push({ t: 'lit', s: fmt.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (c === '\\') {
      toks.push({ t: 'lit', s: fmt[i + 1] ?? '' })
      i += 2
      continue
    }
    const lower = fmt.slice(i).toLowerCase()
    if (lower.startsWith('am/pm')) {
      toks.push({ t: 'f', f: 'AM/PM' })
      i += 5
      continue
    }
    if (lower.startsWith('a/p')) {
      toks.push({ t: 'f', f: 'A/P' })
      i += 3
      continue
    }
    if (/[dMmyYhHnsStTqfFw]/.test(c)) {
      let j = i
      while (j < fmt.length && fmt[j] === c) j++
      toks.push({ t: 'f', f: fmt.slice(i, j) })
      i = j
      continue
    }
    toks.push({ t: 'lit', s: c })
    i++
  }
  // Regra VB: "m"/"mm" é minuto quando segue hora ou precede segundos.
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    if (t.t !== 'f' || !/^m{1,2}$/.test(t.f)) continue
    let prev: DateTok | undefined
    for (let p = k - 1; p >= 0; p--) if (toks[p].t === 'f') {
      prev = toks[p]
      break
    }
    let next: DateTok | undefined
    for (let p = k + 1; p < toks.length; p++) if (toks[p].t === 'f') {
      next = toks[p]
      break
    }
    const afterHour = prev && prev.t === 'f' && /^[hH]+$/.test(prev.f)
    const beforeSec = next && next.t === 'f' && /^[sS]+$/.test(next.f)
    if (afterHour || beforeSec) t.f = t.f === 'm' ? 'n' : 'nn'
    else t.f = t.f.toUpperCase()
  }
  dateFormatCache.set(fmt, toks)
  return toks
}

function translateNamedDate(fmt: string, loc: LocaleInfo): string {
  switch (fmt.toLowerCase()) {
    case 'general date':
      return `${loc.shortDate} ${loc.longTime}`
    case 'long date':
    case 'd':
      return fmt === 'd' ? loc.shortDate : loc.longDate
    case 'short date':
      return loc.shortDate
    case 'medium date':
      return 'dd MMM yyyy'
    case 'long time':
      return loc.longTime
    case 'short time':
      return loc.shortTime
    case 'medium time':
      return 'hh:mm tt'
    default:
      return fmt
  }
}

export function formatDate(ms: number, fmt: string | undefined, kind: 'date' | 'datetime' | 'time' = 'datetime', locale: Locale = currentLocale): string {
  const loc = LOCALES[locale]
  let f = fmt
  if (!f || f.toLowerCase() === 'general') {
    if (kind === 'date') f = loc.shortDate
    else if (kind === 'time') f = loc.longTime
    else f = timeOfDay(ms) === 0 ? loc.shortDate : `${loc.shortDate} ${loc.longTime}`
  } else f = translateNamedDate(f, loc)
  const toks = parseDateFormat(f)
  const d = new Date(ms)
  const Y = d.getUTCFullYear()
  const M = d.getUTCMonth()
  const D = d.getUTCDate()
  const H = d.getUTCHours()
  const N = d.getUTCMinutes()
  const S = d.getUTCSeconds()
  const W = d.getUTCDay()
  const hasAmPm = toks.some((t) => t.t === 'f' && (t.f === 'AM/PM' || t.f === 'A/P' || /^t+$/i.test(t.f)))
  let out = ''
  for (const t of toks) {
    if (t.t === 'lit') {
      out += t.s
      continue
    }
    const f2 = t.f
    switch (f2) {
      case 'd':
        out += D
        break
      case 'dd':
        out += String(D).padStart(2, '0')
        break
      case 'ddd':
        out += loc.daysAbbr[W]
        break
      case 'dddd':
        out += loc.days[W]
        break
      case 'M':
        out += M + 1
        break
      case 'MM':
        out += String(M + 1).padStart(2, '0')
        break
      case 'MMM':
        out += loc.monthsAbbr[M]
        break
      case 'MMMM':
        out += loc.months[M]
        break
      case 'MMMMM':
        out += loc.months[M][0].toUpperCase()
        break
      case 'y':
      case 'yy':
        out += String(Y % 100).padStart(2, '0')
        break
      case 'yyy':
      case 'yyyy':
      case 'yyyyy':
        out += Y
        break
      case 'Y':
      case 'YY':
        out += String(Y % 100).padStart(2, '0')
        break
      case 'YYYY':
        out += Y
        break
      case 'h': {
        const h = hasAmPm ? H % 12 || 12 : H
        out += h
        break
      }
      case 'hh': {
        const h = hasAmPm ? H % 12 || 12 : H
        out += String(h).padStart(2, '0')
        break
      }
      case 'H':
        out += H
        break
      case 'HH':
        out += String(H).padStart(2, '0')
        break
      case 'n':
        out += N
        break
      case 'nn':
        out += String(N).padStart(2, '0')
        break
      case 's':
      case 'S':
        out += S
        break
      case 'ss':
      case 'SS':
        out += String(S).padStart(2, '0')
        break
      case 'q':
        out += Math.floor(M / 3) + 1
        break
      case 't':
        out += H < 12 ? 'A' : 'P'
        break
      case 'tt':
      case 'AM/PM':
        out += H < 12 ? 'AM' : 'PM'
        break
      case 'A/P':
        out += H < 12 ? 'A' : 'P'
        break
      case 'f':
      case 'ff':
      case 'fff':
        out += String(d.getUTCMilliseconds()).padStart(3, '0').slice(0, f2.length)
        break
      default:
        out += f2
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Formatação genérica de escalares
// ---------------------------------------------------------------------------

export function isDateFormat(fmt: string): boolean {
  const f = fmt.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '')
  if (/^(general date|long date|short date|medium date|long time|short time|medium time)$/i.test(fmt)) return true
  return /[dyhHsS]/.test(f) || /M{1,4}/.test(f)
}

export function formatScalar(v: Scalar, fmt?: string, type?: DataType, locale: Locale = currentLocale): string {
  const loc = LOCALES[locale]
  if (v === null) return loc.blank
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') {
    if (fmt) {
      const f = fmt.toLowerCase()
      if (f === 'yes/no') return v ? (locale === 'pt-BR' ? 'Sim' : 'Yes') : locale === 'pt-BR' ? 'Não' : 'No'
      if (f === 'on/off') return v ? 'On' : 'Off'
    }
    return v ? loc.trueText : loc.falseText
  }
  if (v instanceof DateVal) return formatDate(v.ms, fmt && isDateFormat(fmt) ? fmt : undefined, v.kind, locale)
  if (type && (type === 'date' || type === 'datetime' || type === 'time')) {
    return formatDate(v, fmt && isDateFormat(fmt) ? fmt : undefined, type, locale)
  }
  if (fmt && !isDateFormat(fmt)) return formatNumber(v, fmt, locale)
  if (type === 'int') return formatNumber(v, '#,0', locale)
  if (type === 'currency') return formatNumber(v, `"${loc.currency}" #,0.00`, locale)
  return formatGeneral(v, locale)
}

/** Formato padrão sugerido para um tipo de dado. */
export function defaultFormatFor(type: DataType): string | undefined {
  switch (type) {
    case 'int':
      return '#,0'
    case 'number':
      return undefined
    case 'currency':
      return '"R$" #,0.00'
    case 'date':
      return 'dd/MM/yyyy'
    case 'datetime':
      return 'dd/MM/yyyy HH:mm:ss'
    case 'time':
      return 'HH:mm:ss'
    default:
      return undefined
  }
}
