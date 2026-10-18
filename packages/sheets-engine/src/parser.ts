// Tokenizador e analisador de fórmulas (produz uma AST). Separador de argumentos: ";".

export type Node =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'ref'; ref: string }
  | { type: 'range'; from: string; to: string }
  | { type: 'unary'; op: string; operand: Node }
  | { type: 'binary'; op: string; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] }

interface Tok {
  kind: 'num' | 'str' | 'id' | 'op' | 'lparen' | 'rparen' | 'sep' | 'colon'
  text?: string
  num?: number
}

const IDENT = /[A-Za-z0-9_$.À-ÿ]/

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === '"') {
      let j = i + 1
      let s = ''
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"'
            j += 2
            continue
          }
          j++
          break
        }
        s += src[j++]
      }
      toks.push({ kind: 'str', text: s })
      i = j
      continue
    }
    if (c === '(') {
      toks.push({ kind: 'lparen' })
      i++
      continue
    }
    if (c === ')') {
      toks.push({ kind: 'rparen' })
      i++
      continue
    }
    if (c === ';') {
      toks.push({ kind: 'sep' })
      i++
      continue
    }
    if (c === ':') {
      toks.push({ kind: 'colon' })
      i++
      continue
    }
    if (/[0-9]/.test(c)) {
      let j = i
      let s = ''
      while (j < src.length && /[0-9]/.test(src[j])) s += src[j++]
      if ((src[j] === ',' || src[j] === '.') && /[0-9]/.test(src[j + 1] ?? '')) {
        s += '.'
        j++
        while (j < src.length && /[0-9]/.test(src[j])) s += src[j++]
      }
      if (src[j] === 'e' || src[j] === 'E') {
        s += 'e'
        j++
        if (src[j] === '+' || src[j] === '-') s += src[j++]
        while (j < src.length && /[0-9]/.test(src[j])) s += src[j++]
      }
      toks.push({ kind: 'num', num: Number(s) })
      i = j
      continue
    }
    const two = src.substr(i, 2)
    if (two === '<>' || two === '<=' || two === '>=') {
      toks.push({ kind: 'op', text: two })
      i += 2
      continue
    }
    if ('+-*/^&=<>%'.includes(c)) {
      toks.push({ kind: 'op', text: c })
      i++
      continue
    }
    if (IDENT.test(c)) {
      let j = i
      let s = ''
      while (j < src.length && IDENT.test(src[j])) s += src[j++]
      toks.push({ kind: 'id', text: s })
      i = j
      continue
    }
    throw new Error(`Caractere inválido na fórmula: "${c}"`)
  }
  return toks
}

const BINPREC: Record<string, number> = {
  '=': 1,
  '<>': 1,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '^': 5
}

export function parseFormula(src: string): Node {
  const toks = tokenize(src)
  let p = 0
  const peek = (): Tok | undefined => toks[p]
  const next = (): Tok | undefined => toks[p++]
  const expect = (kind: Tok['kind']): void => {
    const t = next()
    if (!t || t.kind !== kind) throw new Error('Fórmula incompleta.')
  }

  const parsePrimary = (): Node => {
    const t = next()
    if (!t) throw new Error('Fim inesperado da fórmula.')
    if (t.kind === 'num') return { type: 'num', value: t.num! }
    if (t.kind === 'str') return { type: 'str', value: t.text! }
    if (t.kind === 'lparen') {
      const e = parseExpr(0)
      expect('rparen')
      return e
    }
    if (t.kind === 'id') {
      const name = t.text!
      if (peek()?.kind === 'lparen') {
        next()
        const args: Node[] = []
        if (peek() && peek()!.kind !== 'rparen') {
          args.push(parseExpr(0))
          while (peek()?.kind === 'sep') {
            next()
            args.push(parseExpr(0))
          }
        }
        expect('rparen')
        return { type: 'call', name, args }
      }
      const up = name.toUpperCase()
      if (up === 'VERDADEIRO' || up === 'TRUE') return { type: 'bool', value: true }
      if (up === 'FALSO' || up === 'FALSE') return { type: 'bool', value: false }
      if (peek()?.kind === 'colon') {
        next()
        const t2 = next()
        if (!t2 || t2.kind !== 'id') throw new Error('Intervalo inválido.')
        return { type: 'range', from: name, to: t2.text! }
      }
      return { type: 'ref', ref: name }
    }
    throw new Error('Token inesperado na fórmula.')
  }

  const parsePostfix = (): Node => {
    let n = parsePrimary()
    while (peek()?.kind === 'op' && peek()!.text === '%') {
      next()
      n = { type: 'unary', op: '%', operand: n }
    }
    return n
  }

  const parseUnary = (): Node => {
    const t = peek()
    if (t?.kind === 'op' && (t.text === '-' || t.text === '+')) {
      next()
      return { type: 'unary', op: t.text, operand: parseUnary() }
    }
    return parsePostfix()
  }

  function parseExpr(min: number): Node {
    let left = parseUnary()
    for (;;) {
      const t = peek()
      if (!t || t.kind !== 'op' || !(t.text! in BINPREC)) break
      const prec = BINPREC[t.text!]
      if (prec < min) break
      next()
      const nextMin = t.text === '^' ? prec : prec + 1
      const right = parseExpr(nextMin)
      left = { type: 'binary', op: t.text!, left, right }
    }
    return left
  }

  const node = parseExpr(0)
  if (p < toks.length) throw new Error('Sobra de tokens na fórmula.')
  return node
}
