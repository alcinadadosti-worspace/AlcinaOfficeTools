// Utilitários de data. Todas as datas são "ingênuas" e representadas em ms UTC.

export const MS_PER_DAY = 86_400_000
export const MS_PER_HOUR = 3_600_000
export const MS_PER_MINUTE = 60_000
/** Época das datas OLE/Excel/DAX: 30/12/1899. */
export const OLE_EPOCH_MS = Date.UTC(1899, 11, 30)

const scratch = new Date(0)

/** Monta uma data (mês 1-12). Aceita estouro de mês/dia como Date.UTC. */
export function makeDate(y: number, m: number, d: number, hh = 0, mi = 0, ss = 0, ms = 0): number {
  scratch.setTime(0)
  scratch.setUTCFullYear(y, m - 1, d)
  scratch.setUTCHours(hh, mi, ss, ms)
  return scratch.getTime()
}

export function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m)
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28
  return DAYS_IN_MONTH[m - 1]
}

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function year(ms: number): number {
  return new Date(ms).getUTCFullYear()
}
export function month(ms: number): number {
  return new Date(ms).getUTCMonth() + 1
}
export function day(ms: number): number {
  return new Date(ms).getUTCDate()
}
export function hour(ms: number): number {
  return new Date(ms).getUTCHours()
}
export function minute(ms: number): number {
  return new Date(ms).getUTCMinutes()
}
export function second(ms: number): number {
  return new Date(ms).getUTCSeconds()
}
/** 0 = domingo ... 6 = sábado */
export function weekday0(ms: number): number {
  return new Date(ms).getUTCDay()
}
export function quarter(ms: number): number {
  return Math.floor((month(ms) - 1) / 3) + 1
}

export function dateOnly(ms: number): number {
  return Math.floor(ms / MS_PER_DAY) * MS_PER_DAY
}

export function timeOfDay(ms: number): number {
  return ms - dateOnly(ms)
}

export function addDays(ms: number, n: number): number {
  return ms + n * MS_PER_DAY
}

/** Soma meses mantendo o dia (limitado ao fim do mês), como EDATE. */
export function addMonths(ms: number, n: number): number {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + n
  const ty = y + Math.floor(m / 12)
  const tm = ((m % 12) + 12) % 12
  const dim = daysInMonth(ty, tm + 1)
  const dd = Math.min(d.getUTCDate(), dim)
  return makeDate(ty, tm + 1, dd, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())
}

export function addYears(ms: number, n: number): number {
  return addMonths(ms, n * 12)
}

export function startOfMonth(ms: number): number {
  const d = new Date(ms)
  return makeDate(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}

export function endOfMonth(ms: number): number {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  return makeDate(y, m, daysInMonth(y, m))
}

export function startOfQuarter(ms: number): number {
  const d = new Date(ms)
  const q = Math.floor(d.getUTCMonth() / 3)
  return makeDate(d.getUTCFullYear(), q * 3 + 1, 1)
}

export function endOfQuarter(ms: number): number {
  const s = startOfQuarter(ms)
  return endOfMonth(addMonths(s, 2))
}

export function startOfYear(ms: number): number {
  return makeDate(year(ms), 1, 1)
}

export function endOfYear(ms: number): number {
  return makeDate(year(ms), 12, 31)
}

export function startOfWeek(ms: number, firstDay = 0): number {
  const d = dateOnly(ms)
  const wd = weekday0(d)
  const diff = (wd - firstDay + 7) % 7
  return d - diff * MS_PER_DAY
}

export function dayOfYear(ms: number): number {
  return Math.floor((dateOnly(ms) - startOfYear(ms)) / MS_PER_DAY) + 1
}

/** WEEKNUM estilo Excel/DAX tipo 1 (semana começa no domingo) ou 2 (segunda). */
export function weekNum(ms: number, returnType = 1): number {
  if (returnType === 21) return isoWeek(ms)
  const firstDay = returnType === 2 ? 1 : 0
  const jan1 = startOfYear(ms)
  const offset = (weekday0(jan1) - firstDay + 7) % 7
  return Math.floor((dayOfYear(ms) - 1 + offset) / 7) + 1
}

export function isoWeek(ms: number): number {
  const d = dateOnly(ms)
  const wd = (weekday0(d) + 6) % 7 // segunda = 0
  const thursday = d + (3 - wd) * MS_PER_DAY
  const jan1 = startOfYear(thursday)
  return Math.floor((thursday - jan1) / MS_PER_DAY / 7) + 1
}

export function serialToMs(serial: number): number {
  return Math.round(OLE_EPOCH_MS + serial * MS_PER_DAY)
}

export function msToSerial(ms: number): number {
  return (ms - OLE_EPOCH_MS) / MS_PER_DAY
}

/** Converte um Date JS (hora local) em data ingênua preservando os campos locais. */
export function fromLocalDate(d: Date): number {
  return makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
}

export function nowNaive(): number {
  return fromLocalDate(new Date())
}

export function todayNaive(): number {
  return dateOnly(nowNaive())
}

export const MONTH_NAMES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
]
export const MONTH_ABBR_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const DAY_NAMES_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
export const DAY_ABBR_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export const MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
export const MONTH_ABBR_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_ABBR_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MONTH_LOOKUP: Map<string, number> = (() => {
  const m = new Map<string, number>()
  const add = (names: string[]) => names.forEach((n, i) => m.set(n.toLowerCase(), i + 1))
  add(MONTH_NAMES_PT)
  add(MONTH_ABBR_PT)
  add(MONTH_NAMES_EN)
  add(MONTH_ABBR_EN)
  m.set('marco', 3)
  m.set('sept', 9)
  return m
})()

export function monthFromName(name: string): number | undefined {
  return MONTH_LOOKUP.get(name.toLowerCase().replace(/\.$/, ''))
}
