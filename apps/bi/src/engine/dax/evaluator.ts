// Avaliador de expressões DAX (contextos de filtro e de linha).
import type { Node } from './ast'
import { DaxError, parseDax } from './parser'
import { Ctx, type Frame, type VarValue } from './context'
import {
  FilterContext,
  RowsFilter,
  ValuesFilter,
  type Filter,
  coverage,
  removeColumnsFrom,
  sortUnique
} from './filter'
import { BaseTV, MatTV, TableValue, type TVCol } from './tablevalue'
import { arith, compareOp, concat, toBool, toNumber } from './values'
import { FUNCS } from './registry'
import { type DataType, DateVal, type Scalar, scalarTypeOf } from '../data/types'
import {
  type ColRT,
  type MeasureRT,
  type ModelRuntime,
  type NormKey,
  type RelState,
  type TableRT,
  normKey
} from '../model/runtime'
import { datePartColumnName, type DatePartLevel } from '../model/types'

const LEVEL_ALIASES: Record<string, DatePartLevel> = {
  ano: 'year',
  year: 'year',
  trimestre: 'quarter',
  quarter: 'quarter',
  mês: 'month',
  mes: 'month',
  month: 'month',
  dia: 'day',
  day: 'day'
}

/** Funções cujo argumento de coluna não é um "predicado" (não descer ao coletar colunas). */
const COLUMN_CONSUMERS = new Set([
  'SUM',
  'AVERAGE',
  'MIN',
  'MAX',
  'COUNT',
  'COUNTA',
  'COUNTBLANK',
  'COUNTROWS',
  'DISTINCTCOUNT',
  'DISTINCTCOUNTNOBLANK',
  'MEDIAN',
  'PRODUCT',
  'SUMX',
  'AVERAGEX',
  'MINX',
  'MAXX',
  'COUNTX',
  'COUNTAX',
  'MEDIANX',
  'PRODUCTX',
  'CONCATENATEX',
  'RANKX',
  'CALCULATE',
  'CALCULATETABLE',
  'FILTER',
  'ALL',
  'ALLEXCEPT',
  'ALLSELECTED',
  'ALLNOBLANKROW',
  'REMOVEFILTERS',
  'VALUES',
  'DISTINCT',
  'SELECTEDVALUE',
  'HASONEVALUE',
  'HASONEFILTER',
  'ISFILTERED',
  'ISCROSSFILTERED',
  'ISINSCOPE',
  'LOOKUPVALUE',
  'FIRSTNONBLANK',
  'LASTNONBLANK',
  'TOPN',
  'SUMMARIZE',
  'ADDCOLUMNS',
  'SELECTCOLUMNS',
  'RELATEDTABLE',
  'EARLIER',
  'EARLIEST'
])

export interface QueryMeasure {
  table: TableRT | null
  name: string
  node: Node
}

export class Evaluator {
  readonly measureCache = new Map<string, Scalar>()
  private readonly parseCache = new Map<string, Node>()
  private readonly evaluating = new Set<number | string>()
  /** Medidas temporárias (DEFINE MEASURE em consultas). */
  readonly queryMeasures = new Map<string, QueryMeasure>()
  /** Limite de linhas para tabelas materializadas (proteção de memória). */
  maxMaterializeRows = 5_000_000

  constructor(readonly model: ModelRuntime) {}

  parse(expr: string): Node {
    let n = this.parseCache.get(expr)
    if (!n) {
      n = parseDax(expr)
      this.parseCache.set(expr, n)
    }
    return n
  }

  clearCache(): void {
    this.measureCache.clear()
  }

  emptyCtx(): Ctx {
    return new Ctx(FilterContext.empty(this.model))
  }

  // --------------------------------------------------------------------
  // Despacho
  // --------------------------------------------------------------------

  /** Avalia uma expressão que pode resultar em escalar ou tabela. */
  any(n: Node, ctx: Ctx): VarValue {
    switch (n.k) {
      case 'table':
      case 'tablector':
        return this.table(n, ctx)
      case 'call': {
        const def = FUNCS.get(n.name)
        if (!def) throw new DaxError(`A função "${n.name}" não existe.`, n.pos)
        this.checkArity(def.name, def.min, def.max, n.args.length, n)
        return def.impl(this, n.args, ctx, n)
      }
      case 'varref': {
        const s = ctx.vars?.lookup(n.name)
        if (!s) throw new DaxError(`Variável "${n.name}" não definida.`, n.pos)
        return s.value
      }
      case 'var': {
        let c = ctx
        for (const d of n.defs) c = c.withVar(d.name, this.any(d.e, c))
        return this.any(n.ret, c)
      }
      default:
        return this.scalar(n, ctx)
    }
  }

  isTableNode(n: Node, ctx: Ctx): boolean {
    switch (n.k) {
      case 'table':
      case 'tablector':
        return true
      case 'call':
        return FUNCS.get(n.name)?.kind === 'table'
      case 'varref':
        return ctx.vars?.lookup(n.name)?.value instanceof TableValue
      case 'var':
        return this.isTableNode(n.ret, ctx)
      default:
        return false
    }
  }

  private checkArity(name: string, min: number, max: number, count: number, n: Node): void {
    if (count < min || count > max) {
      const exp = min === max ? `${min}` : max === Infinity ? `pelo menos ${min}` : `de ${min} a ${max}`
      throw new DaxError(`A função ${name} espera ${exp} argumento(s); foram informados ${count}.`, n.pos)
    }
  }

  scalar(n: Node, ctx: Ctx): Scalar {
    switch (n.k) {
      case 'num':
        return n.v
      case 'str':
        return n.v
      case 'bool':
        return n.v
      case 'ref':
        return this.refScalar(n, ctx)
      case 'varref': {
        const s = ctx.vars?.lookup(n.name)
        if (!s) throw new DaxError(`Variável "${n.name}" não definida.`, n.pos)
        return s.value instanceof TableValue ? this.tableToScalar(s.value, n) : s.value
      }
      case 'call': {
        const def = FUNCS.get(n.name)
        if (!def) throw new DaxError(`A função "${n.name}" não existe.`, n.pos)
        this.checkArity(def.name, def.min, def.max, n.args.length, n)
        const r = def.impl(this, n.args, ctx, n)
        return r instanceof TableValue ? this.tableToScalar(r, n) : r
      }
      case 'unary': {
        const v = this.scalar(n.e, ctx)
        if (n.op === 'NOT') return !toBool(v)
        if (v === null) return null
        if (n.op === '-') return v instanceof DateVal ? -toNumber(v) : -toNumber(v)
        return v
      }
      case 'bin':
        return this.binary(n.op, n.l, n.r, ctx)
      case 'in': {
        const v = this.scalar(n.l, ctx)
        const t = this.table(n.r, ctx)
        for (let r = 0; r < t.rowCount; r++) {
          const x = t.get(r, 0)
          try {
            if (compareOp('==', v, x)) return true
          } catch {
            /* tipos incompatíveis: não é igual */
          }
        }
        return false
      }
      case 'var': {
        let c = ctx
        for (const d of n.defs) c = c.withVar(d.name, this.any(d.e, c))
        return this.scalar(n.ret, c)
      }
      case 'table':
      case 'tablector':
        return this.tableToScalar(this.table(n, ctx), n)
      case 'kw':
        if (n.v === 'EMPTY') return null
        throw new DaxError(`Palavra-chave "${n.v}" inesperada.`, n.pos)
    }
  }

  private binary(op: string, l: Node, r: Node, ctx: Ctx): Scalar {
    switch (op) {
      case '&&': {
        if (!toBool(this.scalar(l, ctx))) return false
        return toBool(this.scalar(r, ctx))
      }
      case '||': {
        if (toBool(this.scalar(l, ctx))) return true
        return toBool(this.scalar(r, ctx))
      }
      case '&':
        return concat(this.scalar(l, ctx), this.scalar(r, ctx))
      case '+':
      case '-':
      case '*':
      case '/':
      case '^':
        return arith(op, this.scalar(l, ctx), this.scalar(r, ctx))
      default:
        return compareOp(op, this.scalar(l, ctx), this.scalar(r, ctx))
    }
  }

  tableToScalar(t: TableValue, n: Node): Scalar {
    if (t.rowCount === 0) return null
    if (t.cols.length !== 1) {
      throw new DaxError('Foi fornecida uma tabela com várias colunas onde era esperado um único valor.', n.pos)
    }
    if (t.rowCount > 1) throw new DaxError('Foi fornecida uma tabela com vários valores onde era esperado um único valor.', n.pos)
    return t.get(0, 0)
  }

  table(n: Node, ctx: Ctx): TableValue {
    switch (n.k) {
      case 'table':
        return this.tableRef(n.name, ctx, n)
      case 'varref': {
        const s = ctx.vars?.lookup(n.name)
        if (!s) throw new DaxError(`Variável "${n.name}" não definida.`, n.pos)
        if (s.value instanceof TableValue) return s.value
        return new MatTV([{ name: 'Value', lineage: null, type: scalarTypeOf(s.value) }], [[s.value]], 1)
      }
      case 'call': {
        const def = FUNCS.get(n.name)
        if (!def) throw new DaxError(`A função "${n.name}" não existe.`, n.pos)
        this.checkArity(def.name, def.min, def.max, n.args.length, n)
        const r = def.impl(this, n.args, ctx, n)
        if (r instanceof TableValue) return r
        return new MatTV([{ name: 'Value', lineage: null, type: scalarTypeOf(r) }], [[r]], 1)
      }
      case 'tablector':
        return this.tableCtor(n, ctx)
      case 'var': {
        let c = ctx
        for (const d of n.defs) c = c.withVar(d.name, this.any(d.e, c))
        return this.table(n.ret, c)
      }
      case 'ref': {
        // Referência de coluna usada como tabela: valores visíveis da coluna.
        const col = this.colArg(n, ctx)
        return this.distinctValues(col, ctx.fc, true)
      }
      default:
        throw new DaxError('Era esperada uma expressão de tabela.', n.pos)
    }
  }

  private tableCtor(n: Extract<Node, { k: 'tablector' }>, ctx: Ctx): MatTV {
    const width = n.rows.reduce((m, r) => Math.max(m, r.length), 0)
    const rows: Scalar[][] = n.rows.map((r) => r.map((e) => this.scalar(e, ctx)))
    const cols: TVCol[] = []
    for (let c = 0; c < width; c++) {
      let type: DataType = 'any'
      for (const r of rows) {
        const v = r[c]
        if (v !== null && v !== undefined) {
          const t = scalarTypeOf(v)
          type = type === 'any' ? t : type === t ? type : type === 'int' && t === 'number' ? 'number' : type === 'number' && t === 'int' ? 'number' : 'text'
        }
      }
      cols.push({ name: width === 1 ? 'Value' : `Value${c + 1}`, lineage: null, type: type === 'any' ? 'text' : type })
    }
    return MatTV.fromRows(cols, rows)
  }

  tableRef(name: string, ctx: Ctx, n?: Node): TableValue {
    const t = this.model.table(name)
    if (!t) throw new DaxError(`Não foi possível encontrar a tabela "${name}".`, n?.pos)
    return new BaseTV(t, ctx.fc.visibleRows(t))
  }

  requireTable(name: string, n?: Node): TableRT {
    const t = this.model.table(name)
    if (!t) throw new DaxError(`Não foi possível encontrar a tabela "${name}".`, n?.pos)
    return t
  }

  // --------------------------------------------------------------------
  // Referências de coluna e medida
  // --------------------------------------------------------------------

  resolveColumn(t: TableRT, name: string, level?: string): ColRT | undefined {
    const base = t.column(name)
    if (!level) return base
    if (!base) return undefined
    const lv = level.toLowerCase()
    if (lv === 'date' || lv === 'data') return base
    const l = LEVEL_ALIASES[lv]
    if (!l) return undefined
    return t.column(datePartColumnName(base.name, l))
  }

  /** Resolve uma referência de coluna usada como argumento de função. */
  colArg(n: Node, ctx: Ctx): ColRT {
    if (n.k !== 'ref') throw new DaxError('Era esperada uma referência de coluna (ex.: Tabela[Coluna]).', n.pos)
    if (n.table) {
      const t = this.requireTable(n.table, n)
      const c = this.resolveColumn(t, n.name, n.level)
      if (!c) throw new DaxError(`A coluna "${n.name}" não existe na tabela "${t.name}".`, n.pos)
      return c
    }
    for (let i = ctx.frames.length - 1; i >= 0; i--) {
      const bt = ctx.frames[i].tv.baseTable()
      const c = bt?.column(n.name)
      if (c) return c
    }
    const found = this.model.tables.map((t) => t.column(n.name)).filter((c): c is ColRT => !!c)
    if (found.length === 1) return found[0]
    if (found.length > 1) throw new DaxError(`A coluna "[${n.name}]" é ambígua; especifique a tabela.`, n.pos)
    throw new DaxError(`A coluna "[${n.name}]" não foi encontrada.`, n.pos)
  }

  /** Tenta resolver como coluna; devolve null se não for coluna. */
  tryColArg(n: Node, ctx: Ctx): ColRT | null {
    if (n.k !== 'ref') return null
    try {
      return this.colArg(n, ctx)
    } catch {
      return null
    }
  }

  private refScalar(n: Extract<Node, { k: 'ref' }>, ctx: Ctx): Scalar {
    if (n.table) {
      const t = this.model.table(n.table)
      if (!t) throw new DaxError(`Não foi possível encontrar a tabela "${n.table}".`, n.pos)
      const col = this.resolveColumn(t, n.name, n.level)
      if (col) {
        const v = this.frameValue(col, ctx)
        if (v !== undefined) return v
        throw new DaxError(
          `Não é possível determinar um único valor para a coluna "${col.name}" na tabela "${t.name}". ` +
            'Isso pode acontecer quando uma fórmula de medida se refere a uma coluna sem uma agregação como SUM, MIN, MAX ou COUNT.',
          n.pos
        )
      }
      const qm = this.queryMeasures.get(n.name.toLowerCase())
      if (qm) return this.evalQueryMeasure(qm, ctx)
      const m = this.model.measure(n.name)
      if (m) return this.evalMeasure(m, ctx)
      throw new DaxError(`A coluna ou medida "${n.name}" não existe na tabela "${t.name}".`, n.pos)
    }
    // [Nome]: coluna do contexto de linha ou medida
    for (let i = ctx.frames.length - 1; i >= 0; i--) {
      const f = ctx.frames[i]
      const idx = f.tv.colByName(n.name)
      if (idx >= 0) return f.tv.get(f.row, idx)
    }
    const qm = this.queryMeasures.get(n.name.toLowerCase())
    if (qm) return this.evalQueryMeasure(qm, ctx)
    const m = this.model.measure(n.name)
    if (m) return this.evalMeasure(m, ctx)
    throw new DaxError(`A coluna ou medida "[${n.name}]" não foi encontrada.`, n.pos)
  }

  /** Valor da coluna no contexto de linha (undefined se não houver linha com a coluna). */
  frameValue(col: ColRT, ctx: Ctx): Scalar | undefined {
    for (let i = ctx.frames.length - 1; i >= 0; i--) {
      const f = ctx.frames[i]
      const tv = f.tv
      if (tv instanceof BaseTV) {
        if (tv.table === col.table) {
          const r = tv.rows[f.row]
          return r < 0 ? null : col.data.get(r)
        }
        continue
      }
      const idx = tv.colByLineage(col)
      if (idx >= 0) return tv.get(f.row, idx)
    }
    return undefined
  }

  evalMeasure(m: MeasureRT, ctx: Ctx): Scalar {
    const fc = ctx.hasPendingRows ? this.contextTransition(ctx) : ctx.fc
    const key = `${m.id}|${fc.sig}|${fc.shadow?.sig ?? ''}`
    if (this.measureCache.has(key)) return this.measureCache.get(key)!
    if (this.evaluating.has(m.id)) throw new DaxError(`Dependência circular detectada na medida [${m.name}].`)
    this.evaluating.add(m.id)
    try {
      const node = this.parse(m.def.expression)
      const v = this.scalar(node, new Ctx(fc, [], null, 0))
      if (this.measureCache.size > 200_000) this.measureCache.clear()
      this.measureCache.set(key, v)
      return v
    } catch (e) {
      if (e instanceof DaxError && !e.message.startsWith('[')) {
        throw new DaxError(`[${m.name}]: ${e.message}`)
      }
      throw e
    } finally {
      this.evaluating.delete(m.id)
    }
  }

  private evalQueryMeasure(m: QueryMeasure, ctx: Ctx): Scalar {
    const fc = ctx.hasPendingRows ? this.contextTransition(ctx) : ctx.fc
    const id = `q:${m.name.toLowerCase()}`
    if (this.evaluating.has(id)) throw new DaxError(`Dependência circular detectada na medida [${m.name}].`)
    this.evaluating.add(id)
    try {
      return this.scalar(m.node, new Ctx(fc, [], null, 0))
    } finally {
      this.evaluating.delete(id)
    }
  }

  /** Avalia uma expressão de medida ad hoc (texto DAX) num contexto. */
  evalExpression(expr: string | Node, fc: FilterContext): Scalar {
    const node = typeof expr === 'string' ? this.parse(expr) : expr
    return this.scalar(node, new Ctx(fc))
  }

  // --------------------------------------------------------------------
  // Transição de contexto e CALCULATE
  // --------------------------------------------------------------------

  contextTransition(ctx: Ctx): FilterContext {
    const filters: Filter[] = []
    for (let i = ctx.transitioned; i < ctx.frames.length; i++) {
      const f = ctx.frames[i]
      const bt = f.tv.baseTable()
      if (bt) {
        const br = f.tv.baseRow(f.row)
        if (br >= 0) filters.push(new RowsFilter(bt, bt.identityRows(br), false))
        else for (const c of bt.baseColumns) filters.push(ValuesFilter.single(c, [null]))
        continue
      }
      for (let c = 0; c < f.tv.cols.length; c++) {
        const lin = f.tv.cols[c].lineage
        if (lin) filters.push(ValuesFilter.single(lin, [normKey(f.tv.get(f.row, c))]))
      }
    }
    return this.applyFilters(ctx.fc, filters.map((filter) => ({ filter, keep: false })))
  }

  /** Aplica filtros com a semântica do CALCULATE (sobrescreve as mesmas colunas). */
  applyFilters(fc: FilterContext, specs: { filter: Filter; keep: boolean }[]): FilterContext {
    if (specs.length === 0) return fc
    let list: Filter[] = fc.filters as Filter[]
    let removed = false
    for (const s of specs) {
      if (s.keep) continue
      const cov = coverage(this.model, s.filter, fc.rel)
      const next = removeColumnsFrom(list, cov.cols, cov.tables)
      if (next.length !== list.length || next.some((f, i) => f !== list[i])) removed = true
      list = next
    }
    const add = specs.map((s) => s.filter)
    if (!removed) return fc.addFilters(add)
    return new FilterContext(this.model, [...list, ...add], fc.rel, null, null, fc.shadow)
  }

  /** Remove filtros (ALL / REMOVEFILTERS) de colunas e/ou tabelas (expandidas). */
  removeFilters(fc: FilterContext, cols: ColRT[], tables: TableRT[]): FilterContext {
    const colSet = new Set(cols)
    const tableSet = new Set<TableRT>()
    for (const t of tables) for (const x of this.model.expandedTables(t, fc.rel)) tableSet.add(x)
    const list = removeColumnsFrom(fc.filters, colSet, tableSet)
    if (list.length === fc.filters.length && list.every((f, i) => f === fc.filters[i])) return fc
    return new FilterContext(this.model, list, fc.rel, null, null, fc.shadow)
  }

  /** Prepara o contexto para CALCULATE/CALCULATETABLE. */
  calculateCtx(filterArgs: Node[], ctx: Ctx): Ctx {
    const specs: { filter: Filter; keep: boolean }[] = []
    const modifiers: ((fc: FilterContext) => FilterContext)[] = []
    let activate: Set<string> | null = null
    let direction: Map<string, 'single' | 'both' | 'none' | 'reverse'> | null = null

    const collect = (arg: Node, keep: boolean): void => {
      if (arg.k === 'kw' && arg.v === 'EMPTY') return
      if (arg.k === 'call') {
        switch (arg.name) {
          case 'KEEPFILTERS':
            if (arg.args.length !== 1) throw new DaxError('KEEPFILTERS espera 1 argumento.', arg.pos)
            collect(arg.args[0], true)
            return
          case 'ALL':
          case 'REMOVEFILTERS':
          case 'ALLNOBLANKROW':
          case 'ALLCROSSFILTERED': {
            if (arg.args.length === 0) {
              modifiers.push((fc) => new FilterContext(this.model, [], fc.rel, null, null, fc.shadow))
              return
            }
            const { cols, tables } = this.columnsOrTables(arg.args, ctx)
            modifiers.push((fc) => this.removeFilters(fc, cols, tables))
            return
          }
          case 'ALLEXCEPT': {
            if (arg.args.length < 2) throw new DaxError('ALLEXCEPT espera uma tabela e ao menos uma coluna.', arg.pos)
            const t = this.tableArgBase(arg.args[0], ctx)
            const keep = arg.args.slice(1).map((a) => this.colArg(a, ctx))
            modifiers.push((fc) => this.allExcept(fc, t, keep))
            return
          }
          case 'ALLSELECTED': {
            const { cols, tables } = arg.args.length ? this.columnsOrTables(arg.args, ctx) : { cols: [], tables: [] }
            const all = arg.args.length === 0
            modifiers.push((fc) => this.allSelected(fc, cols, tables, all))
            return
          }
          case 'USERELATIONSHIP': {
            if (arg.args.length !== 2) throw new DaxError('USERELATIONSHIP espera 2 colunas.', arg.pos)
            const a = this.colArg(arg.args[0], ctx)
            const b = this.colArg(arg.args[1], ctx)
            const rel = this.model.relationships.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a))
            if (!rel) throw new DaxError(`Não existe relação entre ${a.qualifiedName} e ${b.qualifiedName}.`, arg.pos)
            activate = activate ?? new Set()
            activate.add(rel.id)
            return
          }
          case 'CROSSFILTER': {
            if (arg.args.length !== 3) throw new DaxError('CROSSFILTER espera 3 argumentos.', arg.pos)
            const a = this.colArg(arg.args[0], ctx)
            const b = this.colArg(arg.args[1], ctx)
            const rel = this.model.relationships.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a))
            if (!rel) throw new DaxError(`Não existe relação entre ${a.qualifiedName} e ${b.qualifiedName}.`, arg.pos)
            const d = arg.args[2]
            const dv = d.k === 'kw' || d.k === 'table' ? (d.k === 'kw' ? d.v : d.name.toUpperCase()) : String(this.scalar(d, ctx)).toUpperCase()
            direction = direction ?? new Map()
            if (dv === 'BOTH') direction.set(rel.id, 'both')
            else if (dv === 'NONE') direction.set(rel.id, 'none')
            else if (dv === 'ONEWAY_RIGHTFILTERSLEFT' && rel.from === a) direction.set(rel.id, 'single')
            else if (dv === 'ONEWAY_LEFTFILTERSRIGHT' && rel.from === a) direction.set(rel.id, 'reverse')
            else direction.set(rel.id, 'single')
            return
          }
        }
      }
      if (this.isTableNode(arg, ctx)) {
        const tv = this.table(arg, ctx)
        const f = this.tableToFilter(tv)
        if (f) specs.push({ filter: f, keep })
        return
      }
      if (arg.k === 'var') {
        const v = this.any(arg, ctx)
        if (v instanceof TableValue) {
          const f = this.tableToFilter(v)
          if (f) specs.push({ filter: f, keep })
          return
        }
      }
      specs.push({ filter: this.predicateFilter(arg, ctx), keep })
    }

    for (const a of filterArgs) collect(a, false)

    let fc = ctx.hasPendingRows ? this.contextTransition(ctx) : ctx.fc
    if (activate || direction) {
      const rel: RelState = {
        activate: activate ?? fc.rel.activate,
        direction: direction ?? fc.rel.direction
      }
      fc = fc.withRel(rel)
    }
    for (const m of modifiers) fc = m(fc)
    fc = this.applyFilters(fc, specs)
    return new Ctx(fc, ctx.frames, ctx.vars, ctx.frames.length)
  }

  private columnsOrTables(args: Node[], ctx: Ctx): { cols: ColRT[]; tables: TableRT[] } {
    const cols: ColRT[] = []
    const tables: TableRT[] = []
    for (const a of args) {
      if (a.k === 'ref') cols.push(this.colArg(a, ctx))
      else if (a.k === 'table') tables.push(this.requireTable(a.name, a))
      else if (a.k === 'kw' && a.v === 'EMPTY') continue
      else {
        const tv = this.table(a, ctx)
        const bt = tv.baseTable()
        if (bt) tables.push(bt)
        else for (const c of tv.cols) if (c.lineage) cols.push(c.lineage)
      }
    }
    return { cols, tables }
  }

  tableArgBase(n: Node, ctx: Ctx): TableRT {
    if (n.k === 'table') return this.requireTable(n.name, n)
    const tv = this.table(n, ctx)
    const bt = tv.baseTable()
    if (!bt) throw new DaxError('Era esperada uma referência de tabela.', n.pos)
    return bt
  }

  allExcept(fc: FilterContext, t: TableRT, keep: ColRT[]): FilterContext {
    const keepSet = new Set(keep)
    const tables = this.model.expandedTables(t, fc.rel)
    const cols: ColRT[] = []
    for (const tb of tables) for (const c of tb.columns) if (!keepSet.has(c)) cols.push(c)
    // remove filtros em colunas não mantidas e filtros de linhas das tabelas
    const colSet = new Set(cols)
    const out: Filter[] = []
    for (const f of fc.filters) {
      if (f.kind === 'rows') {
        if (tables.includes(f.table)) continue
        out.push(f)
        continue
      }
      const k = f.cols.filter((c) => !colSet.has(c))
      if (k.length === f.cols.length) out.push(f)
      else {
        const p = f.project(k)
        if (p) out.push(p)
      }
    }
    return new FilterContext(this.model, out, fc.rel, null, null, fc.shadow)
  }

  allSelected(fc: FilterContext, cols: ColRT[], tables: TableRT[], all: boolean): FilterContext {
    const shadow = fc.shadow
    if (all) {
      if (!shadow) return new FilterContext(this.model, [], fc.rel, null, null, null)
      return new FilterContext(this.model, shadow.filters, fc.rel, null, null, shadow)
    }
    const removed = this.removeFilters(fc, cols, tables)
    if (!shadow) return removed
    // Restaura os filtros "externos" (do visual) nas colunas indicadas.
    const tableSet = new Set<TableRT>()
    for (const t of tables) for (const x of this.model.expandedTables(t, fc.rel)) tableSet.add(x)
    const colSet = new Set(cols)
    const restore: Filter[] = []
    for (const f of shadow.filters) {
      if (f.kind === 'rows') {
        if (tableSet.has(f.table)) restore.push(f)
        continue
      }
      const k = f.cols.filter((c) => colSet.has(c) || tableSet.has(c.table))
      if (k.length) {
        const p = f.project(k)
        if (p) restore.push(p)
      }
    }
    if (!restore.length) return removed
    return new FilterContext(this.model, [...removed.filters, ...restore], fc.rel, null, null, shadow)
  }

  /** Converte uma tabela em filtro (linhagem das colunas). */
  tableToFilter(tv: TableValue): Filter | null {
    const bt = tv.baseTable()
    if (bt) {
      const rows: number[] = []
      for (let i = 0; i < tv.rowCount; i++) {
        const r = tv.baseRow(i)
        if (r >= 0) rows.push(r)
      }
      return new RowsFilter(bt, sortUnique(rows, bt.rowCount), true)
    }
    const idx: number[] = []
    const cols: ColRT[] = []
    tv.cols.forEach((c, i) => {
      if (c.lineage && !cols.includes(c.lineage)) {
        idx.push(i)
        cols.push(c.lineage)
      }
    })
    if (cols.length === 0) return null
    const tuples: NormKey[][] = []
    for (let r = 0; r < tv.rowCount; r++) tuples.push(idx.map((i) => normKey(tv.get(r, i))))
    if (cols.length === 1) return ValuesFilter.single(cols[0], tuples.map((t) => t[0]))
    return new ValuesFilter(cols, tuples)
  }

  /** Coleta referências de coluna de um predicado booleano. */
  private predicateColumns(n: Node, ctx: Ctx, out: Set<ColRT>): boolean {
    let hasMeasure = false
    const walk = (x: Node): void => {
      switch (x.k) {
        case 'ref': {
          if (x.table) {
            const t = this.model.table(x.table)
            const c = t ? this.resolveColumn(t, x.name, x.level) : undefined
            if (c) out.add(c)
            else hasMeasure = true
          } else {
            if (!ctx.frames.some((f) => f.tv.colByName(x.name) >= 0)) hasMeasure = true
          }
          return
        }
        case 'call':
          if (COLUMN_CONSUMERS.has(x.name)) {
            hasMeasure = true
            return
          }
          x.args.forEach(walk)
          return
        case 'unary':
          walk(x.e)
          return
        case 'bin':
          walk(x.l)
          walk(x.r)
          return
        case 'in':
          walk(x.l)
          walk(x.r)
          return
        case 'var':
          x.defs.forEach((d) => walk(d.e))
          walk(x.ret)
          return
        case 'tablector':
          x.rows.forEach((r) => r.forEach(walk))
          return
        default:
          return
      }
    }
    walk(n)
    return hasMeasure
  }

  /** Filtro booleano do CALCULATE: FILTER(ALL(colunas), predicado). */
  predicateFilter(pred: Node, ctx: Ctx): ValuesFilter {
    const cols = new Set<ColRT>()
    const hasDynamic = this.predicateColumns(pred, ctx, cols)
    if (cols.size === 0) throw new DaxError('A expressão de filtro do CALCULATE deve referenciar ao menos uma coluna.', pred.pos)
    const colList = [...cols]
    const t0 = colList[0].table
    if (colList.some((c) => c.table !== t0)) {
      throw new DaxError('Um filtro booleano do CALCULATE deve usar colunas de uma única tabela.', pred.pos)
    }
    // Caminho rápido: coluna <op> constante
    if (colList.length === 1 && !hasDynamic) {
      const fast = this.fastPredicate(pred, colList[0], ctx)
      if (fast) return fast
    }
    const combos = this.allCombos(colList)
    const frame: Frame = { tv: combos, row: 0 }
    const inner = ctx.withFrame(frame)
    const keep: NormKey[][] = []
    for (let r = 0; r < combos.rowCount; r++) {
      frame.row = r
      if (toBool(this.scalar(pred, inner))) {
        const t: NormKey[] = []
        for (let c = 0; c < colList.length; c++) t.push(normKey(combos.get(r, c)))
        keep.push(t)
      }
    }
    if (colList.length === 1) return ValuesFilter.single(colList[0], keep.map((k) => k[0]))
    return new ValuesFilter(colList, keep)
  }

  private fastPredicate(pred: Node, col: ColRT, ctx: Ctx): ValuesFilter | null {
    const isCol = (n: Node) => n.k === 'ref' && this.tryColArg(n, ctx) === col
    let op: string | null = null
    let other: Node | null = null
    let flipped = false
    if (pred.k === 'bin' && ['=', '==', '<>', '<', '>', '<=', '>='].includes(pred.op)) {
      if (isCol(pred.l)) {
        op = pred.op
        other = pred.r
      } else if (isCol(pred.r)) {
        op = pred.op
        other = pred.l
        flipped = true
      }
    } else if (pred.k === 'in' && isCol(pred.l)) {
      const t = this.table(pred.r, ctx)
      const vals: Scalar[] = []
      for (let r = 0; r < t.rowCount; r++) vals.push(t.get(r, 0))
      const idx = col.valueIndex
      const keys: NormKey[] = []
      for (let id = 0; id < idx.distinctCount; id++) {
        const v = idx.values[id]
        if (vals.some((x) => safeEq('==', v, x))) keys.push(idx.keys[id])
      }
      return ValuesFilter.single(col, keys)
    }
    if (!op || !other) return null
    const c = this.scalar(other, ctx)
    const idx = col.valueIndex
    const keys: NormKey[] = []
    for (let id = 0; id < idx.distinctCount; id++) {
      const v = idx.values[id]
      if (flipped ? safeEq(op, c, v) : safeEq(op, v, c)) keys.push(idx.keys[id])
    }
    // linha em branco virtual
    if ((flipped ? safeEq(op, c, null) : safeEq(op, null, c)) && !keys.includes(null)) keys.push(null)
    return ValuesFilter.single(col, keys)
  }

  /** Todas as combinações distintas existentes das colunas (ALL(cols)). */
  allCombos(cols: ColRT[]): MatTV {
    const t = cols[0].table
    const n = t.rowCount
    const tvCols: TVCol[] = cols.map((c) => ({ name: c.name, lineage: c, type: c.type }))
    if (cols.length === 1) {
      const idx = cols[0].valueIndex
      const values = [...idx.values]
      if (idx.blankId < 0 && this.hasBlankRow(t)) values.push(null)
      return new MatTV(tvCols, [values], values.length)
    }
    const ids = cols.map((c) => c.valueIndex)
    const seen = new Set<string>()
    const data: Scalar[][] = cols.map(() => [])
    for (let r = 0; r < n; r++) {
      let key = ''
      for (let c = 0; c < cols.length; c++) key += (c ? ',' : '') + ids[c].ids[r]
      if (seen.has(key)) continue
      seen.add(key)
      for (let c = 0; c < cols.length; c++) data[c].push(ids[c].values[ids[c].ids[r]])
    }
    if (this.hasBlankRow(t)) {
      const allBlank = data[0].some((_, i) => data.every((d) => d[i] === null))
      if (!allBlank) for (const d of data) d.push(null)
    }
    return new MatTV(tvCols, data)
  }

  /** A tabela tem linha em branco virtual (chaves sem correspondência)? */
  hasBlankRow(t: TableRT): boolean {
    for (const r of this.model.relationships) if (r.toTable === t && r.hasUnmatched()) return true
    return false
  }

  /** A linha em branco está visível no contexto? */
  blankRowVisible(t: TableRT, fc: FilterContext): boolean {
    if (!fc.visible(t).blank) return false
    for (const r of this.model.relationships) {
      if (r.toTable !== t || !r.hasUnmatched()) continue
      if (!this.model.isRelActive(r, fc.rel)) continue
      const un = r.unmatched()
      const vis = fc.visible(r.fromTable)
      if (vis.rows === null) return true
      // interseção não vazia?
      let i = 0
      let j = 0
      const a = un
      const b = vis.rows
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) return true
        if (a[i] < b[j]) i++
        else j++
      }
    }
    return false
  }

  /** VALUES/DISTINCT de uma coluna no contexto. */
  distinctValues(col: ColRT, fc: FilterContext, includeBlankRow: boolean): MatTV {
    const t = col.table
    const sel = fc.visible(t)
    const idx = col.valueIndex
    const values: Scalar[] = []
    let hasNull = false
    if (sel.rows === null) {
      for (let id = 0; id < idx.distinctCount; id++) values.push(idx.values[id])
      hasNull = idx.blankId >= 0
    } else {
      const seen = new Uint8Array(idx.distinctCount)
      const ids = idx.ids
      const rows = sel.rows
      for (let i = 0; i < rows.length; i++) {
        const id = ids[rows[i]]
        if (!seen[id]) {
          seen[id] = 1
          values.push(idx.values[id])
          if (id === idx.blankId) hasNull = true
        }
      }
    }
    if (includeBlankRow && !hasNull && this.blankRowVisible(t, fc)) values.push(null)
    return new MatTV([{ name: col.name, lineage: col, type: col.type }], [values], values.length)
  }

  // --------------------------------------------------------------------
  // Utilidades para funções
  // --------------------------------------------------------------------

  /** Itera as linhas de uma tabela avaliando uma expressão por linha. */
  iterate(tv: TableValue, expr: Node, ctx: Ctx, cb: (v: Scalar, row: number) => boolean | void): void {
    const frame: Frame = { tv, row: 0 }
    const inner = ctx.withFrame(frame)
    const n = tv.rowCount
    for (let r = 0; r < n; r++) {
      frame.row = r
      if (cb(this.scalar(expr, inner), r) === false) break
    }
  }

  /** Avalia uma expressão por linha retornando todos os valores. */
  mapRows(tv: TableValue, expr: Node, ctx: Ctx): Scalar[] {
    const out: Scalar[] = new Array(tv.rowCount)
    this.iterate(tv, expr, ctx, (v, r) => {
      out[r] = v
    })
    return out
  }

  /** Contexto com uma linha (para avaliações pontuais). */
  rowCtx(ctx: Ctx, tv: TableValue, row: number): Ctx {
    return ctx.withFrame({ tv, row })
  }
}

function safeEq(op: string, a: Scalar, b: Scalar): boolean {
  try {
    return compareOp(op, a, b)
  } catch {
    return false
  }
}
