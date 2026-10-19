// Biblioteca de funções da planilha (nomes em português e inglês).
import { type CellValue, type CellError, isError, err } from './types'
import { type ArgValue, type Matrix, flatten, scalar, toList, isMatrix, toNumber, toText, toBool, parseNumber } from './runtime'

export const FUNCTIONS: Record<string, (args: ArgValue[]) => CellValue> = {}

function reg(names: string[], fn: (args: ArgValue[]) => CellValue): void {
  for (const n of names) FUNCTIONS[n] = fn
}

function nums(args: ArgValue[]): number[] | { error: CellError } {
  const out: number[] = []
  for (const v of flatten(args)) {
    if (isError(v)) return v
    if (typeof v === 'number') out.push(v)
    else if (typeof v === 'boolean') out.push(v ? 1 : 0)
  }
  return out
}

function n1(args: ArgValue[], i = 0): number | { error: CellError } {
  return toNumber(scalar(args[i]))
}

function matches(value: CellValue, crit: CellValue): boolean {
  let op = '='
  let target: CellValue = crit
  if (typeof crit === 'string') {
    const m = /^(<=|>=|<>|=|<|>)(.*)$/.exec(crit)
    if (m) {
      op = m[1]
      const rest = m[2]
      const n = parseNumber(rest)
      target = n === null ? rest : n
    }
  }
  const vn = typeof value === 'number' ? value : typeof value === 'string' ? parseNumber(value) : typeof value === 'boolean' ? (value ? 1 : 0) : null
  const tn = typeof target === 'number' ? target : null
  let c: number
  if (vn !== null && tn !== null) c = vn < tn ? -1 : vn > tn ? 1 : 0
  else {
    const a = toText(value).toUpperCase()
    const b = toText(target).toUpperCase()
    c = a < b ? -1 : a > b ? 1 : 0
  }
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
    case '>=':
      return c >= 0
  }
  return false
}

function asRange(a: ArgValue): CellValue[] {
  return toList(a)
}

function matrixOf(a: ArgValue): Matrix {
  return isMatrix(a) ? a : { kind: 'matrix', rows: 1, cols: 1, cells: [[scalar(a)]] }
}
function sameValue(a: CellValue, b: CellValue): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b
  return toText(a).toUpperCase() === toText(b).toUpperCase()
}
function cmpLookup(a: CellValue, b: CellValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0
  const x = toText(a).toUpperCase()
  const y = toText(b).toUpperCase()
  return x < y ? -1 : x > y ? 1 : 0
}

// --- Matemáticas / agregação ---
reg(['SOMA', 'SUM'], (a) => {
  const ns = nums(a)
  return Array.isArray(ns) ? ns.reduce((s, x) => s + x, 0) : ns
})
reg(['MÉDIA', 'MEDIA', 'AVERAGE'], (a) => {
  const ns = nums(a)
  if (!Array.isArray(ns)) return ns
  return ns.length ? ns.reduce((s, x) => s + x, 0) / ns.length : err('#DIV/0!')
})
reg(['MÍNIMO', 'MINIMO', 'MIN'], (a) => {
  const ns = nums(a)
  if (!Array.isArray(ns)) return ns
  return ns.length ? Math.min(...ns) : 0
})
reg(['MÁXIMO', 'MAXIMO', 'MAX'], (a) => {
  const ns = nums(a)
  if (!Array.isArray(ns)) return ns
  return ns.length ? Math.max(...ns) : 0
})
reg(['CONT.NÚM', 'CONT.NUM', 'COUNT'], (a) => {
  const ns = nums(a)
  return Array.isArray(ns) ? ns.length : ns
})
reg(['CONT.VALORES', 'COUNTA'], (a) => flatten(a).filter((v) => v !== null && v !== '').length)
reg(['ARRED', 'ROUND'], (a) => {
  const n = n1(a)
  if (isError(n)) return n
  const d = n1(a, 1)
  const dd = isError(d) ? 0 : d
  const f = Math.pow(10, dd)
  return Math.round(n * f) / f
})
reg(['ARREDONDAR.PARA.CIMA', 'ROUNDUP'], (a) => {
  const n = n1(a)
  if (isError(n)) return n
  const d = n1(a, 1)
  const f = Math.pow(10, isError(d) ? 0 : d)
  return (n < 0 ? -1 : 1) * Math.ceil(Math.abs(n) * f) / f
})
reg(['ARREDONDAR.PARA.BAIXO', 'ROUNDDOWN'], (a) => {
  const n = n1(a)
  if (isError(n)) return n
  const d = n1(a, 1)
  const f = Math.pow(10, isError(d) ? 0 : d)
  return (n < 0 ? -1 : 1) * Math.floor(Math.abs(n) * f) / f
})
reg(['ABS'], (a) => {
  const n = n1(a)
  return isError(n) ? n : Math.abs(n)
})
reg(['INT'], (a) => {
  const n = n1(a)
  return isError(n) ? n : Math.floor(n)
})
reg(['TRUNCAR', 'TRUNC'], (a) => {
  const n = n1(a)
  return isError(n) ? n : Math.trunc(n)
})
reg(['MOD', 'RESTO'], (a) => {
  const x = n1(a)
  if (isError(x)) return x
  const y = n1(a, 1)
  if (isError(y)) return y
  return y === 0 ? err('#DIV/0!') : x - Math.floor(x / y) * y
})
reg(['RAIZ', 'SQRT'], (a) => {
  const n = n1(a)
  if (isError(n)) return n
  return n < 0 ? err('#NÚM!') : Math.sqrt(n)
})
reg(['POTÊNCIA', 'POTENCIA', 'POWER'], (a) => {
  const b = n1(a)
  if (isError(b)) return b
  const e = n1(a, 1)
  if (isError(e)) return e
  return Math.pow(b, e)
})
reg(['SOMASE', 'SUMIF'], (a) => {
  const range = asRange(a[0])
  const crit = scalar(a[1])
  const sumR = a[2] !== undefined ? asRange(a[2]) : range
  let s = 0
  for (let i = 0; i < range.length; i++) {
    if (matches(range[i], crit)) {
      const v = sumR[i]
      if (isError(v)) return v
      if (typeof v === 'number') s += v
      else if (typeof v === 'boolean') s += v ? 1 : 0
    }
  }
  return s
})
reg(['CONT.SE', 'COUNTIF'], (a) => {
  const range = asRange(a[0])
  const crit = scalar(a[1])
  let n = 0
  for (const v of range) if (matches(v, crit)) n++
  return n
})

// --- Lógicas ---
reg(['SE', 'IF'], (a) => {
  const cond = toBool(scalar(a[0]))
  if (isError(cond)) return cond
  return cond ? scalar(a[1] ?? null) : scalar(a[2] ?? false)
})
reg(['SE.ERRO', 'SEERRO', 'IFERROR'], (a) => {
  const v = scalar(a[0])
  return isError(v) ? scalar(a[1] ?? null) : v
})
reg(['E', 'AND'], (a) => {
  for (const v of flatten(a)) {
    const b = toBool(v)
    if (isError(b)) return b
    if (!b) return false
  }
  return true
})
reg(['OU', 'OR'], (a) => {
  for (const v of flatten(a)) {
    const b = toBool(v)
    if (isError(b)) return b
    if (b) return true
  }
  return false
})
reg(['NÃO', 'NAO', 'NOT'], (a) => {
  const b = toBool(scalar(a[0]))
  return isError(b) ? b : !b
})

// --- Texto ---
reg(['CONCATENAR', 'CONCAT', 'CONCATENATE'], (a) => flatten(a).map(toText).join(''))
reg(['MAIÚSCULA', 'MAIUSCULA', 'UPPER'], (a) => toText(scalar(a[0])).toUpperCase())
reg(['MINÚSCULA', 'MINUSCULA', 'LOWER'], (a) => toText(scalar(a[0])).toLowerCase())
reg(['ARRUMAR', 'TRIM'], (a) => toText(scalar(a[0])).trim().replace(/\s+/g, ' '))
reg(['NÚM.CARACT', 'NUM.CARACT', 'LEN'], (a) => toText(scalar(a[0])).length)
reg(['ESQUERDA', 'LEFT'], (a) => {
  const s = toText(scalar(a[0]))
  const n = a[1] !== undefined ? n1(a, 1) : 1
  return s.slice(0, isError(n) ? 1 : n)
})
reg(['DIREITA', 'RIGHT'], (a) => {
  const s = toText(scalar(a[0]))
  const n = a[1] !== undefined ? n1(a, 1) : 1
  const k = isError(n) ? 1 : n
  return k <= 0 ? '' : s.slice(-k)
})
reg(['EXT.TEXTO', 'MID'], (a) => {
  const s = toText(scalar(a[0]))
  const start = n1(a, 1)
  const len = n1(a, 2)
  if (isError(start)) return start
  if (isError(len)) return len
  return s.slice(start - 1, start - 1 + len)
})

// --- Data (texto, no formato pt-BR) ---
reg(['HOJE', 'TODAY'], () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
})
reg(['AGORA', 'NOW'], () => {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
})

// --- Pesquisa, referência e estatística ---
reg(['PROCV', 'VLOOKUP'], (a) => {
  const lookup = scalar(a[0])
  const mat = matrixOf(a[1])
  const col = n1(a, 2)
  if (isError(col)) return col
  const ci = Math.trunc(col) - 1
  if (ci < 0 || ci >= mat.cols) return err('#REF!')
  const approx = a[3] !== undefined && toBool(scalar(a[3])) === true
  if (!approx) {
    for (let r = 0; r < mat.rows; r++) if (sameValue(lookup, mat.cells[r][0])) return mat.cells[r][ci]
    return err('#N/D')
  }
  let best = -1
  for (let r = 0; r < mat.rows; r++) {
    if (cmpLookup(mat.cells[r][0], lookup) <= 0) best = r
    else break
  }
  return best >= 0 ? mat.cells[best][ci] : err('#N/D')
})

reg(['ÍNDICE', 'INDICE', 'INDEX'], (a) => {
  const mat = matrixOf(a[0])
  const rn = n1(a, 1)
  if (isError(rn)) return rn
  if (a[2] === undefined && (mat.rows === 1 || mat.cols === 1)) {
    const list = flatten([mat])
    const i = Math.trunc(rn) - 1
    return i >= 0 && i < list.length ? list[i] : err('#REF!')
  }
  const cn = a[2] !== undefined ? n1(a, 2) : 1
  if (isError(cn)) return cn
  const ri = Math.trunc(rn) - 1
  const ci = Math.trunc(cn) - 1
  if (ri < 0 || ri >= mat.rows || ci < 0 || ci >= mat.cols) return err('#REF!')
  return mat.cells[ri][ci]
})

reg(['CORRESP', 'MATCH'], (a) => {
  const lookup = scalar(a[0])
  const list = toList(a[1])
  const typ = a[2] !== undefined ? n1(a, 2) : 1
  const t = isError(typ) ? 1 : Math.trunc(typ)
  if (t === 0) {
    for (let i = 0; i < list.length; i++) if (sameValue(lookup, list[i])) return i + 1
    return err('#N/D')
  }
  let best = -1
  for (let i = 0; i < list.length; i++) {
    const c = cmpLookup(list[i], lookup)
    if (t > 0 && c <= 0) best = i
    else if (t < 0 && c >= 0) best = i
  }
  return best >= 0 ? best + 1 : err('#N/D')
})

reg(['SOMASES', 'SUMIFS'], (a) => {
  const sum = toList(a[0])
  const keep = sum.map(() => true)
  for (let k = 1; k + 1 < a.length; k += 2) {
    const rng = toList(a[k])
    const cr = scalar(a[k + 1])
    for (let i = 0; i < keep.length; i++) if (!matches(rng[i] ?? null, cr)) keep[i] = false
  }
  let s = 0
  for (let i = 0; i < sum.length; i++) {
    if (!keep[i]) continue
    const v = sum[i]
    if (isError(v)) return v
    if (typeof v === 'number') s += v
    else if (typeof v === 'boolean') s += v ? 1 : 0
  }
  return s
})

reg(['CONT.SES', 'COUNTIFS'], (a) => {
  if (a.length < 2) return err('#VALOR!')
  const keep = toList(a[0]).map(() => true)
  for (let k = 0; k + 1 < a.length; k += 2) {
    const rng = toList(a[k])
    const cr = scalar(a[k + 1])
    for (let i = 0; i < keep.length; i++) if (!matches(rng[i] ?? null, cr)) keep[i] = false
  }
  return keep.filter(Boolean).length
})

reg(['SES', 'IFS'], (a) => {
  for (let k = 0; k + 1 < a.length; k += 2) {
    const b = toBool(scalar(a[k]))
    if (isError(b)) return b
    if (b) return scalar(a[k + 1])
  }
  return err('#N/D')
})

reg(['MAIOR', 'LARGE'], (a) => {
  const ns = nums([a[0]])
  if (!Array.isArray(ns)) return ns
  const k = n1(a, 1)
  if (isError(k)) return k
  const sorted = [...ns].sort((x, y) => y - x)
  const kk = Math.trunc(k)
  return kk >= 1 && kk <= sorted.length ? sorted[kk - 1] : err('#NÚM!')
})

reg(['MENOR', 'SMALL'], (a) => {
  const ns = nums([a[0]])
  if (!Array.isArray(ns)) return ns
  const k = n1(a, 1)
  if (isError(k)) return k
  const sorted = [...ns].sort((x, y) => x - y)
  const kk = Math.trunc(k)
  return kk >= 1 && kk <= sorted.length ? sorted[kk - 1] : err('#NÚM!')
})

// ===== Ampliação da biblioteca (v0.4) =====

function keepMask(len: number, a: ArgValue[], start: number): boolean[] {
  const keep = new Array<boolean>(len).fill(true)
  for (let k = start; k + 1 < a.length; k += 2) {
    const rng = toList(a[k])
    const cr = scalar(a[k + 1])
    for (let i = 0; i < len; i++) if (!matches(rng[i] ?? null, cr)) keep[i] = false
  }
  return keep
}
function variance(ns: number[], sample: boolean): number {
  const m = ns.reduce((s, x) => s + x, 0) / ns.length
  const q = ns.reduce((s, x) => s + (x - m) * (x - m), 0)
  return q / (sample ? ns.length - 1 : ns.length)
}
function parseDate(v: CellValue): Date | null {
  if (typeof v === 'string') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v.trim())
    if (m) {
      let y = +m[3]
      if (y < 100) y += 2000
      const d = new Date(y, +m[2] - 1, +m[1])
      return isNaN(d.getTime()) ? null : d
    }
  }
  return null
}
function fmtDate(d: Date): string {
  const p = (x: number): string => String(x).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

// --- Matemáticas adicionais ---
reg(['PI'], () => Math.PI)
reg(['EXP'], (a) => { const n = n1(a); return isError(n) ? n : Math.exp(n) })
reg(['LN'], (a) => { const n = n1(a); if (isError(n)) return n; return n <= 0 ? err('#NÚM!') : Math.log(n) })
reg(['LOG'], (a) => { const n = n1(a); if (isError(n)) return n; if (n <= 0) return err('#NÚM!'); const b = a[1] !== undefined ? n1(a, 1) : 10; if (isError(b)) return b; return Math.log(n) / Math.log(b) })
reg(['LOG10'], (a) => { const n = n1(a); if (isError(n)) return n; return n <= 0 ? err('#NÚM!') : Math.log10(n) })
reg(['SINAL', 'SIGN'], (a) => { const n = n1(a); return isError(n) ? n : Math.sign(n) })
reg(['FATORIAL', 'FACT'], (a) => { const n = n1(a); if (isError(n)) return n; const k = Math.trunc(n); if (k < 0) return err('#NÚM!'); let f = 1; for (let i = 2; i <= k; i++) f *= i; return f })
reg(['TETO', 'ARREDMULTSUP', 'CEILING'], (a) => { const n = n1(a); if (isError(n)) return n; const s = a[1] !== undefined ? n1(a, 1) : 1; if (isError(s)) return s; return s === 0 ? 0 : Math.ceil(n / s) * s })
reg(['ARREDMULTB', 'ARREDMULTINF', 'FLOOR'], (a) => { const n = n1(a); if (isError(n)) return n; const s = a[1] !== undefined ? n1(a, 1) : 1; if (isError(s)) return s; return s === 0 ? err('#DIV/0!') : Math.floor(n / s) * s })
reg(['MARRED', 'MROUND'], (a) => { const n = n1(a); if (isError(n)) return n; const s = n1(a, 1); if (isError(s)) return s; return s === 0 ? 0 : Math.round(n / s) * s })
reg(['ALEATÓRIO', 'ALEATORIO', 'RAND'], () => Math.random())
reg(['ALEATÓRIOENTRE', 'ALEATORIOENTRE', 'RANDBETWEEN'], (a) => { const lo = n1(a); if (isError(lo)) return lo; const hi = n1(a, 1); if (isError(hi)) return hi; const l = Math.ceil(lo); const h = Math.floor(hi); return l + Math.floor(Math.random() * (h - l + 1)) })
reg(['SOMARPRODUTO', 'SUMPRODUCT'], (a) => {
  const lists = a.map(toList)
  const len = lists.reduce((m, l) => Math.max(m, l.length), 0)
  let s = 0
  for (let i = 0; i < len; i++) {
    let p = 1
    for (const l of lists) {
      const v = l[i]
      if (isError(v)) return v
      p *= typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0
    }
    s += p
  }
  return s
})
reg(['SOMAQUAD', 'SUMSQ'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; return ns.reduce((s, x) => s + x * x, 0) })
reg(['MDC', 'GCD'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; const g = (x: number, y: number): number => (y ? g(y, x % y) : x); return ns.map((x) => Math.abs(Math.trunc(x))).reduce((x, y) => g(x, y), 0) })
reg(['MMC', 'LCM'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; if (!ns.length) return err('#NÚM!'); const g = (x: number, y: number): number => (y ? g(y, x % y) : x); return ns.map((x) => Math.abs(Math.trunc(x))).reduce((x, y) => (x && y ? Math.abs(x * y) / g(x, y) : 0)) })

// --- Estatística condicional e descritiva ---
reg(['MÉDIASE', 'MEDIASE', 'AVERAGEIF'], (a) => {
  const range = asRange(a[0]); const crit = scalar(a[1]); const avg = a[2] !== undefined ? asRange(a[2]) : range
  let s = 0; let c = 0
  for (let i = 0; i < range.length; i++) {
    if (matches(range[i], crit)) { const v = avg[i]; if (isError(v)) return v; if (typeof v === 'number') { s += v; c++ } else if (typeof v === 'boolean') { s += v ? 1 : 0; c++ } }
  }
  return c ? s / c : err('#DIV/0!')
})
reg(['MÉDIASES', 'MEDIASES', 'AVERAGEIFS'], (a) => {
  const avg = toList(a[0]); const keep = keepMask(avg.length, a, 1)
  let s = 0; let c = 0
  for (let i = 0; i < avg.length; i++) { if (!keep[i]) continue; const v = avg[i]; if (isError(v)) return v; if (typeof v === 'number') { s += v; c++ } else if (typeof v === 'boolean') { s += v ? 1 : 0; c++ } }
  return c ? s / c : err('#DIV/0!')
})
reg(['MÁXIMOSES', 'MAXIMOSES', 'MAXIFS'], (a) => {
  const vals = toList(a[0]); const keep = keepMask(vals.length, a, 1); const picked: number[] = []
  for (let i = 0; i < vals.length; i++) { if (!keep[i]) continue; const v = vals[i]; if (isError(v)) return v; if (typeof v === 'number') picked.push(v); else if (typeof v === 'boolean') picked.push(v ? 1 : 0) }
  return picked.length ? Math.max(...picked) : 0
})
reg(['MÍNIMOSES', 'MINIMOSES', 'MINIFS'], (a) => {
  const vals = toList(a[0]); const keep = keepMask(vals.length, a, 1); const picked: number[] = []
  for (let i = 0; i < vals.length; i++) { if (!keep[i]) continue; const v = vals[i]; if (isError(v)) return v; if (typeof v === 'number') picked.push(v); else if (typeof v === 'boolean') picked.push(v ? 1 : 0) }
  return picked.length ? Math.min(...picked) : 0
})
reg(['CONT.VAZIO', 'CONT.VAZIAS', 'COUNTBLANK'], (a) => flatten(a).filter((v) => v === null || v === '').length)
reg(['MED', 'MEDIANA', 'MEDIAN'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; if (!ns.length) return err('#NÚM!'); const s = [...ns].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 })
reg(['MODO', 'MODO.ÚNICO', 'MODO.UNICO', 'MODE'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; const cnt = new Map<number, number>(); let best: number | null = null; let bc = 1; for (const x of ns) { const c = (cnt.get(x) ?? 0) + 1; cnt.set(x, c); if (c > bc) { bc = c; best = x } } return best === null ? err('#N/D') : best })
reg(['DESVPAD', 'DESVPAD.A', 'DESVPADA', 'STDEV'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; return ns.length > 1 ? Math.sqrt(variance(ns, true)) : err('#DIV/0!') })
reg(['DESVPADP', 'DESVPAD.P', 'STDEVP'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; return ns.length ? Math.sqrt(variance(ns, false)) : err('#DIV/0!') })
reg(['VAR', 'VAR.A', 'VARA'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; return ns.length > 1 ? variance(ns, true) : err('#DIV/0!') })
reg(['VARP', 'VAR.P'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; return ns.length ? variance(ns, false) : err('#DIV/0!') })

// --- Lógicas e de informação ---
reg(['VERDADEIRO', 'TRUE'], () => true)
reg(['FALSO', 'FALSE'], () => false)
reg(['XOU', 'XOR'], (a) => { let t = 0; for (const v of flatten(a)) { const b = toBool(v); if (isError(b)) return b; if (b) t++ } return t % 2 === 1 })
reg(['SE.NÃO.DISP', 'SE.NAO.DISP', 'IFNA'], (a) => { const v = scalar(a[0]); return isError(v) && v.error === '#N/D' ? scalar(a[1] ?? null) : v })
reg(['ÉERROS', 'EERROS', 'ISERROR'], (a) => isError(scalar(a[0])))
reg(['ÉERRO', 'EERRO', 'ISERR'], (a) => { const v = scalar(a[0]); return isError(v) && v.error !== '#N/D' })
reg(['É.NÃO.DISP', 'ENAODISP', 'ISNA'], (a) => { const v = scalar(a[0]); return isError(v) && v.error === '#N/D' })
reg(['ÉNÚM', 'ENUM', 'ISNUMBER'], (a) => typeof scalar(a[0]) === 'number')
reg(['ÉTEXTO', 'ETEXTO', 'ISTEXT'], (a) => typeof scalar(a[0]) === 'string')
reg(['ÉCÉL.VAZIA', 'ECELVAZIA', 'ISBLANK'], (a) => { const v = scalar(a[0]); return v === null || v === '' })
reg(['ÉLÓGICO', 'ELOGICO', 'ISLOGICAL'], (a) => typeof scalar(a[0]) === 'boolean')
reg(['NÃO.DISP', 'NAO.DISP', 'NA'], () => err('#N/D'))

// --- Texto adicionais ---
reg(['PRI.MAIÚSCULA', 'PRI.MAIUSCULA', 'PROPER'], (a) => toText(scalar(a[0])).toLowerCase().replace(/\b\p{L}/gu, (ch) => ch.toUpperCase()))
reg(['REPETIR', 'REPT'], (a) => { const s = toText(scalar(a[0])); const n = n1(a, 1); if (isError(n)) return n; const k = Math.trunc(n); return k <= 0 ? '' : s.repeat(Math.min(k, 100000)) })
reg(['EXATO', 'EXACT'], (a) => toText(scalar(a[0])) === toText(scalar(a[1])))
reg(['VALOR', 'VALUE'], (a) => { const n = parseNumber(toText(scalar(a[0]))); return n === null ? err('#VALOR!') : n })
reg(['SUBSTITUIR', 'SUBSTITUTE'], (a) => {
  const s = toText(scalar(a[0])); const oldt = toText(scalar(a[1])); const newt = toText(scalar(a[2]))
  if (oldt === '') return s
  const inst = a[3] !== undefined ? n1(a, 3) : null
  if (isError(inst)) return inst
  if (inst === null) return s.split(oldt).join(newt)
  let idx = -1; let count = 0; let from = 0
  while ((idx = s.indexOf(oldt, from)) !== -1) { count++; if (count === inst) return s.slice(0, idx) + newt + s.slice(idx + oldt.length); from = idx + oldt.length }
  return s
})
reg(['MUDAR', 'REPLACE'], (a) => { const s = toText(scalar(a[0])); const start = n1(a, 1); if (isError(start)) return start; const len = n1(a, 2); if (isError(len)) return len; const i = Math.max(0, Math.trunc(start) - 1); return s.slice(0, i) + toText(scalar(a[3])) + s.slice(i + Math.max(0, Math.trunc(len))) })
reg(['LOCALIZAR', 'FIND'], (a) => { const sub = toText(scalar(a[0])); const s = toText(scalar(a[1])); const start = a[2] !== undefined ? n1(a, 2) : 1; if (isError(start)) return start; const i = s.indexOf(sub, Math.max(0, Math.trunc(start) - 1)); return i < 0 ? err('#VALOR!') : i + 1 })
reg(['PROCURAR', 'SEARCH'], (a) => { const sub = toText(scalar(a[0])).toLowerCase(); const s = toText(scalar(a[1])).toLowerCase(); const start = a[2] !== undefined ? n1(a, 2) : 1; if (isError(start)) return start; const i = s.indexOf(sub, Math.max(0, Math.trunc(start) - 1)); return i < 0 ? err('#VALOR!') : i + 1 })
reg(['TEXTOJUNTAR', 'TEXTJOIN'], (a) => { const delim = toText(scalar(a[0])); const ignore = toBool(scalar(a[1])); if (isError(ignore)) return ignore; const parts = flatten(a.slice(2)).filter((v) => !ignore || (v !== null && v !== '')).map(toText); return parts.join(delim) })
reg(['TEXTO', 'TEXT'], (a) => {
  const raw = scalar(a[0]); const fmt = toText(scalar(a[1]))
  const n = toNumber(raw)
  if (isError(n)) return toText(raw)
  const pct = fmt.includes('%')
  const grouping = fmt.includes(',')
  const dot = fmt.split('.')[1]
  const dec = dot ? (dot.match(/[0#]/g)?.length ?? 0) : 0
  const opts: Intl.NumberFormatOptions = { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: grouping }
  if (pct) opts.style = 'percent'
  return new Intl.NumberFormat('pt-BR', opts).format(n)
})

// --- Pesquisa adicionais ---
reg(['ESCOLHER', 'CHOOSE'], (a) => { const i = n1(a, 0); if (isError(i)) return i; const idx = Math.trunc(i); return idx >= 1 && idx < a.length ? scalar(a[idx]) : err('#VALOR!') })
reg(['PROCH', 'HLOOKUP'], (a) => {
  const lookup = scalar(a[0]); const mat = matrixOf(a[1]); const row = n1(a, 2)
  if (isError(row)) return row
  const ri = Math.trunc(row) - 1
  if (ri < 0 || ri >= mat.rows) return err('#REF!')
  const approx = a[3] !== undefined && toBool(scalar(a[3])) === true
  if (!approx) { for (let c = 0; c < mat.cols; c++) if (sameValue(lookup, mat.cells[0][c])) return mat.cells[ri][c]; return err('#N/D') }
  let best = -1
  for (let c = 0; c < mat.cols; c++) { if (cmpLookup(mat.cells[0][c], lookup) <= 0) best = c; else break }
  return best >= 0 ? mat.cells[ri][best] : err('#N/D')
})
reg(['PROCX', 'XLOOKUP'], (a) => {
  const lookup = scalar(a[0]); const look = toList(a[1]); const ret = toList(a[2])
  for (let i = 0; i < look.length; i++) if (sameValue(lookup, look[i])) return ret[i] ?? err('#N/D')
  return a[3] !== undefined ? scalar(a[3]) : err('#N/D')
})

// --- Data (texto dd/mm/aaaa) ---
reg(['DATA', 'DATE'], (a) => { const y = n1(a, 0); if (isError(y)) return y; const m = n1(a, 1); if (isError(m)) return m; const d = n1(a, 2); if (isError(d)) return d; return fmtDate(new Date(Math.trunc(y), Math.trunc(m) - 1, Math.trunc(d))) })
reg(['ANO', 'YEAR'], (a) => { const d = parseDate(scalar(a[0])); return d ? d.getFullYear() : err('#VALOR!') })
reg(['MÊS', 'MES', 'MONTH'], (a) => { const d = parseDate(scalar(a[0])); return d ? d.getMonth() + 1 : err('#VALOR!') })
reg(['DIA', 'DAY'], (a) => { const d = parseDate(scalar(a[0])); return d ? d.getDate() : err('#VALOR!') })
reg(['DIA.DA.SEMANA', 'WEEKDAY'], (a) => { const d = parseDate(scalar(a[0])); return d ? d.getDay() + 1 : err('#VALOR!') })

// ===== Ampliação da biblioteca (v0.5): trigonometria, financeiras, estatística, texto, data/hora, informação =====

function fact(n: number): number { n = Math.trunc(n); if (n < 0) return NaN; let f = 1; for (let i = 2; i <= n; i++) f *= i; return f }
function toRoman(n: number): string {
  n = Math.trunc(n); if (n <= 0 || n > 3999) return ''
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let r = ''; for (const [v, s] of map) while (n >= v) { r += s; n -= v }
  return r
}
function addMonths(d: Date, m: number): Date { return new Date(d.getFullYear(), d.getMonth() + Math.trunc(m), d.getDate()) }
function workday(start: Date, days: number): Date {
  const d = new Date(start); let n = Math.abs(Math.trunc(days)); const step = days >= 0 ? 1 : -1
  while (n > 0) { d.setDate(d.getDate() + step); const w = d.getDay(); if (w !== 0 && w !== 6) n-- }
  return d
}
function parseTime(v: CellValue): [number, number, number] | null {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(toText(v))
  return m ? [+m[1], +m[2], m[3] ? +m[3] : 0] : null
}
function annuityResidual(r: number, nper: number, pmt: number, pv: number, fv: number, type: number): number {
  if (Math.abs(r) < 1e-10) return pv + pmt * nper + fv
  const t = Math.pow(1 + r, nper)
  return pv * t + pmt * (1 + r * type) * (t - 1) / r + fv
}
function newton(f: (x: number) => number, guess: number, tol: number): number | null {
  let r = guess
  for (let i = 0; i < 128; i++) {
    const y = f(r)
    const d = (f(r + 1e-6) - y) / 1e-6
    if (Math.abs(d) < 1e-13) break
    const rn = r - y / d
    if (!isFinite(rn) || rn <= -1) break
    if (Math.abs(rn - r) < 1e-10) return rn
    r = rn
  }
  return Math.abs(f(r)) < tol ? r : null
}

// --- Trigonometria ---
reg(['SEN', 'SENO', 'SIN'], (a) => { const n = n1(a); return isError(n) ? n : Math.sin(n) })
reg(['COS'], (a) => { const n = n1(a); return isError(n) ? n : Math.cos(n) })
reg(['TAN'], (a) => { const n = n1(a); return isError(n) ? n : Math.tan(n) })
reg(['ASEN', 'ASENO', 'ASIN'], (a) => { const n = n1(a); if (isError(n)) return n; return n < -1 || n > 1 ? err('#NÚM!') : Math.asin(n) })
reg(['ACOS'], (a) => { const n = n1(a); if (isError(n)) return n; return n < -1 || n > 1 ? err('#NÚM!') : Math.acos(n) })
reg(['ATAN'], (a) => { const n = n1(a); return isError(n) ? n : Math.atan(n) })
reg(['ATAN2'], (a) => { const x = n1(a); if (isError(x)) return x; const y = n1(a, 1); if (isError(y)) return y; return Math.atan2(y, x) })
reg(['SENH', 'SINH'], (a) => { const n = n1(a); return isError(n) ? n : Math.sinh(n) })
reg(['COSH'], (a) => { const n = n1(a); return isError(n) ? n : Math.cosh(n) })
reg(['TANH'], (a) => { const n = n1(a); return isError(n) ? n : Math.tanh(n) })
reg(['GRAUS', 'DEGREES'], (a) => { const n = n1(a); return isError(n) ? n : (n * 180) / Math.PI })
reg(['RADIANOS', 'RADIANS'], (a) => { const n = n1(a); return isError(n) ? n : (n * Math.PI) / 180 })

// --- Matemática adicional ---
reg(['PRODUTO', 'MULT', 'PRODUCT'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; return ns.length ? ns.reduce((s, x) => s * x, 1) : 0 })
reg(['QUOCIENTE', 'QUOTIENT'], (a) => { const x = n1(a); if (isError(x)) return x; const y = n1(a, 1); if (isError(y)) return y; return y === 0 ? err('#DIV/0!') : Math.trunc(x / y) })
reg(['PAR', 'EVEN'], (a) => { const n = n1(a); if (isError(n)) return n; const s = n < 0 ? -1 : 1; return s * Math.ceil(Math.abs(n) / 2) * 2 })
reg(['ÍMPAR', 'IMPAR', 'ODD'], (a) => { const n = n1(a); if (isError(n)) return n; const s = n < 0 ? -1 : 1; const k = Math.ceil(Math.abs(n)); return s * (k % 2 === 0 ? k + 1 : k) })
reg(['COMBIN'], (a) => { const n = n1(a); if (isError(n)) return n; const k = n1(a, 1); if (isError(k)) return k; if (k < 0 || k > n) return err('#NÚM!'); return Math.round(fact(n) / (fact(k) * fact(n - k))) })
reg(['PERMUT'], (a) => { const n = n1(a); if (isError(n)) return n; const k = n1(a, 1); if (isError(k)) return k; if (k < 0 || k > n) return err('#NÚM!'); return Math.round(fact(n) / fact(n - k)) })
reg(['ROMANO', 'ROMAN'], (a) => { const n = n1(a); if (isError(n)) return n; const r = toRoman(n); return r || err('#VALOR!') })

// --- Estatística adicional ---
reg(['ORDEM', 'ORDEM.EQ', 'RANK', 'RANK.EQ'], (a) => {
  const x = n1(a); if (isError(x)) return x
  const ref = nums([a[1]]); if (!Array.isArray(ref)) return ref
  const asc = a[2] !== undefined && toBool(scalar(a[2])) === true
  const sorted = [...ref].sort((p, q) => (asc ? p - q : q - p))
  const i = sorted.indexOf(x)
  return i < 0 ? err('#N/D') : i + 1
})
function percentileOf(ns: number[], k: number): number {
  const s = [...ns].sort((x, y) => x - y)
  const pos = k * (s.length - 1); const lo = Math.floor(pos); const fr = pos - lo
  return lo + 1 < s.length ? s[lo] + fr * (s[lo + 1] - s[lo]) : s[lo]
}
reg(['PERCENTIL', 'PERCENTIL.INC', 'PERCENTILE'], (a) => { const ns = nums([a[0]]); if (!Array.isArray(ns)) return ns; if (!ns.length) return err('#NÚM!'); const k = n1(a, 1); if (isError(k)) return k; return k < 0 || k > 1 ? err('#NÚM!') : percentileOf(ns, k) })
reg(['QUARTIL', 'QUARTIL.INC', 'QUARTILE'], (a) => { const ns = nums([a[0]]); if (!Array.isArray(ns)) return ns; if (!ns.length) return err('#NÚM!'); const q = n1(a, 1); if (isError(q)) return q; const qq = Math.trunc(q); return qq < 0 || qq > 4 ? err('#NÚM!') : percentileOf(ns, qq / 4) })
reg(['MÉDIA.GEOMÉTRICA', 'MEDIA.GEOMETRICA', 'GEOMEAN'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; if (!ns.length) return err('#NÚM!'); for (const x of ns) if (x <= 0) return err('#NÚM!'); const p = ns.reduce((s, x) => s * x, 1); return Math.pow(p, 1 / ns.length) })
reg(['MÉDIA.HARMÔNICA', 'MEDIA.HARMONICA', 'HARMEAN'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; if (!ns.length) return err('#NÚM!'); let s = 0; for (const x of ns) { if (x <= 0) return err('#NÚM!'); s += 1 / x } return ns.length / s })
reg(['DESV.MÉDIO', 'DESV.MEDIO', 'AVEDEV'], (a) => { const ns = nums(a); if (!Array.isArray(ns)) return ns; if (!ns.length) return err('#NÚM!'); const m = ns.reduce((s, x) => s + x, 0) / ns.length; return ns.reduce((s, x) => s + Math.abs(x - m), 0) / ns.length })

// --- Financeiras ---
reg(['VP', 'PV'], (a) => {
  const r = n1(a); if (isError(r)) return r; const nper = n1(a, 1); if (isError(nper)) return nper; const pmt = n1(a, 2); if (isError(pmt)) return pmt
  const fv = a[3] !== undefined ? n1(a, 3) : 0; if (isError(fv)) return fv; const ty = a[4] !== undefined ? n1(a, 4) : 0; if (isError(ty)) return ty
  if (r === 0) return -(fv + pmt * nper)
  const t = Math.pow(1 + r, nper)
  return -(fv + pmt * (1 + r * ty) * (t - 1) / r) / t
})
reg(['VF', 'FV'], (a) => {
  const r = n1(a); if (isError(r)) return r; const nper = n1(a, 1); if (isError(nper)) return nper; const pmt = n1(a, 2); if (isError(pmt)) return pmt
  const pv = a[3] !== undefined ? n1(a, 3) : 0; if (isError(pv)) return pv; const ty = a[4] !== undefined ? n1(a, 4) : 0; if (isError(ty)) return ty
  if (r === 0) return -(pv + pmt * nper)
  const t = Math.pow(1 + r, nper)
  return -(pv * t + pmt * (1 + r * ty) * (t - 1) / r)
})
reg(['PGTO', 'PMT'], (a) => {
  const r = n1(a); if (isError(r)) return r; const nper = n1(a, 1); if (isError(nper)) return nper; const pv = n1(a, 2); if (isError(pv)) return pv
  const fv = a[3] !== undefined ? n1(a, 3) : 0; if (isError(fv)) return fv; const ty = a[4] !== undefined ? n1(a, 4) : 0; if (isError(ty)) return ty
  if (nper === 0) return err('#NÚM!')
  if (r === 0) return -(pv + fv) / nper
  const t = Math.pow(1 + r, nper)
  return -(fv + pv * t) * r / ((1 + r * ty) * (t - 1))
})
reg(['NPER'], (a) => {
  const r = n1(a); if (isError(r)) return r; const pmt = n1(a, 1); if (isError(pmt)) return pmt; const pv = n1(a, 2); if (isError(pv)) return pv
  const fv = a[3] !== undefined ? n1(a, 3) : 0; if (isError(fv)) return fv; const ty = a[4] !== undefined ? n1(a, 4) : 0; if (isError(ty)) return ty
  if (r === 0) return pmt === 0 ? err('#NÚM!') : -(pv + fv) / pmt
  const num = pmt * (1 + r * ty) - fv * r
  const den = pv * r + pmt * (1 + r * ty)
  if (num / den <= 0) return err('#NÚM!')
  return Math.log(num / den) / Math.log(1 + r)
})
reg(['TAXA', 'RATE'], (a) => {
  const nper = n1(a); if (isError(nper)) return nper; const pmt = n1(a, 1); if (isError(pmt)) return pmt; const pv = n1(a, 2); if (isError(pv)) return pv
  const fv = a[3] !== undefined ? n1(a, 3) : 0; if (isError(fv)) return fv; const ty = a[4] !== undefined ? n1(a, 4) : 0; if (isError(ty)) return ty
  const guess = a[5] !== undefined ? n1(a, 5) : 0.1; if (isError(guess)) return guess
  const r = newton((x) => annuityResidual(x, nper, pmt, pv, fv, ty), guess, 1e-5)
  return r === null ? err('#NÚM!') : r
})
reg(['VPL', 'NPV'], (a) => {
  const r = n1(a); if (isError(r)) return r
  const cfs = flatten(a.slice(1))
  let s = 0
  for (let i = 0; i < cfs.length; i++) { const v = cfs[i]; if (isError(v)) return v; if (typeof v === 'number') s += v / Math.pow(1 + r, i + 1) }
  return s
})
reg(['TIR', 'IRR'], (a) => {
  const cfs = toList(a[0]).map((v) => (typeof v === 'number' ? v : 0))
  const guess = a[1] !== undefined ? n1(a, 1) : 0.1; if (isError(guess)) return guess
  const npv = (x: number): number => cfs.reduce((s, c, i) => s + c / Math.pow(1 + x, i), 0)
  const r = newton(npv, guess, 1e-4)
  return r === null ? err('#NÚM!') : r
})

// --- Texto adicional ---
reg(['CÓDIGO', 'CODIGO', 'CODE'], (a) => { const s = toText(scalar(a[0])); return s ? s.charCodeAt(0) : err('#VALOR!') })
reg(['CARÁT', 'CARACT', 'CHAR'], (a) => { const n = n1(a); if (isError(n)) return n; return String.fromCharCode(Math.trunc(n)) })
reg(['UNICODE'], (a) => { const s = toText(scalar(a[0])); return s ? (s.codePointAt(0) ?? err('#VALOR!')) : err('#VALOR!') })
reg(['UNICAR', 'UNICHAR'], (a) => { const n = n1(a); if (isError(n)) return n; return String.fromCodePoint(Math.trunc(n)) })
reg(['LIMPAR', 'CLEAN'], (a) => toText(scalar(a[0])).replace(/[\u0000-\u001f\u007f]/g, ''))
reg(['T'], (a) => { const v = scalar(a[0]); return typeof v === 'string' ? v : '' })
reg(['MOEDA', 'DÓLAR', 'DOLAR', 'DOLLAR'], (a) => { const n = n1(a); if (isError(n)) return n; const dec = a[1] !== undefined ? n1(a, 1) : 2; if (isError(dec)) return dec; const dd = Math.max(0, Math.min(20, Math.trunc(dec))); return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: dd, maximumFractionDigits: dd }).format(n) })
reg(['DEF.NÚM.DEC', 'DEF.NUM.DEC', 'FIXED'], (a) => { const n = n1(a); if (isError(n)) return n; const dec = a[1] !== undefined ? n1(a, 1) : 2; if (isError(dec)) return dec; const dd = Math.max(0, Math.min(20, Math.trunc(dec))); const noGrp = a[2] !== undefined && toBool(scalar(a[2])) === true; return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dd, maximumFractionDigits: dd, useGrouping: !noGrp }).format(n) })

// --- Data e hora adicionais (datas em texto dd/mm/aaaa) ---
reg(['DATA.VALOR', 'DATAVALOR', 'DATEVALUE'], (a) => { const d = parseDate(scalar(a[0])); return d ? fmtDate(d) : err('#VALOR!') })
reg(['DIAS', 'DAYS'], (a) => { const e = parseDate(scalar(a[0])); const s = parseDate(scalar(a[1])); if (!e || !s) return err('#VALOR!'); return Math.round((e.getTime() - s.getTime()) / 86400000) })
reg(['DATAM', 'EDATE'], (a) => { const d = parseDate(scalar(a[0])); if (!d) return err('#VALOR!'); const m = n1(a, 1); if (isError(m)) return m; return fmtDate(addMonths(d, m)) })
reg(['FIMMÊS', 'FIMMES', 'EOMONTH'], (a) => { const d = parseDate(scalar(a[0])); if (!d) return err('#VALOR!'); const m = n1(a, 1); if (isError(m)) return m; return fmtDate(new Date(d.getFullYear(), d.getMonth() + Math.trunc(m) + 1, 0)) })
reg(['DIATRABALHO', 'WORKDAY'], (a) => { const d = parseDate(scalar(a[0])); if (!d) return err('#VALOR!'); const n = n1(a, 1); if (isError(n)) return n; return fmtDate(workday(d, n)) })
reg(['DIATRABALHOTOTAL', 'NETWORKDAYS'], (a) => {
  let s = parseDate(scalar(a[0])); let e = parseDate(scalar(a[1])); if (!s || !e) return err('#VALOR!')
  let sign = 1; if (s > e) { const t = s; s = e; e = t; sign = -1 }
  let count = 0; const d = new Date(s)
  while (d <= e) { const w = d.getDay(); if (w !== 0 && w !== 6) count++; d.setDate(d.getDate() + 1) }
  return sign * count
})
reg(['NÚMSEMANA', 'NUMSEMANA', 'WEEKNUM'], (a) => { const d = parseDate(scalar(a[0])); if (!d) return err('#VALOR!'); const start = new Date(d.getFullYear(), 0, 1); const days = Math.floor((d.getTime() - start.getTime()) / 86400000); return Math.floor((days + start.getDay()) / 7) + 1 })
reg(['TEMPO', 'TIME'], (a) => { const h = n1(a); if (isError(h)) return h; const m = n1(a, 1); if (isError(m)) return m; const s = a[2] !== undefined ? n1(a, 2) : 0; if (isError(s)) return s; const p = (x: number): string => String(Math.trunc(x)).padStart(2, '0'); return `${p(h)}:${p(m)}:${p(s)}` })
reg(['HORA', 'HOUR'], (a) => { const t = parseTime(scalar(a[0])); return t ? t[0] : err('#VALOR!') })
reg(['MINUTO', 'MINUTE'], (a) => { const t = parseTime(scalar(a[0])); return t ? t[1] : err('#VALOR!') })
reg(['SEGUNDO', 'SECOND'], (a) => { const t = parseTime(scalar(a[0])); return t ? t[2] : err('#VALOR!') })

// --- Informação adicional ---
reg(['ÉPAR', 'EPAR', 'ISEVEN'], (a) => { const n = n1(a); return isError(n) ? n : Math.trunc(n) % 2 === 0 })
reg(['ÉIMPAR', 'EIMPAR', 'ISODD'], (a) => { const n = n1(a); return isError(n) ? n : Math.abs(Math.trunc(n) % 2) === 1 })
reg(['ÉNÃOTEXTO', 'ENAOTEXTO', 'ISNONTEXT'], (a) => typeof scalar(a[0]) !== 'string')
reg(['N'], (a) => { const v = scalar(a[0]); if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; if (isError(v)) return v; return 0 })
reg(['TIPO', 'TYPE'], (a) => { const v = scalar(a[0]); if (typeof v === 'number') return 1; if (typeof v === 'string') return 2; if (typeof v === 'boolean') return 4; if (isError(v)) return 16; return 1 })

/** Lista de nomes de funções (para autocompletar / ajuda). */
export const FUNCTION_NAMES = (): string[] => Object.keys(FUNCTIONS).sort((a, b) => a.localeCompare(b, 'pt-BR'))
