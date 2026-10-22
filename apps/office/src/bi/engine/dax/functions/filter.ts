// Funções de filtro e de relações.
import type { Node } from '../ast'
import type { Ctx } from '../context'
import type { Evaluator } from '../evaluator'
import { DaxError } from '../parser'
import { fn, register } from '../registry'
import { BaseTV, MatTV, TableValue, materialize, type TVCol } from '../tablevalue'
import { compareOp, sortCompare, toBool, toNumber } from '../values'
import type { Scalar } from '../../data/types'
import { type ColRT, type TableRT, normKey } from '../../model/runtime'
import { tupleKey } from '../filter'

function onlyInCalculate(name: string) {
  return () => {
    throw new DaxError(`A função ${name} só pode ser usada como argumento de filtro do CALCULATE.`)
  }
}

function allTable(ev: Evaluator, t: TableRT, blankRow: boolean): BaseTV {
  const all = t.allRows()
  if (blankRow && ev.hasBlankRow(t)) {
    const rows = new Int32Array(all.length + 1)
    rows.set(all)
    rows[all.length] = -1
    return new BaseTV(t, rows)
  }
  return new BaseTV(t, all)
}

function columnsArgs(ev: Evaluator, args: Node[], ctx: Ctx): ColRT[] {
  return args.filter((a) => !(a.k === 'kw' && a.v === 'EMPTY')).map((a) => ev.colArg(a, ctx))
}

/** Valores distintos de um conjunto de colunas em linhas dadas. */
function distinctCombos(cols: ColRT[], rows: Int32Array): MatTV {
  const tvCols: TVCol[] = cols.map((c) => ({ name: c.name, lineage: c, type: c.type }))
  const idx = cols.map((c) => c.valueIndex)
  const seen = new Set<string>()
  const data: Scalar[][] = cols.map(() => [])
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    let key = ''
    for (let c = 0; c < cols.length; c++) key += (c ? ',' : '') + idx[c].ids[r]
    if (seen.has(key)) continue
    seen.add(key)
    for (let c = 0; c < cols.length; c++) data[c].push(idx[c].values[idx[c].ids[r]])
  }
  return new MatTV(tvCols, data)
}

/** Linhas distintas de uma tabela qualquer. */
export function distinctRows(tv: TableValue): TableValue {
  const seen = new Set<string>()
  const keep: number[] = []
  for (let r = 0; r < tv.rowCount; r++) {
    const key = tupleKey(tv.rowValues(r).map(normKey))
    if (seen.has(key)) continue
    seen.add(key)
    keep.push(r)
  }
  if (keep.length === tv.rowCount) return tv
  return tv.pick(keep)
}

function relatedValue(ev: Evaluator, col: ColRT, ctx: Ctx, call: Node): Scalar {
  for (let i = ctx.frames.length - 1; i >= 0; i--) {
    const f = ctx.frames[i]
    const bt = f.tv.baseTable()
    if (!bt) {
      const idx = f.tv.colByLineage(col)
      if (idx >= 0) return f.tv.get(f.row, idx)
      continue
    }
    const br = f.tv.baseRow(f.row)
    if (bt === col.table) return br < 0 ? null : col.data.get(br)
    const path = ev.model.manyToOnePath(bt, col.table, ctx.fc.rel)
    if (!path) continue
    if (br < 0) return null
    const rr = ev.model.relatedRow(bt, br, col.table, ctx.fc.rel)
    return rr < 0 ? null : col.data.get(rr)
  }
  throw new DaxError(
    `A coluna ${col.qualifiedName} usada em RELATED não está relacionada a nenhuma tabela do contexto de linha atual (é preciso uma relação muitos-para-um).`,
    call.pos
  )
}

function earlier(ev: Evaluator, col: ColRT, ctx: Ctx, skip: number, earliest: boolean, call: Node): Scalar {
  const hits: Scalar[] = []
  for (let i = ctx.frames.length - 1; i >= 0; i--) {
    const f = ctx.frames[i]
    const tv = f.tv
    if (tv instanceof BaseTV) {
      if (tv.table === col.table) {
        const r = tv.rows[f.row]
        hits.push(r < 0 ? null : col.data.get(r))
      }
      continue
    }
    const idx = tv.colByLineage(col)
    if (idx >= 0) hits.push(tv.get(f.row, idx))
  }
  if (earliest) {
    if (hits.length < 2) throw new DaxError('EARLIEST requer pelo menos dois contextos de linha.', call.pos)
    return hits[hits.length - 1]
  }
  if (hits.length <= skip) {
    throw new DaxError(`EARLIER/EARLIEST referencia um contexto de linha anterior inexistente para ${col.qualifiedName}.`, call.pos)
  }
  return hits[skip]
}

function sortedValues(values: Scalar[]): Scalar[] {
  return [...values].sort(sortCompare)
}

function nonBlank(ev: Evaluator, a: Node[], ctx: Ctx, last: boolean, returnValue: boolean): Scalar | TableValue {
  let col: ColRT | null = null
  let tv: TableValue
  if (a[0].k === 'ref') {
    col = ev.colArg(a[0], ctx)
    tv = ev.distinctValues(col, ctx.fc, true)
  } else tv = ev.table(a[0], ctx)
  const order = tv.rowCount ? sortedValues(Array.from({ length: tv.rowCount }, (_, i) => tv.get(i, 0))) : []
  const mat = new MatTV(tv.cols.slice(0, 1), [order], order.length)
  const frame = { tv: mat as TableValue, row: 0 }
  const inner = ctx.withFrame(frame)
  const n = mat.rowCount
  for (let k = 0; k < n; k++) {
    const r = last ? n - 1 - k : k
    frame.row = r
    const v = ev.scalar(a[1], inner)
    if (v !== null) {
      if (returnValue) return v
      return new MatTV(mat.cols, [[mat.get(r, 0)]], 1)
    }
  }
  if (returnValue) return null
  return MatTV.empty(mat.cols)
}

register([
  fn('CALCULATE', 'scalar', 'Filtro', 1, Infinity, 'CALCULATE(<expressão>[, <filtro1>[, <filtro2>...]])', 'Avalia uma expressão em um contexto de filtro modificado.', (ev, a, ctx) => {
    const c2 = ev.calculateCtx(a.slice(1), ctx)
    return ev.scalar(a[0], c2)
  }),
  fn('CALCULATETABLE', 'table', 'Filtro', 1, Infinity, 'CALCULATETABLE(<tabela>[, <filtro1>...])', 'Avalia uma expressão de tabela em um contexto de filtro modificado.', (ev, a, ctx) => {
    const c2 = ev.calculateCtx(a.slice(1), ctx)
    return ev.table(a[0], c2)
  }),
  fn('FILTER', 'table', 'Filtro', 2, 2, 'FILTER(<tabela>, <condição>)', 'Retorna as linhas da tabela que atendem à condição.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    const keep: number[] = []
    ev.iterate(tv, a[1], ctx, (v, r) => {
      if (toBool(v)) keep.push(r)
    })
    if (keep.length === tv.rowCount) return tv
    return tv.pick(keep)
  }),
  fn('ALL', 'table', 'Filtro', 0, Infinity, 'ALL([<tabela> | <coluna>[, <coluna>...]])', 'Retorna todas as linhas/valores, ignorando filtros.', (ev, a, ctx, call) => {
    if (a.length === 0) throw new DaxError('ALL() sem argumentos só pode ser usado dentro do CALCULATE.', call.pos)
    if (a[0].k === 'table') return allTable(ev, ev.requireTable(a[0].name, a[0]), true)
    if (a[0].k !== 'ref') {
      const tv = ev.table(a[0], ctx)
      const bt = tv.baseTable()
      if (bt) return allTable(ev, bt, true)
      throw new DaxError('ALL requer uma tabela ou colunas.', call.pos)
    }
    const cols = columnsArgs(ev, a, ctx)
    if (cols.some((c) => c.table !== cols[0].table)) throw new DaxError('As colunas de ALL devem ser da mesma tabela.', call.pos)
    return ev.allCombos(cols)
  }),
  fn('ALLNOBLANKROW', 'table', 'Filtro', 1, Infinity, 'ALLNOBLANKROW(<tabela> | <coluna>...)', 'Como ALL, sem a linha em branco.', (ev, a, ctx) => {
    if (a[0].k === 'table') return allTable(ev, ev.requireTable(a[0].name, a[0]), false)
    const cols = columnsArgs(ev, a, ctx)
    const all = ev.allCombos(cols)
    const keep: number[] = []
    for (let r = 0; r < all.rowCount; r++) {
      if (cols.length === 1 && all.get(r, 0) === null && cols[0].valueIndex.blankId < 0) continue
      keep.push(r)
    }
    return all.pick(keep)
  }),
  fn('ALLEXCEPT', 'table', 'Filtro', 2, Infinity, 'ALLEXCEPT(<tabela>, <coluna>[, <coluna>...])', 'Remove todos os filtros da tabela, exceto das colunas indicadas.', (ev, a, ctx) => {
    const t = ev.tableArgBase(a[0], ctx)
    const keep = new Set(columnsArgs(ev, a.slice(1), ctx))
    const cols = t.baseColumns.filter((c) => !keep.has(c))
    return distinctCombos(cols, t.allRows())
  }),
  fn('ALLSELECTED', 'table', 'Filtro', 0, Infinity, 'ALLSELECTED([<tabela> | <coluna>...])', 'Valores visíveis no contexto externo (seleção do visual).', (ev, a, ctx, call) => {
    if (a.length === 0) throw new DaxError('ALLSELECTED() sem argumentos só pode ser usado dentro do CALCULATE.', call.pos)
    const fc = ctx.fc.shadow ?? ev.emptyCtx().fc
    if (a[0].k === 'table') {
      const t = ev.requireTable(a[0].name, a[0])
      return new BaseTV(t, fc.visibleRows(t))
    }
    const cols = columnsArgs(ev, a, ctx)
    if (cols.length === 1) return ev.distinctValues(cols[0], fc, true)
    return distinctCombos(cols, fc.visibleRows(cols[0].table))
  }),
  fn('ALLCROSSFILTERED', 'table', 'Filtro', 1, 1, 'ALLCROSSFILTERED(<tabela>)', 'Remove todos os filtros da tabela.', onlyInCalculate('ALLCROSSFILTERED')),
  fn('REMOVEFILTERS', 'table', 'Filtro', 0, Infinity, 'REMOVEFILTERS([<tabela> | <coluna>...])', 'Remove filtros (somente dentro do CALCULATE).', onlyInCalculate('REMOVEFILTERS')),
  fn('USERELATIONSHIP', 'scalar', 'Relação', 2, 2, 'USERELATIONSHIP(<coluna1>, <coluna2>)', 'Ativa uma relação inativa no CALCULATE.', onlyInCalculate('USERELATIONSHIP')),
  fn('CROSSFILTER', 'scalar', 'Relação', 3, 3, 'CROSSFILTER(<coluna1>, <coluna2>, <direção>)', 'Altera a direção de filtragem de uma relação no CALCULATE.', onlyInCalculate('CROSSFILTER')),
  fn('KEEPFILTERS', 'table', 'Filtro', 1, 1, 'KEEPFILTERS(<expressão>)', 'Mantém os filtros existentes ao aplicar um novo filtro no CALCULATE.', (ev, a, ctx) => ev.table(a[0], ctx)),
  fn('VALUES', 'table', 'Filtro', 1, 1, 'VALUES(<coluna> | <tabela>)', 'Valores distintos visíveis (inclui a linha em branco).', (ev, a, ctx) => {
    if (a[0].k === 'ref') return ev.distinctValues(ev.colArg(a[0], ctx), ctx.fc, true)
    if (a[0].k === 'table') {
      const t = ev.requireTable(a[0].name, a[0])
      const rows = ctx.fc.visibleRows(t)
      if (ev.blankRowVisible(t, ctx.fc)) {
        const out = new Int32Array(rows.length + 1)
        out.set(rows)
        out[rows.length] = -1
        return new BaseTV(t, out)
      }
      return new BaseTV(t, rows)
    }
    return distinctRows(ev.table(a[0], ctx))
  }),
  fn('DISTINCT', 'table', 'Filtro', 1, 1, 'DISTINCT(<coluna> | <tabela>)', 'Valores (ou linhas) distintos.', (ev, a, ctx) => {
    if (a[0].k === 'ref') return ev.distinctValues(ev.colArg(a[0], ctx), ctx.fc, false)
    return distinctRows(ev.table(a[0], ctx))
  }),
  fn('RELATED', 'scalar', 'Relação', 1, 1, 'RELATED(<coluna>)', 'Valor relacionado de outra tabela (lado "um").', (ev, a, ctx, call) => {
    return relatedValue(ev, ev.colArg(a[0], ctx), ctx, call)
  }),
  fn('RELATEDTABLE', 'table', 'Relação', 1, 1, 'RELATEDTABLE(<tabela>)', 'Linhas relacionadas da tabela (lado "muitos").', (ev, a, ctx) => {
    const c2 = ev.calculateCtx([], ctx)
    return ev.table(a[0], c2)
  }),
  fn('SELECTEDVALUE', 'scalar', 'Filtro', 1, 2, 'SELECTEDVALUE(<coluna>[, <resultadoAlternativo>])', 'Valor da coluna quando há exatamente um valor no contexto.', (ev, a, ctx) => {
    const v = ev.distinctValues(ev.colArg(a[0], ctx), ctx.fc, true)
    if (v.rowCount === 1) return v.get(0, 0)
    return a.length > 1 ? ev.scalar(a[1], ctx) : null
  }),
  fn('HASONEVALUE', 'scalar', 'Informação', 1, 1, 'HASONEVALUE(<coluna>)', 'TRUE quando o contexto contém exatamente um valor para a coluna.', (ev, a, ctx) => {
    return ev.distinctValues(ev.colArg(a[0], ctx), ctx.fc, true).rowCount === 1
  }),
  fn('HASONEFILTER', 'scalar', 'Informação', 1, 1, 'HASONEFILTER(<coluna>)', 'TRUE quando a coluna tem um filtro direto com um único valor.', (ev, a, ctx) => {
    const col = ev.colArg(a[0], ctx)
    const fs = ctx.fc.filtersOn(col)
    if (fs.length === 0) return false
    return ev.distinctValues(col, ctx.fc, true).rowCount === 1
  }),
  fn('ISFILTERED', 'scalar', 'Informação', 1, 1, 'ISFILTERED(<coluna> | <tabela>)', 'TRUE quando há filtro direto na coluna/tabela.', (ev, a, ctx) => {
    if (a[0].k === 'table') {
      const t = ev.requireTable(a[0].name, a[0])
      return t.columns.some((c) => ctx.fc.isColumnFiltered(c))
    }
    return ctx.fc.isColumnFiltered(ev.colArg(a[0], ctx))
  }),
  fn('ISCROSSFILTERED', 'scalar', 'Informação', 1, 1, 'ISCROSSFILTERED(<coluna> | <tabela>)', 'TRUE quando a coluna/tabela é filtrada direta ou indiretamente.', (ev, a, ctx) => {
    const t = a[0].k === 'table' ? ev.requireTable(a[0].name, a[0]) : ev.colArg(a[0], ctx).table
    if (t.columns.some((c) => ctx.fc.isColumnFiltered(c))) return true
    return ctx.fc.visibleCount(t) < t.rowCount
  }),
  fn('ISINSCOPE', 'scalar', 'Informação', 1, 1, 'ISINSCOPE(<coluna>)', 'TRUE quando a coluna é um nível de agrupamento do visual.', (ev, a, ctx) => {
    const col = ev.colArg(a[0], ctx)
    return ctx.fc.filters.some((f) => f.kind === 'values' && f.isGroup && f.cols.includes(col))
  }),
  fn('EARLIER', 'scalar', 'Filtro', 1, 2, 'EARLIER(<coluna>[, <número>])', 'Valor da coluna em um contexto de linha externo.', (ev, a, ctx, call) => {
    const n = a.length > 1 ? toNumber(ev.scalar(a[1], ctx)) : 1
    return earlier(ev, ev.colArg(a[0], ctx), ctx, n, false, call)
  }),
  fn('EARLIEST', 'scalar', 'Filtro', 1, 1, 'EARLIEST(<coluna>)', 'Valor da coluna no contexto de linha mais externo.', (ev, a, ctx, call) => {
    return earlier(ev, ev.colArg(a[0], ctx), ctx, 0, true, call)
  }),
  fn(
    'LOOKUPVALUE',
    'scalar',
    'Filtro',
    3,
    Infinity,
    'LOOKUPVALUE(<colunaResultado>, <colunaBusca>, <valorBusca>[, ...][, <alternativo>])',
    'Procura um valor em uma tabela (como PROCV).',
    (ev, a, ctx, call) => {
      const result = ev.colArg(a[0], ctx)
      const pairs = a.length - 1
      const hasAlt = pairs % 2 === 1
      const nPairs = Math.floor(pairs / 2)
      const t = result.table
      let candidates: Int32Array | null = null
      for (let i = 0; i < nPairs; i++) {
        const sc = ev.colArg(a[1 + i * 2], ctx)
        if (sc.table !== t && !ev.model.manyToOnePath(t, sc.table)) {
          throw new DaxError('As colunas de busca do LOOKUPVALUE devem pertencer à mesma tabela (ou relacionadas).', call.pos)
        }
        const v = ev.scalar(a[2 + i * 2], ctx)
        const rows: number[] = []
        if (sc.table === t) {
          const idx = sc.valueIndex
          const id = idx.idOf(v)
          if (id >= 0) for (const r of idx.rowsOf(id)) rows.push(r)
        } else {
          const n = t.rowCount
          for (let r = 0; r < n; r++) {
            const rr = ev.model.relatedRow(t, r, sc.table)
            if (rr >= 0 && compareOp('=', sc.data.get(rr), v)) rows.push(r)
          }
        }
        const sorted = Int32Array.from(rows).sort()
        if (!candidates) candidates = sorted
        else {
          const set = new Set(sorted)
          candidates = candidates.filter((r) => set.has(r))
        }
        if (candidates.length === 0) break
      }
      if (!candidates || candidates.length === 0) return hasAlt ? ev.scalar(a[a.length - 1], ctx) : null
      const first = result.data.get(candidates[0])
      for (let i = 1; i < candidates.length; i++) {
        const v = result.data.get(candidates[i])
        if (sortCompare(v, first) !== 0) {
          if (hasAlt) return ev.scalar(a[a.length - 1], ctx)
          throw new DaxError('LOOKUPVALUE encontrou vários valores diferentes para os critérios informados.', call.pos)
        }
      }
      return first
    }
  ),
  fn('FIRSTNONBLANK', 'table', 'Filtro', 2, 2, 'FIRSTNONBLANK(<coluna>, <expressão>)', 'Primeiro valor da coluna para o qual a expressão não é vazia.', (ev, a, ctx) => nonBlank(ev, a, ctx, false, false) as TableValue),
  fn('LASTNONBLANK', 'table', 'Filtro', 2, 2, 'LASTNONBLANK(<coluna>, <expressão>)', 'Último valor da coluna para o qual a expressão não é vazia.', (ev, a, ctx) => nonBlank(ev, a, ctx, true, false) as TableValue),
  fn('FIRSTNONBLANKVALUE', 'scalar', 'Filtro', 2, 2, 'FIRSTNONBLANKVALUE(<coluna>, <expressão>)', 'Primeiro valor não vazio da expressão.', (ev, a, ctx) => nonBlank(ev, a, ctx, false, true) as Scalar),
  fn('LASTNONBLANKVALUE', 'scalar', 'Filtro', 2, 2, 'LASTNONBLANKVALUE(<coluna>, <expressão>)', 'Último valor não vazio da expressão.', (ev, a, ctx) => nonBlank(ev, a, ctx, true, true) as Scalar),
  fn('CONTAINS', 'scalar', 'Informação', 3, Infinity, 'CONTAINS(<tabela>, <coluna>, <valor>[, ...])', 'TRUE se existir uma linha com os valores indicados.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    const conds: { idx: number; v: Scalar }[] = []
    for (let i = 1; i + 1 < a.length; i += 2) {
      const col = ev.colArg(a[i], ctx)
      let idx = tv.colByLineage(col)
      if (idx < 0) idx = tv.colByName(col.name)
      if (idx < 0) throw new DaxError(`A coluna ${col.qualifiedName} não faz parte da tabela de CONTAINS.`)
      conds.push({ idx, v: ev.scalar(a[i + 1], ctx) })
    }
    for (let r = 0; r < tv.rowCount; r++) {
      if (conds.every((c) => safeEquals(tv.get(r, c.idx), c.v))) return true
    }
    return false
  }),
  fn('CONTAINSROW', 'scalar', 'Informação', 2, Infinity, 'CONTAINSROW(<tabela>, <valor>[, ...])', 'TRUE se a tabela contém a linha.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    const vals = a.slice(1).map((x) => ev.scalar(x, ctx))
    for (let r = 0; r < tv.rowCount; r++) if (vals.every((v, i) => safeEquals(tv.get(r, i), v, true))) return true
    return false
  }),
  fn('TREATAS', 'table', 'Filtro', 2, Infinity, 'TREATAS(<tabela>, <coluna>[, <coluna>...])', 'Aplica os valores de uma tabela como filtro em outras colunas.', (ev, a, ctx, call) => {
    const tv = materialize(ev.table(a[0], ctx))
    const cols = columnsArgs(ev, a.slice(1), ctx)
    if (cols.length !== tv.cols.length) throw new DaxError('TREATAS: o número de colunas não corresponde.', call.pos)
    const newCols: TVCol[] = cols.map((c) => ({ name: c.name, lineage: c, type: c.type }))
    return new MatTV(newCols, tv.data, tv.rowCount)
  }),
  fn('TOPN', 'table', 'Tabela', 2, Infinity, 'TOPN(<n>, <tabela>[, <ordenarPor>[, <ordem>]]...)', 'As N primeiras linhas segundo a ordenação (empates incluídos).', (ev, a, ctx) => {
    const n = Math.max(0, Math.floor(toNumber(ev.scalar(a[0], ctx))))
    const tv = ev.table(a[1], ctx)
    if (n === 0) return tv.pick([])
    if (a.length < 3) return tv.rowCount <= n ? tv : tv.pick(Array.from({ length: n }, (_, i) => i))
    const keys: { vals: Scalar[]; asc: boolean }[] = []
    for (let i = 2; i < a.length; i += 2) {
      const ord = a[i + 1]
      const asc = !!ord && ((ord.k === 'kw' && ord.v === 'ASC') || (ord.k === 'num' && ord.v === 1))
      keys.push({ vals: ev.mapRows(tv, a[i], ctx), asc })
    }
    const idx = Array.from({ length: tv.rowCount }, (_, i) => i)
    const cmp = (x: number, y: number) => {
      for (const k of keys) {
        const c = sortCompare(k.vals[x], k.vals[y])
        if (c) return k.asc ? c : -c
      }
      return 0
    }
    idx.sort((x, y) => cmp(x, y) || x - y)
    if (idx.length <= n) return tv.pick(idx)
    let end = n
    while (end < idx.length && cmp(idx[end], idx[n - 1]) === 0) end++
    return tv.pick(idx.slice(0, end))
  })
])

function safeEquals(x: Scalar, y: Scalar, strict = false): boolean {
  try {
    return compareOp(strict ? '==' : '=', x, y)
  } catch {
    return false
  }
}
