// Funções de manipulação de tabelas.
import type { Node } from '../ast'
import type { Ctx } from '../context'
import type { Evaluator } from '../evaluator'
import { DaxError } from '../parser'
import { fn, register } from '../registry'
import { ExtTV, MatTV, TableValue, materialize, type TVCol } from '../tablevalue'
import { toNumber } from '../values'
import { type DataType, type Scalar, scalarTypeOf } from '../../data/types'
import { type ColRT, normKey } from '../../model/runtime'
import { tupleKey, ValuesFilter } from '../filter'

function inferType(values: Scalar[]): DataType {
  let t: DataType = 'any'
  for (const v of values) {
    if (v === null) continue
    const k = scalarTypeOf(v)
    if (t === 'any') t = k
    else if (t !== k) {
      if ((t === 'int' && k === 'number') || (t === 'number' && k === 'int')) t = 'number'
      else if ((t === 'date' || t === 'datetime') && (k === 'date' || k === 'datetime')) t = 'datetime'
      else return 'any'
    }
  }
  return t === 'any' ? 'text' : t
}

function nameArg(ev: Evaluator, n: Node, ctx: Ctx, fname: string): string {
  if (n.k !== 'str') {
    const v = ev.scalar(n, ctx)
    if (typeof v !== 'string') throw new DaxError(`${fname}: o nome da coluna deve ser um texto entre aspas.`, n.pos)
    return v
  }
  return n.v
}

/** Agrupa linhas de uma tabela pelas colunas indicadas (usado por SUMMARIZE). */
function groupRows(tv: TableValue, groupIdx: number[], extraLookups: ((row: number) => Scalar)[]): { keys: Scalar[][]; rows: number[][] } {
  const map = new Map<string, number>()
  const keys: Scalar[][] = []
  const rows: number[][] = []
  for (let r = 0; r < tv.rowCount; r++) {
    const vals: Scalar[] = []
    for (const i of groupIdx) vals.push(tv.get(r, i))
    for (const f of extraLookups) vals.push(f(r))
    const k = tupleKey(vals.map(normKey))
    let g = map.get(k)
    if (g === undefined) {
      g = keys.length
      map.set(k, g)
      keys.push(vals)
      rows.push([])
    }
    rows[g].push(r)
  }
  return { keys, rows }
}

function columnUnion(tables: TableValue[], fname: string): TVCol[] {
  const n = tables[0].cols.length
  for (const t of tables) if (t.cols.length !== n) throw new DaxError(`${fname}: todas as tabelas devem ter o mesmo número de colunas.`)
  return tables[0].cols.map((c, i) => {
    const same = tables.every((t) => t.cols[i].lineage === c.lineage)
    return { name: c.name, lineage: same ? c.lineage : null, type: c.type }
  })
}

function rowKeySet(tv: TableValue): Set<string> {
  const s = new Set<string>()
  for (let r = 0; r < tv.rowCount; r++) s.add(tupleKey(tv.rowValues(r).map(normKey)))
  return s
}

register([
  fn(
    'SUMMARIZE',
    'table',
    'Tabela',
    1,
    Infinity,
    'SUMMARIZE(<tabela>, <colunaAgrupamento>[, ...][, <nome>, <expressão>]...)',
    'Agrupa a tabela pelas colunas indicadas (e adiciona colunas calculadas).',
    (ev, a, ctx, call) => {
      const tv = ev.table(a[0], ctx)
      const groupCols: ColRT[] = []
      let i = 1
      while (i < a.length && a[i].k === 'ref') {
        groupCols.push(ev.colArg(a[i], ctx))
        i++
      }
      const ext: { name: string; expr: Node }[] = []
      for (; i < a.length; i += 2) {
        if (i + 1 >= a.length) throw new DaxError('SUMMARIZE: nome sem expressão correspondente.', call.pos)
        ext.push({ name: nameArg(ev, a[i], ctx, 'SUMMARIZE'), expr: a[i + 1] })
      }
      const bt = tv.baseTable()
      const groupIdx: number[] = []
      const lookups: ((row: number) => Scalar)[] = []
      const order: ({ kind: 'idx'; i: number } | { kind: 'lk'; i: number })[] = []
      for (const c of groupCols) {
        const idx = tv.colByLineage(c)
        if (idx >= 0) {
          order.push({ kind: 'idx', i: groupIdx.length })
          groupIdx.push(idx)
        } else if (bt && ev.model.manyToOnePath(bt, c.table, ctx.fc.rel)) {
          order.push({ kind: 'lk', i: lookups.length })
          lookups.push((row) => {
            const br = tv.baseRow(row)
            if (br < 0) return null
            const rr = ev.model.relatedRow(bt, br, c.table, ctx.fc.rel)
            return rr < 0 ? null : c.data.get(rr)
          })
        } else throw new DaxError(`SUMMARIZE: a coluna ${c.qualifiedName} não pode ser alcançada a partir da tabela.`, call.pos)
      }
      const g = groupRows(tv, groupIdx, lookups)
      const cols: TVCol[] = groupCols.map((c) => ({ name: c.name, lineage: c, type: c.type }))
      const data: Scalar[][] = groupCols.map(() => [])
      g.keys.forEach((k) => {
        order.forEach((o, ci) => {
          data[ci].push(o.kind === 'idx' ? k[o.i] : k[groupIdx.length + o.i])
        })
      })
      const base = new MatTV(cols, data, g.keys.length)
      if (!ext.length) return base
      // Colunas de extensão: avaliadas no contexto do grupo (transição de contexto).
      const extra: Scalar[][] = ext.map(() => [])
      const frame = { tv: base as TableValue, row: 0 }
      const inner = ctx.withFrame(frame)
      for (let r = 0; r < base.rowCount; r++) {
        frame.row = r
        const c2 = ev.calculateCtx([], inner)
        ext.forEach((e, k) => extra[k].push(ev.scalar(e.expr, c2)))
      }
      return new ExtTV(
        base,
        ext.map((e, k) => ({ name: e.name, lineage: null, type: inferType(extra[k]) })),
        extra
      )
    }
  ),
  fn(
    'SUMMARIZECOLUMNS',
    'table',
    'Tabela',
    1,
    Infinity,
    'SUMMARIZECOLUMNS(<colunaAgrupamento>[, ...][, <tabelaFiltro>]...[, <nome>, <expressão>]...)',
    'Tabela resumida pelas colunas, com filtros e medidas (como os visuais).',
    (ev, a, ctx, call) => {
      const groupCols: ColRT[] = []
      const filterTables: Node[] = []
      let i = 0
      for (; i < a.length; i++) {
        const x = a[i]
        if (x.k === 'ref') groupCols.push(ev.colArg(x, ctx))
        else if (x.k === 'str') break
        else filterTables.push(x)
      }
      const ext: { name: string; expr: Node }[] = []
      for (; i < a.length; i += 2) {
        if (i + 1 >= a.length) throw new DaxError('SUMMARIZECOLUMNS: nome sem expressão correspondente.', call.pos)
        ext.push({ name: nameArg(ev, a[i], ctx, 'SUMMARIZECOLUMNS'), expr: a[i + 1] })
      }
      const fcCtx = filterTables.length ? ev.calculateCtx(filterTables, ctx) : ctx
      const fc = fcCtx.fc
      // Combinações existentes: por tabela, valores distintos visíveis; tabelas diferentes: produto filtrado por existência em fatos.
      const byTable = new Map<string, ColRT[]>()
      for (const c of groupCols) {
        const arr = byTable.get(c.table.name) ?? []
        arr.push(c)
        byTable.set(c.table.name, arr)
      }
      let combos: Scalar[][] = [[]]
      let comboCols: ColRT[] = []
      for (const cols of byTable.values()) {
        const rows = fc.visibleRows(cols[0].table)
        const idx = cols.map((c) => c.valueIndex)
        const seen = new Set<string>()
        const vals: Scalar[][] = []
        for (let r = 0; r < rows.length; r++) {
          let k = ''
          for (let c = 0; c < cols.length; c++) k += (c ? ',' : '') + idx[c].ids[rows[r]]
          if (seen.has(k)) continue
          seen.add(k)
          vals.push(cols.map((_, c) => idx[c].values[idx[c].ids[rows[r]]]))
        }
        // Linha em branco virtual (chaves sem correspondência no lado "um").
        if (ev.blankRowVisible(cols[0].table, fc) && !vals.some((v) => v.every((x) => x === null))) vals.push(cols.map(() => null))
        const next: Scalar[][] = []
        for (const a1 of combos) for (const b of vals) next.push([...a1, ...b])
        combos = next
        comboCols = [...comboCols, ...cols]
        if (combos.length > 2_000_000) throw new DaxError('SUMMARIZECOLUMNS: combinações demais.')
      }
      const cols: TVCol[] = comboCols.map((c) => ({ name: c.name, lineage: c, type: c.type }))
      const extra: Scalar[][] = ext.map(() => [])
      const keepRows: number[] = []
      combos.forEach((combo, r) => {
        const filters = comboCols.map((c, k) => {
          const f = ValuesFilter.single(c, [normKey(combo[k])])
          f.isGroup = true
          return f
        })
        const gfc = fc.addFilters(filters).withShadow(fc)
        if (!ext.length) {
          keepRows.push(r)
          return
        }
        const vals = ext.map((e) => ev.scalar(e.expr, ctx.withFc(gfc, ctx.frames.length)))
        if (vals.some((v) => v !== null)) {
          keepRows.push(r)
          vals.forEach((v, k) => extra[k].push(v))
        }
      })
      const data = cols.map((_, c) => keepRows.map((r) => combos[r][c]))
      const base = new MatTV(cols, data, keepRows.length)
      if (!ext.length) return base
      return new ExtTV(
        base,
        ext.map((e, k) => ({ name: e.name, lineage: null, type: inferType(extra[k]) })),
        extra
      )
    }
  ),
  fn('ADDCOLUMNS', 'table', 'Tabela', 3, Infinity, 'ADDCOLUMNS(<tabela>, <nome>, <expressão>[, ...])', 'Adiciona colunas calculadas a uma tabela.', (ev, a, ctx, call) => {
    const tv = ev.table(a[0], ctx)
    if ((a.length - 1) % 2 !== 0) throw new DaxError('ADDCOLUMNS: cada nome precisa de uma expressão.', call.pos)
    const names: string[] = []
    const exprs: Node[] = []
    for (let i = 1; i < a.length; i += 2) {
      names.push(nameArg(ev, a[i], ctx, 'ADDCOLUMNS'))
      exprs.push(a[i + 1])
    }
    const extra = exprs.map((e) => ev.mapRows(tv, e, ctx))
    return new ExtTV(
      tv,
      names.map((n, k) => ({ name: n, lineage: null, type: inferType(extra[k]) })),
      extra
    )
  }),
  fn('SELECTCOLUMNS', 'table', 'Tabela', 2, Infinity, 'SELECTCOLUMNS(<tabela>, [<nome>,] <expressão>[, ...])', 'Seleciona/calcula colunas de uma tabela.', (ev, a, ctx) => {
    const tv = ev.table(a[0], ctx)
    const cols: TVCol[] = []
    const data: Scalar[][] = []
    let i = 1
    while (i < a.length) {
      let name: string
      let expr: Node
      if (a[i].k === 'str' && i + 1 < a.length) {
        name = (a[i] as Extract<Node, { k: 'str' }>).v
        expr = a[i + 1]
        i += 2
      } else {
        expr = a[i]
        name = expr.k === 'ref' ? expr.name : `Coluna${cols.length + 1}`
        i += 1
      }
      const vals = ev.mapRows(tv, expr, ctx)
      let lineage: ColRT | null = null
      if (expr.k === 'ref') {
        const c = ev.tryColArg(expr, ctx)
        if (c && tv.colByLineage(c) >= 0) lineage = c
      }
      cols.push({ name, lineage, type: lineage ? lineage.type : inferType(vals) })
      data.push(vals)
    }
    return new MatTV(cols, data, tv.rowCount)
  }),
  fn('GENERATESERIES', 'table', 'Tabela', 2, 3, 'GENERATESERIES(<início>, <fim>[, <incremento>])', 'Tabela com uma série de valores.', (ev, a, ctx) => {
    const s = ev.scalar(a[0], ctx)
    const e = ev.scalar(a[1], ctx)
    const step = a.length > 2 ? toNumber(ev.scalar(a[2], ctx)) : 1
    if (step <= 0) throw new DaxError('GENERATESERIES: o incremento deve ser positivo.')
    const x0 = toNumber(s)
    const x1 = toNumber(e)
    const vals: Scalar[] = []
    const n = Math.floor((x1 - x0) / step + 1e-9)
    if (n > 5_000_000) throw new DaxError('GENERATESERIES: série muito grande.')
    for (let k = 0; k <= n; k++) vals.push(Number((x0 + k * step).toPrecision(15)))
    return new MatTV([{ name: 'Value', lineage: null, type: Number.isInteger(step) && Number.isInteger(x0) ? 'int' : 'number' }], [vals], vals.length)
  }),
  fn('ROW', 'table', 'Tabela', 2, Infinity, 'ROW(<nome>, <expressão>[, ...])', 'Tabela com uma única linha.', (ev, a, ctx) => {
    const cols: TVCol[] = []
    const data: Scalar[][] = []
    for (let i = 0; i + 1 < a.length; i += 2) {
      const v = ev.scalar(a[i + 1], ctx)
      cols.push({ name: nameArg(ev, a[i], ctx, 'ROW'), lineage: null, type: scalarTypeOf(v) === 'any' ? 'text' : scalarTypeOf(v) })
      data.push([v])
    }
    return new MatTV(cols, data, 1)
  }),
  fn('DATATABLE', 'table', 'Tabela', 3, Infinity, 'DATATABLE(<nome>, <tipo>[, ...], {{<valores>}})', 'Tabela com valores literais.', (ev, a, ctx, call) => {
    const last = a[a.length - 1]
    if (last.k !== 'tablector') throw new DaxError('DATATABLE: o último argumento deve ser {{...}}.', call.pos)
    const cols: TVCol[] = []
    for (let i = 0; i + 1 < a.length - 1; i += 2) {
      const tn = a[i + 1]
      const t = tn.k === 'kw' ? tn.v : tn.k === 'table' ? tn.name.toUpperCase() : 'STRING'
      const type: DataType =
        t === 'INTEGER' ? 'int' : t === 'DOUBLE' ? 'number' : t === 'CURRENCY' ? 'currency' : t === 'BOOLEAN' ? 'bool' : t === 'DATETIME' ? 'datetime' : 'text'
      cols.push({ name: nameArg(ev, a[i], ctx, 'DATATABLE'), lineage: null, type })
    }
    const rows = last.rows.map((r) => r.map((e) => ev.scalar(e, ctx)))
    return MatTV.fromRows(cols, rows)
  }),
  fn('UNION', 'table', 'Tabela', 2, Infinity, 'UNION(<tabela1>, <tabela2>[, ...])', 'Une as linhas de várias tabelas.', (ev, a, ctx) => {
    const tables = a.map((x) => materialize(ev.table(x, ctx)))
    const cols = columnUnion(tables, 'UNION')
    const data = cols.map((_, c) => tables.flatMap((t) => t.data[c]))
    return new MatTV(cols, data)
  }),
  fn('INTERSECT', 'table', 'Tabela', 2, 2, 'INTERSECT(<tabela1>, <tabela2>)', 'Linhas da primeira tabela presentes na segunda.', (ev, a, ctx) => {
    const t1 = ev.table(a[0], ctx)
    const keys = rowKeySet(ev.table(a[1], ctx))
    const keep: number[] = []
    for (let r = 0; r < t1.rowCount; r++) if (keys.has(tupleKey(t1.rowValues(r).map(normKey)))) keep.push(r)
    return t1.pick(keep)
  }),
  fn('EXCEPT', 'table', 'Tabela', 2, 2, 'EXCEPT(<tabela1>, <tabela2>)', 'Linhas da primeira tabela ausentes na segunda.', (ev, a, ctx) => {
    const t1 = ev.table(a[0], ctx)
    const keys = rowKeySet(ev.table(a[1], ctx))
    const keep: number[] = []
    for (let r = 0; r < t1.rowCount; r++) if (!keys.has(tupleKey(t1.rowValues(r).map(normKey)))) keep.push(r)
    return t1.pick(keep)
  }),
  fn('CROSSJOIN', 'table', 'Tabela', 2, Infinity, 'CROSSJOIN(<tabela1>, <tabela2>[, ...])', 'Produto cartesiano das tabelas.', (ev, a, ctx) => {
    const tables = a.map((x) => materialize(ev.table(x, ctx)))
    let rows: Scalar[][] = [[]]
    let cols: TVCol[] = []
    for (const t of tables) {
      const next: Scalar[][] = []
      for (const r of rows) for (let k = 0; k < t.rowCount; k++) next.push([...r, ...t.rowValues(k)])
      if (next.length > 5_000_000) throw new DaxError('CROSSJOIN: resultado grande demais.')
      rows = next
      cols = [...cols, ...t.cols]
    }
    return MatTV.fromRows(cols, rows)
  }),
  fn('GENERATE', 'table', 'Tabela', 2, 2, 'GENERATE(<tabela1>, <tabela2>)', 'Para cada linha da primeira, linhas da segunda avaliada no contexto.', (ev, a, ctx) => {
    const t1 = ev.table(a[0], ctx)
    const out: Scalar[][] = []
    let cols2: TVCol[] | null = null
    const frame = { tv: t1, row: 0 }
    const inner = ctx.withFrame(frame)
    for (let r = 0; r < t1.rowCount; r++) {
      frame.row = r
      const t2 = ev.table(a[1], inner)
      cols2 = cols2 ?? t2.cols
      for (let k = 0; k < t2.rowCount; k++) out.push([...t1.rowValues(r), ...t2.rowValues(k)])
    }
    return MatTV.fromRows([...t1.cols, ...(cols2 ?? [])], out)
  }),
  fn('GENERATEALL', 'table', 'Tabela', 2, 2, 'GENERATEALL(<tabela1>, <tabela2>)', 'Como GENERATE, mantendo linhas sem correspondência.', (ev, a, ctx) => {
    const t1 = ev.table(a[0], ctx)
    const out: Scalar[][] = []
    let cols2: TVCol[] | null = null
    const frame = { tv: t1, row: 0 }
    const inner = ctx.withFrame(frame)
    const pending: number[] = []
    for (let r = 0; r < t1.rowCount; r++) {
      frame.row = r
      const t2 = ev.table(a[1], inner)
      cols2 = cols2 ?? t2.cols
      if (t2.rowCount === 0) {
        pending.push(out.length)
        out.push([...t1.rowValues(r)])
      }
      for (let k = 0; k < t2.rowCount; k++) out.push([...t1.rowValues(r), ...t2.rowValues(k)])
    }
    const w = t1.cols.length + (cols2?.length ?? 0)
    for (const i of pending) while (out[i].length < w) out[i].push(null)
    return MatTV.fromRows([...t1.cols, ...(cols2 ?? [])], out)
  }),
  fn('NATURALINNERJOIN', 'table', 'Tabela', 2, 2, 'NATURALINNERJOIN(<tabela1>, <tabela2>)', 'Junção interna pelas colunas de mesmo nome/linhagem.', (ev, a, ctx) => {
    const t1 = materialize(ev.table(a[0], ctx))
    const t2 = materialize(ev.table(a[1], ctx))
    const common: [number, number][] = []
    t1.cols.forEach((c, i) => {
      const j = t2.cols.findIndex((d) => (c.lineage && d.lineage === c.lineage) || d.name.toLowerCase() === c.name.toLowerCase())
      if (j >= 0) common.push([i, j])
    })
    if (!common.length) throw new DaxError('NATURALINNERJOIN: não há colunas em comum.')
    const index = new Map<string, number[]>()
    for (let r = 0; r < t2.rowCount; r++) {
      const k = tupleKey(common.map(([, j]) => normKey(t2.get(r, j))))
      const arr = index.get(k) ?? []
      arr.push(r)
      index.set(k, arr)
    }
    const other = t2.cols.map((_, j) => j).filter((j) => !common.some(([, cj]) => cj === j))
    const rows: Scalar[][] = []
    for (let r = 0; r < t1.rowCount; r++) {
      const k = tupleKey(common.map(([i]) => normKey(t1.get(r, i))))
      for (const r2 of index.get(k) ?? []) rows.push([...t1.rowValues(r), ...other.map((j) => t2.get(r2, j))])
    }
    return MatTV.fromRows([...t1.cols, ...other.map((j) => t2.cols[j])], rows)
  }),
  fn('GROUPBY', 'table', 'Tabela', 1, Infinity, 'GROUPBY(<tabela>, <colunaAgrupamento>[, ...][, <nome>, <expressão com CURRENTGROUP()>]...)', 'Agrupa sem transição de contexto.', (ev, a, ctx, call) => {
    const tv = ev.table(a[0], ctx)
    const groupCols: ColRT[] = []
    let i = 1
    while (i < a.length && a[i].k === 'ref') groupCols.push(ev.colArg(a[i++], ctx))
    const idx = groupCols.map((c) => {
      const k = tv.colByLineage(c)
      if (k < 0) throw new DaxError(`GROUPBY: a coluna ${c.qualifiedName} não está na tabela.`, call.pos)
      return k
    })
    const g = groupRows(tv, idx, [])
    const cols: TVCol[] = groupCols.map((c) => ({ name: c.name, lineage: c, type: c.type }))
    const data: Scalar[][] = groupCols.map((_, k) => g.keys.map((key) => key[k]))
    const ext: { name: string; expr: Node }[] = []
    for (; i + 1 < a.length; i += 2) ext.push({ name: nameArg(ev, a[i], ctx, 'GROUPBY'), expr: a[i + 1] })
    const extraVals: Scalar[][] = ext.map(() => [])
    g.rows.forEach((rows) => {
      const sub = tv.pick(rows)
      const c2 = ctx.withVar('__CURRENTGROUP', sub)
      ext.forEach((e, k) => extraVals[k].push(ev.scalar(e.expr, c2)))
    })
    const base = new MatTV(cols, data, g.keys.length)
    if (!ext.length) return base
    return new ExtTV(
      base,
      ext.map((e, k) => ({ name: e.name, lineage: null, type: inferType(extraVals[k]) })),
      extraVals
    )
  }),
  fn('CURRENTGROUP', 'table', 'Tabela', 0, 0, 'CURRENTGROUP()', 'Linhas do grupo atual (dentro de GROUPBY).', (_ev, _a, ctx, call) => {
    const s = ctx.vars?.lookup('__CURRENTGROUP')
    if (!s || !(s.value instanceof TableValue)) throw new DaxError('CURRENTGROUP só pode ser usado dentro de GROUPBY.', call.pos)
    return s.value
  }),
  fn('SAMPLE', 'table', 'Tabela', 3, Infinity, 'SAMPLE(<n>, <tabela>, <ordenarPor>[, <ordem>]...)', 'Amostra de N linhas distribuídas.', (ev, a, ctx) => {
    const n = Math.max(0, Math.floor(toNumber(ev.scalar(a[0], ctx))))
    const tv = ev.table(a[1], ctx)
    if (tv.rowCount <= n) return tv
    const step = tv.rowCount / n
    const keep: number[] = []
    for (let k = 0; k < n; k++) keep.push(Math.floor(k * step))
    return tv.pick(keep)
  }),
  fn('FILTERS', 'table', 'Filtro', 1, 1, 'FILTERS(<coluna>)', 'Valores aplicados diretamente como filtro na coluna.', (ev, a, ctx) => {
    const col = ev.colArg(a[0], ctx)
    const fs = ctx.fc.filtersOn(col)
    if (!fs.length) return ev.allCombos([col])
    return ev.distinctValues(col, ctx.fc, true)
  }),
  fn('ISSUBTOTAL', 'scalar', 'Informação', 1, 1, 'ISSUBTOTAL(<coluna>)', 'TRUE em linhas de subtotal (dentro de SUMMARIZE ROLLUP).', () => false),
])
