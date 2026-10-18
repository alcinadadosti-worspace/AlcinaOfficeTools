// Motor de cálculo: guarda o conteúdo bruto das células e avalia sob demanda,
// com memoização por recálculo e detecção de referência circular.
import { parseFormula, type Node } from './parser'
import { parseA1, cellKey, parseKey } from './a1'
import { type CellValue, isError, err } from './types'
import { FUNCTIONS } from './functions'
import { toNumber, toText, parseNumber, type ArgValue } from './runtime'

export interface CellEntry {
  row: number
  col: number
  raw: string
}

export class SheetEngine {
  private cells = new Map<string, string>()
  private cache = new Map<string, CellValue>()
  private stack = new Set<string>()
  rows = 0
  cols = 0

  setCell(row: number, col: number, raw?: string): void {
    const k = cellKey(row, col)
    const t = raw ?? ''
    if (t === '') {
      this.cells.delete(k)
    } else {
      this.cells.set(k, t)
      this.rows = Math.max(this.rows, row + 1)
      this.cols = Math.max(this.cols, col + 1)
    }
    this.cache.clear()
  }

  getRaw(row: number, col: number): string {
    return this.cells.get(cellKey(row, col)) ?? ''
  }

  load(entries: CellEntry[]): void {
    this.cells.clear()
    this.cache.clear()
    this.rows = 0
    this.cols = 0
    for (const e of entries) this.setCell(e.row, e.col, e.raw)
  }

  entries(): CellEntry[] {
    const out: CellEntry[] = []
    for (const [k, raw] of this.cells) {
      const { row, col } = parseKey(k)
      out.push({ row, col, raw })
    }
    return out
  }

  getValue(row: number, col: number): CellValue {
    const k = cellKey(row, col)
    const cached = this.cache.get(k)
    if (cached !== undefined) return cached
    if (this.stack.has(k)) return err('#CIRC!')
    const raw = this.cells.get(k)
    if (raw === undefined || raw === '') {
      this.cache.set(k, null)
      return null
    }
    this.stack.add(k)
    let v: CellValue
    try {
      v = this.evalRaw(raw)
    } catch {
      v = err('#VALOR!')
    }
    this.stack.delete(k)
    this.cache.set(k, v)
    return v
  }

  private evalRaw(raw: string): CellValue {
    if (raw[0] === '=') return this.eval(parseFormula(raw.slice(1)))
    const up = raw.toUpperCase()
    if (up === 'VERDADEIRO' || up === 'TRUE') return true
    if (up === 'FALSO' || up === 'FALSE') return false
    const n = parseNumber(raw)
    return n === null ? raw : n
  }

  private eval(node: Node): CellValue {
    switch (node.type) {
      case 'num':
        return node.value
      case 'str':
        return node.value
      case 'bool':
        return node.value
      case 'ref': {
        const a = parseA1(node.ref)
        return a ? this.getValue(a.row, a.col) : err('#NOME?')
      }
      case 'range':
        return err('#VALOR!')
      case 'unary': {
        const v = toNumber(this.eval(node.operand))
        if (isError(v)) return v
        if (node.op === '%') return v / 100
        return node.op === '-' ? -v : v
      }
      case 'binary':
        return this.binary(node)
      case 'call': {
        const fn = FUNCTIONS[node.name.toUpperCase()]
        if (!fn) return err('#NOME?')
        return fn(node.args.map((x) => this.evalArg(x)))
      }
    }
    return err('#VALOR!')
  }

  private binary(node: Extract<Node, { type: 'binary' }>): CellValue {
    const l = this.eval(node.left)
    if (isError(l)) return l
    const r = this.eval(node.right)
    if (isError(r)) return r
    const op = node.op
    if (op === '&') return toText(l) + toText(r)
    if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') return this.compare(op, l, r)
    const ln = toNumber(l)
    if (isError(ln)) return ln
    const rn = toNumber(r)
    if (isError(rn)) return rn
    switch (op) {
      case '+':
        return ln + rn
      case '-':
        return ln - rn
      case '*':
        return ln * rn
      case '/':
        return rn === 0 ? err('#DIV/0!') : ln / rn
      case '^':
        return Math.pow(ln, rn)
    }
    return err('#VALOR!')
  }

  private compare(op: string, l: CellValue, r: CellValue): CellValue {
    let c: number
    if (typeof l === 'number' && typeof r === 'number') c = l < r ? -1 : l > r ? 1 : 0
    else {
      const a = toText(l).toUpperCase()
      const b = toText(r).toUpperCase()
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
    return err('#VALOR!')
  }

  private evalArg(node: Node): ArgValue {
    if (node.type === 'range') return this.rangeValues(node.from, node.to)
    return this.eval(node)
  }

  private rangeValues(from: string, to: string): CellValue[] {
    const a = parseA1(from)
    const b = parseA1(to)
    if (!a || !b) return [err('#REF!')]
    const r1 = Math.min(a.row, b.row)
    const r2 = Math.max(a.row, b.row)
    const c1 = Math.min(a.col, b.col)
    const c2 = Math.max(a.col, b.col)
    const out: CellValue[] = []
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(this.getValue(r, c))
    return out
  }
}
