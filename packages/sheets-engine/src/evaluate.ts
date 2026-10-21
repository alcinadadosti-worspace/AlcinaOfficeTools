// Motor de cálculo: guarda o conteúdo bruto das células e avalia sob demanda,
// com memoização por recálculo e detecção de referência circular.
import { parseFormula, type Node } from './parser'
import { parseA1, parseEndpoint, cellKey, parseKey } from './a1'
import { type CellValue, type CellError, isError, err } from './types'
import { FUNCTIONS } from './functions'
import { toNumber, toText, parseNumber, isMatrix, type ArgValue, type Matrix } from './runtime'

export interface CellEntry {
  row: number
  col: number
  raw: string
}

export class SheetEngine {
  private cells = new Map<string, string>()
  private cache = new Map<string, CellValue>()
  private spillCache = new Map<string, Matrix>()
  private stack = new Set<string>()
  private cur: { row: number; col: number } | null = null
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
    this.spillCache.clear()
  }

  getRaw(row: number, col: number): string {
    return this.cells.get(cellKey(row, col)) ?? ''
  }

  load(entries: CellEntry[]): void {
    this.cells.clear()
    this.cache.clear()
    this.spillCache.clear()
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
    const prevCur = this.cur
    this.cur = { row, col }
    let v: CellValue
    try {
      const av = this.evalRawArg(raw)
      if (isMatrix(av)) {
        if (av.rows > 1 || av.cols > 1) this.spillCache.set(k, av)
        v = av.cells[0]?.[0] ?? null
      } else {
        v = av
      }
    } catch {
      v = err('#VALOR!')
    }
    this.cur = prevCur
    this.stack.delete(k)
    this.cache.set(k, v)
    return v
  }

  /** Avalia o conteúdo bruto, preservando matrizes do nível superior (para o spill). */
  private evalRawArg(raw: string): ArgValue {
    if (raw[0] === '=') return this.evalArg(parseFormula(raw.slice(1)))
    const up = raw.toUpperCase()
    if (up === 'VERDADEIRO' || up === 'TRUE') return true
    if (up === 'FALSO' || up === 'FALSE') return false
    const n = parseNumber(raw)
    return n === null ? raw : n
  }

  /** Matriz derramada (spill) ancorada nesta célula, ou null. */
  getSpill(row: number, col: number): Matrix | null {
    this.getValue(row, col)
    return this.spillCache.get(cellKey(row, col)) ?? null
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
      case 'binary': {
        const v = this.evalBinary(node)
        return isMatrix(v) ? (v.cells[0]?.[0] ?? null) : v
      }
      case 'call': {
        const v = this.evalCall(node)
        return isMatrix(v) ? (v.cells[0]?.[0] ?? null) : v
      }
    }
    return err('#VALOR!')
  }

  // Operadores com transmissão de array: se algum lado for matriz, aplica elemento a elemento.
  private evalBinary(node: Extract<Node, { type: 'binary' }>): ArgValue {
    const l = this.evalArg(node.left)
    const r = this.evalArg(node.right)
    if (isMatrix(l) || isMatrix(r)) {
      const rows = Math.max(isMatrix(l) ? l.rows : 1, isMatrix(r) ? r.rows : 1)
      const cols = Math.max(isMatrix(l) ? l.cols : 1, isMatrix(r) ? r.cols : 1)
      const cells: CellValue[][] = []
      for (let i = 0; i < rows; i++) {
        const row: CellValue[] = []
        for (let j = 0; j < cols; j++) row.push(this.binaryScalar(node.op, cellOf(l, i, j), cellOf(r, i, j)))
        cells.push(row)
      }
      return { kind: 'matrix', rows, cols, cells }
    }
    return this.binaryScalar(node.op, l as CellValue, r as CellValue)
  }

  private binaryScalar(op: string, l: CellValue, r: CellValue): CellValue {
    if (isError(l)) return l
    if (isError(r)) return r
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
    else if (typeof l === 'number' || typeof r === 'number') c = typeof l === 'number' ? -1 : 1 // número < texto; nunca iguais (como no Excel)
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
    if (node.type === 'range') return this.rangeMatrix(node.from, node.to)
    if (node.type === 'call') return this.evalCall(node)
    if (node.type === 'binary') return this.evalBinary(node)
    return this.eval(node)
  }

  private evalCall(node: Extract<Node, { type: 'call' }>): ArgValue {
    const name = node.name.toUpperCase()
    const sp = this.special(name, node.args)
    if (sp !== undefined) return sp
    const fn = FUNCTIONS[name]
    if (!fn) return err('#NOME?')
    return fn(node.args.map((x) => this.evalArg(x)))
  }

  private toInt(node: Node): number | { error: CellError } {
    const v = toNumber(this.eval(node))
    return isError(v) ? v : Math.trunc(v)
  }

  private refOf(node: Node): { r1: number; c1: number; r2: number; c2: number } | null {
    if (node.type === 'ref') {
      const a = parseA1(node.ref)
      return a ? { r1: a.row, c1: a.col, r2: a.row, c2: a.col } : null
    }
    if (node.type === 'range') {
      const a = parseA1(node.from)
      const b = parseA1(node.to)
      if (!a || !b) return null
      return { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) }
    }
    return null
  }

  // Funções que precisam da referência (não do valor) ou da célula atual.
  private special(name: string, args: Node[]): ArgValue | undefined {
    switch (name) {
      case 'LIN':
      case 'LINHA':
      case 'ROW': {
        if (!args.length) return this.cur ? this.cur.row + 1 : err('#REF!')
        const r = this.refOf(args[0])
        return r ? r.r1 + 1 : err('#REF!')
      }
      case 'COL':
      case 'COLUNA':
      case 'COLUMN': {
        if (!args.length) return this.cur ? this.cur.col + 1 : err('#REF!')
        const r = this.refOf(args[0])
        return r ? r.c1 + 1 : err('#REF!')
      }
      case 'DESLOC':
      case 'OFFSET': {
        if (args.length < 3) return err('#REF!')
        const base = this.refOf(args[0])
        if (!base) return err('#REF!')
        const dr = this.toInt(args[1])
        if (isError(dr)) return dr
        const dc = this.toInt(args[2])
        if (isError(dc)) return dc
        const h = args[3] !== undefined ? this.toInt(args[3]) : base.r2 - base.r1 + 1
        if (isError(h)) return h
        const w = args[4] !== undefined ? this.toInt(args[4]) : base.c2 - base.c1 + 1
        if (isError(w)) return w
        const r1 = base.r1 + dr
        const c1 = base.c1 + dc
        if (r1 < 0 || c1 < 0 || h < 1 || w < 1) return err('#REF!')
        return this.matrixAt(r1, c1, r1 + h - 1, c1 + w - 1)
      }
      case 'INDIRETO':
      case 'INDIRECT': {
        if (!args.length) return err('#REF!')
        const t = toText(this.eval(args[0])).trim().replace(/\$/g, '')
        const parts = t.split(':')
        if (parts.length === 2) {
          const a = parseA1(parts[0])
          const b = parseA1(parts[1])
          if (!a || !b) return err('#REF!')
          return this.matrixAt(Math.min(a.row, b.row), Math.min(a.col, b.col), Math.max(a.row, b.row), Math.max(a.col, b.col))
        }
        const a = parseA1(t)
        return a ? this.getValue(a.row, a.col) : err('#REF!')
      }
      case 'ÉREF':
      case 'EREF':
      case 'ISREF':
        return args.length > 0 && this.refOf(args[0]) !== null
    }
    return undefined
  }

  private rangeMatrix(from: string, to: string): Matrix {
    const a = parseEndpoint(from)
    const b = parseEndpoint(to)
    if (!a || !b) return { kind: 'matrix', rows: 1, cols: 1, cells: [[err('#REF!')]] }
    // Coluna inteira (A:A) ou linha inteira (1:1): recorta a dimensão aberta ao intervalo usado.
    const maxR = Math.max(this.rows - 1, 0)
    const maxC = Math.max(this.cols - 1, 0)
    const haveCols = a.col !== null && b.col !== null
    const haveRows = a.row !== null && b.row !== null
    const c1 = haveCols ? Math.min(a.col!, b.col!) : 0
    const c2 = haveCols ? Math.max(a.col!, b.col!) : maxC
    const r1 = haveRows ? Math.min(a.row!, b.row!) : 0
    const r2 = haveRows ? Math.max(a.row!, b.row!) : maxR
    return this.matrixAt(r1, c1, r2, c2)
  }

  private matrixAt(r1: number, c1: number, r2: number, c2: number): Matrix {
    const cells: CellValue[][] = []
    for (let r = r1; r <= r2; r++) {
      const row: CellValue[] = []
      for (let c = c1; c <= c2; c++) row.push(this.getValue(r, c))
      cells.push(row)
    }
    return { kind: 'matrix', rows: r2 - r1 + 1, cols: c2 - c1 + 1, cells }
  }
}

// Seleciona o valor (i,j) de um argumento, transmitindo escalares e vetores linha/coluna.
function cellOf(v: ArgValue, i: number, j: number): CellValue {
  if (isMatrix(v)) {
    const r = v.rows === 1 ? 0 : i
    const c = v.cols === 1 ? 0 : j
    return v.cells[r]?.[c] ?? null
  }
  return v
}
