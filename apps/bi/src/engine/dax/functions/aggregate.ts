// Funções de agregação e iteradores.
import type { Node } from '../ast'
import type { Ctx } from '../context'
import type { Evaluator } from '../evaluator'
import { DaxError } from '../parser'
import { fn, register } from '../registry'
import { BaseTV, MatTV, type TableValue } from '../tablevalue'
import { compareValues, sortCompare, toNumber, toText } from '../values'
import { DateVal, type Scalar, isDateType } from '../../data/types'
import { serialToMs } from '../../data/dates'
import type { ColRT } from '../../model/runtime'

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

interface ColRows {
  col: ColRT
  rows: Int32Array
}

function colRows(ev: Evaluator, n: Node, ctx: Ctx, fname: string): ColRows {
  if (n.k !== 'ref') throw new DaxError(`${fname} aceita somente uma referência de coluna como argumento.`, n.pos)
  const col = ev.colArg(n, ctx)
  return { col, rows: ctx.fc.visibleRows(col.table) }
}

function wrapNum(col: ColRT, x: number): Scalar {
  if (x !== x) return null
  if (isDateType(col.type)) return new DateVal(x, col.type as 'date')
  return x
}

/** Valores numéricos (NaN = vazio) de uma coluna nas linhas dadas. */
function forEachNum(col: ColRT, rows: Int32Array, cb: (x: number) => void): void {
  const d = col.data
  if (d.data.kind === 'num') {
    const v = d.data.values
    for (let i = 0; i < rows.length; i++) cb(v[rows[i]])
    return
  }
  for (let i = 0; i < rows.length; i++) {
    const s = d.get(rows[i])
    if (s === null) cb(NaN)
    else if (typeof s === 'string') {
      const t = s.trim()
      cb(t === '' ? NaN : Number.isNaN(Number(t)) ? NaN : Number(t))
    } else cb(typeof s === 'boolean' ? (s ? 1 : 0) : typeof s === 'number' ? s : s.ms)
  }
}

function checkNumericColumn(col: ColRT, fname: string): void {
  if (col.type === 'text' || col.type === 'bool') {
    throw new DaxError(`A função ${fname} não pode trabalhar com valores do tipo ${col.type === 'text' ? 'Texto' : 'Verdadeiro/Falso'} (coluna ${col.qualifiedName}).`)
  }
}

/**
 * Compila uma expressão numérica simples sobre colunas de uma tabela base
 * (aritmética, constantes e RELATED) em uma função rápida por linha.
 */
export function compileNumeric(ev: Evaluator, n: Node, tv: BaseTV, ctx: Ctx): ((r: number) => number) | null {
  const t = tv.table
  const model = ev.model
  const rec = (x: Node): ((r: number) => number) | null => {
    switch (x.k) {
      case 'num': {
        const v = x.v
        return () => v
      }
      case 'ref': {
        let col: ColRT | undefined
        if (x.table) {
          const tt = model.table(x.table)
          if (tt !== t) return null
          col = ev.resolveColumn(t, x.name, x.level)
        } else {
          col = t.column(x.name)
          // [Nome] pode ser medida ou variável de linha de outro contexto
          if (!col) return null
        }
        if (!col) return null
        const data = col.data.data
        if (data.kind !== 'num' || isDateType(col.type)) return null
        const vals = data.values
        return (r) => vals[r]
      }
      case 'unary': {
        if (x.op === 'NOT') return null
        const e = rec(x.e)
        if (!e) return null
        return x.op === '-' ? (r) => -e(r) : e
      }
      case 'bin': {
        if (!['+', '-', '*', '/'].includes(x.op)) return null
        const a = rec(x.l)
        const b = rec(x.r)
        if (!a || !b) return null
        switch (x.op) {
          case '+':
            return (r) => {
              const p = a(r)
              const q = b(r)
              if (p !== p) return q !== q ? NaN : q
              return q !== q ? p : p + q
            }
          case '-':
            return (r) => {
              const p = a(r)
              const q = b(r)
              if (p !== p) return q !== q ? NaN : -q
              return q !== q ? p : p - q
            }
          case '*':
            return (r) => a(r) * b(r)
          default:
            return (r) => {
              const p = a(r)
              const q = b(r)
              if (p !== p) return NaN
              if (q !== q || q === 0) return p === 0 ? NaN : p > 0 ? Infinity : -Infinity
              return p / q
            }
        }
      }
      case 'call': {
        if (x.name === 'RELATED' && x.args.length === 1 && x.args[0].k === 'ref') {
          const col = ev.tryColArg(x.args[0], ctx)
          if (!col || col.table === t) return null
          const data = col.data.data
          if (data.kind !== 'num' || isDateType(col.type)) return null
          const path = model.manyToOnePath(t, col.table, ctx.fc.rel)
          if (!path) return null
          const n = t.rowCount
          const lk = new Int32Array(n)
          for (let r = 0; r < n; r++) lk[r] = model.relatedRow(t, r, col.table, ctx.fc.rel)
          const vals = data.values
          return (r) => {
            const rr = lk[r]
            return rr < 0 ? NaN : vals[rr]
          }
        }
        return null
      }
      default:
        return null
    }
  }
  return rec(n)
}

/** Avalia expr por linha retornando números (NaN = vazio) — usa caminho rápido quando possível. */
function numbersOf(ev: Evaluator, tv: TableValue, expr: Node, ctx: Ctx): { nums: Float64Array } {
  const n = tv.rowCount
  const out = new Float64Array(n)
  if (tv instanceof BaseTV) {
    const f = compileNumeric(ev, expr, tv, ctx)
    if (f) {
      const rows = tv.rows
      for (let i = 0; i < n; i++) {
        const r = rows[i]
        out[i] = r < 0 ? NaN : f(r)
      }
      return { nums: out }
    }
  }
  ev.iterate(tv, expr, ctx, (v, i) => {
    if (v === null) out[i] = NaN
    else if (typeof v === 'string' && v.trim() === '') out[i] = NaN
    else out[i] = toNumber(v)
  })
  return { nums: out }
}

function sumOf(nums: ArrayLike<number>): Scalar {
  let s = 0
  let any = false
  for (let i = 0; i < nums.length; i++) {
    const x = nums[i]
    if (x === x) {
      s += x
      any = true
    }
  }
  return any ? s : null
}

function percentile(sorted: number[], k: number, exclusive: boolean): number | null {
  const n = sorted.length
  if (n === 0) return null
  if (exclusive) {
    const rank = k * (n + 1)
    if (rank < 1 || rank > n) throw new DaxError('O valor de k está fora do intervalo permitido em PERCENTILE.EXC.')
    const lo = Math.floor(rank)
    const frac = rank - lo
    if (lo >= n) return sorted[n - 1]
    return sorted[lo - 1] + frac * (sorted[lo] - sorted[lo - 1])
  }
  if (k < 0 || k > 1) throw new DaxError('O valor de k deve estar entre 0 e 1.')
  const rank = k * (n - 1)
  const lo = Math.floor(rank)
  const frac = rank - lo
  if (lo + 1 >= n) return sorted[n - 1]
  return sorted[lo] + frac * (sorted[lo + 1] - sorted[lo])
}

function variance(vals: number[], sample: boolean): number | null {
  const n = vals.length
  if (n === 0 || (sample && n < 2)) return null
  let mean = 0
  for (const v of vals) mean += v
  mean /= n
  let ss = 0
  for (const v of vals) ss += (v - mean) * (v - mean)
  return ss / (sample ? n - 1 : n)
}

function colNumbers(c: ColRows): number[] {
  const out: number[] = []
  forEachNum(c.col, c.rows, (x) => {
    if (x === x) out.push(x)
  })
  return out
}

function iterNumbers(ev: Evaluator, args: Node[], ctx: Ctx): number[] {
  const tv = ev.table(args[0], ctx)
  const { nums } = numbersOf(ev, tv, args[1], ctx)
  const out: number[] = []
  for (let i = 0; i < nums.length; i++) if (nums[i] === nums[i]) out.push(nums[i])
  return out
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

register([
  fn('SUM', 'scalar', 'Agregação', 1, 1, 'SUM(<coluna>)', 'Soma todos os números de uma coluna.', (ev, a, ctx) => {
    const c = colRows(ev, a[0], ctx, 'SUM')
    checkNumericColumn(c.col, 'SUM')
    let s = 0
    let any = false
    forEachNum(c.col, c.rows, (x) => {
      if (x === x) {
        s += x
        any = true
      }
    })
    return any ? s : null
  }),
  fn('AVERAGE', 'scalar', 'Agregação', 1, 1, 'AVERAGE(<coluna>)', 'Média aritmética dos valores de uma coluna.', (ev, a, ctx) => {
    const c = colRows(ev, a[0], ctx, 'AVERAGE')
    checkNumericColumn(c.col, 'AVERAGE')
    let s = 0
    let n = 0
    forEachNum(c.col, c.rows, (x) => {
      if (x === x) {
        s += x
        n++
      }
    })
    return n ? s / n : null
  }),
  fn('MIN', 'scalar', 'Agregação', 1, 2, 'MIN(<coluna>) | MIN(<expr1>, <expr2>)', 'Menor valor de uma coluna ou entre dois valores.', (ev, a, ctx) => {
    if (a.length === 2) {
      const x = ev.scalar(a[0], ctx)
      const y = ev.scalar(a[1], ctx)
      if (x === null) return y
      if (y === null) return x
      return compareValues(x, y) <= 0 ? x : y
    }
    const c = colRows(ev, a[0], ctx, 'MIN')
    if (c.col.type === 'text') {
      let best: string | null = null
      for (let i = 0; i < c.rows.length; i++) {
        const v = c.col.data.get(c.rows[i]) as string | null
        if (v !== null && (best === null || compareValues(v, best) < 0)) best = v
      }
      return best
    }
    let m = Infinity
    forEachNum(c.col, c.rows, (x) => {
      if (x < m) m = x
    })
    return m === Infinity ? null : wrapNum(c.col, m)
  }),
  fn('MAX', 'scalar', 'Agregação', 1, 2, 'MAX(<coluna>) | MAX(<expr1>, <expr2>)', 'Maior valor de uma coluna ou entre dois valores.', (ev, a, ctx) => {
    if (a.length === 2) {
      const x = ev.scalar(a[0], ctx)
      const y = ev.scalar(a[1], ctx)
      if (x === null) return y
      if (y === null) return x
      return compareValues(x, y) >= 0 ? x : y
    }
    const c = colRows(ev, a[0], ctx, 'MAX')
    if (c.col.type === 'text') {
      let best: string | null = null
      for (let i = 0; i < c.rows.length; i++) {
        const v = c.col.data.get(c.rows[i]) as string | null
        if (v !== null && (best === null || compareValues(v, best) > 0)) best = v
      }
      return best
    }
    let m = -Infinity
    forEachNum(c.col, c.rows, (x) => {
      if (x > m) m = x
    })
    return m === -Infinity ? null : wrapNum(c.col, m)
  }),
  fn('COUNT', 'scalar', 'Agregação', 1, 1, 'COUNT(<coluna>)', 'Conta as linhas com valores não vazios na coluna.', (ev, a, ctx) => {
    const c = colRows(ev, a[0], ctx, 'COUNT')
    let n = 0
    const d = c.col.data
    for (let i = 0; i < c.rows.length; i++) if (!d.isBlank(c.rows[i])) n++
    return n || null
  }),
  fn('COUNTA', 'scalar', 'Agregação', 1, 1, 'COUNTA(<coluna>)', 'Conta as linhas não vazias da coluna (qualquer tipo).', (ev, a, ctx) => {
    const c = colRows(ev, a[0], ctx, 'COUNTA')
    let n = 0
    const d = c.col.data
    for (let i = 0; i < c.rows.length; i++) if (!d.isBlank(c.rows[i])) n++
    return n || null
  }),
  fn('COUNTBLANK', 'scalar', 'Agregação', 1, 1, 'COUNTBLANK(<coluna>)', 'Conta as células vazias da coluna.', (ev, a, ctx) => {
    const c = colRows(ev, a[0], ctx, 'COUNTBLANK')
    let n = 0
    const d = c.col.data
    for (let i = 0; i < c.rows.length; i++) {
      const v = d.get(c.rows[i])
      if (v === null || v === '') n++
    }
    return n || null
  }),
  fn('COUNTROWS', 'scalar', 'Agregação', 0, 1, 'COUNTROWS([<tabela>])', 'Conta as linhas de uma tabela.', (ev, a, ctx, call) => {
    if (a.length === 0) throw new DaxError('COUNTROWS requer uma tabela.', call.pos)
    if (a[0].k === 'table') {
      const t = ev.requireTable(a[0].name, a[0])
      const n = ctx.fc.visibleCount(t)
      return n || null
    }
    const n = ev.table(a[0], ctx).rowCount
    return n || null
  }),
  fn('DISTINCTCOUNT', 'scalar', 'Agregação', 1, 1, 'DISTINCTCOUNT(<coluna>)', 'Conta os valores distintos (inclui vazio).', (ev, a, ctx) => {
    const c = colRows(ev, a[0], ctx, 'DISTINCTCOUNT')
    const idx = c.col.valueIndex
    if (c.rows.length === c.col.table.rowCount) return idx.distinctCount || null
    const seen = new Uint8Array(idx.distinctCount)
    let n = 0
    for (let i = 0; i < c.rows.length; i++) {
      const id = idx.ids[c.rows[i]]
      if (!seen[id]) {
        seen[id] = 1
        n++
      }
    }
    return n || null
  }),
  fn('DISTINCTCOUNTNOBLANK', 'scalar', 'Agregação', 1, 1, 'DISTINCTCOUNTNOBLANK(<coluna>)', 'Conta os valores distintos, ignorando vazios.', (ev, a, ctx) => {
    const c = colRows(ev, a[0], ctx, 'DISTINCTCOUNTNOBLANK')
    const idx = c.col.valueIndex
    const seen = new Uint8Array(idx.distinctCount)
    let n = 0
    for (let i = 0; i < c.rows.length; i++) {
      const id = idx.ids[c.rows[i]]
      if (!seen[id] && id !== idx.blankId) {
        seen[id] = 1
        n++
      }
    }
    return n || null
  }),
  fn('MEDIAN', 'scalar', 'Estatística', 1, 1, 'MEDIAN(<coluna>)', 'Mediana dos valores da coluna.', (ev, a, ctx) => {
    const vals = colNumbers(colRows(ev, a[0], ctx, 'MEDIAN')).sort((x, y) => x - y)
    return percentile(vals, 0.5, false)
  }),
  fn('PRODUCT', 'scalar', 'Matemática', 1, 1, 'PRODUCT(<coluna>)', 'Produto dos valores da coluna.', (ev, a, ctx) => {
    const vals = colNumbers(colRows(ev, a[0], ctx, 'PRODUCT'))
    if (!vals.length) return null
    return vals.reduce((p, x) => p * x, 1)
  }),
  fn('STDEV.S', 'scalar', 'Estatística', 1, 1, 'STDEV.S(<coluna>)', 'Desvio padrão amostral.', (ev, a, ctx) => {
    const v = variance(colNumbers(colRows(ev, a[0], ctx, 'STDEV.S')), true)
    return v === null ? null : Math.sqrt(v)
  }),
  fn('STDEV.P', 'scalar', 'Estatística', 1, 1, 'STDEV.P(<coluna>)', 'Desvio padrão populacional.', (ev, a, ctx) => {
    const v = variance(colNumbers(colRows(ev, a[0], ctx, 'STDEV.P')), false)
    return v === null ? null : Math.sqrt(v)
  }),
  fn('VAR.S', 'scalar', 'Estatística', 1, 1, 'VAR.S(<coluna>)', 'Variância amostral.', (ev, a, ctx) => variance(colNumbers(colRows(ev, a[0], ctx, 'VAR.S')), true)),
  fn('VAR.P', 'scalar', 'Estatística', 1, 1, 'VAR.P(<coluna>)', 'Variância populacional.', (ev, a, ctx) => variance(colNumbers(colRows(ev, a[0], ctx, 'VAR.P')), false)),
  fn('PERCENTILE.INC', 'scalar', 'Estatística', 2, 2, 'PERCENTILE.INC(<coluna>, <k>)', 'k-ésimo percentil (inclusivo).', (ev, a, ctx) => {
    const vals = colNumbers(colRows(ev, a[0], ctx, 'PERCENTILE.INC')).sort((x, y) => x - y)
    return percentile(vals, toNumber(ev.scalar(a[1], ctx)), false)
  }),
  fn('PERCENTILE.EXC', 'scalar', 'Estatística', 2, 2, 'PERCENTILE.EXC(<coluna>, <k>)', 'k-ésimo percentil (exclusivo).', (ev, a, ctx) => {
    const vals = colNumbers(colRows(ev, a[0], ctx, 'PERCENTILE.EXC')).sort((x, y) => x - y)
    return percentile(vals, toNumber(ev.scalar(a[1], ctx)), true)
  }),
  fn('GEOMEAN', 'scalar', 'Estatística', 1, 1, 'GEOMEAN(<coluna>)', 'Média geométrica.', (ev, a, ctx) => {
    const vals = colNumbers(colRows(ev, a[0], ctx, 'GEOMEAN'))
    if (!vals.length) return null
    if (vals.some((v) => v <= 0)) throw new DaxError('GEOMEAN requer valores positivos.')
    return Math.exp(vals.reduce((s, v) => s + Math.log(v), 0) / vals.length)
  }),

  // ---- Iteradores ----
  fn('SUMX', 'scalar', 'Agregação', 2, 2, 'SUMX(<tabela>, <expressão>)', 'Soma uma expressão avaliada para cada linha da tabela.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    const { nums } = numbersOf(ev, tv, a[1], ctx)
    return sumOf(nums)
  }),
  fn('AVERAGEX', 'scalar', 'Agregação', 2, 2, 'AVERAGEX(<tabela>, <expressão>)', 'Média de uma expressão avaliada por linha.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    const { nums } = numbersOf(ev, tv, a[1], ctx)
    let s = 0
    let n = 0
    for (let i = 0; i < nums.length; i++) {
      const x = nums[i]
      if (x === x) {
        s += x
        n++
      }
    }
    return n ? s / n : null
  }),
  fn('MINX', 'scalar', 'Agregação', 2, 2, 'MINX(<tabela>, <expressão>)', 'Menor valor de uma expressão avaliada por linha.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    let best: Scalar = null
    ev.iterate(tv, a[1], ctx, (v) => {
      if (v !== null && (best === null || sortCompare(v, best) < 0)) best = v
    })
    return best
  }),
  fn('MAXX', 'scalar', 'Agregação', 2, 2, 'MAXX(<tabela>, <expressão>)', 'Maior valor de uma expressão avaliada por linha.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    let best: Scalar = null
    ev.iterate(tv, a[1], ctx, (v) => {
      if (v !== null && (best === null || sortCompare(v, best) > 0)) best = v
    })
    return best
  }),
  fn('COUNTX', 'scalar', 'Agregação', 2, 2, 'COUNTX(<tabela>, <expressão>)', 'Conta as linhas em que a expressão não é vazia.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    let n = 0
    ev.iterate(tv, a[1], ctx, (v) => {
      if (v !== null) n++
    })
    return n || null
  }),
  fn('COUNTAX', 'scalar', 'Agregação', 2, 2, 'COUNTAX(<tabela>, <expressão>)', 'Conta as linhas em que a expressão não é vazia.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    let n = 0
    ev.iterate(tv, a[1], ctx, (v) => {
      if (v !== null) n++
    })
    return n || null
  }),
  fn('MEDIANX', 'scalar', 'Estatística', 2, 2, 'MEDIANX(<tabela>, <expressão>)', 'Mediana de uma expressão por linha.', (ev, a, ctx) => {
    return percentile(iterNumbers(ev, a, ctx).sort((x, y) => x - y), 0.5, false)
  }),
  fn('PRODUCTX', 'scalar', 'Matemática', 2, 2, 'PRODUCTX(<tabela>, <expressão>)', 'Produto de uma expressão por linha.', (ev, a, ctx) => {
    const vals = iterNumbers(ev, a, ctx)
    return vals.length ? vals.reduce((p, x) => p * x, 1) : null
  }),
  fn('STDEVX.S', 'scalar', 'Estatística', 2, 2, 'STDEVX.S(<tabela>, <expressão>)', 'Desvio padrão amostral de uma expressão.', (ev, a, ctx) => {
    const v = variance(iterNumbers(ev, a, ctx), true)
    return v === null ? null : Math.sqrt(v)
  }),
  fn('STDEVX.P', 'scalar', 'Estatística', 2, 2, 'STDEVX.P(<tabela>, <expressão>)', 'Desvio padrão populacional de uma expressão.', (ev, a, ctx) => {
    const v = variance(iterNumbers(ev, a, ctx), false)
    return v === null ? null : Math.sqrt(v)
  }),
  fn('VARX.S', 'scalar', 'Estatística', 2, 2, 'VARX.S(<tabela>, <expressão>)', 'Variância amostral de uma expressão.', (ev, a, ctx) => variance(iterNumbers(ev, a, ctx), true)),
  fn('VARX.P', 'scalar', 'Estatística', 2, 2, 'VARX.P(<tabela>, <expressão>)', 'Variância populacional de uma expressão.', (ev, a, ctx) => variance(iterNumbers(ev, a, ctx), false)),
  fn('PERCENTILEX.INC', 'scalar', 'Estatística', 3, 3, 'PERCENTILEX.INC(<tabela>, <expressão>, <k>)', 'Percentil inclusivo de uma expressão.', (ev, a, ctx) => {
    return percentile(iterNumbers(ev, a, ctx).sort((x, y) => x - y), toNumber(ev.scalar(a[2], ctx)), false)
  }),
  fn('PERCENTILEX.EXC', 'scalar', 'Estatística', 3, 3, 'PERCENTILEX.EXC(<tabela>, <expressão>, <k>)', 'Percentil exclusivo de uma expressão.', (ev, a, ctx) => {
    return percentile(iterNumbers(ev, a, ctx).sort((x, y) => x - y), toNumber(ev.scalar(a[2], ctx)), true)
  }),
  fn('GEOMEANX', 'scalar', 'Estatística', 2, 2, 'GEOMEANX(<tabela>, <expressão>)', 'Média geométrica de uma expressão.', (ev, a, ctx) => {
    const vals = iterNumbers(ev, a, ctx)
    if (!vals.length) return null
    return Math.exp(vals.reduce((s, v) => s + Math.log(v), 0) / vals.length)
  }),
  fn(
    'CONCATENATEX',
    'scalar',
    'Texto',
    2,
    Infinity,
    'CONCATENATEX(<tabela>, <expressão>[, <delimitador>[, <ordenarPor>[, <ordem>]]...])',
    'Concatena o resultado de uma expressão para cada linha.',
    (ev, a, ctx) => {
      const tv = ev.table(a[0], ctx)
      const vals = ev.mapRows(tv, a[1], ctx)
      const delim = a.length > 2 ? toText(ev.scalar(a[2], ctx)) : ''
      let order = vals.map((_, i) => i)
      if (a.length > 3) {
        const keys: { vals: Scalar[]; desc: boolean }[] = []
        for (let i = 3; i < a.length; i += 2) {
          const ord = a[i + 1]
          const desc = !!ord && ord.k === 'kw' && ord.v === 'DESC'
          keys.push({ vals: ev.mapRows(tv, a[i], ctx), desc })
        }
        order = order.sort((x, y) => {
          for (const k of keys) {
            const c = sortCompare(k.vals[x], k.vals[y])
            if (c) return k.desc ? -c : c
          }
          return x - y
        })
      }
      const parts: string[] = []
      for (const i of order) parts.push(toText(vals[i]))
      return parts.join(delim)
    }
  ),
  fn(
    'RANKX',
    'scalar',
    'Estatística',
    2,
    5,
    'RANKX(<tabela>, <expressão>[, <valor>[, <ordem>[, <empates>]]])',
    'Classificação de um valor entre os valores da expressão avaliada em cada linha da tabela.',
    (ev, a, ctx) => {
      const tv = ev.table(a[0], ctx)
      const vals = ev.mapRows(tv, a[1], ctx)
      const value = a.length > 2 && !(a[2].k === 'kw' && a[2].v === 'EMPTY') ? ev.scalar(a[2], ctx) : ev.scalar(a[1], ctx)
      const ordNode = a[3]
      const asc = !!ordNode && ((ordNode.k === 'kw' && ordNode.v === 'ASC') || (ordNode.k === 'num' && ordNode.v === 1))
      const dense = !!a[4] && a[4].k === 'kw' && a[4].v === 'DENSE'
      if (value === null && vals.every((v) => v === null)) return null
      const cmp = (x: Scalar, y: Scalar) => {
        const c = sortCompare(x === null ? 0 : x, y === null ? 0 : y)
        return asc ? c : -c
      }
      if (dense) {
        const distinct: Scalar[] = []
        const sorted = [...vals].sort(cmp)
        for (const v of sorted) if (!distinct.length || cmp(distinct[distinct.length - 1], v) !== 0) distinct.push(v)
        let rank = 1
        for (const v of distinct) {
          if (cmp(v, value) < 0) rank++
        }
        return rank
      }
      let rank = 1
      for (const v of vals) if (cmp(v, value) < 0) rank++
      return rank
    }
  ),
  fn('RANK.EQ', 'scalar', 'Estatística', 2, 3, 'RANK.EQ(<valor>, <coluna>[, <ordem>])', 'Classificação de um número em uma coluna.', (ev, a, ctx) => {
    const value = ev.scalar(a[0], ctx)
    const col = ev.colArg(a[1], ctx)
    const asc = a.length > 2 && toNumber(ev.scalar(a[2], ctx)) !== 0
    const rows = ctx.fc.visibleRows(col.table)
    let rank = 1
    for (let i = 0; i < rows.length; i++) {
      const v = col.data.get(rows[i])
      if (v === null) continue
      const c = sortCompare(v, value)
      if (asc ? c < 0 : c > 0) rank++
    }
    return value === null ? null : rank
  })
])

// Exportado para outras funções (ex.: VQ)
export { numbersOf, sumOf }

/** Valores (número/data) de uma expressão sobre uma tabela; útil para MIN/MAX de datas. */
export function toDateIfSerial(x: number): DateVal {
  return new DateVal(serialToMs(x), 'date')
}

export function tableColumnValues(tv: TableValue, col: number): Scalar[] {
  const out: Scalar[] = new Array(tv.rowCount)
  for (let r = 0; r < tv.rowCount; r++) out[r] = tv.get(r, col)
  return out
}

export function singleColumnTable(name: string, values: Scalar[]): MatTV {
  return new MatTV([{ name, lineage: null, type: 'any' }], [values], values.length)
}
