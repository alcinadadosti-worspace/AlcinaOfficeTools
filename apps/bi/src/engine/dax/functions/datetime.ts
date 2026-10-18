// Funções de data/hora e inteligência de tempo.
import type { Node } from '../ast'
import type { Ctx } from '../context'
import type { Evaluator } from '../evaluator'
import { DaxError } from '../parser'
import { fn, register } from '../registry'
import { MatTV, type TableValue, type TVCol } from '../tablevalue'
import { ValuesFilter } from '../filter'
import { toDate, toMs, toNumber, toText } from '../values'
import { DateVal, type Scalar } from '../../data/types'
import {
  MS_PER_DAY,
  OLE_EPOCH_MS,
  addMonths,
  dateOnly,
  day,
  daysInMonth,
  endOfMonth,
  hour,
  isoWeek,
  makeDate,
  minute,
  month,
  nowNaive,
  quarter,
  second,
  startOfMonth,
  timeOfDay,
  todayNaive,
  weekNum,
  weekday0,
  year
} from '../../data/dates'
import { parseDateTime } from '../../data/convert'
import type { ColRT } from '../../model/runtime'

const d = (ev: Evaluator, n: Node, ctx: Ctx): number | null => toMs(ev.scalar(n, ctx))

function dateVal(ms: number): DateVal {
  return new DateVal(ms, timeOfDay(ms) === 0 ? 'date' : 'datetime')
}

function part(ev: Evaluator, a: Node[], ctx: Ctx, f: (ms: number) => number): Scalar {
  const v = d(ev, a[0], ctx)
  return v === null ? null : f(v)
}

// ---------------------------------------------------------------------------
// Inteligência de tempo: conjunto de datas
// ---------------------------------------------------------------------------

interface DateSet {
  col: ColRT | null
  /** datas visíveis no contexto (ordenadas, distintas) */
  visible: number[]
  /** todas as datas da coluna (ordenadas, distintas) */
  all: number[]
  tvCol: TVCol
}

function sortedUnique(values: number[]): number[] {
  const s = [...new Set(values)].sort((x, y) => x - y)
  return s
}

const allDatesCache = new WeakMap<ColRT, number[]>()

function allDatesOf(col: ColRT): number[] {
  let a = allDatesCache.get(col)
  if (!a) {
    const idx = col.valueIndex
    const out: number[] = []
    for (const v of idx.values) if (v instanceof DateVal) out.push(v.ms)
    a = sortedUnique(out)
    allDatesCache.set(col, a)
  }
  return a
}

function datesArg(ev: Evaluator, n: Node, ctx: Ctx, fname: string): DateSet {
  if (n.k === 'ref') {
    const col = ev.colArg(n, ctx)
    if (col.type !== 'date' && col.type !== 'datetime') throw new DaxError(`${fname}: a coluna ${col.qualifiedName} não é do tipo data.`, n.pos)
    const vals = ev.distinctValues(col, ctx.fc, false)
    const vis: number[] = []
    for (const v of vals.data[0]) if (v instanceof DateVal) vis.push(v.ms)
    return { col, visible: sortedUnique(vis), all: allDatesOf(col), tvCol: { name: col.name, lineage: col, type: col.type } }
  }
  const tv = ev.table(n, ctx)
  const lin = tv.cols[0]?.lineage ?? null
  const vis: number[] = []
  for (let r = 0; r < tv.rowCount; r++) {
    const v = tv.get(r, 0)
    const ms = v === null ? null : toMs(v)
    if (ms !== null) vis.push(ms)
  }
  const visible = sortedUnique(vis)
  return {
    col: lin,
    visible,
    all: lin ? allDatesOf(lin) : visible,
    tvCol: tv.cols[0] ?? { name: 'Date', lineage: null, type: 'date' }
  }
}

function result(ds: DateSet, dates: number[]): MatTV {
  const kind = ds.tvCol.type === 'datetime' ? 'datetime' : 'date'
  return new MatTV([ds.tvCol], [dates.map((ms) => new DateVal(ms, kind))], dates.length)
}

function between(all: number[], lo: number, hi: number): number[] {
  const out: number[] = []
  for (const x of all) if (x >= lo && x <= hi) out.push(x)
  return out
}

function parseYearEnd(s: string | null): { m: number; d: number } {
  if (!s) return { m: 12, d: 31 }
  const t = s.trim()
  let m = /^(\d{1,2})[-/](\d{1,2})$/.exec(t)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    // aceita "06-30" (mês-dia) e "30/06" (dia/mês)
    if (a > 12) return { m: b, d: a }
    if (t.includes('/') && b <= 12 && a <= 31 && a > 12) return { m: b, d: a }
    return { m: a, d: b }
  }
  const p = parseDateTime(t, true)
  if (p) return { m: month(p.ms), d: day(p.ms) }
  m = /^(\d{1,2})$/.exec(t)
  if (m) return { m: Number(m[1]), d: daysInMonth(2001, Number(m[1])) }
  return { m: 12, d: 31 }
}

function fiscalYearStart(last: number, ye: { m: number; d: number }): number {
  const y = year(last)
  const endThisYear = makeDate(y, ye.m, Math.min(ye.d, daysInMonth(y, ye.m)))
  const startY = last > endThisYear ? y : y - 1
  const prevEnd = makeDate(startY, ye.m, Math.min(ye.d, daysInMonth(startY, ye.m)))
  return prevEnd + MS_PER_DAY
}

function quarterStart(ms: number): number {
  return makeDate(year(ms), Math.floor((month(ms) - 1) / 3) * 3 + 1, 1)
}

function isMonthEnd(ms: number): boolean {
  return day(ms) === daysInMonth(year(ms), month(ms))
}

function shiftMonths(ms: number, n: number): number {
  if (isMonthEnd(dateOnly(ms))) {
    const t = addMonths(startOfMonth(ms), n)
    return endOfMonth(t) + timeOfDay(ms)
  }
  return addMonths(ms, n)
}

type Interval = 'DAY' | 'MONTH' | 'QUARTER' | 'YEAR' | 'WEEK' | 'HOUR' | 'MINUTE' | 'SECOND'

function intervalArg(n: Node | undefined, ev: Evaluator, ctx: Ctx): Interval {
  if (!n) return 'DAY'
  let s = ''
  if (n.k === 'table') s = n.name
  else if (n.k === 'kw') s = n.v
  else s = toText(ev.scalar(n, ctx))
  const u = s.toUpperCase()
  if (['DAY', 'MONTH', 'QUARTER', 'YEAR', 'WEEK', 'HOUR', 'MINUTE', 'SECOND'].includes(u)) return u as Interval
  throw new DaxError(`Intervalo de data inválido: "${s}". Use DAY, MONTH, QUARTER ou YEAR.`, n.pos)
}

function monthsOf(i: Interval): number {
  return i === 'YEAR' ? 12 : i === 'QUARTER' ? 3 : 1
}

/** As datas cobrem meses completos (em relação às datas existentes na coluna)? */
function coversFullMonths(ds: DateSet): boolean {
  if (!ds.visible.length) return false
  const visSet = new Set(ds.visible)
  const months = new Set(ds.visible.map((x) => startOfMonth(x)))
  for (const m0 of months) {
    const m1 = endOfMonth(m0) + MS_PER_DAY - 1
    for (const x of ds.all) if (x >= m0 && x <= m1 && !visSet.has(x)) return false
  }
  return true
}

function dateAdd(ds: DateSet, n: number, interval: Interval): number[] {
  if (!ds.visible.length) return []
  const allSet = new Set(ds.all)
  let shifted: number[]
  if (interval === 'DAY' || interval === 'WEEK') {
    const step = (interval === 'WEEK' ? 7 : 1) * n * MS_PER_DAY
    shifted = ds.visible.map((x) => x + step)
  } else if (interval === 'HOUR' || interval === 'MINUTE' || interval === 'SECOND') {
    const step = n * (interval === 'HOUR' ? 3_600_000 : interval === 'MINUTE' ? 60_000 : 1000)
    shifted = ds.visible.map((x) => x + step)
  } else {
    const months = n * monthsOf(interval)
    if (coversFullMonths(ds)) {
      const target = new Set(ds.visible.map((x) => addMonths(startOfMonth(x), months)))
      return ds.all.filter((x) => target.has(startOfMonth(x)))
    }
    shifted = ds.visible.map((x) => shiftMonths(x, months))
  }
  return sortedUnique(shifted.filter((x) => allSet.has(x)))
}

function periodBounds(ms: number, interval: Interval, ye?: { m: number; d: number }): [number, number] {
  switch (interval) {
    case 'YEAR': {
      if (ye && !(ye.m === 12 && ye.d === 31)) {
        const s = fiscalYearStart(ms, ye)
        return [s, addMonths(s, 12) - MS_PER_DAY]
      }
      return [makeDate(year(ms), 1, 1), makeDate(year(ms), 12, 31)]
    }
    case 'QUARTER': {
      const s = quarterStart(ms)
      return [s, endOfMonth(addMonths(s, 2))]
    }
    case 'MONTH':
      return [startOfMonth(ms), endOfMonth(ms)]
    default: {
      const s = dateOnly(ms)
      return [s, s]
    }
  }
}

function endOfDay(ms: number): number {
  return dateOnly(ms) + MS_PER_DAY - 1
}

function datesToDate(ev: Evaluator, a: Node[], ctx: Ctx, kind: 'YEAR' | 'QUARTER' | 'MONTH', fname: string, yearEndArg?: Node): TableValue {
  const ds = datesArg(ev, a[0], ctx, fname)
  if (!ds.visible.length) return result(ds, [])
  const last = ds.visible[ds.visible.length - 1]
  let start: number
  if (kind === 'YEAR') start = fiscalYearStart(last, parseYearEnd(yearEndArg ? toText(ev.scalar(yearEndArg, ctx)) : null))
  else if (kind === 'QUARTER') start = quarterStart(last)
  else start = startOfMonth(last)
  return result(ds, between(ds.all, start, endOfDay(last)))
}

/** CALCULATE(expr, <tabela de datas>, filtros...) */
function calcWithDates(ev: Evaluator, expr: Node, dates: TableValue, filterArgs: Node[], ctx: Ctx): Scalar {
  const f = ev.tableToFilter(dates)
  const c2 = ev.calculateCtx(filterArgs, ctx)
  const fc = f ? ev.applyFilters(c2.fc, [{ filter: f instanceof ValuesFilter ? f : f, keep: false }]) : c2.fc
  return ev.scalar(expr, c2.withFc(fc))
}

function totalToDate(ev: Evaluator, a: Node[], ctx: Ctx, kind: 'YEAR' | 'QUARTER' | 'MONTH', fname: string): Scalar {
  const rest = a.slice(2)
  let yearEnd: Node | undefined
  const filters: Node[] = []
  for (const x of rest) {
    if (kind === 'YEAR' && x.k === 'str') yearEnd = x
    else filters.push(x)
  }
  const dates = datesToDate(ev, [a[1]], ctx, kind, fname, yearEnd)
  return calcWithDates(ev, a[0], dates, filters, ctx)
}

function prevNext(ev: Evaluator, a: Node[], ctx: Ctx, interval: Interval, dir: -1 | 1, fname: string): TableValue {
  const ds = datesArg(ev, a[0], ctx, fname)
  if (!ds.visible.length) return result(ds, [])
  const ref = dir < 0 ? ds.visible[0] : ds.visible[ds.visible.length - 1]
  const ye = interval === 'YEAR' && a[1] ? parseYearEnd(toText(ev.scalar(a[1], ctx))) : undefined
  let target: number
  if (interval === 'DAY') target = dateOnly(ref) + dir * MS_PER_DAY
  else target = addMonths(periodBounds(ref, interval, ye)[0], dir * monthsOf(interval))
  const [lo, hi] = periodBounds(target, interval, ye)
  return result(ds, between(ds.all, lo, endOfDay(hi)))
}

function boundaryDate(ev: Evaluator, a: Node[], ctx: Ctx, interval: Interval, end: boolean, fname: string): TableValue {
  const ds = datesArg(ev, a[0], ctx, fname)
  if (!ds.visible.length) return result(ds, [])
  const ref = end ? ds.visible[ds.visible.length - 1] : ds.visible[0]
  const ye = interval === 'YEAR' && a[1] ? parseYearEnd(toText(ev.scalar(a[1], ctx))) : undefined
  const [lo, hi] = periodBounds(ref, interval, ye)
  const inPeriod = between(ds.all, lo, endOfDay(hi))
  if (!inPeriod.length) return result(ds, [])
  return result(ds, [end ? inPeriod[inPeriod.length - 1] : inPeriod[0]])
}

function balance(ev: Evaluator, a: Node[], ctx: Ctx, interval: Interval, opening: boolean, fname: string): Scalar {
  const ds = datesArg(ev, a[1], ctx, fname)
  if (!ds.visible.length) return null
  const ref = opening ? ds.visible[0] : ds.visible[ds.visible.length - 1]
  const ye = interval === 'YEAR' && a[3] ? parseYearEnd(toText(ev.scalar(a[3], ctx))) : undefined
  const [lo, hi] = periodBounds(ref, interval, ye)
  let target: number
  if (opening) target = lo - MS_PER_DAY
  else {
    const inPeriod = between(ds.all, lo, endOfDay(hi))
    target = inPeriod.length ? inPeriod[inPeriod.length - 1] : hi
  }
  const dates = result(ds, ds.all.includes(target) ? [target] : [])
  return calcWithDates(ev, a[0], dates, a.slice(2, 3), ctx)
}

function datediff(a: number, b: number, interval: Interval): number {
  switch (interval) {
    case 'SECOND':
      return Math.floor(b / 1000) - Math.floor(a / 1000)
    case 'MINUTE':
      return Math.floor(b / 60_000) - Math.floor(a / 60_000)
    case 'HOUR':
      return Math.floor(b / 3_600_000) - Math.floor(a / 3_600_000)
    case 'DAY':
      return Math.round((dateOnly(b) - dateOnly(a)) / MS_PER_DAY)
    case 'WEEK': {
      const wa = dateOnly(a) - weekday0(a) * MS_PER_DAY
      const wb = dateOnly(b) - weekday0(b) * MS_PER_DAY
      return Math.round((wb - wa) / (7 * MS_PER_DAY))
    }
    case 'MONTH':
      return (year(b) - year(a)) * 12 + (month(b) - month(a))
    case 'QUARTER':
      return (year(b) - year(a)) * 4 + (quarter(b) - quarter(a))
    case 'YEAR':
      return year(b) - year(a)
  }
}

function calendarTable(start: number, end: number): MatTV {
  const s = dateOnly(start)
  const e = dateOnly(end)
  if (e < s) throw new DaxError('CALENDAR: a data final é anterior à data inicial.')
  const vals: Scalar[] = []
  for (let x = s; x <= e; x += MS_PER_DAY) vals.push(new DateVal(x, 'date'))
  return new MatTV([{ name: 'Date', lineage: null, type: 'date' }], [vals], vals.length)
}

register([
  fn('DATE', 'scalar', 'Data e hora', 3, 3, 'DATE(<ano>, <mês>, <dia>)', 'Cria uma data.', (ev, a, ctx) => {
    let y = Math.trunc(toNumber(ev.scalar(a[0], ctx)))
    if (y >= 0 && y < 1900) y += 1900
    const m = Math.trunc(toNumber(ev.scalar(a[1], ctx)))
    const dd = Math.trunc(toNumber(ev.scalar(a[2], ctx)))
    return new DateVal(makeDate(y, m, dd), 'date')
  }),
  fn('TIME', 'scalar', 'Data e hora', 3, 3, 'TIME(<hora>, <minuto>, <segundo>)', 'Cria uma hora.', (ev, a, ctx) => {
    const h = toNumber(ev.scalar(a[0], ctx))
    const m = toNumber(ev.scalar(a[1], ctx))
    const s = toNumber(ev.scalar(a[2], ctx))
    const total = (((h * 3600 + m * 60 + s) % 86400) + 86400) % 86400
    return new DateVal(OLE_EPOCH_MS + total * 1000, 'time')
  }),
  fn('YEAR', 'scalar', 'Data e hora', 1, 1, 'YEAR(<data>)', 'Ano da data.', (ev, a, ctx) => part(ev, a, ctx, year)),
  fn('MONTH', 'scalar', 'Data e hora', 1, 1, 'MONTH(<data>)', 'Mês da data (1-12).', (ev, a, ctx) => part(ev, a, ctx, month)),
  fn('DAY', 'scalar', 'Data e hora', 1, 1, 'DAY(<data>)', 'Dia do mês.', (ev, a, ctx) => part(ev, a, ctx, day)),
  fn('HOUR', 'scalar', 'Data e hora', 1, 1, 'HOUR(<data>)', 'Hora (0-23).', (ev, a, ctx) => part(ev, a, ctx, hour)),
  fn('MINUTE', 'scalar', 'Data e hora', 1, 1, 'MINUTE(<data>)', 'Minuto.', (ev, a, ctx) => part(ev, a, ctx, minute)),
  fn('SECOND', 'scalar', 'Data e hora', 1, 1, 'SECOND(<data>)', 'Segundo.', (ev, a, ctx) => part(ev, a, ctx, second)),
  fn('QUARTER', 'scalar', 'Data e hora', 1, 1, 'QUARTER(<data>)', 'Trimestre (1-4).', (ev, a, ctx) => part(ev, a, ctx, quarter)),
  fn('WEEKDAY', 'scalar', 'Data e hora', 1, 2, 'WEEKDAY(<data>[, <tipoRetorno>])', 'Dia da semana.', (ev, a, ctx) => {
    const v = d(ev, a[0], ctx)
    if (v === null) return null
    const t = a.length > 1 ? toNumber(ev.scalar(a[1], ctx)) : 1
    const w = weekday0(v)
    if (t === 2) return ((w + 6) % 7) + 1
    if (t === 3) return (w + 6) % 7
    return w + 1
  }),
  fn('WEEKNUM', 'scalar', 'Data e hora', 1, 2, 'WEEKNUM(<data>[, <tipoRetorno>])', 'Número da semana no ano.', (ev, a, ctx) => {
    const v = d(ev, a[0], ctx)
    if (v === null) return null
    const t = a.length > 1 ? toNumber(ev.scalar(a[1], ctx)) : 1
    return t === 21 ? isoWeek(v) : weekNum(v, t === 2 || t === 11 ? 2 : 1)
  }),
  fn('TODAY', 'scalar', 'Data e hora', 0, 0, 'TODAY()', 'Data de hoje.', () => new DateVal(todayNaive(), 'date')),
  fn('NOW', 'scalar', 'Data e hora', 0, 0, 'NOW()', 'Data e hora atuais.', () => new DateVal(nowNaive(), 'datetime')),
  fn('UTCNOW', 'scalar', 'Data e hora', 0, 0, 'UTCNOW()', 'Data e hora UTC.', () => new DateVal(Date.now(), 'datetime')),
  fn('UTCTODAY', 'scalar', 'Data e hora', 0, 0, 'UTCTODAY()', 'Data UTC de hoje.', () => new DateVal(dateOnly(Date.now()), 'date')),
  fn('EOMONTH', 'scalar', 'Data e hora', 2, 2, 'EOMONTH(<data>, <meses>)', 'Último dia do mês após N meses.', (ev, a, ctx) => {
    const v = d(ev, a[0], ctx)
    if (v === null) return null
    return new DateVal(endOfMonth(addMonths(startOfMonth(v), Math.trunc(toNumber(ev.scalar(a[1], ctx))))), 'date')
  }),
  fn('EDATE', 'scalar', 'Data e hora', 2, 2, 'EDATE(<data>, <meses>)', 'Data N meses antes/depois.', (ev, a, ctx) => {
    const v = d(ev, a[0], ctx)
    if (v === null) return null
    return new DateVal(dateOnly(addMonths(v, Math.trunc(toNumber(ev.scalar(a[1], ctx))))), 'date')
  }),
  fn('DATEDIFF', 'scalar', 'Data e hora', 3, 3, 'DATEDIFF(<data1>, <data2>, <intervalo>)', 'Número de limites de intervalo entre duas datas.', (ev, a, ctx) => {
    const x = d(ev, a[0], ctx)
    const y = d(ev, a[1], ctx)
    if (x === null || y === null) return null
    return datediff(x, y, intervalArg(a[2], ev, ctx))
  }),
  fn('DATEVALUE', 'scalar', 'Data e hora', 1, 1, 'DATEVALUE(<texto>)', 'Converte texto em data.', (ev, a, ctx) => {
    const v = toDate(ev.scalar(a[0], ctx))
    return v ? new DateVal(dateOnly(v.ms), 'date') : null
  }),
  fn('TIMEVALUE', 'scalar', 'Data e hora', 1, 1, 'TIMEVALUE(<texto>)', 'Converte texto em hora.', (ev, a, ctx) => {
    const v = toDate(ev.scalar(a[0], ctx))
    return v ? new DateVal(OLE_EPOCH_MS + timeOfDay(v.ms), 'time') : null
  }),
  fn('YEARFRAC', 'scalar', 'Data e hora', 2, 3, 'YEARFRAC(<início>, <fim>[, <base>])', 'Fração do ano entre duas datas.', (ev, a, ctx) => {
    let s = d(ev, a[0], ctx)
    let e = d(ev, a[1], ctx)
    if (s === null || e === null) return null
    if (s > e) [s, e] = [e, s]
    const basis = a.length > 2 ? toNumber(ev.scalar(a[2], ctx)) : 0
    if (basis === 3) return (dateOnly(e) - dateOnly(s)) / MS_PER_DAY / 365
    if (basis === 2) return (dateOnly(e) - dateOnly(s)) / MS_PER_DAY / 360
    if (basis === 1) return (dateOnly(e) - dateOnly(s)) / MS_PER_DAY / 365.25
    let d1 = Math.min(30, day(s))
    let d2 = day(e)
    if (d2 === 31 && d1 >= 30) d2 = 30
    d1 = Math.min(d1, 30)
    return ((year(e) - year(s)) * 360 + (month(e) - month(s)) * 30 + (d2 - d1)) / 360
  }),
  fn('NETWORKDAYS', 'scalar', 'Data e hora', 2, 4, 'NETWORKDAYS(<início>, <fim>[, <fimDeSemana>[, <feriados>]])', 'Dias úteis entre duas datas.', (ev, a, ctx) => {
    const s = d(ev, a[0], ctx)
    const e = d(ev, a[1], ctx)
    if (s === null || e === null) return null
    const holidays = new Set<number>()
    if (a.length > 3) {
      const tv = ev.table(a[3], ctx)
      for (let r = 0; r < tv.rowCount; r++) {
        const h = toMs(tv.get(r, 0))
        if (h !== null) holidays.add(dateOnly(h))
      }
    }
    const lo = dateOnly(Math.min(s, e))
    const hi = dateOnly(Math.max(s, e))
    let n = 0
    for (let x = lo; x <= hi; x += MS_PER_DAY) {
      const w = weekday0(x)
      if (w !== 0 && w !== 6 && !holidays.has(x)) n++
    }
    return s <= e ? n : -n
  }),
  fn('CALENDAR', 'table', 'Data e hora', 2, 2, 'CALENDAR(<dataInicial>, <dataFinal>)', 'Tabela com uma coluna "Date" contendo todas as datas do intervalo.', (ev, a, ctx) => {
    const s = d(ev, a[0], ctx)
    const e = d(ev, a[1], ctx)
    if (s === null || e === null) throw new DaxError('CALENDAR requer datas inicial e final.')
    return calendarTable(s, e)
  }),
  fn('CALENDARAUTO', 'table', 'Data e hora', 0, 1, 'CALENDARAUTO([<mêsFimAnoFiscal>])', 'Calendário cobrindo todas as datas do modelo.', (ev, a, ctx) => {
    let lo = Infinity
    let hi = -Infinity
    for (const t of ev.model.tables) {
      if (t.def.expression) continue
      for (const c of t.columns) {
        if (c.derived || (c.type !== 'date' && c.type !== 'datetime')) continue
        for (const ms of allDatesOf(c)) {
          if (ms < lo) lo = ms
          if (ms > hi) hi = ms
        }
      }
    }
    if (lo === Infinity) {
      const y = year(todayNaive())
      return calendarTable(makeDate(y, 1, 1), makeDate(y, 12, 31))
    }
    const fyEnd = a.length ? Math.trunc(toNumber(ev.scalar(a[0], ctx))) : 12
    const startY = month(lo) > fyEnd ? year(lo) : year(lo) - 1
    const endY = month(hi) > fyEnd ? year(hi) + 1 : year(hi)
    return calendarTable(makeDate(startY, fyEnd, daysInMonth(startY, fyEnd)) + MS_PER_DAY, makeDate(endY, fyEnd, daysInMonth(endY, fyEnd)))
  }),

  // ---------------------------------------------------- Inteligência de tempo
  fn('DATESYTD', 'table', 'Inteligência de tempo', 1, 2, 'DATESYTD(<datas>[, <fimDoAno>])', 'Datas do início do ano até a última data do contexto.', (ev, a, ctx) =>
    datesToDate(ev, a, ctx, 'YEAR', 'DATESYTD', a[1])
  ),
  fn('DATESQTD', 'table', 'Inteligência de tempo', 1, 1, 'DATESQTD(<datas>)', 'Datas do início do trimestre até a última data do contexto.', (ev, a, ctx) =>
    datesToDate(ev, a, ctx, 'QUARTER', 'DATESQTD')
  ),
  fn('DATESMTD', 'table', 'Inteligência de tempo', 1, 1, 'DATESMTD(<datas>)', 'Datas do início do mês até a última data do contexto.', (ev, a, ctx) =>
    datesToDate(ev, a, ctx, 'MONTH', 'DATESMTD')
  ),
  fn('TOTALYTD', 'scalar', 'Inteligência de tempo', 2, 4, 'TOTALYTD(<expressão>, <datas>[, <filtro>][, <fimDoAno>])', 'Valor acumulado no ano.', (ev, a, ctx) =>
    totalToDate(ev, a, ctx, 'YEAR', 'TOTALYTD')
  ),
  fn('TOTALQTD', 'scalar', 'Inteligência de tempo', 2, 3, 'TOTALQTD(<expressão>, <datas>[, <filtro>])', 'Valor acumulado no trimestre.', (ev, a, ctx) =>
    totalToDate(ev, a, ctx, 'QUARTER', 'TOTALQTD')
  ),
  fn('TOTALMTD', 'scalar', 'Inteligência de tempo', 2, 3, 'TOTALMTD(<expressão>, <datas>[, <filtro>])', 'Valor acumulado no mês.', (ev, a, ctx) =>
    totalToDate(ev, a, ctx, 'MONTH', 'TOTALMTD')
  ),
  fn('SAMEPERIODLASTYEAR', 'table', 'Inteligência de tempo', 1, 1, 'SAMEPERIODLASTYEAR(<datas>)', 'Mesmas datas deslocadas um ano para trás.', (ev, a, ctx) => {
    const ds = datesArg(ev, a[0], ctx, 'SAMEPERIODLASTYEAR')
    return result(ds, dateAdd(ds, -1, 'YEAR'))
  }),
  fn('DATEADD', 'table', 'Inteligência de tempo', 3, 3, 'DATEADD(<datas>, <número>, <intervalo>)', 'Desloca as datas do contexto.', (ev, a, ctx) => {
    const ds = datesArg(ev, a[0], ctx, 'DATEADD')
    return result(ds, dateAdd(ds, Math.trunc(toNumber(ev.scalar(a[1], ctx))), intervalArg(a[2], ev, ctx)))
  }),
  fn('PARALLELPERIOD', 'table', 'Inteligência de tempo', 3, 3, 'PARALLELPERIOD(<datas>, <número>, <intervalo>)', 'Período completo paralelo deslocado.', (ev, a, ctx) => {
    const ds = datesArg(ev, a[0], ctx, 'PARALLELPERIOD')
    if (!ds.visible.length) return result(ds, [])
    const interval = intervalArg(a[2], ev, ctx)
    const n = Math.trunc(toNumber(ev.scalar(a[1], ctx)))
    const months = n * monthsOf(interval)
    const lo = periodBounds(addMonths(startOfMonth(ds.visible[0]), months), interval)[0]
    const hi = periodBounds(addMonths(startOfMonth(ds.visible[ds.visible.length - 1]), months), interval)[1]
    return result(ds, between(ds.all, lo, endOfDay(hi)))
  }),
  fn('PREVIOUSDAY', 'table', 'Inteligência de tempo', 1, 1, 'PREVIOUSDAY(<datas>)', 'Dia anterior à primeira data do contexto.', (ev, a, ctx) => prevNext(ev, a, ctx, 'DAY', -1, 'PREVIOUSDAY')),
  fn('PREVIOUSMONTH', 'table', 'Inteligência de tempo', 1, 1, 'PREVIOUSMONTH(<datas>)', 'Todas as datas do mês anterior.', (ev, a, ctx) => prevNext(ev, a, ctx, 'MONTH', -1, 'PREVIOUSMONTH')),
  fn('PREVIOUSQUARTER', 'table', 'Inteligência de tempo', 1, 1, 'PREVIOUSQUARTER(<datas>)', 'Todas as datas do trimestre anterior.', (ev, a, ctx) => prevNext(ev, a, ctx, 'QUARTER', -1, 'PREVIOUSQUARTER')),
  fn('PREVIOUSYEAR', 'table', 'Inteligência de tempo', 1, 2, 'PREVIOUSYEAR(<datas>[, <fimDoAno>])', 'Todas as datas do ano anterior.', (ev, a, ctx) => prevNext(ev, a, ctx, 'YEAR', -1, 'PREVIOUSYEAR')),
  fn('NEXTDAY', 'table', 'Inteligência de tempo', 1, 1, 'NEXTDAY(<datas>)', 'Dia seguinte à última data do contexto.', (ev, a, ctx) => prevNext(ev, a, ctx, 'DAY', 1, 'NEXTDAY')),
  fn('NEXTMONTH', 'table', 'Inteligência de tempo', 1, 1, 'NEXTMONTH(<datas>)', 'Todas as datas do próximo mês.', (ev, a, ctx) => prevNext(ev, a, ctx, 'MONTH', 1, 'NEXTMONTH')),
  fn('NEXTQUARTER', 'table', 'Inteligência de tempo', 1, 1, 'NEXTQUARTER(<datas>)', 'Todas as datas do próximo trimestre.', (ev, a, ctx) => prevNext(ev, a, ctx, 'QUARTER', 1, 'NEXTQUARTER')),
  fn('NEXTYEAR', 'table', 'Inteligência de tempo', 1, 2, 'NEXTYEAR(<datas>[, <fimDoAno>])', 'Todas as datas do próximo ano.', (ev, a, ctx) => prevNext(ev, a, ctx, 'YEAR', 1, 'NEXTYEAR')),
  fn('DATESBETWEEN', 'table', 'Inteligência de tempo', 3, 3, 'DATESBETWEEN(<datas>, <início>, <fim>)', 'Datas entre duas datas (inclusive).', (ev, a, ctx) => {
    const ds = datesArg(ev, a[0], ctx, 'DATESBETWEEN')
    const s = d(ev, a[1], ctx)
    const e = d(ev, a[2], ctx)
    const lo = s === null ? -Infinity : s
    const hi = e === null ? Infinity : endOfDay(e)
    return result(ds, between(ds.all, lo, hi))
  }),
  fn('DATESINPERIOD', 'table', 'Inteligência de tempo', 4, 4, 'DATESINPERIOD(<datas>, <início>, <número>, <intervalo>)', 'Datas em um período a partir de uma data.', (ev, a, ctx) => {
    const ds = datesArg(ev, a[0], ctx, 'DATESINPERIOD')
    const s = d(ev, a[1], ctx)
    if (s === null) return result(ds, [])
    const n = Math.trunc(toNumber(ev.scalar(a[2], ctx)))
    const interval = intervalArg(a[3], ev, ctx)
    let other: number
    if (interval === 'DAY' || interval === 'WEEK') other = s + n * (interval === 'WEEK' ? 7 : 1) * MS_PER_DAY
    else other = shiftMonths(s, n * monthsOf(interval))
    const lo = n >= 0 ? s : other + MS_PER_DAY
    const hi = n >= 0 ? other - MS_PER_DAY : s
    return result(ds, between(ds.all, dateOnly(lo), endOfDay(hi)))
  }),
  fn('FIRSTDATE', 'table', 'Inteligência de tempo', 1, 1, 'FIRSTDATE(<datas>)', 'Primeira data do contexto.', (ev, a, ctx) => {
    const ds = datesArg(ev, a[0], ctx, 'FIRSTDATE')
    return result(ds, ds.visible.length ? [ds.visible[0]] : [])
  }),
  fn('LASTDATE', 'table', 'Inteligência de tempo', 1, 1, 'LASTDATE(<datas>)', 'Última data do contexto.', (ev, a, ctx) => {
    const ds = datesArg(ev, a[0], ctx, 'LASTDATE')
    return result(ds, ds.visible.length ? [ds.visible[ds.visible.length - 1]] : [])
  }),
  fn('STARTOFMONTH', 'table', 'Inteligência de tempo', 1, 1, 'STARTOFMONTH(<datas>)', 'Primeira data do mês.', (ev, a, ctx) => boundaryDate(ev, a, ctx, 'MONTH', false, 'STARTOFMONTH')),
  fn('STARTOFQUARTER', 'table', 'Inteligência de tempo', 1, 1, 'STARTOFQUARTER(<datas>)', 'Primeira data do trimestre.', (ev, a, ctx) => boundaryDate(ev, a, ctx, 'QUARTER', false, 'STARTOFQUARTER')),
  fn('STARTOFYEAR', 'table', 'Inteligência de tempo', 1, 2, 'STARTOFYEAR(<datas>[, <fimDoAno>])', 'Primeira data do ano.', (ev, a, ctx) => boundaryDate(ev, a, ctx, 'YEAR', false, 'STARTOFYEAR')),
  fn('ENDOFMONTH', 'table', 'Inteligência de tempo', 1, 1, 'ENDOFMONTH(<datas>)', 'Última data do mês.', (ev, a, ctx) => boundaryDate(ev, a, ctx, 'MONTH', true, 'ENDOFMONTH')),
  fn('ENDOFQUARTER', 'table', 'Inteligência de tempo', 1, 1, 'ENDOFQUARTER(<datas>)', 'Última data do trimestre.', (ev, a, ctx) => boundaryDate(ev, a, ctx, 'QUARTER', true, 'ENDOFQUARTER')),
  fn('ENDOFYEAR', 'table', 'Inteligência de tempo', 1, 2, 'ENDOFYEAR(<datas>[, <fimDoAno>])', 'Última data do ano.', (ev, a, ctx) => boundaryDate(ev, a, ctx, 'YEAR', true, 'ENDOFYEAR')),
  fn('OPENINGBALANCEMONTH', 'scalar', 'Inteligência de tempo', 2, 3, 'OPENINGBALANCEMONTH(<expressão>, <datas>[, <filtro>])', 'Valor no fim do mês anterior.', (ev, a, ctx) =>
    balance(ev, a, ctx, 'MONTH', true, 'OPENINGBALANCEMONTH')
  ),
  fn('OPENINGBALANCEQUARTER', 'scalar', 'Inteligência de tempo', 2, 3, 'OPENINGBALANCEQUARTER(<expressão>, <datas>[, <filtro>])', 'Valor no fim do trimestre anterior.', (ev, a, ctx) =>
    balance(ev, a, ctx, 'QUARTER', true, 'OPENINGBALANCEQUARTER')
  ),
  fn('OPENINGBALANCEYEAR', 'scalar', 'Inteligência de tempo', 2, 4, 'OPENINGBALANCEYEAR(<expressão>, <datas>[, <filtro>[, <fimDoAno>]])', 'Valor no fim do ano anterior.', (ev, a, ctx) =>
    balance(ev, a, ctx, 'YEAR', true, 'OPENINGBALANCEYEAR')
  ),
  fn('CLOSINGBALANCEMONTH', 'scalar', 'Inteligência de tempo', 2, 3, 'CLOSINGBALANCEMONTH(<expressão>, <datas>[, <filtro>])', 'Valor na última data do mês.', (ev, a, ctx) =>
    balance(ev, a, ctx, 'MONTH', false, 'CLOSINGBALANCEMONTH')
  ),
  fn('CLOSINGBALANCEQUARTER', 'scalar', 'Inteligência de tempo', 2, 3, 'CLOSINGBALANCEQUARTER(<expressão>, <datas>[, <filtro>])', 'Valor na última data do trimestre.', (ev, a, ctx) =>
    balance(ev, a, ctx, 'QUARTER', false, 'CLOSINGBALANCEQUARTER')
  ),
  fn('CLOSINGBALANCEYEAR', 'scalar', 'Inteligência de tempo', 2, 4, 'CLOSINGBALANCEYEAR(<expressão>, <datas>[, <filtro>[, <fimDoAno>]])', 'Valor na última data do ano.', (ev, a, ctx) =>
    balance(ev, a, ctx, 'YEAR', false, 'CLOSINGBALANCEYEAR')
  )
])

export { dateVal }
