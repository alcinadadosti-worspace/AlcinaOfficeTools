// Biblioteca de funções da planilha (nomes em português e inglês).
import { type CellValue, type CellError, isError, err } from './types'
import { type ArgValue, flatten, scalar, toNumber, toText, toBool, parseNumber } from './runtime'

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
  return Array.isArray(a) ? a : [a]
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

/** Lista de nomes de funções (para autocompletar / ajuda). */
export const FUNCTION_NAMES = (): string[] => Object.keys(FUNCTIONS).sort((a, b) => a.localeCompare(b, 'pt-BR'))
