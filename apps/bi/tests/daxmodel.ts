// Modelo de exemplo (esquema estrela) para os testes do motor DAX.
import { Column } from '@engine/data/column'
import { DataTable } from '@engine/data/table'
import { type DataType, DateVal, type Scalar } from '@engine/data/types'
import { makeDate, MS_PER_DAY } from '@engine/data/dates'
import { ModelRuntime, normKey } from '@engine/model/runtime'
import type { ModelDef, TableDef } from '@engine/model/types'
import { Evaluator, FilterContext, ValuesFilter, installCalcHooks } from '@engine/dax'

export function d(y: number, m: number, day: number): DateVal {
  return new DateVal(makeDate(y, m, day), 'date')
}

function table(name: string, cols: [string, DataType][], rows: Scalar[][], extra: Partial<TableDef> = {}) {
  const data = new DataTable(cols.map(([n, t], i) => Column.fromScalars(n, t, rows.map((r) => r[i]))))
  const def: TableDef = {
    name,
    columns: cols.map(([n, t]) => ({ name: n, dataType: t, summarizeBy: t === 'int' || t === 'number' ? 'sum' : 'none' })),
    measures: [],
    hierarchies: [],
    ...extra
  }
  return { def, data }
}

export interface TestModel {
  model: ModelRuntime
  ev: Evaluator
  def: ModelDef
  ctx(filters?: [string, string, Scalar[]][]): FilterContext
  m(expr: string, filters?: [string, string, Scalar[]][]): Scalar
}

export function buildModel(opts: { measures?: Record<string, string>; calcColumns?: { table: string; name: string; expr: string }[]; calcTables?: { name: string; expr: string }[] } = {}): TestModel {
  const produto = table(
    'Produto',
    [
      ['ProdutoID', 'int'],
      ['Nome', 'text'],
      ['Cor', 'text'],
      ['Categoria', 'text'],
      ['Preco', 'number']
    ],
    [
      [1, 'Bicicleta', 'Vermelho', 'Esporte', 1000],
      [2, 'Capacete', 'Azul', 'Esporte', 150],
      [3, 'Camiseta', 'Vermelho', 'Roupas', 50],
      [4, 'Boné', 'Preto', 'Roupas', 30],
      [5, 'Luva', 'Azul', 'Esporte', 40]
    ]
  )
  const cliente = table(
    'Cliente',
    [
      ['ClienteID', 'int'],
      ['Nome', 'text'],
      ['Estado', 'text']
    ],
    [
      [10, 'Ana', 'SP'],
      [11, 'Bruno', 'RJ'],
      [12, 'Carla', 'SP'],
      [13, 'Davi', 'MG']
    ]
  )
  // Calendário 2023-01-01 .. 2024-12-31
  const cal: Scalar[][] = []
  for (let x = makeDate(2023, 1, 1); x <= makeDate(2024, 12, 31); x += MS_PER_DAY) {
    const dt = new Date(x)
    cal.push([new DateVal(x, 'date'), dt.getUTCFullYear(), dt.getUTCMonth() + 1])
  }
  const calendario = table(
    'Calendario',
    [
      ['Data', 'date'],
      ['Ano', 'int'],
      ['Mes', 'int']
    ],
    cal,
    { dateColumn: 'Data' }
  )
  const vendas = table(
    'Vendas',
    [
      ['VendaID', 'int'],
      ['Data', 'date'],
      ['ProdutoID', 'int'],
      ['ClienteID', 'int'],
      ['Qtd', 'int'],
      ['Valor', 'number']
    ],
    [
      [1, d(2023, 1, 15), 1, 10, 1, 1000],
      [2, d(2023, 2, 10), 2, 11, 2, 300],
      [3, d(2023, 3, 5), 3, 10, 4, 200],
      [4, d(2023, 6, 20), 1, 12, 2, 2000],
      [5, d(2024, 1, 10), 3, 13, 10, 500],
      [6, d(2024, 2, 14), 4, 10, 5, 150],
      [7, d(2024, 3, 1), 2, 11, 1, 150],
      [8, d(2024, 3, 20), 5, 12, 3, 120],
      [9, d(2024, 6, 30), 99, 13, 1, 77] // produto inexistente (linha em branco)
    ]
  )
  const tables = [produto, cliente, calendario, vendas]
  for (const [k, v] of Object.entries(opts.measures ?? {})) vendas.def.measures.push({ name: k, expression: v })
  for (const cc of opts.calcColumns ?? []) {
    const t = tables.find((x) => x.def.name === cc.table)!
    t.def.columns.push({ name: cc.name, dataType: 'any', summarizeBy: 'none', expression: cc.expr })
  }
  const defs = tables.map((t) => t.def)
  for (const ct of opts.calcTables ?? []) defs.push({ name: ct.name, expression: ct.expr, columns: [], measures: [], hierarchies: [] })
  const def: ModelDef = {
    tables: defs,
    relationships: [
      { id: 'r1', fromTable: 'Vendas', fromColumn: 'ProdutoID', toTable: 'Produto', toColumn: 'ProdutoID', cardinality: 'manyToOne', crossFilter: 'single', active: true },
      { id: 'r2', fromTable: 'Vendas', fromColumn: 'ClienteID', toTable: 'Cliente', toColumn: 'ClienteID', cardinality: 'manyToOne', crossFilter: 'single', active: true },
      { id: 'r3', fromTable: 'Vendas', fromColumn: 'Data', toTable: 'Calendario', toColumn: 'Data', cardinality: 'manyToOne', crossFilter: 'single', active: true }
    ],
    autoDateTime: true
  }
  const sources = new Map(tables.map((t) => [t.def.name, t.data]))
  const model = new ModelRuntime(def, sources)
  const ev = new Evaluator(model)
  installCalcHooks(ev)
  model.computeAll()
  const ctx = (filters: [string, string, Scalar[]][] = []) => {
    const fs = filters.map(([t, c, vals]) => ValuesFilter.single(model.table(t)!.column(c)!, vals.map(normKey)))
    return FilterContext.empty(model).addFilters(fs)
  }
  return {
    model,
    ev,
    def,
    ctx,
    m: (expr, filters = []) => {
      ev.clearCache()
      return ev.evalExpression(expr, ctx(filters))
    }
  }
}
