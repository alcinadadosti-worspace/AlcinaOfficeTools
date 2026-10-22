// Funções lógicas, matemáticas, de texto e de informação.
import type { Node } from '../ast'
import type { Ctx } from '../context'
import type { Evaluator } from '../evaluator'
import { DaxError } from '../parser'
import { fn, register } from '../registry'
import { TableValue } from '../tablevalue'
import { compareOp, toBool, toNumber, toText } from '../values'
import { DateVal, type Scalar } from '../../data/types'
import { formatScalar, formatNumber } from '../../data/format'
import { parseNumber } from '../../data/convert'

const num = (ev: Evaluator, n: Node, ctx: Ctx): number => toNumber(ev.scalar(n, ctx))
const numOrNull = (ev: Evaluator, n: Node, ctx: Ctx): number | null => {
  const v = ev.scalar(n, ctx)
  return v === null ? null : toNumber(v)
}
const text = (ev: Evaluator, n: Node, ctx: Ctx): string => toText(ev.scalar(n, ctx))
const isEmptyArg = (n: Node | undefined) => !n || (n.k === 'kw' && n.v === 'EMPTY')

function roundHalfAway(x: number, digits: number): number {
  const f = Math.pow(10, digits)
  const y = Math.abs(x) * f
  // corrige erros de ponto flutuante (ex.: 1.005)
  const r = Math.round(Number(y.toPrecision(15)))
  return (Math.sign(x) * r) / f
}

function roundTowardZero(x: number, digits: number): number {
  const f = Math.pow(10, digits)
  return (Math.sign(x) * Math.floor(Number((Math.abs(x) * f).toPrecision(15)))) / f
}

function roundAwayFromZero(x: number, digits: number): number {
  const f = Math.pow(10, digits)
  return (Math.sign(x) * Math.ceil(Number((Math.abs(x) * f).toPrecision(15)))) / f
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.trunc(a))
  b = Math.abs(Math.trunc(b))
  while (b) [a, b] = [b, a % b]
  return a
}

function wildcardRegex(find: string): RegExp {
  let re = ''
  for (let i = 0; i < find.length; i++) {
    const c = find[i]
    if (c === '~' && i + 1 < find.length) {
      re += find[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (c === '*') re += '[\\s\\S]*'
    else if (c === '?') re += '[\\s\\S]'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(re, 'i')
}

function tryEval(ev: Evaluator, n: Node, ctx: Ctx): { ok: true; v: Scalar } | { ok: false } {
  try {
    const v = ev.scalar(n, ctx)
    if (typeof v === 'number' && !Number.isFinite(v)) return { ok: false }
    return { ok: true, v }
  } catch {
    return { ok: false }
  }
}

register([
  // ------------------------------------------------------------------ Lógica
  fn('IF', 'scalar', 'Lógica', 2, 3, 'IF(<teste>, <valorSeVerdadeiro>[, <valorSeFalso>])', 'Retorna um valor conforme a condição.', (ev, a, ctx) => {
    if (toBool(ev.scalar(a[0], ctx))) return ev.scalar(a[1], ctx)
    return a.length > 2 ? ev.scalar(a[2], ctx) : null
  }),
  fn('IF.EAGER', 'scalar', 'Lógica', 2, 3, 'IF.EAGER(<teste>, <valorSeVerdadeiro>[, <valorSeFalso>])', 'IF com avaliação antecipada.', (ev, a, ctx) => {
    const t = ev.scalar(a[1], ctx)
    const f = a.length > 2 ? ev.scalar(a[2], ctx) : null
    return toBool(ev.scalar(a[0], ctx)) ? t : f
  }),
  fn('SWITCH', 'scalar', 'Lógica', 3, Infinity, 'SWITCH(<expressão>, <valor1>, <resultado1>[, ...][, <senão>])', 'Avalia uma expressão contra uma lista de valores.', (ev, a, ctx) => {
    const v = ev.scalar(a[0], ctx)
    let i = 1
    for (; i + 1 < a.length; i += 2) {
      const c = ev.scalar(a[i], ctx)
      let eq = false
      try {
        eq = compareOp('=', v, c)
      } catch {
        eq = false
      }
      if (eq) return ev.scalar(a[i + 1], ctx)
    }
    return i < a.length ? ev.scalar(a[i], ctx) : null
  }),
  fn('AND', 'scalar', 'Lógica', 2, 2, 'AND(<lógico1>, <lógico2>)', 'TRUE se ambos forem verdadeiros.', (ev, a, ctx) => toBool(ev.scalar(a[0], ctx)) && toBool(ev.scalar(a[1], ctx))),
  fn('OR', 'scalar', 'Lógica', 2, 2, 'OR(<lógico1>, <lógico2>)', 'TRUE se algum for verdadeiro.', (ev, a, ctx) => toBool(ev.scalar(a[0], ctx)) || toBool(ev.scalar(a[1], ctx))),
  fn('NOT', 'scalar', 'Lógica', 1, 1, 'NOT(<lógico>)', 'Inverte o valor lógico.', (ev, a, ctx) => !toBool(ev.scalar(a[0], ctx))),
  fn('IFERROR', 'scalar', 'Lógica', 2, 2, 'IFERROR(<valor>, <valorSeErro>)', 'Retorna o valor alternativo se houver erro.', (ev, a, ctx) => {
    const r = tryEval(ev, a[0], ctx)
    return r.ok ? r.v : ev.scalar(a[1], ctx)
  }),
  fn('ISERROR', 'scalar', 'Informação', 1, 1, 'ISERROR(<valor>)', 'TRUE se a expressão gerar erro.', (ev, a, ctx) => !tryEval(ev, a[0], ctx).ok),
  fn('COALESCE', 'scalar', 'Lógica', 2, Infinity, 'COALESCE(<expressão>, <expressão>[, ...])', 'Primeiro valor não vazio.', (ev, a, ctx) => {
    for (const x of a) {
      const v = ev.scalar(x, ctx)
      if (v !== null) return v
    }
    return null
  }),
  fn('BLANK', 'scalar', 'Informação', 0, 0, 'BLANK()', 'Retorna um valor em branco.', () => null),
  fn('ERROR', 'scalar', 'Informação', 1, 1, 'ERROR(<texto>)', 'Gera um erro com a mensagem.', (ev, a, ctx) => {
    throw new DaxError(text(ev, a[0], ctx))
  }),

  // ------------------------------------------------------------- Informação
  fn('ISBLANK', 'scalar', 'Informação', 1, 1, 'ISBLANK(<valor>)', 'TRUE se o valor for vazio.', (ev, a, ctx) => ev.scalar(a[0], ctx) === null),
  fn('ISNUMBER', 'scalar', 'Informação', 1, 1, 'ISNUMBER(<valor>)', 'TRUE se for número.', (ev, a, ctx) => typeof ev.scalar(a[0], ctx) === 'number'),
  fn('ISTEXT', 'scalar', 'Informação', 1, 1, 'ISTEXT(<valor>)', 'TRUE se for texto.', (ev, a, ctx) => typeof ev.scalar(a[0], ctx) === 'string'),
  fn('ISNONTEXT', 'scalar', 'Informação', 1, 1, 'ISNONTEXT(<valor>)', 'TRUE se não for texto.', (ev, a, ctx) => typeof ev.scalar(a[0], ctx) !== 'string'),
  fn('ISLOGICAL', 'scalar', 'Informação', 1, 1, 'ISLOGICAL(<valor>)', 'TRUE se for lógico.', (ev, a, ctx) => typeof ev.scalar(a[0], ctx) === 'boolean'),
  fn('ISEVEN', 'scalar', 'Informação', 1, 1, 'ISEVEN(<número>)', 'TRUE se for par.', (ev, a, ctx) => Math.trunc(num(ev, a[0], ctx)) % 2 === 0),
  fn('ISODD', 'scalar', 'Informação', 1, 1, 'ISODD(<número>)', 'TRUE se for ímpar.', (ev, a, ctx) => Math.abs(Math.trunc(num(ev, a[0], ctx)) % 2) === 1),
  fn('ISEMPTY', 'scalar', 'Informação', 1, 1, 'ISEMPTY(<tabela>)', 'TRUE se a tabela estiver vazia.', (ev, a, ctx) => ev.table(a[0], ctx).rowCount === 0),
  fn('USERNAME', 'scalar', 'Informação', 0, 0, 'USERNAME()', 'Nome do usuário atual.', () => 'AlcinaBi\\usuario'),
  fn('USERPRINCIPALNAME', 'scalar', 'Informação', 0, 0, 'USERPRINCIPALNAME()', 'Nome principal do usuário.', () => 'usuario@alcinabi.local'),
  fn('USEROBJECTID', 'scalar', 'Informação', 0, 0, 'USEROBJECTID()', 'Identificador do usuário.', () => '00000000-0000-0000-0000-000000000000'),

  // ------------------------------------------------------------- Matemática
  fn('DIVIDE', 'scalar', 'Matemática', 2, 3, 'DIVIDE(<numerador>, <denominador>[, <resultadoAlternativo>])', 'Divisão segura (trata divisão por zero).', (ev, a, ctx) => {
    const d = numOrNull(ev, a[1], ctx)
    if (d === null || d === 0) return a.length > 2 ? ev.scalar(a[2], ctx) : null
    const n = numOrNull(ev, a[0], ctx)
    if (n === null) return null
    return n / d
  }),
  fn('ABS', 'scalar', 'Matemática', 1, 1, 'ABS(<número>)', 'Valor absoluto.', (ev, a, ctx) => {
    const v = numOrNull(ev, a[0], ctx)
    return v === null ? null : Math.abs(v)
  }),
  fn('ROUND', 'scalar', 'Matemática', 1, 2, 'ROUND(<número>, <casas>)', 'Arredonda para o número de casas.', (ev, a, ctx) => {
    const v = numOrNull(ev, a[0], ctx)
    if (v === null) return null
    return roundHalfAway(v, a.length > 1 ? Math.trunc(num(ev, a[1], ctx)) : 0)
  }),
  fn('ROUNDUP', 'scalar', 'Matemática', 2, 2, 'ROUNDUP(<número>, <casas>)', 'Arredonda para longe de zero.', (ev, a, ctx) => {
    const v = numOrNull(ev, a[0], ctx)
    return v === null ? null : roundAwayFromZero(v, Math.trunc(num(ev, a[1], ctx)))
  }),
  fn('ROUNDDOWN', 'scalar', 'Matemática', 2, 2, 'ROUNDDOWN(<número>, <casas>)', 'Arredonda em direção a zero.', (ev, a, ctx) => {
    const v = numOrNull(ev, a[0], ctx)
    return v === null ? null : roundTowardZero(v, Math.trunc(num(ev, a[1], ctx)))
  }),
  fn('MROUND', 'scalar', 'Matemática', 2, 2, 'MROUND(<número>, <múltiplo>)', 'Arredonda para o múltiplo mais próximo.', (ev, a, ctx) => {
    const v = num(ev, a[0], ctx)
    const m = num(ev, a[1], ctx)
    if (m === 0) return 0
    if (Math.sign(v) * Math.sign(m) < 0) throw new DaxError('MROUND: número e múltiplo devem ter o mesmo sinal.')
    return roundHalfAway(v / m, 0) * m
  }),
  fn('INT', 'scalar', 'Matemática', 1, 1, 'INT(<número>)', 'Arredonda para baixo até o inteiro mais próximo.', (ev, a, ctx) => {
    const v = numOrNull(ev, a[0], ctx)
    return v === null ? null : Math.floor(v)
  }),
  fn('TRUNC', 'scalar', 'Matemática', 1, 2, 'TRUNC(<número>[, <casas>])', 'Trunca o número.', (ev, a, ctx) => {
    const v = numOrNull(ev, a[0], ctx)
    return v === null ? null : roundTowardZero(v, a.length > 1 ? Math.trunc(num(ev, a[1], ctx)) : 0)
  }),
  fn('MOD', 'scalar', 'Matemática', 2, 2, 'MOD(<número>, <divisor>)', 'Resto da divisão (sinal do divisor).', (ev, a, ctx) => {
    const n = num(ev, a[0], ctx)
    const d = num(ev, a[1], ctx)
    if (d === 0) throw new DaxError('MOD: divisão por zero.')
    return n - d * Math.floor(n / d)
  }),
  fn('QUOTIENT', 'scalar', 'Matemática', 2, 2, 'QUOTIENT(<numerador>, <denominador>)', 'Parte inteira da divisão.', (ev, a, ctx) => {
    const d = num(ev, a[1], ctx)
    if (d === 0) throw new DaxError('QUOTIENT: divisão por zero.')
    return Math.trunc(num(ev, a[0], ctx) / d)
  }),
  fn('POWER', 'scalar', 'Matemática', 2, 2, 'POWER(<número>, <potência>)', 'Potência.', (ev, a, ctx) => Math.pow(num(ev, a[0], ctx), num(ev, a[1], ctx))),
  fn('SQRT', 'scalar', 'Matemática', 1, 1, 'SQRT(<número>)', 'Raiz quadrada.', (ev, a, ctx) => {
    const v = num(ev, a[0], ctx)
    if (v < 0) throw new DaxError('SQRT de número negativo.')
    return Math.sqrt(v)
  }),
  fn('EXP', 'scalar', 'Matemática', 1, 1, 'EXP(<número>)', 'e elevado ao número.', (ev, a, ctx) => Math.exp(num(ev, a[0], ctx))),
  fn('LN', 'scalar', 'Matemática', 1, 1, 'LN(<número>)', 'Logaritmo natural.', (ev, a, ctx) => Math.log(num(ev, a[0], ctx))),
  fn('LOG', 'scalar', 'Matemática', 1, 2, 'LOG(<número>[, <base>])', 'Logaritmo na base indicada (padrão 10).', (ev, a, ctx) => {
    const b = a.length > 1 ? num(ev, a[1], ctx) : 10
    return Math.log(num(ev, a[0], ctx)) / Math.log(b)
  }),
  fn('LOG10', 'scalar', 'Matemática', 1, 1, 'LOG10(<número>)', 'Logaritmo na base 10.', (ev, a, ctx) => Math.log10(num(ev, a[0], ctx))),
  fn('SIGN', 'scalar', 'Matemática', 1, 1, 'SIGN(<número>)', 'Sinal do número (-1, 0, 1).', (ev, a, ctx) => Math.sign(num(ev, a[0], ctx))),
  fn('CEILING', 'scalar', 'Matemática', 1, 2, 'CEILING(<número>, <significância>)', 'Arredonda para cima até o múltiplo.', (ev, a, ctx) => {
    const v = num(ev, a[0], ctx)
    const s = a.length > 1 ? num(ev, a[1], ctx) : 1
    if (s === 0) return 0
    return Math.ceil(v / s) * s
  }),
  fn('ISO.CEILING', 'scalar', 'Matemática', 1, 2, 'ISO.CEILING(<número>[, <significância>])', 'Arredonda para cima até o múltiplo.', (ev, a, ctx) => {
    const v = num(ev, a[0], ctx)
    const s = Math.abs(a.length > 1 ? num(ev, a[1], ctx) : 1)
    if (s === 0) return 0
    return Math.ceil(v / s) * s
  }),
  fn('FLOOR', 'scalar', 'Matemática', 2, 2, 'FLOOR(<número>, <significância>)', 'Arredonda para baixo até o múltiplo.', (ev, a, ctx) => {
    const v = num(ev, a[0], ctx)
    const s = num(ev, a[1], ctx)
    if (s === 0) return 0
    return Math.floor(v / s) * s
  }),
  fn('EVEN', 'scalar', 'Matemática', 1, 1, 'EVEN(<número>)', 'Arredonda para o próximo inteiro par.', (ev, a, ctx) => {
    const v = num(ev, a[0], ctx)
    const r = Math.ceil(Math.abs(v) / 2) * 2
    return v < 0 ? -r : r
  }),
  fn('ODD', 'scalar', 'Matemática', 1, 1, 'ODD(<número>)', 'Arredonda para o próximo inteiro ímpar.', (ev, a, ctx) => {
    const v = num(ev, a[0], ctx)
    let r = Math.ceil(Math.abs(v))
    if (r % 2 === 0) r++
    return v < 0 ? -r : r
  }),
  fn('FACT', 'scalar', 'Matemática', 1, 1, 'FACT(<número>)', 'Fatorial.', (ev, a, ctx) => {
    const n = Math.trunc(num(ev, a[0], ctx))
    if (n < 0) throw new DaxError('FACT de número negativo.')
    let r = 1
    for (let i = 2; i <= n; i++) r *= i
    return r
  }),
  fn('GCD', 'scalar', 'Matemática', 2, Infinity, 'GCD(<número1>, <número2>[, ...])', 'Máximo divisor comum.', (ev, a, ctx) => a.map((x) => num(ev, x, ctx)).reduce((p, x) => gcd(p, x))),
  fn('LCM', 'scalar', 'Matemática', 2, Infinity, 'LCM(<número1>, <número2>[, ...])', 'Mínimo múltiplo comum.', (ev, a, ctx) =>
    a.map((x) => Math.abs(Math.trunc(num(ev, x, ctx)))).reduce((p, x) => (p === 0 || x === 0 ? 0 : (p * x) / gcd(p, x)))
  ),
  fn('PI', 'scalar', 'Matemática', 0, 0, 'PI()', 'O número π.', () => Math.PI),
  fn('RAND', 'scalar', 'Matemática', 0, 0, 'RAND()', 'Número aleatório entre 0 e 1.', () => Math.random()),
  fn('RANDBETWEEN', 'scalar', 'Matemática', 2, 2, 'RANDBETWEEN(<inferior>, <superior>)', 'Inteiro aleatório no intervalo.', (ev, a, ctx) => {
    const lo = Math.ceil(num(ev, a[0], ctx))
    const hi = Math.floor(num(ev, a[1], ctx))
    return lo + Math.floor(Math.random() * (hi - lo + 1))
  }),
  fn('SIN', 'scalar', 'Matemática', 1, 1, 'SIN(<número>)', 'Seno.', (ev, a, ctx) => Math.sin(num(ev, a[0], ctx))),
  fn('COS', 'scalar', 'Matemática', 1, 1, 'COS(<número>)', 'Cosseno.', (ev, a, ctx) => Math.cos(num(ev, a[0], ctx))),
  fn('TAN', 'scalar', 'Matemática', 1, 1, 'TAN(<número>)', 'Tangente.', (ev, a, ctx) => Math.tan(num(ev, a[0], ctx))),
  fn('ASIN', 'scalar', 'Matemática', 1, 1, 'ASIN(<número>)', 'Arco seno.', (ev, a, ctx) => Math.asin(num(ev, a[0], ctx))),
  fn('ACOS', 'scalar', 'Matemática', 1, 1, 'ACOS(<número>)', 'Arco cosseno.', (ev, a, ctx) => Math.acos(num(ev, a[0], ctx))),
  fn('ATAN', 'scalar', 'Matemática', 1, 1, 'ATAN(<número>)', 'Arco tangente.', (ev, a, ctx) => Math.atan(num(ev, a[0], ctx))),
  fn('DEGREES', 'scalar', 'Matemática', 1, 1, 'DEGREES(<radianos>)', 'Converte radianos em graus.', (ev, a, ctx) => (num(ev, a[0], ctx) * 180) / Math.PI),
  fn('RADIANS', 'scalar', 'Matemática', 1, 1, 'RADIANS(<graus>)', 'Converte graus em radianos.', (ev, a, ctx) => (num(ev, a[0], ctx) * Math.PI) / 180),
  fn('CURRENCY', 'scalar', 'Matemática', 1, 1, 'CURRENCY(<valor>)', 'Converte em decimal fixo (4 casas).', (ev, a, ctx) => Math.round(num(ev, a[0], ctx) * 10000) / 10000),
  fn('CONVERT', 'scalar', 'Informação', 2, 2, 'CONVERT(<expressão>, <tipo>)', 'Converte para BOOLEAN, INTEGER, DOUBLE, STRING, DATETIME ou CURRENCY.', (ev, a, ctx, call) => {
    const v = ev.scalar(a[0], ctx)
    const t = a[1].k === 'kw' ? a[1].v : a[1].k === 'table' ? a[1].name.toUpperCase() : ''
    if (v === null) return null
    switch (t) {
      case 'BOOLEAN':
        return toBool(v)
      case 'INTEGER':
        return Math.round(toNumber(v))
      case 'DOUBLE':
        return toNumber(v)
      case 'CURRENCY':
        return Math.round(toNumber(v) * 10000) / 10000
      case 'STRING':
        return toText(v)
      case 'DATETIME': {
        if (v instanceof DateVal) return v
        return new DateVal(Date.UTC(1899, 11, 30) + toNumber(v) * 86_400_000, 'datetime')
      }
      default:
        throw new DaxError('Tipo de conversão inválido em CONVERT.', call.pos)
    }
  }),

  // ------------------------------------------------------------------ Texto
  fn('CONCATENATE', 'scalar', 'Texto', 2, 2, 'CONCATENATE(<texto1>, <texto2>)', 'Junta dois textos.', (ev, a, ctx) => text(ev, a[0], ctx) + text(ev, a[1], ctx)),
  fn('COMBINEVALUES', 'scalar', 'Texto', 3, Infinity, 'COMBINEVALUES(<delimitador>, <expr1>, <expr2>[, ...])', 'Junta valores com um delimitador.', (ev, a, ctx) => {
    const d = text(ev, a[0], ctx)
    return a
      .slice(1)
      .map((x) => text(ev, x, ctx))
      .join(d)
  }),
  fn('LEFT', 'scalar', 'Texto', 1, 2, 'LEFT(<texto>[, <número>])', 'Caracteres do início do texto.', (ev, a, ctx) => {
    const s = text(ev, a[0], ctx)
    const n = a.length > 1 ? num(ev, a[1], ctx) : 1
    return s.slice(0, Math.max(0, n))
  }),
  fn('RIGHT', 'scalar', 'Texto', 1, 2, 'RIGHT(<texto>[, <número>])', 'Caracteres do fim do texto.', (ev, a, ctx) => {
    const s = text(ev, a[0], ctx)
    const n = a.length > 1 ? num(ev, a[1], ctx) : 1
    return n <= 0 ? '' : s.slice(-n)
  }),
  fn('MID', 'scalar', 'Texto', 3, 3, 'MID(<texto>, <início>, <número>)', 'Parte do texto a partir de uma posição.', (ev, a, ctx) => {
    const s = text(ev, a[0], ctx)
    const start = Math.max(1, num(ev, a[1], ctx))
    return s.substr(start - 1, Math.max(0, num(ev, a[2], ctx)))
  }),
  fn('LEN', 'scalar', 'Texto', 1, 1, 'LEN(<texto>)', 'Número de caracteres.', (ev, a, ctx) => text(ev, a[0], ctx).length),
  fn('UPPER', 'scalar', 'Texto', 1, 1, 'UPPER(<texto>)', 'Converte em maiúsculas.', (ev, a, ctx) => text(ev, a[0], ctx).toLocaleUpperCase('pt-BR')),
  fn('LOWER', 'scalar', 'Texto', 1, 1, 'LOWER(<texto>)', 'Converte em minúsculas.', (ev, a, ctx) => text(ev, a[0], ctx).toLocaleLowerCase('pt-BR')),
  fn('TRIM', 'scalar', 'Texto', 1, 1, 'TRIM(<texto>)', 'Remove espaços extras.', (ev, a, ctx) => text(ev, a[0], ctx).trim().replace(/ {2,}/g, ' ')),
  fn('SUBSTITUTE', 'scalar', 'Texto', 3, 4, 'SUBSTITUTE(<texto>, <antigo>, <novo>[, <ocorrência>])', 'Substitui texto.', (ev, a, ctx) => {
    const s = text(ev, a[0], ctx)
    const old = text(ev, a[1], ctx)
    const nw = text(ev, a[2], ctx)
    if (!old) return s
    if (a.length > 3) {
      const inst = Math.trunc(num(ev, a[3], ctx))
      let idx = -1
      for (let i = 0; i < inst; i++) {
        idx = s.indexOf(old, idx + 1)
        if (idx < 0) return s
      }
      return s.slice(0, idx) + nw + s.slice(idx + old.length)
    }
    return s.split(old).join(nw)
  }),
  fn('REPLACE', 'scalar', 'Texto', 4, 4, 'REPLACE(<texto>, <início>, <número>, <novo>)', 'Substitui parte do texto pela posição.', (ev, a, ctx) => {
    const s = text(ev, a[0], ctx)
    const start = Math.max(1, num(ev, a[1], ctx)) - 1
    const n = Math.max(0, num(ev, a[2], ctx))
    return s.slice(0, start) + text(ev, a[3], ctx) + s.slice(start + n)
  }),
  fn('SEARCH', 'scalar', 'Texto', 2, 4, 'SEARCH(<procurar>, <dentroDe>[, <início>[, <naoEncontrado>]])', 'Posição de um texto (sem diferenciar maiúsculas, aceita curingas).', (ev, a, ctx) => {
    const find = text(ev, a[0], ctx)
    const within = text(ev, a[1], ctx)
    const start = a.length > 2 && !isEmptyArg(a[2]) ? Math.max(1, num(ev, a[2], ctx)) : 1
    const m = wildcardRegex(find).exec(within.slice(start - 1))
    if (!m) {
      if (a.length > 3) return ev.scalar(a[3], ctx)
      throw new DaxError(`SEARCH: o texto "${find}" não foi encontrado.`)
    }
    return m.index + start
  }),
  fn('FIND', 'scalar', 'Texto', 2, 4, 'FIND(<procurar>, <dentroDe>[, <início>[, <naoEncontrado>]])', 'Posição de um texto (diferencia maiúsculas).', (ev, a, ctx) => {
    const find = text(ev, a[0], ctx)
    const within = text(ev, a[1], ctx)
    const start = a.length > 2 && !isEmptyArg(a[2]) ? Math.max(1, num(ev, a[2], ctx)) : 1
    const i = within.indexOf(find, start - 1)
    if (i < 0) {
      if (a.length > 3) return ev.scalar(a[3], ctx)
      throw new DaxError(`FIND: o texto "${find}" não foi encontrado.`)
    }
    return i + 1
  }),
  fn('CONTAINSSTRING', 'scalar', 'Texto', 2, 2, 'CONTAINSSTRING(<dentroDe>, <procurar>)', 'TRUE se contiver o texto (sem diferenciar maiúsculas).', (ev, a, ctx) =>
    wildcardRegex(text(ev, a[1], ctx)).test(text(ev, a[0], ctx))
  ),
  fn('CONTAINSSTRINGEXACT', 'scalar', 'Texto', 2, 2, 'CONTAINSSTRINGEXACT(<dentroDe>, <procurar>)', 'TRUE se contiver o texto (diferencia maiúsculas).', (ev, a, ctx) =>
    text(ev, a[0], ctx).includes(text(ev, a[1], ctx))
  ),
  fn('EXACT', 'scalar', 'Texto', 2, 2, 'EXACT(<texto1>, <texto2>)', 'TRUE se os textos forem idênticos.', (ev, a, ctx) => text(ev, a[0], ctx) === text(ev, a[1], ctx)),
  fn('REPT', 'scalar', 'Texto', 2, 2, 'REPT(<texto>, <vezes>)', 'Repete um texto.', (ev, a, ctx) => text(ev, a[0], ctx).repeat(Math.max(0, Math.trunc(num(ev, a[1], ctx))))),
  fn('VALUE', 'scalar', 'Texto', 1, 1, 'VALUE(<texto>)', 'Converte texto em número.', (ev, a, ctx) => {
    const v = ev.scalar(a[0], ctx)
    if (v === null) return null
    if (typeof v === 'number') return v
    if (v instanceof DateVal) return toNumber(v)
    const s = String(v).trim()
    const n = Number(s)
    if (!Number.isNaN(n) && s !== '') return n
    const p = parseNumber(s, ',') ?? parseNumber(s, '.')
    if (p === undefined) throw new DaxError(`Não é possível converter "${s}" em número.`)
    return p
  }),
  fn('FORMAT', 'scalar', 'Texto', 2, 3, 'FORMAT(<valor>, <formato>[, <localidade>])', 'Formata um valor como texto.', (ev, a, ctx) => {
    const v = ev.scalar(a[0], ctx)
    const f = text(ev, a[1], ctx)
    const loc = a.length > 2 ? text(ev, a[2], ctx) : ''
    const locale = /^en/i.test(loc) ? 'en-US' : loc ? 'pt-BR' : undefined
    if (v === null) return ''
    if (typeof v === 'string') {
      const n = Number(v)
      if (!Number.isNaN(n) && v.trim() !== '') return formatScalar(n, f, undefined, locale)
      return v
    }
    return formatScalar(v, f, undefined, locale)
  }),
  fn('FIXED', 'scalar', 'Texto', 1, 3, 'FIXED(<número>[, <casas>[, <semSeparador>]])', 'Formata com casas decimais fixas.', (ev, a, ctx) => {
    const v = num(ev, a[0], ctx)
    const d = a.length > 1 ? Math.trunc(num(ev, a[1], ctx)) : 2
    const noCommas = a.length > 2 && toBool(ev.scalar(a[2], ctx))
    return formatNumber(v, (noCommas ? '0' : '#,0') + (d > 0 ? '.' + '0'.repeat(d) : ''))
  }),
  fn('UNICHAR', 'scalar', 'Texto', 1, 1, 'UNICHAR(<número>)', 'Caractere Unicode.', (ev, a, ctx) => String.fromCodePoint(Math.trunc(num(ev, a[0], ctx)))),
  fn('UNICODE', 'scalar', 'Texto', 1, 1, 'UNICODE(<texto>)', 'Código do primeiro caractere.', (ev, a, ctx) => text(ev, a[0], ctx).codePointAt(0) ?? null),
  fn('TOCSV', 'scalar', 'Texto', 1, 4, 'TOCSV(<tabela>[, <máxLinhas>[, <delimitador>[, <incluirCabeçalho>]]])', 'Tabela como texto CSV.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx) as TableValue
    const max = a.length > 1 && !isEmptyArg(a[1]) ? num(ev, a[1], ctx) : 10
    const delim = a.length > 2 && !isEmptyArg(a[2]) ? text(ev, a[2], ctx) : ','
    const header = a.length > 3 ? toBool(ev.scalar(a[3], ctx)) : true
    const lines: string[] = []
    if (header) lines.push(tv.cols.map((c) => c.name).join(delim))
    for (let r = 0; r < Math.min(tv.rowCount, max); r++) lines.push(tv.rowValues(r).map(toText).join(delim))
    return lines.join('\n')
  })
])
