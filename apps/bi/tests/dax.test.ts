import { describe, expect, it } from 'vitest'
import { buildModel, d } from './daxmodel'
import { parseDax, parseDaxQuery, DaxError } from '@engine/dax'
import { DateVal } from '@engine/data/types'

const measures = {
  'Total Vendas': 'SUM(Vendas[Valor])',
  'Qtd Total': 'SUM(Vendas[Qtd])',
  'Num Vendas': 'COUNTROWS(Vendas)',
  'Vendas Vermelho': 'CALCULATE([Total Vendas], Produto[Cor] = "Vermelho")',
  '% do Total': 'DIVIDE([Total Vendas], CALCULATE([Total Vendas], ALL(Produto)))',
  YTD: 'TOTALYTD([Total Vendas], Calendario[Data])',
  'Ano Anterior': 'CALCULATE([Total Vendas], SAMEPERIODLASTYEAR(Calendario[Data]))',
  'Media por Cliente': 'AVERAGEX(VALUES(Cliente[ClienteID]), [Total Vendas])'
}

describe('parser DAX', () => {
  it('analisa expressões com precedência e VAR', () => {
    const n = parseDax('VAR x = 1 + 2 * 3 RETURN x ^ 2')
    expect(n.k).toBe('var')
    expect(() => parseDax('SUM(')).toThrow(DaxError)
    const q = parseDaxQuery('DEFINE MEASURE Vendas[X] = 1 EVALUATE Produto ORDER BY Produto[Nome] DESC')
    expect(q.evaluates[0].orderBy[0].desc).toBe(true)
  })
  it('aceita separador ";" e vírgula decimal', () => {
    const t = buildModel()
    expect(t.m('ROUND(1,256; 2)')).toBe(1.26)
    expect(t.m('IF(1 > 0; "sim"; "não")')).toBe('sim')
  })
})

describe('avaliação DAX', () => {
  const t = buildModel({ measures })

  it('agregações básicas', () => {
    expect(t.m('[Total Vendas]')).toBe(4497)
    expect(t.m('[Qtd Total]')).toBe(29)
    expect(t.m('[Num Vendas]')).toBe(9)
    expect(t.m('DISTINCTCOUNT(Vendas[ClienteID])')).toBe(4)
    expect(t.m('AVERAGE(Vendas[Valor])')).toBeCloseTo(4497 / 9)
    expect(t.m('MAX(Vendas[Data])')).toEqual(d(2024, 6, 30))
  })

  it('filtros propagam da dimensão para o fato', () => {
    expect(t.m('[Total Vendas]', [['Produto', 'Cor', ['Vermelho']]])).toBe(3700)
    expect(t.m('[Total Vendas]', [['Produto', 'Categoria', ['Roupas']]])).toBe(850)
    expect(t.m('[Total Vendas]', [['Cliente', 'Estado', ['SP']]])).toBe(1000 + 200 + 2000 + 150 + 120)
    // texto não diferencia maiúsculas
    expect(t.m('[Total Vendas]', [['Produto', 'Cor', ['vermelho']]])).toBe(3700)
  })

  it('CALCULATE sobrescreve e KEEPFILTERS intersecta', () => {
    expect(t.m('[Vendas Vermelho]', [['Produto', 'Cor', ['Azul']]])).toBe(3700)
    expect(t.m('CALCULATE([Total Vendas], KEEPFILTERS(Produto[Cor] = "Vermelho"))', [['Produto', 'Cor', ['Azul']]])).toBeNull()
    expect(t.m('CALCULATE([Total Vendas], Produto[Cor] IN {"Azul", "Preto"})')).toBe(300 + 150 + 120 + 150)
    expect(t.m('CALCULATE([Total Vendas], Produto[Preco] >= 150)')).toBe(1000 + 2000 + 300 + 150)
  })

  it('ALL, ALLEXCEPT e percentual do total', () => {
    expect(t.m('[% do Total]', [['Produto', 'Categoria', ['Esporte']]])).toBeCloseTo((1000 + 300 + 2000 + 150 + 120) / 4497)
    expect(t.m('CALCULATE([Total Vendas], ALL(Vendas))', [['Produto', 'Cor', ['Azul']]])).toBe(4497)
    expect(t.m('CALCULATE([Total Vendas], ALLEXCEPT(Produto, Produto[Categoria]))', [['Produto', 'Cor', ['Azul']], ['Produto', 'Categoria', ['Esporte']]])).toBe(3570)
    expect(t.m('CALCULATE([Total Vendas], REMOVEFILTERS())', [['Cliente', 'Estado', ['MG']]])).toBe(4497)
  })

  it('linha em branco de chaves sem correspondência', () => {
    expect(t.m('COUNTROWS(ALL(Produto))')).toBe(6)
    expect(t.m('COUNTROWS(VALUES(Produto[Cor]))')).toBe(4)
    expect(t.m('[Total Vendas]', [['Produto', 'Cor', [null]]])).toBe(77)
    expect(t.m('COUNTROWS(DISTINCT(Produto[Cor]))')).toBe(3)
  })

  it('iteradores e RELATED', () => {
    expect(t.m('SUMX(Vendas, Vendas[Qtd] * RELATED(Produto[Preco]))')).toBe(1000 + 300 + 200 + 2000 + 500 + 150 + 150 + 120)
    expect(t.m('SUMX(FILTER(Vendas, Vendas[Qtd] > 2), Vendas[Valor])')).toBe(200 + 500 + 150 + 120)
    expect(t.m('[Media por Cliente]')).toBeCloseTo(4497 / 4)
    expect(t.m('MAXX(VALUES(Produto[Nome]), [Total Vendas])')).toBe(3000)
    expect(t.m('CONCATENATEX(FILTER(Produto, Produto[Cor] = "Azul"), Produto[Nome], ", ", Produto[Nome], ASC)')).toBe('Capacete, Luva')
  })

  it('transição de contexto em FILTER', () => {
    expect(t.m('CALCULATE([Total Vendas], FILTER(ALL(Cliente), [Total Vendas] > 1000))')).toBe(1000 + 200 + 150 + 2000 + 120)
    expect(t.m('COUNTROWS(FILTER(Produto, [Total Vendas] > 200))')).toBe(3)
  })

  it('RANKX e TOPN', () => {
    expect(t.m('RANKX(ALL(Produto[Nome]), [Total Vendas])', [['Produto', 'Nome', ['Bicicleta']]])).toBe(1)
    expect(t.m('RANKX(ALL(Produto[Nome]), [Total Vendas])', [['Produto', 'Nome', ['Camiseta']]])).toBe(2)
    expect(t.m('COUNTROWS(TOPN(2, ALL(Produto), [Total Vendas]))')).toBe(2)
  })

  it('inteligência de tempo', () => {
    expect(t.m('[YTD]', [['Calendario', 'Mes', [3]], ['Calendario', 'Ano', [2024]]])).toBe(500 + 150 + 150 + 120)
    expect(t.m('[Ano Anterior]', [['Calendario', 'Ano', [2024]]])).toBe(1000 + 300 + 200 + 2000)
    expect(t.m('[Ano Anterior]', [['Calendario', 'Ano', [2024]], ['Calendario', 'Mes', [2]]])).toBe(300)
    expect(t.m('CALCULATE([Total Vendas], DATEADD(Calendario[Data], -1, MONTH))', [['Calendario', 'Ano', [2024]], ['Calendario', 'Mes', [3]]])).toBe(150)
    expect(t.m('CALCULATE([Total Vendas], DATESINPERIOD(Calendario[Data], DATE(2024,3,31), -3, MONTH))')).toBe(500 + 150 + 150 + 120)
    expect(t.m('CALCULATE([Total Vendas], PREVIOUSMONTH(Calendario[Data]))', [['Calendario', 'Ano', [2024]], ['Calendario', 'Mes', [3]]])).toBe(150)
    expect(t.m('CALCULATE([Total Vendas], PARALLELPERIOD(Calendario[Data], -1, YEAR))', [['Calendario', 'Ano', [2024]], ['Calendario', 'Mes', [1]]])).toBe(3500)
    expect(t.m('TOTALYTD([Total Vendas], Calendario[Data], "06-30")', [['Calendario', 'Ano', [2024]], ['Calendario', 'Mes', [3]]])).toBe(920)
    expect(t.m('LASTDATE(Calendario[Data])', [['Calendario', 'Ano', [2023]]])).toEqual(d(2023, 12, 31))
  })

  it('hierarquia automática de datas', () => {
    expect(t.m('CALCULATE([Total Vendas], Vendas[Data].[Ano] = 2023)')).toBe(3500)
    expect(t.m('CALCULATE([Total Vendas], Vendas[Data].[Mês] = 3)')).toBe(200 + 150 + 120)
  })

  it('funções escalares', () => {
    expect(t.m('SWITCH(TRUE(), 5 > 10, "a", 5 > 3, "b", "c")')).toBe('b')
    expect(t.m('FORMAT(1234.5, "#,0.00")')).toBe('1.234,50')
    expect(t.m('FORMAT(DATE(2024, 3, 5), "dd/MM/yyyy")')).toBe('05/03/2024')
    expect(t.m('LEFT("AlcinaBi", 6) & "-" & UPPER(RIGHT("abc", 2))')).toBe('Alcina-BC')
    expect(t.m('DIVIDE(10, 0, -1)')).toBe(-1)
    expect(t.m('DATEDIFF(DATE(2024,1,31), DATE(2024,3,1), MONTH)')).toBe(2)
    expect(t.m('EOMONTH(DATE(2024,1,15), 1)')).toEqual(d(2024, 2, 29))
    expect(t.m('BLANK() + 5')).toBe(5)
    expect(t.m('BLANK() * 5')).toBeNull()
    expect(t.m('IFERROR(1/0 + ERROR("x"), 7)')).toBe(7)
    expect(t.m('VAR a = 10 VAR b = a * 2 RETURN a + b')).toBe(30)
    expect(t.m('ROUND(2.5, 0) + ROUND(-2.5, 0)')).toBe(0)
    expect(t.m('"abc" = "ABC"')).toBe(true)
    expect(t.m('COALESCE(BLANK(), BLANK(), 3)')).toBe(3)
    expect(t.m('CONTAINSSTRING("Bicicleta", "CICLE")')).toBe(true)
  })

  it('erros úteis', () => {
    expect(() => t.m('Vendas[Valor]')).toThrow(/único valor/)
    expect(() => t.m('[Inexistente]')).toThrow(/não foi encontrada/)
    expect(() => t.m('1 + "a"')).toThrow()
  })

  it('SUMMARIZECOLUMNS e ADDCOLUMNS', () => {
    const tv = t.ev.table(parseDax('SUMMARIZECOLUMNS(Produto[Categoria], "Total", [Total Vendas])'), t.ev.emptyCtx())
    const rows = Array.from({ length: tv.rowCount }, (_, r) => tv.rowValues(r))
    expect(rows).toContainEqual(['Esporte', 3570])
    expect(rows).toContainEqual(['Roupas', 850])
    expect(rows).toContainEqual([null, 77])
    const t2 = t.ev.table(parseDax('ADDCOLUMNS(VALUES(Cliente[Estado]), "V", [Total Vendas])'), t.ev.emptyCtx())
    expect(t2.rowCount).toBe(3)
  })
})

describe('colunas e tabelas calculadas', () => {
  const t = buildModel({
    measures,
    calcColumns: [
      { table: 'Vendas', name: 'Custo', expr: 'Vendas[Qtd] * RELATED(Produto[Preco])' },
      { table: 'Vendas', name: 'Faixa', expr: 'IF(Vendas[Valor] >= 500, "Alta", "Baixa")' },
      { table: 'Produto', name: 'VendasProduto', expr: 'CALCULATE(SUM(Vendas[Valor]))' },
      { table: 'Vendas', name: 'NumProdutos', expr: 'CALCULATE(COUNTROWS(Produto))' },
      { table: 'Produto', name: 'Rank', expr: 'RANKX(Produto, Produto[VendasProduto])' },
      { table: 'Vendas', name: 'Acumulado', expr: 'CALCULATE(SUM(Vendas[Valor]), FILTER(Vendas, Vendas[VendaID] <= EARLIER(Vendas[VendaID])))' }
    ],
    calcTables: [{ name: 'Datas', expr: 'CALENDAR(DATE(2024,1,1), DATE(2024,1,31))' }]
  })

  it('calcula colunas com RELATED e CALCULATE', () => {
    const vendas = t.model.table('Vendas')!
    const custo = vendas.column('Custo')!
    expect(custo.data.get(0)).toBe(1000)
    expect(custo.data.get(8)).toBeNull()
    expect(vendas.column('Faixa')!.data.get(0)).toBe('Alta')
    const produto = t.model.table('Produto')!
    expect(produto.column('VendasProduto')!.data.get(0)).toBe(3000)
    expect(produto.column('Rank')!.data.get(0)).toBe(1)
    expect(vendas.column('NumProdutos')!.data.get(0)).toBe(5)
    expect(vendas.column('Acumulado')!.data.get(2)).toBe(1500)
    expect(t.m('SUM(Vendas[Custo])')).toBe(4420)
  })

  it('calcula tabelas calculadas', () => {
    const datas = t.model.table('Datas')!
    expect(datas.rowCount).toBe(31)
    expect(datas.columns[0].data.get(0)).toBeInstanceOf(DateVal)
    expect(t.model.errors).toEqual([])
  })
})
