import { describe, expect, it } from 'vitest'
import { applyStep, defaultStepContext, type StepContext } from '@engine/query/steps'
import type { StepOp } from '@engine/query/types'
import { DataTable } from '@engine/data/table'
import { Column } from '@engine/data/column'
import { type DataType, DateVal, type Scalar } from '@engine/data/types'
import { commonScalarType } from '@engine/io/values'
import { makeDate } from '@engine/data/dates'
import { CULTURE_PT_BR } from '@engine/data/convert'

function col(name: string, values: Scalar[], type?: DataType): Column {
  return Column.fromScalars(name, type ?? commonScalarType(values), values)
}

function tbl(spec: Record<string, Scalar[]>, types: Record<string, DataType> = {}): DataTable {
  const cols = Object.entries(spec).map(([name, values]) => col(name, values, types[name]))
  return new DataTable(cols, cols[0]?.length ?? 0)
}

function run(t: DataTable, op: StepOp, ctx?: Partial<StepContext>): DataTable {
  return applyStep(t, op, defaultStepContext(ctx))
}

const d = (y: number, m: number, day: number) => new DateVal(makeDate(y, m, day), 'date')

describe('cabeçalhos', () => {
  it('promove a primeira linha com nomes únicos', () => {
    const t = tbl({ Column1: ['Nome', 'Ana'], Column2: ['Nome', 'x'], Column3: [null, 'y'], Column4: [2024, 1] }, { Column4: 'any' })
    const r = run(t, { op: 'promoteHeaders' })
    expect(r.columnNames()).toEqual(['Nome', 'Nome_1', 'Column3', '2024'])
    expect(r.rowCount).toBe(1)
    expect(r.row(0)).toEqual(['Ana', 'x', 'y', 1])
  })
  it('rebaixa cabeçalhos', () => {
    const r = run(tbl({ A: [1, 2], B: ['x', 'y'] }), { op: 'demoteHeaders' })
    expect(r.columnNames()).toEqual(['Column1', 'Column2'])
    expect(r.rowCount).toBe(3)
    expect(r.row(0)).toEqual(['A', 'B'])
    expect(r.row(2)).toEqual([2, 'y'])
  })
})

describe('tipos e colunas', () => {
  const base = tbl({ Nome: ['Ana', 'Bia', 'Caio'], Valor: ['1,5', 'x', '3'], Data: ['31/01/2024', '01/02/2024', ''] })
  it('altera tipos com cultura e mantém erros', () => {
    const r = run(base, {
      op: 'changeTypes',
      columns: [
        { column: 'Valor', type: 'number' },
        { column: 'Data', type: 'date' }
      ],
      culture: { decimalSep: ',', dayFirst: true }
    })
    expect(r.column('Valor')!.type).toBe('number')
    expect(r.column('Valor')!.get(0)).toBe(1.5)
    expect(r.column('Valor')!.hasError(1)).toBe(true)
    expect((r.column('Data')!.get(1) as DateVal).ms).toBe(makeDate(2024, 2, 1))
    expect(r.column('Data')!.get(2)).toBeNull()
    expect(() => run(base, { op: 'changeTypes', columns: [{ column: 'Nada', type: 'int' }] })).toThrow('A coluna "Nada" da tabela não foi encontrada.')
  })
  it('remove, seleciona, renomeia, reordena e duplica', () => {
    expect(run(base, { op: 'removeColumns', columns: ['Valor'] }).columnNames()).toEqual(['Nome', 'Data'])
    expect(run(base, { op: 'selectColumns', columns: ['Data', 'Nome'] }).columnNames()).toEqual(['Data', 'Nome'])
    expect(run(base, { op: 'renameColumns', renames: [{ from: 'Nome', to: 'Cliente' }] }).columnNames()).toEqual(['Cliente', 'Valor', 'Data'])
    expect(() => run(base, { op: 'renameColumns', renames: [{ from: 'Nome', to: 'Valor' }] })).toThrow(/já existe/i)
    expect(run(base, { op: 'reorderColumns', columns: ['Data', 'Nome'] }).columnNames()).toEqual(['Data', 'Valor', 'Nome'])
    expect(run(base, { op: 'reorderColumns', columns: ['Data', 'Valor', 'Nome'] }).columnNames()).toEqual(['Data', 'Valor', 'Nome'])
    const dup = run(base, { op: 'duplicateColumn', column: 'Nome', newName: 'Nome - Copiar' })
    expect(dup.columnNames()).toEqual(['Nome', 'Valor', 'Data', 'Nome - Copiar'])
    expect(dup.column('Nome - Copiar')!.get(2)).toBe('Caio')
  })
})

describe('filtro de linhas', () => {
  const t = tbl({ Nome: ['Ana', 'bia', 'Caio', null], Valor: [10, null, 30, 40], Data: [d(2024, 1, 1), d(2024, 2, 1), null, d(2024, 3, 1)] })
  const names = (r: DataTable) => r.column('Nome')!.toArray()
  it('compara com semântica de nulos', () => {
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Valor', operator: 'gt', value: 15 } }))).toEqual(['Caio', null])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Valor', operator: 'ne', value: 10 } }))).toEqual(['bia', 'Caio', null])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Nome', operator: 'eq', value: 'BIA', caseSensitive: false } }))).toEqual(['bia'])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Nome', operator: 'eq', value: 'BIA' } }))).toEqual([])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Nome', operator: 'contains', value: 'a' } }))).toEqual(['Ana', 'bia', 'Caio'])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Nome', operator: 'notContains', value: 'n' } }))).toEqual(['bia', 'Caio'])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Nome', operator: 'isNull' } }))).toEqual([null])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Data', operator: 'ge', value: { date: makeDate(2024, 2, 1), kind: 'date' } } }))).toEqual([
      'bia',
      null
    ])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Valor', operator: 'lt', value: '35' } }))).toEqual(['Ana', 'Caio'])
  })
  it('combina condições e listas', () => {
    expect(
      names(
        run(t, {
          op: 'filterRows',
          condition: {
            kind: 'or',
            conditions: [
              { kind: 'compare', column: 'Valor', operator: 'eq', value: 10 },
              { kind: 'in', column: 'Nome', values: ['Caio'] }
            ]
          }
        })
      )
    ).toEqual(['Ana', 'Caio'])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'in', column: 'Nome', values: ['Ana', null], negate: true } }))).toEqual(['bia', 'Caio'])
    expect(
      names(run(t, { op: 'filterRows', condition: { kind: 'not', condition: { kind: 'compare', column: 'Valor', operator: 'gt', value: 15 } } }))
    ).toEqual(['Ana'])
    expect(names(run(t, { op: 'filterRows', condition: { kind: 'expression', expression: 'each [Valor] > 20 and Text.Length([Nome]) = 4' } }))).toEqual([
      'Caio'
    ])
  })
  it('compara com outra coluna', () => {
    const r = run(tbl({ A: [1, 5, 3], B: [2, 4, 3] }), { op: 'filterRows', condition: { kind: 'compare', column: 'A', operator: 'ge', valueColumn: 'B' } })
    expect(r.column('A')!.toArray()).toEqual([5, 3])
  })
})

describe('linhas', () => {
  const t = tbl({ N: [1, 2, 3, 4, 5, 6, 7] })
  const ns = (r: DataTable) => r.column('N')!.toArray()
  it('mantém e remove linhas', () => {
    expect(ns(run(t, { op: 'keepRows', mode: 'top', count: 2 }))).toEqual([1, 2])
    expect(ns(run(t, { op: 'keepRows', mode: 'bottom', count: 2 }))).toEqual([6, 7])
    expect(ns(run(t, { op: 'keepRows', mode: 'range', offset: 2, count: 3 }))).toEqual([3, 4, 5])
    expect(ns(run(t, { op: 'removeRows', mode: 'top', count: 5 }))).toEqual([6, 7])
    expect(ns(run(t, { op: 'removeRows', mode: 'bottom', count: 5 }))).toEqual([1, 2])
    expect(ns(run(t, { op: 'removeRows', mode: 'alternate', offset: 1, count: 1, keep: 2 }))).toEqual([1, 3, 4, 6, 7])
  })
  it('remove linhas em branco e com erros', () => {
    const b = tbl({ A: ['x', null, '', 'y'], B: [1, null, null, null] })
    expect(run(b, { op: 'removeRows', mode: 'blank' }).rowCount).toBe(2)
    const e = run(tbl({ V: ['1', 'a', '3'] }), { op: 'changeTypes', columns: [{ column: 'V', type: 'int' }] })
    expect(run(e, { op: 'removeRows', mode: 'errors' }).column('V')!.toArray()).toEqual([1, 3])
  })
  it('remove e mantém duplicatas', () => {
    const t2 = tbl({ A: ['x', 'x', 'y', 'x'], B: [1, 1, 2, 2] })
    expect(run(t2, { op: 'removeDuplicates', columns: [] }).rowCount).toBe(3)
    expect(run(t2, { op: 'removeDuplicates', columns: ['A'] }).column('B')!.toArray()).toEqual([1, 2])
    expect(run(t2, { op: 'keepDuplicates', columns: ['A', 'B'] }).rowCount).toBe(2)
    expect(run(t2, { op: 'keepDuplicates', columns: ['A'] }).rowCount).toBe(3)
  })
})

describe('classificação', () => {
  it('ordena de forma estável com vários critérios', () => {
    const t = tbl({ G: ['b', 'a', 'b', null, 'a'], V: [1, 2, 3, 4, 5] })
    const r = run(t, { op: 'sort', keys: [{ column: 'G', desc: false }, { column: 'V', desc: true }] })
    expect(r.column('V')!.toArray()).toEqual([4, 5, 2, 3, 1])
    const desc = run(t, { op: 'sort', keys: [{ column: 'G', desc: true }] })
    expect(desc.column('G')!.toArray()).toEqual(['b', 'b', 'a', 'a', null])
    expect(desc.column('V')!.toArray()).toEqual([1, 3, 2, 5, 4])
  })
  it('usa ordenação pt-BR para textos e numérica para números', () => {
    const t = tbl({ T: ['Zebra', 'ábaco', 'Abelha', 'abacate'], N: [10, 9, 100, null] })
    expect(run(t, { op: 'sort', keys: [{ column: 'T', desc: false }] }).column('T')!.toArray()).toEqual(['abacate', 'ábaco', 'Abelha', 'Zebra'])
    expect(run(t, { op: 'sort', keys: [{ column: 'N', desc: false }] }).column('N')!.toArray()).toEqual([null, 9, 10, 100])
  })
})

describe('substituição e preenchimento', () => {
  it('substitui texto parcial, inteiro e nulos', () => {
    const t = tbl({ T: ['casa azul', 'Azul', null, 'azulado'] })
    expect(run(t, { op: 'replaceValues', columns: ['T'], find: 'azul', replace: 'verde', matchEntire: false }).column('T')!.toArray()).toEqual([
      'casa verde',
      'Azul',
      null,
      'verdeado'
    ])
    expect(
      run(t, { op: 'replaceValues', columns: ['T'], find: 'azul', replace: 'verde', matchEntire: false, caseSensitive: false }).column('T')!.toArray()
    ).toEqual(['casa verde', 'verde', null, 'verdeado'])
    expect(run(t, { op: 'replaceValues', columns: ['T'], find: 'Azul', replace: 'X', matchEntire: true }).column('T')!.toArray()).toEqual([
      'casa azul',
      'X',
      null,
      'azulado'
    ])
    expect(run(t, { op: 'replaceValues', columns: ['T'], find: null, replace: '(vazio)', matchEntire: true }).column('T')!.get(2)).toBe('(vazio)')
    expect(run(t, { op: 'replaceValues', columns: ['T'], find: 'a', replace: '$&', matchEntire: false }).column('T')!.get(1)).toBe('Azul')
  })
  it('substitui valores numéricos', () => {
    const t = tbl({ N: [1, null, 3] })
    const r = run(t, { op: 'replaceValues', columns: ['N'], find: null, replace: 0, matchEntire: true })
    expect(r.column('N')!.toArray()).toEqual([1, 0, 3])
    expect(r.column('N')!.type).toBe('int')
    const r2 = run(t, { op: 'replaceValues', columns: ['N'], find: 3, replace: 'três', matchEntire: true })
    expect(r2.column('N')!.type).toBe('any')
    expect(r2.column('N')!.get(2)).toBe('três')
  })
  it('substitui erros', () => {
    const e = run(tbl({ V: ['1', 'a'] }), { op: 'changeTypes', columns: [{ column: 'V', type: 'int' }] })
    const r = run(e, { op: 'replaceErrors', columns: ['V'], value: 0 })
    expect(r.column('V')!.toArray()).toEqual([1, 0])
    expect(r.column('V')!.errorCount()).toBe(0)
  })
  it('preenche para baixo e para cima', () => {
    const t = tbl({ A: ['x', null, null, 'y', null], B: [null, 1, null, 2, null] })
    const down = run(t, { op: 'fill', columns: ['A', 'B'], direction: 'down' })
    expect(down.column('A')!.toArray()).toEqual(['x', 'x', 'x', 'y', 'y'])
    expect(down.column('B')!.toArray()).toEqual([null, 1, 1, 2, 2])
    const up = run(t, { op: 'fill', columns: ['B'], direction: 'up' })
    expect(up.column('B')!.toArray()).toEqual([1, 1, 2, 2, null])
  })
})

describe('divisão e mesclagem', () => {
  const t = tbl({ Id: [1, 2, 3], Nome: ['Silva, Ana, SP', 'Souza, Bia', null] })
  it('divide por delimitador em colunas', () => {
    const r = run(t, { op: 'splitColumn', column: 'Nome', mode: 'delimiter', delimiter: ', ', at: 'each' })
    expect(r.columnNames()).toEqual(['Id', 'Nome.1', 'Nome.2', 'Nome.3'])
    expect(r.row(0)).toEqual([1, 'Silva', 'Ana', 'SP'])
    expect(r.row(1)).toEqual([2, 'Souza', 'Bia', null])
    expect(r.row(2)).toEqual([3, null, null, null])
    const last = run(t, { op: 'splitColumn', column: 'Nome', mode: 'delimiter', delimiter: ', ', at: 'last' })
    expect(last.row(0)).toEqual([1, 'Silva, Ana', 'SP'])
    const first = run(t, { op: 'splitColumn', column: 'Nome', mode: 'delimiter', delimiter: ', ', at: 'first', parts: 2 })
    expect(first.row(0)).toEqual([1, 'Silva', 'Ana, SP'])
  })
  it('divide por posições, comprimento e em linhas', () => {
    const c = tbl({ Cod: ['AB1234', 'CD56'] })
    expect(run(c, { op: 'splitColumn', column: 'Cod', mode: 'positions', positions: [0, 2] }).row(0)).toEqual(['AB', '1234'])
    expect(run(c, { op: 'splitColumn', column: 'Cod', mode: 'length', length: 2 }).row(1)).toEqual(['CD', '56', null])
    const rows = run(t, { op: 'splitColumn', column: 'Nome', mode: 'delimiter', delimiter: ', ', intoRows: true })
    expect(rows.rowCount).toBe(6)
    expect(rows.column('Id')!.toArray()).toEqual([1, 1, 1, 2, 2, 3])
    expect(rows.column('Nome')!.toArray()).toEqual(['Silva', 'Ana', 'SP', 'Souza', 'Bia', null])
  })
  it('mescla colunas', () => {
    const m = tbl({ A: ['x', 'y'], N: [1, null], B: ['z', 'w'] })
    const r = run(m, { op: 'mergeColumns', columns: ['A', 'N'], separator: '-', newName: 'AN' })
    expect(r.columnNames()).toEqual(['AN', 'B'])
    expect(r.column('AN')!.toArray()).toEqual(['x-1', 'y-'])
    const k = run(m, { op: 'mergeColumns', columns: ['B', 'A'], separator: '', newName: 'BA', keepOriginal: true })
    expect(k.columnNames()).toEqual(['A', 'N', 'B', 'BA'])
    expect(k.column('BA')!.get(0)).toBe('zx')
  })
})

describe('transformações', () => {
  it('transforma textos', () => {
    const t = tbl({ T: ['  olá Mundo ', 'ÁGUA', null], N: [12, 3, 4] })
    expect(run(t, { op: 'transformText', columns: ['T'], fn: 'upper' }).column('T')!.toArray()).toEqual(['  OLÁ MUNDO ', 'ÁGUA', null])
    expect(run(t, { op: 'transformText', columns: ['T'], fn: 'lower' }).column('T')!.get(1)).toBe('água')
    expect(run(t, { op: 'transformText', columns: ['T'], fn: 'trim' }).column('T')!.get(0)).toBe('olá Mundo')
    expect(run(t, { op: 'transformText', columns: ['T'], fn: 'capitalize' }).column('T')!.get(0)).toBe('  Olá Mundo ')
    expect(run(t, { op: 'transformText', columns: ['T'], fn: 'prefix', arg: '>' }).column('T')!.get(1)).toBe('>ÁGUA')
    expect(run(t, { op: 'transformText', columns: ['T'], fn: 'suffix', arg: '!' }).column('T')!.get(1)).toBe('ÁGUA!')
    const len = run(t, { op: 'transformText', columns: ['T'], fn: 'length', newName: 'Tam' })
    expect(len.column('Tam')!.type).toBe('int')
    expect(len.column('Tam')!.toArray()).toEqual([12, 4, null])
    expect(run(t, { op: 'transformText', columns: ['N'], fn: 'prefix', arg: 'n' }).column('N')!.toArray()).toEqual(['n12', 'n3', 'n4'])
    expect(run(t, { op: 'transformText', columns: ['T'], fn: 'removeSpaces' }).column('T')!.get(0)).toBe('oláMundo')
  })
  it('transforma números', () => {
    const t = tbl({ V: [2.5, 3.5, -1.25, null], I: [1, 2, 3, 4] })
    const r = run(t, { op: 'transformNumber', columns: ['V'], fn: 'round' })
    expect(r.column('V')!.toArray()).toEqual([2, 4, -1, null])
    expect(r.column('V')!.type).toBe('int')
    expect(run(t, { op: 'transformNumber', columns: ['V'], fn: 'roundUp', arg: 1 }).column('V')!.toArray()).toEqual([2.5, 3.5, -1.2, null])
    expect(run(t, { op: 'transformNumber', columns: ['V'], fn: 'roundDown' }).column('V')!.toArray()).toEqual([2, 3, -2, null])
    const m = run(t, { op: 'transformNumber', columns: ['I'], fn: 'multiply', arg: 3 })
    expect(m.column('I')!.toArray()).toEqual([3, 6, 9, 12])
    expect(m.column('I')!.type).toBe('int')
    expect(run(t, { op: 'transformNumber', columns: ['I'], fn: 'divide', arg: 2 }).column('I')!.type).toBe('number')
    expect(run(t, { op: 'transformNumber', columns: ['I'], fn: 'isEven' }).column('I')!.toArray()).toEqual([false, true, false, true])
    expect(run(t, { op: 'transformNumber', columns: ['I'], fn: 'power', arg: 2, newName: 'Q' }).column('Q')!.toArray()).toEqual([1, 4, 9, 16])
    expect(run(t, { op: 'transformNumber', columns: ['I'], fn: 'percentage', arg: 50 }).column('I')!.toArray()).toEqual([0.5, 1, 1.5, 2])
  })
  it('extrai partes de datas', () => {
    const t = tbl({ D: [d(2024, 3, 15), null, new DateVal(makeDate(2023, 12, 31, 13, 30), 'datetime')] }, { D: 'datetime' })
    expect(run(t, { op: 'datePart', column: 'D', part: 'year' }).column('D')!.toArray()).toEqual([2024, null, 2023])
    expect(run(t, { op: 'datePart', column: 'D', part: 'monthName', newName: 'Mês' }).column('Mês')!.toArray()).toEqual(['março', null, 'dezembro'])
    expect(run(t, { op: 'datePart', column: 'D', part: 'quarter' }).column('D')!.get(0)).toBe(1)
    expect(run(t, { op: 'datePart', column: 'D', part: 'dayName' }).column('D')!.get(0)).toBe('sexta-feira')
    expect(run(t, { op: 'datePart', column: 'D', part: 'hour' }).column('D')!.get(2)).toBe(13)
    const som = run(t, { op: 'datePart', column: 'D', part: 'startOfMonth' })
    expect((som.column('D')!.get(0) as DateVal).ms).toBe(makeDate(2024, 3, 1))
    const dt = run(t, { op: 'datePart', column: 'D', part: 'date' })
    expect(dt.column('D')!.type).toBe('date')
    expect((dt.column('D')!.get(2) as DateVal).ms).toBe(makeDate(2023, 12, 31))
    const txt = run(tbl({ D: ['31/01/2024', 'x'] }), { op: 'datePart', column: 'D', part: 'month' })
    expect(txt.column('D')!.get(0)).toBe(1)
    expect(txt.column('D')!.hasError(1)).toBe(true)
  })
  it('extrai textos', () => {
    const t = tbl({ E: ['ana@mail.com', 'semarroba', null] })
    expect(run(t, { op: 'extractText', column: 'E', mode: 'beforeDelimiter', delimiter: '@' }).column('E')!.toArray()).toEqual(['ana', 'semarroba', null])
    expect(run(t, { op: 'extractText', column: 'E', mode: 'afterDelimiter', delimiter: '@' }).column('E')!.toArray()).toEqual(['mail.com', '', null])
    expect(run(t, { op: 'extractText', column: 'E', mode: 'betweenDelimiters', delimiter: '@', endDelimiter: '.' }).column('E')!.get(0)).toBe('mail')
    expect(run(t, { op: 'extractText', column: 'E', mode: 'first', count: 3 }).column('E')!.get(0)).toBe('ana')
    expect(run(t, { op: 'extractText', column: 'E', mode: 'last', count: 3 }).column('E')!.get(0)).toBe('com')
    expect(run(t, { op: 'extractText', column: 'E', mode: 'range', start: 4, count: 4 }).column('E')!.get(0)).toBe('mail')
    expect(run(t, { op: 'extractText', column: 'E', mode: 'length', newName: 'L' }).column('L')!.toArray()).toEqual([12, 9, null])
  })
})

describe('novas colunas', () => {
  const t = tbl({ Qtd: [2, 3, null], Preco: [10.5, 2, 4], Cat: ['A', 'B', 'C'] })
  it('adiciona coluna personalizada com tipo inferido ou informado', () => {
    const r = run(t, { op: 'addColumn', name: 'Total', expression: '[Qtd] * [Preco]' })
    expect(r.column('Total')!.toArray()).toEqual([21, 6, null])
    expect(r.column('Total')!.type).toBe('int')
    const typed = run(t, { op: 'addColumn', name: 'Total', expression: '[Qtd] * [Preco]', type: 'number' })
    expect(typed.column('Total')!.type).toBe('number')
    const err = run(t, { op: 'addColumn', name: 'X', expression: '[Cat] + 1' })
    expect(err.column('X')!.hasError(0)).toBe(true)
    expect(() => run(t, { op: 'addColumn', name: 'Y', expression: '[Nada] + 1' })).toThrow(/não foi encontrada/)
    expect(() => run(t, { op: 'addColumn', name: 'Qtd', expression: '1' })).toThrow(/já existe/i)
  })
  it('adiciona coluna condicional', () => {
    const r = run(t, {
      op: 'conditionalColumn',
      name: 'Faixa',
      rules: [
        { column: 'Preco', operator: 'gt', value: 5, output: 'Caro' },
        { column: 'Cat', operator: 'eq', value: 'B', outputColumn: 'Cat' }
      ],
      otherwise: 'Barato'
    })
    expect(r.column('Faixa')!.toArray()).toEqual(['Caro', 'B', 'Barato'])
    expect(r.column('Faixa')!.type).toBe('text')
  })
  it('adiciona índice', () => {
    const r = run(t, { op: 'indexColumn', name: 'Índice', start: 1, step: 1 })
    expect(r.column('Índice')!.toArray()).toEqual([1, 2, 3])
    expect(r.column('Índice')!.type).toBe('int')
    expect(run(t, { op: 'indexColumn', name: 'I', start: 0, step: 0.5 }).column('I')!.type).toBe('number')
  })
})

describe('agrupamento e dinamização', () => {
  const t = tbl({ Reg: ['N', 'S', 'N', 'S', 'N'], Prod: ['a', 'a', 'b', 'b', 'b'], V: [10, 20, 30, null, 50] })
  it('agrupa com várias agregações', () => {
    const r = run(t, {
      op: 'groupBy',
      keys: ['Reg'],
      aggregations: [
        { name: 'Soma', fn: 'sum', column: 'V' },
        { name: 'Média', fn: 'avg', column: 'V' },
        { name: 'Mediana', fn: 'median', column: 'V' },
        { name: 'Min', fn: 'min', column: 'Prod' },
        { name: 'Max', fn: 'max', column: 'V' },
        { name: 'Linhas', fn: 'count' },
        { name: 'NaoVazios', fn: 'countNonBlank', column: 'V' },
        { name: 'Distintos', fn: 'countDistinct', column: 'Prod' }
      ]
    })
    expect(r.columnNames()).toEqual(['Reg', 'Soma', 'Média', 'Mediana', 'Min', 'Max', 'Linhas', 'NaoVazios', 'Distintos'])
    expect(r.row(0)).toEqual(['N', 90, 30, 30, 'a', 50, 3, 3, 2])
    expect(r.row(1)).toEqual(['S', 20, 20, 20, 'a', 20, 2, 1, 2])
    expect(r.column('Soma')!.type).toBe('int')
  })
  it('agrupa sem chaves', () => {
    const r = run(t, { op: 'groupBy', keys: [], aggregations: [{ name: 'Total', fn: 'sum', column: 'V' }] })
    expect(r.rowCount).toBe(1)
    expect(r.row(0)).toEqual([110])
  })
  it('não dinamiza colunas (ignorando nulos)', () => {
    const w = tbl({ Id: [1, 2], Jan: [10, null], Fev: [20, 30] })
    const r = run(w, { op: 'unpivot', columns: ['Id'], mode: 'others', attribute: 'Atributo', value: 'Valor' })
    expect(r.columnNames()).toEqual(['Id', 'Atributo', 'Valor'])
    expect(r.rows()).toEqual([
      [1, 'Jan', 10],
      [1, 'Fev', 20],
      [2, 'Fev', 30]
    ])
    expect(run(w, { op: 'unpivot', columns: ['Jan'], mode: 'selected', attribute: 'A', value: 'V' }).rowCount).toBe(1)
  })
  it('dinamiza coluna', () => {
    const r = run(t, { op: 'pivot', column: 'Prod', valueColumn: 'V', fn: 'sum' })
    expect(r.columnNames()).toEqual(['Reg', 'a', 'b'])
    expect(r.rows()).toEqual([
      ['N', 10, 80],
      ['S', 20, null]
    ])
    const none = run(t, { op: 'pivot', column: 'Prod', valueColumn: 'V', fn: 'none' })
    expect(none.column('b')!.hasError(0)).toBe(true)
    expect(none.column('a')!.get(1)).toBe(20)
    const cnt = run(t, { op: 'pivot', column: 'Prod', valueColumn: 'V', fn: 'count' })
    expect(cnt.column('b')!.toArray()).toEqual([2, 1])
  })
  it('transpõe', () => {
    const r = run(tbl({ A: [1, 2], B: ['x', 'y'] }), { op: 'transpose' })
    expect(r.columnNames()).toEqual(['Column1', 'Column2'])
    expect(r.rows()).toEqual([
      [1, 2],
      ['x', 'y']
    ])
  })
})

describe('mesclar e acrescentar', () => {
  const pedidos = tbl({ Pedido: [1, 2, 3, 4], Cliente: ['c1', 'c2', 'c9', 'c1'] })
  const clientes = tbl({ Id: ['c1', 'c2', 'c3'], Nome: ['Ana', 'Bia', 'Caio'], UF: ['PE', 'SP', 'RJ'] })
  const ctx: Partial<StepContext> = { getQuery: () => clientes, queryName: () => 'Clientes' }
  const join = (j: 'left' | 'right' | 'full' | 'inner' | 'leftAnti' | 'rightAnti') =>
    run(pedidos, { op: 'merge', rightQueryId: 'q2', leftKeys: ['Cliente'], rightKeys: ['Id'], join: j, expand: ['Nome'] }, ctx)
  it('faz junções de todos os tipos', () => {
    const left = join('left')
    expect(left.columnNames()).toEqual(['Pedido', 'Cliente', 'Clientes.Nome'])
    expect(left.column('Clientes.Nome')!.toArray()).toEqual(['Ana', 'Bia', null, 'Ana'])
    expect(join('inner').column('Pedido')!.toArray()).toEqual([1, 2, 4])
    expect(join('leftAnti').column('Pedido')!.toArray()).toEqual([3])
    const full = join('full')
    expect(full.rowCount).toBe(5)
    expect(full.row(4)).toEqual([null, null, 'Caio'])
    const right = join('right')
    expect(right.column('Clientes.Nome')!.toArray()).toEqual(['Ana', 'Ana', 'Bia', 'Caio'])
    expect(right.column('Pedido')!.toArray()).toEqual([1, 4, 2, null])
    const anti = join('rightAnti')
    expect(anti.rows()).toEqual([[null, null, 'Caio']])
  })
  it('usa prefixo e chaves compostas', () => {
    const a = tbl({ K1: ['x', 'x'], K2: [1, 2] })
    const b = tbl({ K1: ['x'], K2: [2], V: ['ok'] })
    const r = run(a, { op: 'merge', rightQueryId: 'b', leftKeys: ['K1', 'K2'], rightKeys: ['K1', 'K2'], join: 'left', expand: ['V'], prefix: 'B_' }, { getQuery: () => b })
    expect(r.column('B_V')!.toArray()).toEqual([null, 'ok'])
    expect(() => run(a, { op: 'merge', rightQueryId: 'b', leftKeys: ['K1'], rightKeys: ['K1', 'K2'], join: 'left', expand: [] }, { getQuery: () => b })).toThrow()
  })
  it('casa datas tipadas com datas em colunas "qualquer"', () => {
    const a = tbl({ D: [d(2024, 1, 1), d(2024, 1, 2)] }, { D: 'date' })
    const b = tbl({ D: [d(2024, 1, 2)], V: ['ok'] }, { D: 'any' })
    const r = run(a, { op: 'merge', rightQueryId: 'b', leftKeys: ['D'], rightKeys: ['D'], join: 'left', expand: ['V'] }, { getQuery: () => b, queryName: () => 'B' })
    expect(r.column('B.V')!.toArray()).toEqual([null, 'ok'])
  })
  it('acrescenta consultas alinhando colunas por nome', () => {
    const t1 = tbl({ A: [1, 2], B: ['x', 'y'] })
    const t2 = tbl({ B: ['z'], C: [true], A: [2.5] })
    const r = run(t1, { op: 'append', queryIds: ['t2'] }, { getQuery: () => t2 })
    expect(r.columnNames()).toEqual(['A', 'B', 'C'])
    expect(r.rows()).toEqual([
      [1, 'x', null],
      [2, 'y', null],
      [2.5, 'z', true]
    ])
    expect(r.column('A')!.type).toBe('number')
  })
})

describe('erros', () => {
  it('propaga erros de células nas transformações', () => {
    const e = run(tbl({ V: ['1', 'x'] }), { op: 'changeTypes', columns: [{ column: 'V', type: 'number' }] }, { culture: CULTURE_PT_BR })
    const r = run(e, { op: 'transformNumber', columns: ['V'], fn: 'add', arg: 1 })
    expect(r.column('V')!.get(0)).toBe(2)
    expect(r.column('V')!.hasError(1)).toBe(true)
    const sorted = run(e, { op: 'sort', keys: [{ column: 'V', desc: true }] })
    expect(sorted.column('V')!.hasError(1)).toBe(true)
  })
})
