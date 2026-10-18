// Analisador léxico e sintático de DAX.
import type { BinOp, DaxQuery, Node, Pos } from './ast'

export class DaxError extends Error {
  constructor(
    message: string,
    readonly pos?: Pos
  ) {
    super(message)
    this.name = 'DaxError'
  }
}

type TokType = 'num' | 'str' | 'ident' | 'qtable' | 'bracket' | 'op' | 'sep' | 'eof'

interface Tok {
  t: TokType
  v: string
  num?: number
  start: number
  end: number
  /** Para identificadores: houve espaço antes do próximo caractere? */
}

const KEYWORDS = new Set([
  'ASC',
  'DESC',
  'SKIP',
  'DENSE',
  'BOTH',
  'NONE',
  'ONEWAY',
  'ONEWAY_LEFTFILTERSRIGHT',
  'ONEWAY_RIGHTFILTERSLEFT',
  'BOOLEAN',
  'INTEGER',
  'DOUBLE',
  'STRING',
  'DATETIME',
  'CURRENCY'
])

function isIdentStart(c: string): boolean {
  return /[A-Za-z_À-ɏ]/.test(c)
}
function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_.À-ɏ]/.test(c)
}

/** Detecta se a fórmula usa ';' como separador de argumentos (configuração regional). */
function usesSemicolonSeparator(src: string): boolean {
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '"') {
      i++
      while (i < src.length) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') i += 2
          else break
        } else i++
      }
      i++
      continue
    }
    if (c === "'") {
      i++
      while (i < src.length && src[i] !== "'") i++
      i++
      continue
    }
    if (c === '[') {
      i++
      while (i < src.length && src[i] !== ']') i++
      i++
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '-' && src[i + 1] === '-') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2)
      i = j < 0 ? src.length : j + 2
      continue
    }
    if (c === ';') return true
    i++
  }
  return false
}

export function tokenize(src: string): Tok[] {
  const regional = usesSemicolonSeparator(src)
  const decimalChar = regional ? ',' : '.'
  const sepChar = regional ? ';' : ','
  const toks: Tok[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ' ') {
      i++
      continue
    }
    if ((c === '/' && src[i + 1] === '/') || (c === '-' && src[i + 1] === '-')) {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2)
      i = j < 0 ? n : j + 2
      continue
    }
    const start = i
    if (/[0-9]/.test(c) || (c === decimalChar && /[0-9]/.test(src[i + 1] ?? ''))) {
      let s = ''
      while (i < n && /[0-9]/.test(src[i])) s += src[i++]
      if (src[i] === decimalChar && /[0-9]/.test(src[i + 1] ?? '')) {
        s += '.'
        i++
        while (i < n && /[0-9]/.test(src[i])) s += src[i++]
      } else if (src[i] === decimalChar && !regional) {
        // "1." é aceito como número
        i++
      }
      if ((src[i] === 'e' || src[i] === 'E') && /[0-9+-]/.test(src[i + 1] ?? '')) {
        let j = i + 1
        let e = 'e'
        if (src[j] === '+' || src[j] === '-') e += src[j++]
        if (/[0-9]/.test(src[j] ?? '')) {
          while (j < n && /[0-9]/.test(src[j])) e += src[j++]
          s += e
          i = j
        }
      }
      toks.push({ t: 'num', v: s, num: Number(s), start, end: i })
      continue
    }
    if (c === '"') {
      i++
      let s = ''
      let closed = false
      while (i < n) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            s += '"'
            i += 2
            continue
          }
          closed = true
          i++
          break
        }
        s += src[i++]
      }
      if (!closed) throw new DaxError('Texto sem aspas de fechamento.', { start, end: n })
      toks.push({ t: 'str', v: s, start, end: i })
      continue
    }
    if (c === "'") {
      i++
      let s = ''
      let closed = false
      while (i < n) {
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            s += "'"
            i += 2
            continue
          }
          closed = true
          i++
          break
        }
        s += src[i++]
      }
      if (!closed) throw new DaxError('Nome de tabela sem aspas simples de fechamento.', { start, end: n })
      toks.push({ t: 'qtable', v: s, start, end: i })
      continue
    }
    if (c === '[') {
      i++
      let s = ''
      let closed = false
      while (i < n) {
        if (src[i] === ']') {
          if (src[i + 1] === ']') {
            s += ']'
            i += 2
            continue
          }
          closed = true
          i++
          break
        }
        s += src[i++]
      }
      if (!closed) throw new DaxError('Colchete "]" de fechamento ausente.', { start, end: n })
      toks.push({ t: 'bracket', v: s, start, end: i })
      continue
    }
    if (isIdentStart(c)) {
      let s = ''
      while (i < n && isIdentPart(src[i])) s += src[i++]
      // Um ponto final solto não faz parte do identificador
      while (s.endsWith('.')) {
        s = s.slice(0, -1)
        i--
      }
      toks.push({ t: 'ident', v: s, start, end: i })
      continue
    }
    if (c === sepChar) {
      toks.push({ t: 'sep', v: c, start, end: i + 1 })
      i++
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>' || two === '==' || two === '&&' || two === '||') {
      toks.push({ t: 'op', v: two, start, end: i + 2 })
      i += 2
      continue
    }
    if ('+-*/^&=<>(){}.'.includes(c)) {
      toks.push({ t: 'op', v: c, start, end: i + 1 })
      i++
      continue
    }
    if (c === ',' && regional) {
      throw new DaxError('Separador "," inesperado: esta fórmula usa ";" para separar argumentos.', { start, end: i + 1 })
    }
    throw new DaxError(`Caractere inválido "${c}".`, { start, end: i + 1 })
  }
  toks.push({ t: 'eof', v: '', start: n, end: n })
  return toks
}

const BIN_PREC: Record<string, number> = {
  '||': 1,
  '&&': 2,
  // NOT = 3 (prefixo)
  '=': 4,
  '==': 4,
  '<>': 4,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  IN: 4,
  '&': 5,
  '+': 6,
  '-': 6,
  '*': 7,
  '/': 7,
  '^': 9
}

class Parser {
  private i = 0
  private scopes: Set<string>[] = []

  constructor(
    private readonly toks: Tok[],
    private readonly src: string
  ) {}

  private peek(o = 0): Tok {
    return this.toks[Math.min(this.i + o, this.toks.length - 1)]
  }
  private next(): Tok {
    return this.toks[this.i++]
  }
  private isOp(v: string, o = 0): boolean {
    const t = this.peek(o)
    return t.t === 'op' && t.v === v
  }
  private isIdent(v: string, o = 0): boolean {
    const t = this.peek(o)
    return t.t === 'ident' && t.v.toUpperCase() === v
  }
  private expectOp(v: string): Tok {
    const t = this.next()
    if (t.t !== 'op' || t.v !== v) throw this.err(t, `Esperado "${v}"`)
    return t
  }
  private err(t: Tok, msg: string): DaxError {
    const found = t.t === 'eof' ? 'fim da expressão' : `"${this.src.slice(t.start, t.end)}"`
    return new DaxError(`${msg}, mas foi encontrado ${found} (posição ${t.start + 1}).`, { start: t.start, end: t.end })
  }

  private inVarScope(name: string): boolean {
    const u = name.toUpperCase()
    for (let s = this.scopes.length - 1; s >= 0; s--) if (this.scopes[s].has(u)) return true
    return false
  }

  parseExpressionAll(): Node {
    const e = this.parseExpr(0)
    const t = this.peek()
    if (t.t !== 'eof') throw this.err(t, 'Fim da expressão esperado')
    return e
  }

  parseExpr(minPrec: number): Node {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      let op: string | null = null
      if (t.t === 'op' && BIN_PREC[t.v] !== undefined) op = t.v
      else if (t.t === 'ident' && t.v.toUpperCase() === 'IN') op = 'IN'
      else if (t.t === 'ident' && t.v.toUpperCase() === 'NOT' && this.isIdent('IN', 1)) op = 'NOT IN'
      if (!op) break
      const prec = BIN_PREC[op === 'NOT IN' ? 'IN' : op]
      if (prec < minPrec) break
      this.next()
      if (op === 'NOT IN') this.next()
      // Associatividade à esquerda: o lado direito exige precedência maior.
      const right = this.parseExpr(prec + 1)
      const pos = { start: left.pos.start, end: right.pos.end }
      if (op === 'IN') left = { k: 'in', l: left, r: right, pos }
      else if (op === 'NOT IN') left = { k: 'unary', op: 'NOT', e: { k: 'in', l: left, r: right, pos }, pos }
      else left = { k: 'bin', op: op as BinOp, l: left, r: right, pos }
    }
    return left
  }

  private parseUnary(): Node {
    const t = this.peek()
    if (t.t === 'ident' && t.v.toUpperCase() === 'NOT' && !this.isOp('(', 1)) {
      this.next()
      // NOT tem precedência menor que as comparações: NOT a = b  =>  NOT (a = b)
      const e = this.parseExpr(4)
      return { k: 'unary', op: 'NOT', e, pos: { start: t.start, end: e.pos.end } }
    }
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) {
      this.next()
      const e = this.parseExpr(8)
      return { k: 'unary', op: t.v as '-' | '+', e, pos: { start: t.start, end: e.pos.end } }
    }
    return this.parsePrimary()
  }

  private parseArgs(): Node[] {
    const args: Node[] = []
    this.expectOp('(')
    if (this.isOp(')')) {
      this.next()
      return args
    }
    for (;;) {
      const t = this.peek()
      if (t.t === 'sep') {
        // Argumento omitido
        args.push({ k: 'kw', v: 'EMPTY', pos: { start: t.start, end: t.start } })
        this.next()
        continue
      }
      if (t.t === 'op' && t.v === ')') {
        args.push({ k: 'kw', v: 'EMPTY', pos: { start: t.start, end: t.start } })
        this.next()
        return args
      }
      args.push(this.parseExpr(0))
      const s = this.next()
      if (s.t === 'sep') {
        if (this.isOp(')')) {
          // separador final: argumento vazio
          const p = this.peek()
          args.push({ k: 'kw', v: 'EMPTY', pos: { start: p.start, end: p.start } })
          this.next()
          return args
        }
        continue
      }
      if (s.t === 'op' && s.v === ')') return args
      throw this.err(s, 'Esperado "," ou ")"')
    }
  }

  private parseColumnSuffix(table: string | null, start: number): Node {
    const b = this.next() // bracket
    let level: string | undefined
    if (this.isOp('.') && this.peek(1).t === 'bracket') {
      this.next()
      level = this.next().v
    }
    const end = this.toks[this.i - 1].end
    return { k: 'ref', table, name: b.v, level, pos: { start, end } }
  }

  private parsePrimary(): Node {
    const t = this.peek()
    switch (t.t) {
      case 'num':
        this.next()
        return { k: 'num', v: t.num!, pos: { start: t.start, end: t.end } }
      case 'str':
        this.next()
        return { k: 'str', v: t.v, pos: { start: t.start, end: t.end } }
      case 'bracket':
        return this.parseColumnSuffix(null, t.start)
      case 'qtable': {
        this.next()
        if (this.peek().t === 'bracket') return this.parseColumnSuffix(t.v, t.start)
        return { k: 'table', name: t.v, pos: { start: t.start, end: t.end } }
      }
      case 'ident': {
        const up = t.v.toUpperCase()
        if (up === 'VAR') return this.parseVar()
        if ((up === 'TRUE' || up === 'FALSE') && !this.isOp('(', 1)) {
          this.next()
          return { k: 'bool', v: up === 'TRUE', pos: { start: t.start, end: t.end } }
        }
        if (this.isOp('(', 1)) {
          this.next()
          const args = this.parseArgs()
          const end = this.toks[this.i - 1].end
          if (up === 'TRUE' || up === 'FALSE') return { k: 'bool', v: up === 'TRUE', pos: { start: t.start, end } }
          return { k: 'call', name: up, args, pos: { start: t.start, end } }
        }
        this.next()
        if (this.peek().t === 'bracket') return this.parseColumnSuffix(t.v, t.start)
        if (this.inVarScope(t.v)) return { k: 'varref', name: t.v.toUpperCase(), pos: { start: t.start, end: t.end } }
        if (KEYWORDS.has(up)) return { k: 'kw', v: up, pos: { start: t.start, end: t.end } }
        return { k: 'table', name: t.v, pos: { start: t.start, end: t.end } }
      }
      case 'op': {
        if (t.v === '(') {
          this.next()
          const e = this.parseExpr(0)
          if (this.peek().t === 'sep') {
            // tupla fora de construtor de tabela não é suportada
            throw this.err(this.peek(), 'Esperado ")"')
          }
          this.expectOp(')')
          return e
        }
        if (t.v === '{') return this.parseTableCtor()
        throw this.err(t, 'Expressão esperada')
      }
      default:
        throw this.err(t, 'Expressão esperada')
    }
  }

  private parseTableCtor(): Node {
    const open = this.next()
    const rows: Node[][] = []
    if (this.isOp('}')) {
      const close = this.next()
      return { k: 'tablector', rows, pos: { start: open.start, end: close.end } }
    }
    for (;;) {
      if (this.isOp('(')) {
        // pode ser tupla ou expressão entre parênteses
        const save = this.i
        this.next()
        const items: Node[] = [this.parseExpr(0)]
        while (this.peek().t === 'sep') {
          this.next()
          items.push(this.parseExpr(0))
        }
        if (this.isOp(')')) {
          this.next()
          if (items.length > 1) rows.push(items)
          else {
            // expressão entre parênteses: pode continuar com operadores
            this.i = save
            rows.push([this.parseExpr(0)])
          }
        } else throw this.err(this.peek(), 'Esperado ")"')
      } else rows.push([this.parseExpr(0)])
      const s = this.next()
      if (s.t === 'sep') continue
      if (s.t === 'op' && s.v === '}') return { k: 'tablector', rows, pos: { start: open.start, end: s.end } }
      throw this.err(s, 'Esperado "," ou "}"')
    }
  }

  private parseVar(): Node {
    const start = this.peek().start
    const defs: { name: string; e: Node }[] = []
    const scope = new Set<string>()
    this.scopes.push(scope)
    try {
      while (this.isIdent('VAR')) {
        this.next()
        const nameTok = this.next()
        if (nameTok.t !== 'ident') throw this.err(nameTok, 'Nome de variável esperado')
        this.expectOp('=')
        const e = this.parseExpr(0)
        defs.push({ name: nameTok.v.toUpperCase(), e })
        scope.add(nameTok.v.toUpperCase())
      }
      const r = this.next()
      if (r.t !== 'ident' || r.v.toUpperCase() !== 'RETURN') throw this.err(r, 'Esperado "RETURN"')
      const ret = this.parseExpr(0)
      return { k: 'var', defs, ret, pos: { start, end: ret.pos.end } }
    } finally {
      this.scopes.pop()
    }
  }

  // --------------------------------------------------------------------
  // Consultas DAX (DEFINE / EVALUATE / ORDER BY)
  // --------------------------------------------------------------------

  parseQuery(): DaxQuery {
    const q: DaxQuery = { defines: [], evaluates: [] }
    const scope = new Set<string>()
    this.scopes.push(scope)
    if (this.isIdent('DEFINE')) {
      this.next()
      for (;;) {
        if (this.isIdent('MEASURE')) {
          this.next()
          const ref = this.parsePrimary()
          if (ref.k !== 'ref' || !ref.table) throw new DaxError('MEASURE requer Tabela[Nome].', ref.pos)
          this.expectOp('=')
          q.defines.push({ kind: 'measure', table: ref.table, name: ref.name, e: this.parseExpr(0) })
        } else if (this.isIdent('COLUMN')) {
          this.next()
          const ref = this.parsePrimary()
          if (ref.k !== 'ref' || !ref.table) throw new DaxError('COLUMN requer Tabela[Nome].', ref.pos)
          this.expectOp('=')
          q.defines.push({ kind: 'column', table: ref.table, name: ref.name, e: this.parseExpr(0) })
        } else if (this.isIdent('VAR')) {
          this.next()
          const nameTok = this.next()
          this.expectOp('=')
          const e = this.parseExpr(0)
          scope.add(nameTok.v.toUpperCase())
          q.defines.push({ kind: 'var', name: nameTok.v.toUpperCase(), e })
        } else if (this.isIdent('TABLE')) {
          this.next()
          const nameTok = this.next()
          this.expectOp('=')
          q.defines.push({ kind: 'table', name: nameTok.v, e: this.parseExpr(0) })
        } else break
      }
    }
    while (this.isIdent('EVALUATE')) {
      this.next()
      const e = this.parseExpr(0)
      const orderBy: { e: Node; desc: boolean }[] = []
      if (this.isIdent('ORDER') && this.isIdent('BY', 1)) {
        this.next()
        this.next()
        for (;;) {
          const oe = this.parseExpr(0)
          let desc = false
          if (this.isIdent('DESC')) {
            this.next()
            desc = true
          } else if (this.isIdent('ASC')) this.next()
          orderBy.push({ e: oe, desc })
          if (this.peek().t === 'sep') {
            this.next()
            continue
          }
          break
        }
      }
      q.evaluates.push({ e, orderBy })
    }
    const t = this.peek()
    if (t.t !== 'eof') throw this.err(t, 'Esperado "EVALUATE"')
    if (q.evaluates.length === 0) throw new DaxError('A consulta precisa de pelo menos um EVALUATE.')
    this.scopes.pop()
    return q
  }
}

export function parseDax(src: string): Node {
  const text = src.replace(/^\s*=/, '')
  if (!text.trim()) throw new DaxError('A expressão está vazia.')
  const p = new Parser(tokenize(text), text)
  return p.parseExpressionAll()
}

export function parseDaxQuery(src: string): DaxQuery {
  const p = new Parser(tokenize(src), src)
  return p.parseQuery()
}
