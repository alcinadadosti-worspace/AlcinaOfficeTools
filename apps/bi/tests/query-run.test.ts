import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { QueryRunner, QueryError } from '@engine/query/run'
import type { DbSourceConnection, QueryDef, SourceHost, StepDef, StepOp } from '@engine/query/types'
import { autoSteps } from '@engine/io/headers'
import { queryScript, sourceFormula, stepFormula } from '@engine/query/mcode'
import { defaultStepName, uniqueStepName, uniqueQueryName } from '@engine/query/names'
import { profileColumn } from '@engine/query/profile'
import { Column } from '@engine/data/column'
import { DateVal } from '@engine/data/types'
import { makeDate } from '@engine/data/dates'

const enc = (s: string) => new TextEncoder().encode(s)

class FakeHost implements SourceHost {
  files = new Map<string, { data: Uint8Array; mtime: number }>()
  web = new Map<string, { status: number; contentType: string; data: Uint8Array }>()
  dbResult: { columns: { name: string; type: string }[]; rows: unknown[][] } = { columns: [], rows: [] }
  reads = 0
  fetches = 0
  setFile(path: string, content: string | Uint8Array, mtime = 1) {
    this.files.set(path, { data: typeof content === 'string' ? enc(content) : content, mtime })
  }
  async readFile(path: string) {
    this.reads++
    const f = this.files.get(path)
    if (!f) throw new Error(`Arquivo inexistente: ${path}`)
    return f.data
  }
  async statFile(path: string) {
    const f = this.files.get(path)
    return f ? { size: f.data.length, mtimeMs: f.mtime } : null
  }
  async listDir(path: string) {
    const prefix = path.replace(/[\\/]+$/, '') + '\\'
    return [...this.files.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('\\'))
      .map(([p, f]) => ({ name: p.slice(prefix.length), isDir: false, size: f.data.length, mtimeMs: f.mtime }))
  }
  async fetchUrl(url: string) {
    this.fetches++
    const r = this.web.get(url)
    if (!r) return { status: 404, contentType: 'text/plain', data: enc('not found') }
    return r
  }
  async dbQuery(_c: DbSourceConnection, _sql: string) {
    return this.dbResult
  }
}

const step = (name: string, op: StepOp): StepDef => ({ id: `id_${name}`, name, op })

function salesCsv(): string {
  return 'Pedido;Cliente;Valor;Data\n1;c1;10,50;31/01/2024\n2;c2;20;01/02/2024\n3;c1;5,25;15/02/2024\n4;c3;;20/02/2024'
}

async function salesQuery(host: FakeHost): Promise<QueryDef> {
  host.setFile('C:\\dados\\vendas.csv', salesCsv())
  const runner = new QueryRunner(host)
  const source = { kind: 'csv' as const, path: 'C:\\dados\\vendas.csv', delimiter: ';', encoding: 'auto' as const }
  const raw = await runner.loadSource(source)
  return { id: 'vendas', name: 'Vendas', source, steps: autoSteps(raw), load: true }
}

describe('QueryRunner', () => {
  it('avalia fonte, etapas automáticas e etapas posteriores', async () => {
    const host = new FakeHost()
    const q = await salesQuery(host)
    q.steps.push(step('Linhas Filtradas', { op: 'filterRows', condition: { kind: 'compare', column: 'Valor', operator: 'isNotNull' } }))
    const runner = new QueryRunner(host)
    const t = await runner.evaluate([q], 'vendas')
    expect(t.columnNames()).toEqual(['Pedido', 'Cliente', 'Valor', 'Data'])
    expect(t.rowCount).toBe(3)
    expect(t.column('Valor')!.toArray()).toEqual([10.5, 20, 5.25])
    expect((t.column('Data')!.get(0) as DateVal).ms).toBe(makeDate(2024, 1, 31))
    const raw = await runner.evaluate([q], 'vendas', -1)
    expect(raw.columnNames()[0]).toBe('Column1')
    expect(raw.rowCount).toBe(5)
  })

  it('usa cache e invalida quando o arquivo muda', async () => {
    const host = new FakeHost()
    const q = await salesQuery(host)
    const runner = new QueryRunner(host)
    host.reads = 0
    await runner.evaluate([q], 'vendas')
    await runner.evaluate([q], 'vendas')
    await runner.preview([q], 'vendas', 0)
    expect(host.reads).toBe(1)
    host.setFile('C:\\dados\\vendas.csv', salesCsv() + '\n5;c2;1;21/02/2024', 2)
    const t = await runner.evaluate([q], 'vendas')
    expect(host.reads).toBe(2)
    expect(t.rowCount).toBe(5)
    runner.invalidate('C:\\dados\\vendas.csv')
    await runner.evaluate([q], 'vendas')
    expect(host.reads).toBe(3)
  })

  it('resolve referências, mesclagens e acréscimos', async () => {
    const host = new FakeHost()
    const vendas = await salesQuery(host)
    const clientes: QueryDef = {
      id: 'clientes',
      name: 'Clientes',
      source: {
        kind: 'enterData',
        columns: [
          { name: 'Id', type: 'text' },
          { name: 'Nome', type: 'text' }
        ],
        rows: [
          ['c1', 'Ana'],
          ['c2', 'Bia']
        ]
      },
      steps: [],
      load: true
    }
    const ref: QueryDef = {
      id: 'ref',
      name: 'Vendas (2)',
      source: { kind: 'reference', queryId: 'vendas' },
      steps: [
        step('Consultas Mescladas', { op: 'merge', rightQueryId: 'clientes', leftKeys: ['Cliente'], rightKeys: ['Id'], join: 'left', expand: ['Nome'] }),
        step('Consulta Acrescentada', { op: 'append', queryIds: ['vendas'] })
      ],
      load: true
    }
    const runner = new QueryRunner(host)
    const t = await runner.evaluate([vendas, clientes, ref], 'ref')
    expect(t.columnNames()).toEqual(['Pedido', 'Cliente', 'Valor', 'Data', 'Clientes.Nome'])
    expect(t.rowCount).toBe(8)
    expect(t.column('Clientes.Nome')!.toArray().slice(0, 4)).toEqual(['Ana', 'Bia', 'Ana', null])
  })

  it('detecta referência circular', async () => {
    const host = new FakeHost()
    const a: QueryDef = { id: 'a', name: 'A', source: { kind: 'reference', queryId: 'b' }, steps: [], load: true }
    const b: QueryDef = { id: 'b', name: 'B', source: { kind: 'reference', queryId: 'a' }, steps: [], load: true }
    const runner = new QueryRunner(host)
    await expect(runner.evaluate([a, b], 'a')).rejects.toThrow(/Referência circular detectada entre consultas: A → B → A/)
    const c: QueryDef = {
      id: 'c',
      name: 'C',
      source: { kind: 'blank' },
      steps: [step('Consulta Acrescentada', { op: 'append', queryIds: ['c'] })],
      load: true
    }
    await expect(runner.evaluate([c], 'c')).rejects.toThrow(/circular/)
  })

  it('informa a etapa com erro e gera visualização prévia', async () => {
    const host = new FakeHost()
    const q = await salesQuery(host)
    q.steps.push(step('Colunas Removidas', { op: 'removeColumns', columns: ['Inexistente'] }))
    const runner = new QueryRunner(host)
    await expect(runner.evaluate([q], 'vendas')).rejects.toBeInstanceOf(QueryError)
    try {
      await runner.evaluate([q], 'vendas')
    } catch (err) {
      expect((err as QueryError).stepName).toBe('Colunas Removidas')
      expect((err as Error).message).toBe('A coluna "Inexistente" da tabela não foi encontrada.')
    }
    const bad = await runner.preview([q], 'vendas', 2)
    expect(bad.error).toMatch(/Inexistente/)
    expect(bad.formula).toBe('= Table.RemoveColumns(#"Tipo Alterado", {"Inexistente"})')
    const ok = await runner.preview([q], 'vendas', 1, 2)
    expect(ok.error).toBeUndefined()
    expect(ok.rowCount).toBe(4)
    expect(ok.rows).toHaveLength(2)
    expect(ok.rows[0]).toEqual(['1', 'c1', '10,5', '31/01/2024'])
    expect(ok.columns.map((c) => c.type)).toEqual(['int', 'text', 'number', 'date'])
    expect(ok.formula).toMatch(/^= Table\.TransformColumnTypes\(#"Cabeçalhos Promovidos", \{\{"Pedido", Int64\.Type\}/)
    const valor = ok.profiles.find((p) => p.name === 'Valor')!
    expect(valor.empty).toBe(1)
    expect(valor.valid).toBe(3)
    const src = await runner.preview([q], 'vendas', -1)
    expect(src.formula).toBe('= Csv.Document(File.Contents("C:\\dados\\vendas.csv"), [Delimiter=";", Encoding=65001, QuoteStyle=QuoteStyle.Csv])')
  })

  it('lê Excel, JSON, web e banco de dados', async () => {
    const host = new FakeHost()
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Produto', 'Qtd'], ['A', 1], ['B', 2]]), 'Plan1')
    host.setFile('C:\\x\\a.xlsx', new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer))
    host.setFile('C:\\x\\b.json', JSON.stringify({ itens: [{ id: 1, v: 'x' }] }))
    host.web.set('https://ex.com/d.csv', { status: 200, contentType: 'text/csv', data: enc('a,b\n1,2') })
    host.web.set('https://ex.com/api', { status: 200, contentType: 'application/json', data: enc('[{"k":1},{"k":2}]') })
    host.dbResult = {
      columns: [
        { name: 'id', type: 'int4' },
        { name: 'criado', type: 'timestamp' },
        { name: 'nome', type: 'text' }
      ],
      rows: [
        [1, new Date(2024, 0, 2, 3, 4, 5), 'x'],
        [2, null, 'y']
      ]
    }
    const runner = new QueryRunner(host)
    const xl = await runner.loadSource({ kind: 'excel', path: 'C:\\x\\a.xlsx', sheet: 'Plan1' })
    expect(xl.rowCount).toBe(3)
    expect(xl.row(1)).toEqual(['A', 1])
    const js = await runner.loadSource({ kind: 'json', path: 'C:\\x\\b.json' })
    expect(js.columnNames()).toEqual(['id', 'v'])
    const csv = await runner.loadSource({ kind: 'web', url: 'https://ex.com/d.csv', format: 'auto' })
    expect(csv.row(1)).toEqual(['1', '2'])
    const api = await runner.loadSource({ kind: 'web', url: 'https://ex.com/api', format: 'auto' })
    expect(api.column('k')!.toArray()).toEqual([1, 2])
    await expect(runner.loadSource({ kind: 'web', url: 'https://ex.com/404', format: 'auto' })).rejects.toThrow(/HTTP 404/)
    const db = await runner.loadSource({
      kind: 'database',
      connection: { kind: 'postgres', host: 'h', database: 'd', user: 'u' },
      sql: 'select 1'
    })
    expect(db.column('id')!.type).toBe('int')
    expect(db.column('criado')!.type).toBe('datetime')
    expect((db.column('criado')!.get(0) as DateVal).ms).toBe(makeDate(2024, 1, 2, 3, 4, 5))
    expect(db.column('nome')!.type).toBe('text')
    await expect(runner.loadSource({ kind: 'parquet', path: 'C:\\x\\a.xlsx' })).rejects.toThrow(/Parquet/)
    await expect(runner.loadSource({ kind: 'csv', path: 'C:\\nada.csv', delimiter: ',', encoding: 'auto' })).rejects.toThrow(/não foi encontrado/)
  })

  it('combina arquivos de uma pasta', async () => {
    const host = new FakeHost()
    host.setFile('C:\\pasta\\jan.csv', 'Produto;Qtd\nA;1\nB;2')
    host.setFile('C:\\pasta\\fev.csv', 'Produto;Qtd\nC;3')
    host.setFile('C:\\pasta\\leia.txt', 'ignorar')
    const runner = new QueryRunner(host)
    const t = await runner.loadSource({ kind: 'folder', path: 'C:\\pasta', extension: 'csv' })
    expect(t.columnNames()).toEqual(['Source.Name', 'Produto', 'Qtd'])
    expect(t.rows()).toEqual([
      ['fev.csv', 'C', '3'],
      ['jan.csv', 'A', '1'],
      ['jan.csv', 'B', '2']
    ])
  })

  it('converte dados inseridos manualmente com tipos', async () => {
    const runner = new QueryRunner(new FakeHost())
    const t = await runner.loadSource({
      kind: 'enterData',
      columns: [
        { name: 'N', type: 'number' },
        { name: 'D', type: 'date' }
      ],
      rows: [
        ['1,5', '01/02/2024'],
        ['x', null]
      ]
    })
    expect(t.column('N')!.get(0)).toBe(1.5)
    expect(t.column('N')!.hasError(1)).toBe(true)
    expect((t.column('D')!.get(0) as DateVal).ms).toBe(makeDate(2024, 2, 1))
  })
})

describe('código M e nomes de etapas', () => {
  it('gera script do editor avançado', async () => {
    const host = new FakeHost()
    const q = await salesQuery(host)
    q.steps.push(step('Linhas Filtradas', { op: 'filterRows', condition: { kind: 'compare', column: 'Cliente', operator: 'eq', value: 'c1' } }))
    const script = queryScript(q, [q])
    expect(script.startsWith('let\n    Fonte = Csv.Document(')).toBe(true)
    expect(script).toContain('#"Cabeçalhos Promovidos" = Table.PromoteHeaders(Fonte, [PromoteAllScalars=true])')
    expect(script).toContain('#"Linhas Filtradas" = Table.SelectRows(#"Tipo Alterado", each [Cliente] = "c1")')
    expect(script.endsWith('in\n    #"Linhas Filtradas"')).toBe(true)
  })
  it('gera fórmulas de várias etapas', () => {
    const qs: QueryDef[] = [{ id: 'q2', name: 'Clientes', source: { kind: 'blank' }, steps: [], load: true }]
    const f = (op: StepOp) => stepFormula({ id: 'x', name: 'x', op }, 'Etapa Anterior', qs)
    expect(f({ op: 'sort', keys: [{ column: 'A', desc: true }] })).toBe('= Table.Sort(#"Etapa Anterior", {{"A", Order.Descending}})')
    expect(f({ op: 'merge', rightQueryId: 'q2', leftKeys: ['Id'], rightKeys: ['Id'], join: 'inner', expand: ['Nome'] })).toContain('JoinKind.Inner')
    expect(f({ op: 'groupBy', keys: ['A'], aggregations: [{ name: 'Total', fn: 'sum', column: 'V' }] })).toContain('List.Sum([V])')
    expect(f({ op: 'addColumn', name: 'T', expression: 'each [A] * 2' })).toBe('= Table.AddColumn(#"Etapa Anterior", "T", each [A] * 2)')
    expect(f({ op: 'append', queryIds: ['q2'] })).toBe('= Table.Combine({#"Etapa Anterior", Clientes})')
    expect(f({ op: 'transformText', columns: ['Cód'], fn: 'prefix', arg: 'x_y', newName: 'P' })).toBe(
      '= Table.AddColumn(#"Etapa Anterior", "P", each "x_y" & [Cód], type text)'
    )
    expect(sourceFormula({ kind: 'excel', path: 'C:\\a.xlsx', sheet: 'Plan1' })).toBe(
      '= Excel.Workbook(File.Contents("C:\\a.xlsx"), null, true){[Item="Plan1",Kind="Sheet"]}[Data]'
    )
  })
  it('nomeia etapas como o Power Query', () => {
    expect(defaultStepName({ op: 'changeTypes', columns: [] })).toBe('Tipo Alterado')
    expect(defaultStepName({ op: 'selectColumns', columns: [] })).toBe('Outras Colunas Removidas')
    expect(defaultStepName({ op: 'transformText', columns: [], fn: 'upper' })).toBe('Texto em Maiúscula')
    expect(uniqueStepName('Tipo Alterado', ['Fonte', 'Tipo Alterado', 'Tipo Alterado1'])).toBe('Tipo Alterado2')
    expect(uniqueQueryName('Vendas', ['vendas'])).toBe('Vendas (2)')
  })
})

describe('perfil de coluna', () => {
  it('calcula qualidade e distribuição', () => {
    const c = Column.fromScalars('X', 'text', ['a', 'b', 'a', null, '', 'c'])
    const p = profileColumn(c)
    expect(p).toMatchObject({ count: 6, valid: 4, empty: 2, errors: 0, distinct: 3, unique: 2, min: 'a', max: 'c' })
    expect(p.top[0]).toEqual({ value: 'a', count: 2 })
    const n = profileColumn(Column.fromScalars('N', 'number', [3, 1, 2, 1]))
    expect(n).toMatchObject({ distinct: 3, unique: 2, min: 1, max: 3 })
  })
})
