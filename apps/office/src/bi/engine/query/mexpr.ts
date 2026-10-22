// Linguagem de fórmulas de coluna no estilo M (Power Query): análise e compilação.
import { Column, ColumnBuilder } from '../data/column'
import type { DataTable } from '../data/table'
import { type DataType, DateVal, type Scalar } from '../data/types'
import { CULTURE_PT_BR, type CultureOptions, ConversionError, convertValue, parseDateTime, parseNumber, scalarToText } from '../data/convert'
import { formatDate, formatNumber } from '../data/format'
import {
  DAY_NAMES_PT,
  MONTH_NAMES_PT,
  MS_PER_DAY,
  OLE_EPOCH_MS,
  addDays,
  addMonths,
  dateOnly,
  day,
  dayOfYear,
  daysInMonth,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  hour,
  isLeap,
  makeDate,
  minute,
  month,
  msToSerial,
  nowNaive,
  quarter,
  second,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  timeOfDay,
  weekday0,
  year
} from '../data/dates'
import { commonScalarType } from '../io/values'
import { type RoundMode, roundNumber } from '../data/ops'

/** Erro de avaliação/compilação de fórmula. */
export class MError extends Error {
  constructor(
    message: string,
    readonly position?: number
  ) {
    super(message)
    this.name = 'MError'
  }
}

class MSpecial {
  constructor(
    readonly kind: 'comparer' | 'rounding',
    readonly value: string
  ) {}
}

type MValue = Scalar | MValue[] | MSpecial

// ---------------------------------------------------------------------------
// Analisador léxico
// ---------------------------------------------------------------------------

type Tok =
  | { t: 'num'; v: number; pos: number }
  | { t: 'str'; v: string; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'field'; v: string; pos: number }
  | { t: 'hash'; v: string; pos: number }
  | { t: 'op'; v: string; pos: number }
  | { t: 'eof'; pos: number }

const KEYWORDS = new Set(['and', 'or', 'not', 'if', 'then', 'else', 'each', 'try', 'otherwise', 'error', 'true', 'false', 'null'])

function isIdStart(c: string): boolean {
  return /[A-Za-z_À-ɏ]/.test(c)
}
function isIdChar(c: string): boolean {
  return /[A-Za-z0-9_À-ɏ]/.test(c)
}

function syntaxError(msg: string, pos: number): MError {
  return new MError(`Erro de sintaxe na posição ${pos + 1}: ${msg}`, pos)
}

function readQuoted(src: string, start: number): { value: string; end: number } {
  // start aponta para a aspa de abertura
  let i = start + 1
  let out = ''
  while (i < src.length) {
    const c = src[i]
    if (c === '"') {
      if (src[i + 1] === '"') {
        out += '"'
        i += 2
        continue
      }
      return { value: out, end: i + 1 }
    }
    out += c
    i++
  }
  throw syntaxError('texto sem aspas de fechamento.', start)
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end < 0 ? src.length : end + 2
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))!
      toks.push({ t: 'num', v: Number(m[0]), pos: i })
      i += m[0].length
      continue
    }
    if (c === '"') {
      const q = readQuoted(src, i)
      toks.push({ t: 'str', v: q.value, pos: i })
      i = q.end
      continue
    }
    if (c === '#') {
      if (src[i + 1] === '"') {
        const q = readQuoted(src, i + 1)
        toks.push({ t: 'id', v: q.value, pos: i })
        i = q.end
        continue
      }
      const m = /^#[A-Za-z]+/.exec(src.slice(i))
      if (!m) throw syntaxError('"#" inesperado.', i)
      toks.push({ t: 'hash', v: m[0].toLowerCase(), pos: i })
      i += m[0].length
      continue
    }
    if (c === '[') {
      let j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      let name: string
      if (src[j] === '#' && src[j + 1] === '"') {
        const q = readQuoted(src, j + 1)
        name = q.value
        j = q.end
        while (j < src.length && /\s/.test(src[j])) j++
        if (src[j] !== ']') throw syntaxError('esperado "]".', j)
      } else {
        const end = src.indexOf(']', j)
        if (end < 0) throw syntaxError('referência de coluna sem "]".', i)
        name = src.slice(j, end).trim()
        j = end
      }
      if (!name) throw syntaxError('nome de coluna vazio.', i)
      toks.push({ t: 'field', v: name, pos: i })
      i = j + 1
      continue
    }
    if (c === '_' && !isIdChar(src[i + 1] ?? '')) {
      toks.push({ t: 'op', v: '_', pos: i })
      i++
      continue
    }
    if (isIdStart(c)) {
      let j = i + 1
      while (j < src.length && (isIdChar(src[j]) || (src[j] === '.' && isIdStart(src[j + 1] ?? '')))) j++
      toks.push({ t: 'id', v: src.slice(i, j), pos: i })
      i = j
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === '<>' || two === '<=' || two === '>=' || two === '=>') {
      toks.push({ t: 'op', v: two, pos: i })
      i += 2
      continue
    }
    if ('+-*/&=<>(){},_'.includes(c)) {
      toks.push({ t: 'op', v: c, pos: i })
      i++
      continue
    }
    throw syntaxError(`caractere inesperado "${c}".`, i)
  }
  toks.push({ t: 'eof', pos: src.length })
  return toks
}

// ---------------------------------------------------------------------------
// Árvore sintática
// ---------------------------------------------------------------------------

export type MNode =
  | { k: 'lit'; v: MValue }
  | { k: 'field'; name: string; pos: number }
  | { k: 'list'; items: MNode[] }
  | { k: 'call'; name: string; args: MNode[]; pos: number }
  | { k: 'const'; name: string; pos: number }
  | { k: 'unary'; op: '-' | '+' | 'not'; e: MNode; pos: number }
  | { k: 'bin'; op: string; l: MNode; r: MNode; pos: number }
  | { k: 'if'; c: MNode; t: MNode; e: MNode }
  | { k: 'try'; e: MNode; otherwise: MNode | null }
  | { k: 'error'; e: MNode | null; pos: number }
  | { k: 'intrinsic'; name: string; args: MNode[]; pos: number }

class Parser {
  private p = 0
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.p]
  }
  private next(): Tok {
    return this.toks[this.p++]
  }
  private isOp(v: string): boolean {
    const t = this.peek()
    return t.t === 'op' && t.v === v
  }
  private isKw(v: string): boolean {
    const t = this.peek()
    return t.t === 'id' && t.v === v
  }
  private expectOp(v: string): void {
    const t = this.next()
    if (t.t !== 'op' || t.v !== v) throw syntaxError(`esperado "${v}".`, t.pos)
  }
  private expectKw(v: string): void {
    const t = this.next()
    if (t.t !== 'id' || t.v !== v) throw syntaxError(`esperado "${v}".`, t.pos)
  }

  parseAll(): MNode {
    if (this.peek().t === 'eof') throw syntaxError('a fórmula está vazia.', 0)
    const e = this.expression()
    const t = this.peek()
    if (t.t !== 'eof') throw syntaxError(`símbolo inesperado "${'v' in t ? t.v : ''}".`, t.pos)
    return e
  }

  expression(): MNode {
    if (this.isKw('each')) {
      this.next()
      return this.expression()
    }
    if (this.isKw('if')) {
      this.next()
      const c = this.expression()
      this.expectKw('then')
      const t = this.expression()
      this.expectKw('else')
      const e = this.expression()
      return { k: 'if', c, t, e }
    }
    if (this.isKw('try')) {
      this.next()
      const e = this.expression()
      let otherwise: MNode | null = null
      if (this.isKw('otherwise')) {
        this.next()
        otherwise = this.expression()
      }
      return { k: 'try', e, otherwise }
    }
    if (this.isKw('error')) {
      const pos = this.next().pos
      const t = this.peek()
      const ends = t.t === 'eof' || (t.t === 'id' && (t.v === 'else' || t.v === 'then' || t.v === 'otherwise')) || (t.t === 'op' && (t.v === ')' || t.v === ',' || t.v === '}'))
      return { k: 'error', e: ends ? null : this.expression(), pos }
    }
    return this.orExpr()
  }

  private orExpr(): MNode {
    let l = this.andExpr()
    while (this.isKw('or')) {
      const pos = this.next().pos
      const r = this.andExpr()
      l = { k: 'bin', op: 'or', l, r, pos }
    }
    return l
  }

  private andExpr(): MNode {
    let l = this.notExpr()
    while (this.isKw('and')) {
      const pos = this.next().pos
      const r = this.notExpr()
      l = { k: 'bin', op: 'and', l, r, pos }
    }
    return l
  }

  private notExpr(): MNode {
    if (this.isKw('not')) {
      const pos = this.next().pos
      return { k: 'unary', op: 'not', e: this.notExpr(), pos }
    }
    return this.equality()
  }

  private equality(): MNode {
    let l = this.relational()
    while (this.isOp('=') || this.isOp('<>')) {
      const t = this.next() as { v: string; pos: number }
      const r = this.relational()
      l = { k: 'bin', op: t.v, l, r, pos: t.pos }
    }
    return l
  }

  private relational(): MNode {
    let l = this.additive()
    while (this.isOp('<') || this.isOp('>') || this.isOp('<=') || this.isOp('>=')) {
      const t = this.next() as { v: string; pos: number }
      const r = this.additive()
      l = { k: 'bin', op: t.v, l, r, pos: t.pos }
    }
    return l
  }

  private additive(): MNode {
    let l = this.multiplicative()
    while (this.isOp('+') || this.isOp('-') || this.isOp('&')) {
      const t = this.next() as { v: string; pos: number }
      const r = this.multiplicative()
      l = { k: 'bin', op: t.v, l, r, pos: t.pos }
    }
    return l
  }

  private multiplicative(): MNode {
    let l = this.unary()
    while (this.isOp('*') || this.isOp('/')) {
      const t = this.next() as { v: string; pos: number }
      const r = this.unary()
      l = { k: 'bin', op: t.v, l, r, pos: t.pos }
    }
    return l
  }

  private unary(): MNode {
    if (this.isOp('-') || this.isOp('+')) {
      const t = this.next() as { v: '-' | '+'; pos: number }
      return { k: 'unary', op: t.v, e: this.unary(), pos: t.pos }
    }
    return this.primary()
  }

  private args(): MNode[] {
    this.expectOp('(')
    const out: MNode[] = []
    if (this.isOp(')')) {
      this.next()
      return out
    }
    for (;;) {
      out.push(this.expression())
      if (this.isOp(',')) {
        this.next()
        continue
      }
      this.expectOp(')')
      return out
    }
  }

  private primary(): MNode {
    const t = this.next()
    switch (t.t) {
      case 'num':
        return { k: 'lit', v: t.v }
      case 'str':
        return { k: 'lit', v: t.v }
      case 'field':
        return { k: 'field', name: t.v, pos: t.pos }
      case 'hash':
        return { k: 'intrinsic', name: t.v, args: this.args(), pos: t.pos }
      case 'op': {
        if (t.v === '(') {
          const e = this.expression()
          this.expectOp(')')
          return e
        }
        if (t.v === '{') {
          const items: MNode[] = []
          if (this.isOp('}')) {
            this.next()
            return { k: 'list', items }
          }
          for (;;) {
            items.push(this.expression())
            if (this.isOp(',')) {
              this.next()
              continue
            }
            this.expectOp('}')
            return { k: 'list', items }
          }
        }
        if (t.v === '_') {
          const f = this.peek()
          if (f.t === 'field') {
            this.next()
            return { k: 'field', name: f.v, pos: f.pos }
          }
          throw syntaxError('"_" deve ser seguido de uma coluna, por exemplo _[Coluna].', t.pos)
        }
        throw syntaxError(`símbolo inesperado "${t.v}".`, t.pos)
      }
      case 'id': {
        if (t.v === 'true') return { k: 'lit', v: true }
        if (t.v === 'false') return { k: 'lit', v: false }
        if (t.v === 'null') return { k: 'lit', v: null }
        if (KEYWORDS.has(t.v)) throw syntaxError(`palavra-chave "${t.v}" inesperada.`, t.pos)
        if (this.isOp('(')) return { k: 'call', name: t.v, args: this.args(), pos: t.pos }
        return { k: 'const', name: t.v, pos: t.pos }
      }
      case 'eof':
        throw syntaxError('a fórmula terminou inesperadamente.', t.pos)
    }
  }
}

export function parseMExpression(src: string): MNode {
  return new Parser(tokenize(src)).parseAll()
}

// ---------------------------------------------------------------------------
// Utilitários de valores
// ---------------------------------------------------------------------------

function typeName(v: MValue): string {
  if (v === null) return 'Null'
  if (Array.isArray(v)) return 'List'
  if (v instanceof MSpecial) return 'Function'
  if (typeof v === 'number') return 'Number'
  if (typeof v === 'string') return 'Text'
  if (typeof v === 'boolean') return 'Logical'
  return v.kind === 'date' ? 'Date' : v.kind === 'time' ? 'Time' : 'DateTime'
}

function fail(msg: string): never {
  throw new MError(msg)
}

function argNum(v: MValue, fn: string, pos: number): number | null {
  if (v === null) return null
  if (typeof v === 'number') return v
  return fail(`${fn}: o argumento ${pos} deve ser um número (recebido ${typeName(v)}).`)
}

function reqNum(v: MValue, fn: string, pos: number): number {
  const n = argNum(v, fn, pos)
  if (n === null) return fail(`${fn}: o argumento ${pos} não pode ser nulo.`)
  return n
}

function argText(v: MValue, fn: string, pos: number): string | null {
  if (v === null) return null
  if (typeof v === 'string') return v
  return fail(`${fn}: o argumento ${pos} deve ser um texto (recebido ${typeName(v)}).`)
}

function reqText(v: MValue, fn: string, pos: number): string {
  const s = argText(v, fn, pos)
  if (s === null) return fail(`${fn}: o argumento ${pos} não pode ser nulo.`)
  return s
}

function argDate(v: MValue, fn: string, pos: number, culture: CultureOptions): DateVal | null {
  if (v === null) return null
  if (v instanceof DateVal) return v
  if (typeof v === 'string') {
    const p = parseDateTime(v, culture.dayFirst)
    if (p) return new DateVal(p.ms, p.hasTime ? (p.hasDate ? 'datetime' : 'time') : 'date')
  }
  return fail(`${fn}: o argumento ${pos} deve ser uma data (recebido ${typeName(v)}).`)
}

function argList(v: MValue, fn: string, pos: number): MValue[] | null {
  if (v === null) return null
  if (Array.isArray(v)) return v
  return fail(`${fn}: o argumento ${pos} deve ser uma lista (recebido ${typeName(v)}).`)
}

function ignoreCase(v: MValue | undefined): boolean {
  return v instanceof MSpecial && v.kind === 'comparer' && v.value === 'ignoreCase'
}

function roundTo(x: number, digits: number, mode: string): number {
  return roundNumber(x, digits, mode as RoundMode)
}

function dateResult(ms: number, like: DateVal): DateVal {
  return new DateVal(ms, like.kind === 'time' ? 'datetime' : like.kind)
}

export function properCase(s: string): string {
  return s.toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
}

function textToList(v: MValue): string[] {
  if (typeof v === 'string') return [...v]
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

function standardNumberFormat(fmt: string, culture: CultureOptions): string {
  const m = /^([FfNnPpDdCcEeGg])(\d*)$/.exec(fmt)
  if (!m) return fmt
  const n = m[2] === '' ? undefined : Number(m[2])
  const zeros = (k: number) => (k > 0 ? '.' + '0'.repeat(k) : '')
  switch (m[1].toUpperCase()) {
    case 'F':
      return '0' + zeros(n ?? 2)
    case 'N':
      return '#,0' + zeros(n ?? 2)
    case 'P':
      return '0' + zeros(n ?? 2) + '%'
    case 'D':
      return '0'.repeat(Math.max(1, n ?? 1))
    case 'C':
      return (culture.decimalSep === ',' ? '"R$" ' : '"$"') + '#,0' + zeros(n ?? 2)
    case 'E':
      return '0' + zeros(n ?? 6) + 'E+000'
    default:
      return fmt
  }
}

function toNumberValue(v: MValue, culture: CultureOptions, fn: string): number | null {
  if (v === null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof DateVal) return msToSerial(v.ms)
  if (typeof v === 'string') {
    if (!v.trim()) return null
    const n = parseNumber(v, culture.decimalSep) ?? parseNumber(v, culture.decimalSep === ',' ? '.' : ',')
    if (n === undefined) return fail(`${fn}: não foi possível converter "${v}" em número.`)
    return n
  }
  return fail(`${fn}: não é possível converter ${typeName(v)} em número.`)
}

function asScalar(v: MValue): Scalar {
  if (Array.isArray(v)) return fail('O resultado é uma lista. Use List.Sum, List.Count ou Text.Combine para obter um valor.')
  if (v instanceof MSpecial) return fail('O resultado é uma função, não um valor.')
  return v
}

// ---------------------------------------------------------------------------
// Biblioteca de funções
// ---------------------------------------------------------------------------

type MFn = (args: MValue[], culture: CultureOptions) => MValue

interface FnDef {
  min: number
  max: number
  fn: MFn
}

const F: Record<string, FnDef> = {}

function def(name: string, min: number, max: number, fn: MFn): void {
  F[name] = { min, max, fn }
}

function textFn(name: string, f: (s: string) => MValue): void {
  def(name, 1, 1, ([a]) => {
    const s = argText(a, name, 1)
    return s === null ? null : f(s)
  })
}

// Texto
textFn('Text.Upper', (s) => s.toUpperCase())
textFn('Text.Lower', (s) => s.toLowerCase())
textFn('Text.Proper', properCase)
textFn('Text.Clean', (s) => s.replace(/[\u0000-\u001f\u007f]/g, ''))
textFn('Text.Length', (s) => s.length)
textFn('Text.Reverse', (s) => [...s].reverse().join(''))
function trimFn(name: string, mode: 'both' | 'start' | 'end'): void {
  def(name, 1, 2, ([a, chars]) => {
    const s = argText(a, name, 1)
    if (s === null) return null
    if (chars === undefined || chars === null) {
      return mode === 'both' ? s.trim() : mode === 'start' ? s.replace(/^\s+/, '') : s.replace(/\s+$/, '')
    }
    const set = new Set(textToList(chars))
    let start = 0
    let end = s.length
    if (mode !== 'end') while (start < end && set.has(s[start])) start++
    if (mode !== 'start') while (end > start && set.has(s[end - 1])) end--
    return s.slice(start, end)
  })
}
trimFn('Text.Trim', 'both')
trimFn('Text.TrimStart', 'start')
trimFn('Text.TrimEnd', 'end')
def('Text.Start', 2, 2, ([a, n]) => {
  const s = argText(a, 'Text.Start', 1)
  return s === null ? null : s.slice(0, Math.max(0, reqNum(n, 'Text.Start', 2)))
})
def('Text.End', 2, 2, ([a, n]) => {
  const s = argText(a, 'Text.End', 1)
  if (s === null) return null
  const k = Math.max(0, reqNum(n, 'Text.End', 2))
  return k === 0 ? '' : s.slice(-k)
})
def('Text.Middle', 2, 3, ([a, st, cnt]) => {
  const s = argText(a, 'Text.Middle', 1)
  if (s === null) return null
  const start = Math.max(0, reqNum(st, 'Text.Middle', 2))
  const count = cnt === undefined || cnt === null ? undefined : Math.max(0, reqNum(cnt, 'Text.Middle', 3))
  return count === undefined ? s.slice(start) : s.slice(start, start + count)
})
def('Text.Range', 2, 3, ([a, st, cnt]) => {
  const s = argText(a, 'Text.Range', 1)
  if (s === null) return null
  const start = reqNum(st, 'Text.Range', 2)
  if (start < 0 || start > s.length) fail('Text.Range: o deslocamento está fora do intervalo do texto.')
  const count = cnt === undefined || cnt === null ? undefined : reqNum(cnt, 'Text.Range', 3)
  if (count !== undefined && start + count > s.length) fail('Text.Range: a contagem está fora do intervalo do texto.')
  return count === undefined ? s.slice(start) : s.slice(start, start + count)
})
function containsFn(name: string, test: (s: string, sub: string) => boolean): void {
  def(name, 2, 3, ([a, b, cmp]) => {
    const s = argText(a, name, 1)
    if (s === null) return null
    const sub = reqText(b, name, 2)
    return ignoreCase(cmp) ? test(s.toLowerCase(), sub.toLowerCase()) : test(s, sub)
  })
}
containsFn('Text.Contains', (s, sub) => s.includes(sub))
containsFn('Text.StartsWith', (s, sub) => s.startsWith(sub))
containsFn('Text.EndsWith', (s, sub) => s.endsWith(sub))
def('Text.Replace', 3, 3, ([a, o, n]) => {
  const s = argText(a, 'Text.Replace', 1)
  if (s === null) return null
  const old = reqText(o, 'Text.Replace', 2)
  if (!old) return s
  return s.split(old).join(argText(n, 'Text.Replace', 3) ?? '')
})
function padFn(name: string, start: boolean): void {
  def(name, 2, 3, ([a, n, ch]) => {
    const s = argText(a, name, 1)
    if (s === null) return null
    const len = reqNum(n, name, 2)
    const c = ch === undefined || ch === null ? ' ' : reqText(ch, name, 3)
    if (c.length !== 1) fail(`${name}: o caractere de preenchimento deve ter exatamente um caractere.`)
    return start ? s.padStart(len, c) : s.padEnd(len, c)
  })
}
padFn('Text.PadStart', true)
padFn('Text.PadEnd', false)
def('Text.From', 1, 2, ([a], culture) => {
  if (a === null) return null
  if (Array.isArray(a) || a instanceof MSpecial) fail(`Text.From: não é possível converter ${typeName(a)} em texto.`)
  return scalarToText(a as Scalar, culture)
})
def('Text.Combine', 1, 2, ([list, sep], culture) => {
  const l = argList(list, 'Text.Combine', 1)
  if (l === null) return null
  const sp = sep === undefined || sep === null ? '' : reqText(sep, 'Text.Combine', 2)
  return l
    .filter((v) => v !== null)
    .map((v) => (typeof v === 'string' ? v : scalarToText(asScalar(v), culture) ?? ''))
    .join(sp)
})
def('Text.BeforeDelimiter', 2, 3, ([a, d, idx]) => {
  const s = argText(a, 'Text.BeforeDelimiter', 1)
  if (s === null) return null
  const del = reqText(d, 'Text.BeforeDelimiter', 2)
  const k = idx === undefined || idx === null ? 0 : reqNum(idx, 'Text.BeforeDelimiter', 3)
  let pos = -1
  for (let i = 0; i <= k; i++) {
    pos = s.indexOf(del, pos + 1)
    if (pos < 0) return s
  }
  return s.slice(0, pos)
})
def('Text.AfterDelimiter', 2, 3, ([a, d, idx]) => {
  const s = argText(a, 'Text.AfterDelimiter', 1)
  if (s === null) return null
  const del = reqText(d, 'Text.AfterDelimiter', 2)
  const k = idx === undefined || idx === null ? 0 : reqNum(idx, 'Text.AfterDelimiter', 3)
  let pos = -1
  for (let i = 0; i <= k; i++) {
    pos = s.indexOf(del, pos + 1)
    if (pos < 0) return ''
  }
  return s.slice(pos + del.length)
})
def('Text.BetweenDelimiters', 3, 3, ([a, d1, d2]) => {
  const s = argText(a, 'Text.BetweenDelimiters', 1)
  if (s === null) return null
  const start = reqText(d1, 'Text.BetweenDelimiters', 2)
  const end = reqText(d2, 'Text.BetweenDelimiters', 3)
  const i = s.indexOf(start)
  if (i < 0) return ''
  const j = s.indexOf(end, i + start.length)
  return j < 0 ? s.slice(i + start.length) : s.slice(i + start.length, j)
})
def('Text.Repeat', 2, 2, ([a, n]) => {
  const s = argText(a, 'Text.Repeat', 1)
  return s === null ? null : s.repeat(Math.max(0, reqNum(n, 'Text.Repeat', 2)))
})
def('Text.PositionOf', 2, 2, ([a, b]) => {
  const s = argText(a, 'Text.PositionOf', 1)
  return s === null ? null : s.indexOf(reqText(b, 'Text.PositionOf', 2))
})
def('Text.Insert', 3, 3, ([a, off, b]) => {
  const s = argText(a, 'Text.Insert', 1)
  if (s === null) return null
  const o = reqNum(off, 'Text.Insert', 2)
  return s.slice(0, o) + reqText(b, 'Text.Insert', 3) + s.slice(o)
})
def('Text.Remove', 2, 2, ([a, chars]) => {
  const s = argText(a, 'Text.Remove', 1)
  if (s === null) return null
  const set = new Set(textToList(chars))
  return [...s].filter((c) => !set.has(c)).join('')
})
def('Text.Select', 2, 2, ([a, chars]) => {
  const s = argText(a, 'Text.Select', 1)
  if (s === null) return null
  const set = new Set(textToList(chars))
  return [...s].filter((c) => set.has(c)).join('')
})
def('Text.Split', 2, 2, ([a, d]) => {
  const s = argText(a, 'Text.Split', 1)
  return s === null ? null : s.split(reqText(d, 'Text.Split', 2))
})

// Números
def('Number.From', 1, 2, ([a], culture) => toNumberValue(a, culture, 'Number.From'))
def('Decimal.From', 1, 2, ([a], culture) => toNumberValue(a, culture, 'Decimal.From'))
def('Double.From', 1, 2, ([a], culture) => toNumberValue(a, culture, 'Double.From'))
def('Percentage.From', 1, 2, ([a], culture) => toNumberValue(a, culture, 'Percentage.From'))
def('Int64.From', 1, 2, ([a], culture) => {
  const n = toNumberValue(a, culture, 'Int64.From')
  return n === null ? null : roundTo(n, 0, 'toEven')
})
def('Currency.From', 1, 2, ([a], culture) => {
  const n = toNumberValue(a, culture, 'Currency.From')
  return n === null ? null : Math.round(n * 10000) / 10000
})
def('Number.Round', 1, 3, ([a, d, mode]) => {
  const n = argNum(a, 'Number.Round', 1)
  if (n === null) return null
  const digits = d === undefined || d === null ? 0 : reqNum(d, 'Number.Round', 2)
  const m = mode instanceof MSpecial && mode.kind === 'rounding' ? mode.value : 'toEven'
  return roundTo(n, digits, m)
})
function roundModeFn(name: string, mode: string): void {
  def(name, 1, 2, ([a, d]) => {
    const n = argNum(a, name, 1)
    if (n === null) return null
    return roundTo(n, d === undefined || d === null ? 0 : reqNum(d, name, 2), mode)
  })
}
roundModeFn('Number.RoundUp', 'up')
roundModeFn('Number.RoundDown', 'down')
roundModeFn('Number.RoundAwayFromZero', 'awayFromZero')
roundModeFn('Number.RoundTowardZero', 'towardZero')
function mathFn(name: string, f: (x: number) => MValue): void {
  def(name, 1, 1, ([a]) => {
    const n = argNum(a, name, 1)
    return n === null ? null : f(n)
  })
}
mathFn('Number.Abs', Math.abs)
mathFn('Number.Sqrt', Math.sqrt)
mathFn('Number.Sign', Math.sign)
mathFn('Number.Log10', Math.log10)
mathFn('Number.Ln', Math.log)
mathFn('Number.Exp', Math.exp)
mathFn('Number.IsEven', (x) => Math.abs(x % 2) === 0)
mathFn('Number.IsOdd', (x) => Math.abs(x % 2) === 1)
mathFn('Number.IsNaN', (x) => Number.isNaN(x))
def('Number.Log', 1, 2, ([a, b]) => {
  const n = argNum(a, 'Number.Log', 1)
  if (n === null) return null
  const base = b === undefined || b === null ? Math.E : reqNum(b, 'Number.Log', 2)
  return Math.log(n) / Math.log(base)
})
def('Number.Power', 2, 2, ([a, b]) => {
  const x = argNum(a, 'Number.Power', 1)
  const y = argNum(b, 'Number.Power', 2)
  return x === null || y === null ? null : Math.pow(x, y)
})
def('Number.Mod', 2, 2, ([a, b]) => {
  const x = argNum(a, 'Number.Mod', 1)
  const y = argNum(b, 'Number.Mod', 2)
  if (x === null || y === null) return null
  if (y === 0) fail('Number.Mod: divisão por zero.')
  return x % y
})
def('Number.IntegerDivide', 2, 2, ([a, b]) => {
  const x = argNum(a, 'Number.IntegerDivide', 1)
  const y = argNum(b, 'Number.IntegerDivide', 2)
  if (x === null || y === null) return null
  if (y === 0) fail('Number.IntegerDivide: divisão por zero.')
  return Math.trunc(x / y)
})
def('Number.ToText', 1, 3, ([a, f], culture) => {
  const n = argNum(a, 'Number.ToText', 1)
  if (n === null) return null
  if (f === undefined || f === null) return scalarToText(n, culture)
  const fmt = standardNumberFormat(reqText(f, 'Number.ToText', 2), culture)
  return formatNumber(n, fmt, culture.decimalSep === ',' ? 'pt-BR' : 'en-US')
})

// Datas
function dateFn(name: string, f: (d: DateVal) => MValue): void {
  def(name, 1, 1, ([a], culture) => {
    const d = argDate(a, name, 1, culture)
    return d === null ? null : f(d)
  })
}
dateFn('Date.Year', (d) => year(d.ms))
dateFn('Date.Month', (d) => month(d.ms))
dateFn('Date.Day', (d) => day(d.ms))
dateFn('Date.QuarterOfYear', (d) => quarter(d.ms))
dateFn('Date.DayOfYear', (d) => dayOfYear(d.ms))
dateFn('Date.DaysInMonth', (d) => daysInMonth(year(d.ms), month(d.ms)))
dateFn('Date.IsLeapYear', (d) => isLeap(year(d.ms)))
dateFn('Date.MonthName', (d) => MONTH_NAMES_PT[month(d.ms) - 1])
dateFn('Date.DayOfWeekName', (d) => DAY_NAMES_PT[weekday0(d.ms)])
dateFn('Date.StartOfMonth', (d) => dateResult(startOfMonth(d.ms), d))
dateFn('Date.EndOfMonth', (d) => dateResult(d.kind === 'date' ? endOfMonth(d.ms) : endOfMonth(d.ms) + MS_PER_DAY - 1, d))
dateFn('Date.StartOfYear', (d) => dateResult(startOfYear(d.ms), d))
dateFn('Date.EndOfYear', (d) => dateResult(d.kind === 'date' ? endOfYear(d.ms) : endOfYear(d.ms) + MS_PER_DAY - 1, d))
dateFn('Date.StartOfQuarter', (d) => dateResult(startOfQuarter(d.ms), d))
dateFn('Date.EndOfQuarter', (d) => dateResult(d.kind === 'date' ? endOfQuarter(d.ms) : endOfQuarter(d.ms) + MS_PER_DAY - 1, d))
dateFn('Date.StartOfDay', (d) => dateResult(dateOnly(d.ms), d))
dateFn('Date.EndOfDay', (d) => dateResult(d.kind === 'date' ? dateOnly(d.ms) : dateOnly(d.ms) + MS_PER_DAY - 1, d))
dateFn('Date.IsInCurrentYear', (d) => year(d.ms) === year(nowNaive()))
dateFn('Date.IsInCurrentMonth', (d) => {
  const now = nowNaive()
  return year(d.ms) === year(now) && month(d.ms) === month(now)
})
dateFn('Date.IsInPreviousYear', (d) => year(d.ms) === year(nowNaive()) - 1)
function firstDayArg(v: MValue | undefined, fn: string): number {
  if (v === undefined || v === null) return 0
  return reqNum(v, fn, 2)
}
def('Date.DayOfWeek', 1, 2, ([a, fd], culture) => {
  const d = argDate(a, 'Date.DayOfWeek', 1, culture)
  if (d === null) return null
  return (weekday0(d.ms) - firstDayArg(fd, 'Date.DayOfWeek') + 7) % 7
})
def('Date.StartOfWeek', 1, 2, ([a, fd], culture) => {
  const d = argDate(a, 'Date.StartOfWeek', 1, culture)
  if (d === null) return null
  const diff = (weekday0(d.ms) - firstDayArg(fd, 'Date.StartOfWeek') + 7) % 7
  return dateResult(dateOnly(d.ms) - diff * MS_PER_DAY, d)
})
def('Date.EndOfWeek', 1, 2, ([a, fd], culture) => {
  const d = argDate(a, 'Date.EndOfWeek', 1, culture)
  if (d === null) return null
  const diff = (weekday0(d.ms) - firstDayArg(fd, 'Date.EndOfWeek') + 7) % 7
  const end = dateOnly(d.ms) + (6 - diff) * MS_PER_DAY
  return dateResult(d.kind === 'date' ? end : end + MS_PER_DAY - 1, d)
})
def('Date.WeekOfYear', 1, 2, ([a, fd], culture) => {
  const d = argDate(a, 'Date.WeekOfYear', 1, culture)
  if (d === null) return null
  const first = firstDayArg(fd, 'Date.WeekOfYear')
  const jan1 = startOfYear(d.ms)
  const offset = (weekday0(jan1) - first + 7) % 7
  return Math.floor((dayOfYear(d.ms) - 1 + offset) / 7) + 1
})
def('Date.WeekOfMonth', 1, 2, ([a, fd], culture) => {
  const d = argDate(a, 'Date.WeekOfMonth', 1, culture)
  if (d === null) return null
  const first = firstDayArg(fd, 'Date.WeekOfMonth')
  const som = startOfMonth(d.ms)
  const offset = (weekday0(som) - first + 7) % 7
  return Math.floor((day(d.ms) - 1 + offset) / 7) + 1
})
function addFn(name: string, f: (ms: number, n: number) => number): void {
  def(name, 2, 2, ([a, n], culture) => {
    const d = argDate(a, name, 1, culture)
    if (d === null) return null
    return new DateVal(f(d.ms, reqNum(n, name, 2)), d.kind)
  })
}
addFn('Date.AddDays', (ms, n) => addDays(ms, n))
addFn('Date.AddWeeks', (ms, n) => addDays(ms, n * 7))
addFn('Date.AddMonths', (ms, n) => addMonths(ms, n))
addFn('Date.AddQuarters', (ms, n) => addMonths(ms, n * 3))
addFn('Date.AddYears', (ms, n) => addMonths(ms, n * 12))
function fromDate(v: MValue, kind: 'date' | 'datetime' | 'time', fn: string, culture: CultureOptions): MValue {
  if (v === null) return null
  if (Array.isArray(v) || v instanceof MSpecial) fail(`${fn}: não é possível converter ${typeName(v)}.`)
  const r = convertValue(v as Scalar, kind, culture)
  if (r instanceof ConversionError) fail(`${fn}: ${r.message}`)
  return r
}
def('Date.From', 1, 2, ([a], culture) => fromDate(a, 'date', 'Date.From', culture))
def('DateTime.From', 1, 2, ([a], culture) => fromDate(a, 'datetime', 'DateTime.From', culture))
def('Time.From', 1, 2, ([a], culture) => fromDate(a, 'time', 'Time.From', culture))
def('DateTime.Date', 1, 1, ([a], culture) => {
  const d = argDate(a, 'DateTime.Date', 1, culture)
  return d === null ? null : new DateVal(dateOnly(d.ms), 'date')
})
def('DateTime.Time', 1, 1, ([a], culture) => {
  const d = argDate(a, 'DateTime.Time', 1, culture)
  return d === null ? null : new DateVal(OLE_EPOCH_MS + timeOfDay(d.ms), 'time')
})
def('DateTime.LocalNow', 0, 0, () => new DateVal(nowNaive(), 'datetime'))
def('Date.Today', 0, 0, () => new DateVal(dateOnly(nowNaive()), 'date'))
function toTextFn(name: string): void {
  def(name, 1, 3, ([a, f], culture) => {
    const d = argDate(a, name, 1, culture)
    if (d === null) return null
    const locale = culture.decimalSep === ',' ? 'pt-BR' : 'en-US'
    const fmt = f === undefined || f === null ? undefined : reqText(f, name, 2)
    return formatDate(d.ms, fmt, d.kind, locale)
  })
}
toTextFn('Date.ToText')
toTextFn('DateTime.ToText')
toTextFn('Time.ToText')
dateFn('Time.Hour', (d) => hour(d.ms))
dateFn('Time.Minute', (d) => minute(d.ms))
dateFn('Time.Second', (d) => second(d.ms))
dateFn('DateTime.Hour', (d) => hour(d.ms))

// Durações (representadas como número de dias)
function durFn(name: string, f: (days: number) => number): void {
  def(name, 1, 1, ([a]) => {
    const n = argNum(a, name, 1)
    return n === null ? null : f(n)
  })
}
durFn('Duration.Days', (x) => Math.trunc(x))
durFn('Duration.Hours', (x) => Math.trunc((x - Math.trunc(x)) * 24))
durFn('Duration.Minutes', (x) => Math.trunc((x * 1440) % 60))
durFn('Duration.Seconds', (x) => Math.round((x * 86400) % 60))
durFn('Duration.TotalDays', (x) => x)
durFn('Duration.TotalHours', (x) => x * 24)
durFn('Duration.TotalMinutes', (x) => x * 1440)
durFn('Duration.TotalSeconds', (x) => x * 86400)

// Listas
function numbersOf(list: MValue[]): number[] {
  const out: number[] = []
  for (const v of list) {
    if (v === null) continue
    if (typeof v === 'number') out.push(v)
    else if (v instanceof DateVal) out.push(v.ms)
    else fail(`Não é possível somar valores do tipo ${typeName(v)}.`)
  }
  return out
}
def('List.Sum', 1, 1, ([a]) => {
  const l = argList(a, 'List.Sum', 1)
  if (l === null) return null
  const nums = numbersOf(l)
  return nums.length ? nums.reduce((s, x) => s + x, 0) : null
})
def('List.Average', 1, 1, ([a]) => {
  const l = argList(a, 'List.Average', 1)
  if (l === null) return null
  const nums = numbersOf(l)
  return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : null
})
function minMax(name: string, pickMax: boolean): void {
  def(name, 1, 1, ([a]) => {
    const l = argList(a, name, 1)
    if (l === null) return null
    let best: MValue = null
    for (const v of l) {
      if (v === null) continue
      if (best === null) {
        best = v
        continue
      }
      const c = compareMValues(v, best)
      if (c === null) fail(`${name}: valores de tipos diferentes.`)
      if (pickMax ? c > 0 : c < 0) best = v
    }
    return best
  })
}
minMax('List.Max', true)
minMax('List.Min', false)
def('List.Count', 1, 1, ([a]) => {
  const l = argList(a, 'List.Count', 1)
  return l === null ? null : l.length
})
def('List.NonNullCount', 1, 1, ([a]) => {
  const l = argList(a, 'List.NonNullCount', 1)
  return l === null ? null : l.filter((v) => v !== null).length
})
def('List.Contains', 2, 2, ([a, v]) => {
  const l = argList(a, 'List.Contains', 1)
  if (l === null) return null
  return l.some((x) => mEquals(x, v))
})
def('List.First', 1, 2, ([a, dflt]) => {
  const l = argList(a, 'List.First', 1)
  if (l === null) return null
  return l.length ? l[0] : (dflt ?? null)
})
def('List.Last', 1, 2, ([a, dflt]) => {
  const l = argList(a, 'List.Last', 1)
  if (l === null) return null
  return l.length ? l[l.length - 1] : (dflt ?? null)
})

// Lógicos
def('Logical.From', 1, 1, ([a]) => {
  if (a === null) return null
  if (typeof a === 'boolean') return a
  if (typeof a === 'number') return a !== 0
  if (typeof a === 'string') {
    const s = a.trim().toLowerCase()
    if (s === 'true' || s === 'verdadeiro') return true
    if (s === 'false' || s === 'falso') return false
  }
  return fail(`Logical.From: não foi possível converter ${typeName(a)} em lógico.`)
})
def('Value.Is', 2, 2, ([a, t]) => {
  const tn = typeof t === 'string' ? t.toLowerCase() : ''
  switch (tn) {
    case 'number':
      return typeof a === 'number'
    case 'text':
      return typeof a === 'string'
    case 'logical':
      return typeof a === 'boolean'
    case 'date':
      return a instanceof DateVal && a.kind === 'date'
    case 'datetime':
      return a instanceof DateVal && a.kind === 'datetime'
    case 'null':
      return a === null
    default:
      return fail('Value.Is: tipo não suportado (use "number", "text", "logical", "date", "datetime" ou "null").')
  }
})

const CONSTANTS: Record<string, MValue> = {
  'Comparer.Ordinal': new MSpecial('comparer', 'ordinal'),
  'Comparer.OrdinalIgnoreCase': new MSpecial('comparer', 'ignoreCase'),
  'Day.Sunday': 0,
  'Day.Monday': 1,
  'Day.Tuesday': 2,
  'Day.Wednesday': 3,
  'Day.Thursday': 4,
  'Day.Friday': 5,
  'Day.Saturday': 6,
  'RoundingMode.Up': new MSpecial('rounding', 'up'),
  'RoundingMode.Down': new MSpecial('rounding', 'down'),
  'RoundingMode.AwayFromZero': new MSpecial('rounding', 'awayFromZero'),
  'RoundingMode.TowardZero': new MSpecial('rounding', 'towardZero'),
  'RoundingMode.ToEven': new MSpecial('rounding', 'toEven'),
  'Number.PI': Math.PI,
  'Number.E': Math.E,
  'Number.PositiveInfinity': Infinity,
  'Number.NegativeInfinity': -Infinity,
  'Number.NaN': NaN
}

/** Nomes de funções disponíveis (para autocompletar). */
export const M_FUNCTION_NAMES: string[] = Object.keys(F).sort()

// ---------------------------------------------------------------------------
// Operadores
// ---------------------------------------------------------------------------

function mEquals(a: MValue, b: MValue): boolean {
  if (a === null || b === null) return a === b
  if (a instanceof DateVal && b instanceof DateVal) return a.ms === b.ms
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => mEquals(x, b[i]))
  return a === b
}

/** Compara valores do mesmo tipo; null se incomparáveis. */
function compareMValues(a: MValue, b: MValue): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0)
  if (a instanceof DateVal && b instanceof DateVal) return a.ms < b.ms ? -1 : a.ms > b.ms ? 1 : 0
  return null
}

function textOf(v: MValue, culture: CultureOptions): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v) || v instanceof MSpecial) return fail(`Não é possível concatenar um valor do tipo ${typeName(v)}.`)
  return scalarToText(v as Scalar, culture) ?? ''
}

function binary(op: string, a: MValue, b: MValue, culture: CultureOptions): MValue {
  switch (op) {
    case '=':
      return mEquals(a, b)
    case '<>':
      return !mEquals(a, b)
    case '&': {
      if (a === null || b === null) return null
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b]
      return textOf(a, culture) + textOf(b, culture)
    }
  }
  if (a === null || b === null) return null
  switch (op) {
    case '<':
    case '>':
    case '<=':
    case '>=': {
      const c = compareMValues(a, b)
      if (c === null) return fail(`Não é possível comparar os tipos ${typeName(a)} e ${typeName(b)}.`)
      return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0
    }
    case '+':
      if (typeof a === 'number' && typeof b === 'number') return a + b
      if (a instanceof DateVal && typeof b === 'number') return new DateVal(a.ms + b * MS_PER_DAY, a.kind)
      if (typeof a === 'number' && b instanceof DateVal) return new DateVal(b.ms + a * MS_PER_DAY, b.kind)
      if (a instanceof DateVal && b instanceof DateVal && b.kind === 'time')
        return new DateVal(dateOnly(a.ms) + (b.ms - OLE_EPOCH_MS), 'datetime')
      break
    case '-':
      if (typeof a === 'number' && typeof b === 'number') return a - b
      if (a instanceof DateVal && b instanceof DateVal) return (a.ms - b.ms) / MS_PER_DAY
      if (a instanceof DateVal && typeof b === 'number') return new DateVal(a.ms - b * MS_PER_DAY, a.kind)
      break
    case '*':
      if (typeof a === 'number' && typeof b === 'number') return a * b
      break
    case '/':
      if (typeof a === 'number' && typeof b === 'number') return a / b
      break
  }
  const opName = op === '&' ? '&' : op
  return fail(`Não é possível aplicar o operador ${opName} aos tipos ${typeName(a)} e ${typeName(b)}.`)
}

function logical(v: MValue, op: string): boolean | null {
  if (v === null) return null
  if (typeof v === 'boolean') return v
  return fail(`O operador ${op} espera valores lógicos (recebido ${typeName(v)}).`)
}

// ---------------------------------------------------------------------------
// Compilação
// ---------------------------------------------------------------------------

type Compiled = (row: number) => MValue

interface CompileCtx {
  table: DataTable
  culture: CultureOptions
}

function suggestFunction(name: string): string {
  const low = name.toLowerCase()
  const hit = Object.keys(F).find((k) => k.toLowerCase() === low)
  return hit ? ` Você quis dizer "${hit}"?` : ''
}

function compileNode(node: MNode, ctx: CompileCtx): Compiled {
  switch (node.k) {
    case 'lit': {
      const v = node.v
      return () => v
    }
    case 'field': {
      const col = ctx.table.column(node.name)
      if (!col) throw new MError(`A coluna "${node.name}" da tabela não foi encontrada.`, node.pos)
      if (col.errors) {
        return (r) => {
          if (col.hasError(r)) throw new MError(col.errorMessage ?? `Erro na coluna "${col.name}".`)
          return col.get(r)
        }
      }
      return (r) => col.get(r)
    }
    case 'list': {
      const items = node.items.map((i) => compileNode(i, ctx))
      return (r) => items.map((f) => f(r))
    }
    case 'const': {
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, node.name)) {
        const v = CONSTANTS[node.name]
        return () => v
      }
      const col = ctx.table.column(node.name)
      if (col) throw new MError(`Identificador "${node.name}" desconhecido. Para referenciar a coluna use [${node.name}].`, node.pos)
      throw new MError(`O nome "${node.name}" não foi reconhecido.${suggestFunction(node.name)}`, node.pos)
    }
    case 'intrinsic': {
      const args = node.args.map((a) => compileNode(a, ctx))
      const name = node.name
      const need = (n: number[], label: string) => {
        if (!n.includes(args.length)) throw new MError(`${label} espera ${n.join(' ou ')} argumentos.`, node.pos)
      }
      switch (name) {
        case '#date':
          need([3], '#date')
          return (r) => {
            const [y, m, d] = args.map((f) => reqNum(f(r), '#date', 1))
            return new DateVal(makeDate(y, m, d), 'date')
          }
        case '#datetime':
          need([6], '#datetime')
          return (r) => {
            const [y, m, d, hh, mi, ss] = args.map((f) => reqNum(f(r), '#datetime', 1))
            return new DateVal(makeDate(y, m, d, hh, mi, Math.floor(ss), Math.round((ss % 1) * 1000)), 'datetime')
          }
        case '#time':
          need([3], '#time')
          return (r) => {
            const [hh, mi, ss] = args.map((f) => reqNum(f(r), '#time', 1))
            return new DateVal(OLE_EPOCH_MS + hh * 3_600_000 + mi * 60_000 + Math.round(ss * 1000), 'time')
          }
        case '#duration':
          need([4], '#duration')
          return (r) => {
            const [d, hh, mi, ss] = args.map((f) => reqNum(f(r), '#duration', 1))
            return d + hh / 24 + mi / 1440 + ss / 86400
          }
        default:
          throw new MError(`"${name}" não é suportado.`, node.pos)
      }
    }
    case 'call': {
      const fd = F[node.name]
      if (!fd) throw new MError(`A função "${node.name}" não é reconhecida.${suggestFunction(node.name)}`, node.pos)
      if (node.args.length < fd.min || node.args.length > fd.max) {
        const exp = fd.min === fd.max ? `${fd.min}` : `de ${fd.min} a ${fd.max}`
        throw new MError(`${node.name} espera ${exp} argumento(s), mas recebeu ${node.args.length}.`, node.pos)
      }
      const args = node.args.map((a) => compileNode(a, ctx))
      const fn = fd.fn
      const culture = ctx.culture
      if (args.length === 1) {
        const a0 = args[0]
        return (r) => fn([a0(r)], culture)
      }
      return (r) => fn(
        args.map((f) => f(r)),
        culture
      )
    }
    case 'unary': {
      const e = compileNode(node.e, ctx)
      if (node.op === 'not') {
        return (r) => {
          const v = logical(e(r), 'not')
          return v === null ? null : !v
        }
      }
      const neg = node.op === '-'
      return (r) => {
        const v = e(r)
        if (v === null) return null
        if (typeof v !== 'number') return fail(`Não é possível aplicar o operador ${node.op} ao tipo ${typeName(v)}.`)
        return neg ? -v : v
      }
    }
    case 'bin': {
      const l = compileNode(node.l, ctx)
      const rr = compileNode(node.r, ctx)
      const culture = ctx.culture
      if (node.op === 'and') {
        return (r) => {
          const a = logical(l(r), 'and')
          if (a === false) return false
          const b = logical(rr(r), 'and')
          if (b === false) return false
          return a === null || b === null ? null : true
        }
      }
      if (node.op === 'or') {
        return (r) => {
          const a = logical(l(r), 'or')
          if (a === true) return true
          const b = logical(rr(r), 'or')
          if (b === true) return true
          return a === null || b === null ? null : false
        }
      }
      const op = node.op
      return (r) => binary(op, l(r), rr(r), culture)
    }
    case 'if': {
      const c = compileNode(node.c, ctx)
      const t = compileNode(node.t, ctx)
      const e = compileNode(node.e, ctx)
      return (r) => {
        const v = c(r)
        if (v === true) return t(r)
        if (v === false || v === null) return e(r)
        return fail(`A condição do "if" deve ser lógica (recebido ${typeName(v)}).`)
      }
    }
    case 'error': {
      const e = node.e ? compileNode(node.e, ctx) : null
      return (r) => {
        const msg = e ? e(r) : null
        throw new MError(typeof msg === 'string' && msg ? msg : 'Erro gerado pela fórmula.')
      }
    }
    case 'try': {
      const e = compileNode(node.e, ctx)
      const o = node.otherwise ? compileNode(node.otherwise, ctx) : () => null
      return (r) => {
        try {
          return e(r)
        } catch (err) {
          if (err instanceof MError || err instanceof Error) return o(r)
          throw err
        }
      }
    }
  }
}

/** Compila uma expressão para avaliação linha a linha. Lança MError em erros de sintaxe. */
export function compileMExpression(src: string, table: DataTable, culture: CultureOptions = CULTURE_PT_BR): (row: number) => Scalar {
  const ast = parseMExpression(src)
  const f = compileNode(ast, { table, culture })
  return (row) => asScalar(f(row))
}

/** Compila um predicado (true/false/null; erros resultam em null). */
export function compileMPredicate(src: string, table: DataTable, culture: CultureOptions = CULTURE_PT_BR): (row: number) => boolean | null {
  const f = compileMExpression(src, table, culture)
  return (row) => {
    let v: Scalar
    try {
      v = f(row)
    } catch {
      return null
    }
    if (v === null) return null
    if (typeof v !== 'boolean') return null
    return v
  }
}

/** Avalia a expressão para todas as linhas e produz uma coluna (com erros por célula). */
export function evaluateColumnExpression(
  src: string,
  table: DataTable,
  name: string,
  type?: DataType,
  culture: CultureOptions = CULTURE_PT_BR
): Column {
  const f = compileMExpression(src, table, culture)
  const n = table.rowCount
  const values: Scalar[] = new Array(n)
  const errors: (string | null)[] = new Array(n).fill(null)
  let hasError = false
  for (let r = 0; r < n; r++) {
    try {
      values[r] = f(r)
    } catch (err) {
      values[r] = null
      errors[r] = err instanceof Error ? err.message : String(err)
      hasError = true
    }
  }
  const target: DataType = type ?? commonScalarType(values)
  const b = new ColumnBuilder(target, n)
  for (let r = 0; r < n; r++) {
    if (hasError && errors[r] !== null) {
      b.pushError(errors[r]!)
      continue
    }
    const v = values[r]
    if (type && v !== null) {
      const c = convertValue(v, type, culture)
      if (c instanceof ConversionError) b.pushError(c.message)
      else b.push(c)
    } else if (target === 'date' && v instanceof DateVal) b.push(new DateVal(v.ms, 'date'))
    else b.push(v)
  }
  return b.build(name)
}
