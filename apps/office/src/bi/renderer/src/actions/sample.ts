// Dados de exemplo: monta um pequeno modelo de vendas e um relatório pronto.
import type { SourceDef } from '@engine/query/types'
import type { FieldRef } from '@engine/vq/types'
import { defaultFormatFor } from '@engine/data/format'
import { engine } from '../engine/client'
import { useUi } from '../state/ui'
import { getDoc, updateDoc } from '../state/doc'
import { newFile } from './file'
import { addQueries } from './data'
import { addMeasure, enqueue, syncModelNow, upsertRelationship } from './model'
import { newVisual, uid } from '../report/defaults'
import type { VisualDef, VisualType, FormatProps } from '../report/types'

const PRODUTOS: [number, string, string, number][] = [
  [1, 'Notebook Pro', 'Eletrônicos', 3500],
  [2, 'Smartphone X', 'Eletrônicos', 2500],
  [3, 'Camiseta Básica', 'Vestuário', 60],
  [4, 'Calça Jeans', 'Vestuário', 120],
  [5, 'Sofá 3 Lugares', 'Casa', 1800],
  [6, 'Luminária LED', 'Casa', 90],
  [7, 'Café Especial', 'Alimentos', 25],
  [8, 'Chocolate 70%', 'Alimentos', 15]
]
const REGIOES = ['Sudeste', 'Sul', 'Nordeste', 'Norte', 'Centro-Oeste']

function buildSources(): { name: string; source: SourceDef }[] {
  const produtosRows: string[][] = PRODUTOS.map(([id, nome, cat]) => [String(id), nome, cat])
  const vendasRows: string[][] = []
  for (let m = 1; m <= 12; m++) {
    for (const [id, , , preco] of PRODUTOS) {
      const qtd = ((m * 7 + id * 13) % 18) + 2
      const valor = qtd * preco
      const regiao = REGIOES[(m + id) % REGIOES.length]
      vendasRows.push([`15/${String(m).padStart(2, '0')}/2025`, String(id), regiao, String(qtd), String(valor)])
    }
  }
  const produtos: SourceDef = {
    kind: 'enterData',
    columns: [
      { name: 'ProdutoID', type: 'int' },
      { name: 'Produto', type: 'text' },
      { name: 'Categoria', type: 'text' }
    ],
    rows: produtosRows
  }
  const vendas: SourceDef = {
    kind: 'enterData',
    columns: [
      { name: 'Data', type: 'date' },
      { name: 'ProdutoID', type: 'int' },
      { name: 'Região', type: 'text' },
      { name: 'Quantidade', type: 'int' },
      { name: 'Valor', type: 'currency' }
    ],
    rows: vendasRows
  }
  return [
    { name: 'Produtos', source: produtos },
    { name: 'Vendas', source: vendas }
  ]
}

function mk(type: VisualType, x: number, y: number, z: number, w: number, h: number, fields: Record<string, FieldRef[]>, format: FormatProps = {}): VisualDef {
  const v = newVisual(type, x, y, z)
  v.w = w
  v.h = h
  v.fields = fields
  v.format = format
  return v
}

export async function loadSample(): Promise<void> {
  const ui = useUi.getState()
  ui.set({ loading: { message: 'Preparando dados de exemplo...' } })
  try {
    await newFile(true)

    const items = []
    for (const s of buildSources()) {
      const { steps } = await enqueue(() => engine.inspectSource(s.source))
      items.push({ name: s.name, source: s.source, steps })
    }
    await addQueries(items, 'load')

    // Garante a relação Vendas -> Produtos (caso a detecção automática não a crie).
    const doc = getDoc()
    const hasTables = doc.model.tables.some((t) => t.name === 'Vendas') && doc.model.tables.some((t) => t.name === 'Produtos')
    const hasRel = doc.model.relationships.some(
      (r) => (r.fromTable === 'Vendas' && r.toTable === 'Produtos') || (r.fromTable === 'Produtos' && r.toTable === 'Vendas')
    )
    if (hasTables && !hasRel) {
      upsertRelationship({
        id: uid('rel'),
        fromTable: 'Vendas',
        fromColumn: 'ProdutoID',
        toTable: 'Produtos',
        toColumn: 'ProdutoID',
        cardinality: 'manyToOne',
        crossFilter: 'single',
        active: true
      })
    }

    // Medidas.
    addMeasure('Vendas', { name: 'Receita Total', expression: 'SUM(Vendas[Valor])', formatString: defaultFormatFor('currency') })
    addMeasure('Vendas', { name: 'Quantidade Vendida', expression: 'SUM(Vendas[Quantidade])', formatString: defaultFormatFor('int') })
    addMeasure('Vendas', { name: 'Ticket Médio', expression: 'DIVIDE([Receita Total], [Quantidade Vendida])', formatString: defaultFormatFor('currency') })

    // Campos reutilizados.
    const mRec: FieldRef = { table: 'Vendas', measure: 'Receita Total' }
    const mQtd: FieldRef = { table: 'Vendas', measure: 'Quantidade Vendida' }
    const mTicket: FieldRef = { table: 'Vendas', measure: 'Ticket Médio' }
    const fCategoria: FieldRef = { table: 'Produtos', column: 'Categoria' }
    const fProduto: FieldRef = { table: 'Produtos', column: 'Produto' }
    const fData: FieldRef = { table: 'Vendas', column: 'Data' }
    const fRegiao: FieldRef = { table: 'Vendas', column: 'Região' }
    const title = (text: string): FormatProps => ({ title: { show: true, text } })

    const visuals: VisualDef[] = [
      mk('card', 16, 16, 1, 250, 104, { values: [mRec] }),
      mk('card', 282, 16, 2, 250, 104, { values: [mQtd] }),
      mk('card', 548, 16, 3, 250, 104, { values: [mTicket] }),
      mk('slicer', 16, 136, 4, 250, 300, { field: [fRegiao] }, { sheader: { show: true, text: 'Região' } }),
      mk('column', 282, 136, 5, 480, 300, { category: [fCategoria], values: [mRec] }, title('Receita por categoria')),
      mk('line', 778, 136, 6, 486, 300, { category: [fData], values: [mRec] }, title('Receita por mês')),
      mk('table', 282, 452, 7, 480, 252, { values: [fProduto, mQtd, mRec] }, title('Detalhe por produto')),
      mk('donut', 778, 452, 8, 486, 252, { category: [fRegiao], values: [mRec] }, title('Receita por região'))
    ]

    updateDoc('Relatório de exemplo', (d) => {
      const page = d.report.pages[0]
      page.name = 'Visão Geral'
      page.visuals = visuals
    })

    await syncModelNow()
    const pageId = getDoc().report.pages[0].id
    useUi.getState().set({ view: 'report', showStart: false, activePageId: pageId, selectedVisualIds: [], selection: {} })
    useUi.getState().toast({ intent: 'success', title: 'Relatório de exemplo pronto', body: 'Explore os visuais, medidas e o modelo.' })
  } catch (e) {
    useUi.getState().openDialog({ kind: 'error', title: 'Não foi possível carregar o exemplo', message: e instanceof Error ? e.message : String(e) })
  } finally {
    useUi.getState().set({ loading: null })
  }
}
