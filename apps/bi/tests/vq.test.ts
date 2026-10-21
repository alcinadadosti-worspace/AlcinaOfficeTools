import { describe, expect, it } from 'vitest'
import { buildModel } from './daxmodel'
import { VisualQueryEngine } from '@engine/vq/execute'

const t = buildModel({
  measures: {
    'Total Vendas': 'SUM(Vendas[Valor])',
    '% Total': 'DIVIDE([Total Vendas], CALCULATE([Total Vendas], ALLSELECTED(Produto)))',
    Escopo: 'IF(ISINSCOPE(Produto[Nome]), "nome", IF(ISINSCOPE(Produto[Categoria]), "cat", "total"))'
  }
})
const vq = new VisualQueryEngine(t.ev)
const M = (measure: string) => ({ table: 'Vendas', measure })

describe('consultas de visuais', () => {
  it('agrupa por coluna de dimensão com linha em branco', () => {
    const r = vq.execute({ groupBy: [{ table: 'Produto', column: 'Categoria' }], values: [M('Total Vendas')], filters: [] })
    expect(r.rows).toEqual([
      [null, 77],
      ['Esporte', 3570],
      ['Roupas', 850]
    ])
    expect(r.columns.map((c) => c.name)).toEqual(['Categoria', 'Total Vendas'])
  })

  it('agrupa por várias tabelas usando a tabela fato como ponte', () => {
    const r = vq.execute({
      groupBy: [
        { table: 'Produto', column: 'Categoria' },
        { table: 'Cliente', column: 'Estado' }
      ],
      values: [{ table: 'Vendas', column: 'Valor', aggregation: 'sum' }],
      filters: [{ kind: 'in', field: { table: 'Produto', column: 'Categoria' }, values: ['Esporte'] }]
    })
    expect(r.rows).toEqual([
      ['Esporte', 'RJ', 450],
      ['Esporte', 'SP', 3120]
    ])
    expect(r.columns[2].name).toBe('Soma de Valor')
  })

  it('filtros Top N, de medida e conjuntos de totais', () => {
    const r = vq.execute({
      groupBy: [{ table: 'Produto', column: 'Nome' }],
      values: [M('Total Vendas')],
      filters: [{ kind: 'topN', field: { table: 'Produto', column: 'Nome' }, n: 2, by: M('Total Vendas') }],
      orderBy: [{ kind: 'value', index: 0, desc: true }],
      groupingSets: [[]]
    })
    expect(r.rows).toEqual([
      ['Bicicleta', 3000],
      ['Camiseta', 700]
    ])
    expect(r.sets[0].rows[0].values).toEqual([3700])
    const r2 = vq.execute({
      groupBy: [{ table: 'Produto', column: 'Nome' }],
      values: [M('Total Vendas')],
      filters: [{ kind: 'measure', field: M('Total Vendas'), op: 'gt', value: 400 }]
    })
    expect(r2.rows.map((x) => x[0])).toEqual(['Bicicleta', 'Camiseta', 'Capacete'])
  })

  it('ALLSELECTED respeita os filtros externos do visual', () => {
    const r = vq.execute({
      groupBy: [{ table: 'Produto', column: 'Cor' }],
      values: [M('% Total')],
      filters: [{ kind: 'in', field: { table: 'Produto', column: 'Cor' }, values: ['Azul', 'Preto'] }]
    })
    const azul = r.rows.find((x) => x[0] === 'Azul')!
    expect(azul[1]).toBeCloseTo(570 / 720)
  })

  it('realce cruzado e ISINSCOPE', () => {
    const r = vq.execute({
      groupBy: [{ table: 'Produto', column: 'Categoria' }],
      values: [M('Total Vendas')],
      filters: [],
      highlight: [{ kind: 'in', field: { table: 'Produto', column: 'Cor' }, values: ['Vermelho'] }]
    })
    expect(r.highlights).toEqual([[null], [3000], [700]])
    const s = vq.execute({
      groupBy: [
        { table: 'Produto', column: 'Categoria' },
        { table: 'Produto', column: 'Nome' }
      ],
      values: [M('Escopo')],
      filters: [],
      groupingSets: [[0], []]
    })
    expect(s.rows[0][2]).toBe('nome')
    expect(s.sets[0].rows[0].values[0]).toBe('cat')
    expect(s.sets[1].rows[0].values[0]).toBe('total')
  })

  it('hierarquia de datas e filtros avançados/intervalo', () => {
    const r = vq.execute({
      groupBy: [{ table: 'Vendas', column: 'Data', level: 'year' }],
      values: [M('Total Vendas')],
      filters: [{ kind: 'advanced', field: { table: 'Cliente', column: 'Estado' }, logic: 'or', conditions: [{ op: 'eq', value: 'SP' }, { op: 'eq', value: 'RJ' }] }]
    })
    expect(r.rows).toEqual([
      [2023, 3500],
      [2024, 420]
    ])
    const r2 = vq.execute({
      groupBy: [],
      values: [M('Total Vendas')],
      filters: [{ kind: 'range', field: { table: 'Vendas', column: 'Valor' }, min: 150, max: 500 }]
    })
    expect(r2.rows).toEqual([[300 + 200 + 500 + 150 + 150]])
  })

  it('exclui um único ponto (categoria+série) sem apagar a categoria nem a série', () => {
    const fields = [
      { table: 'Produto', column: 'Categoria' },
      { table: 'Produto', column: 'Cor' }
    ]
    const r = vq.execute({
      groupBy: [{ table: 'Produto', column: 'Categoria' }],
      values: [M('Total Vendas')],
      filters: [{ kind: 'tuple', fields, tuples: [['Esporte', 'Vermelho']], not: true }]
    })
    // Esporte perde apenas o Vermelho (3000), caindo de 3570 para 570; a categoria continua presente.
    expect(r.rows.find((x) => x[0] === 'Esporte')?.[1]).toBe(570)
    // Roupas (que também tem Vermelho = 700) permanece intacto em 850 — NÃO foi excluído junto.
    expect(r.rows.find((x) => x[0] === 'Roupas')?.[1]).toBe(850)
  })
})
