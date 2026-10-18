import { describe, expect, it } from 'vitest'
import { compileMExpression, compileMPredicate, evaluateColumnExpression, MError, parseMExpression } from '@engine/query/mexpr'
import { DataTable } from '@engine/data/table'
import { Column } from '@engine/data/column'
import { DateVal, type Scalar } from '@engine/data/types'
import { makeDate } from '@engine/data/dates'
import { CULTURE_EN_US } from '@engine/data/convert'

const table = new DataTable(
  [
    Column.fromScalars('Nome', 'text', ['Ana Maria', 'bia', null]),
    Column.fromScalars('Qtd', 'int', [2, 3, null]),
    Column.fromScalars('Preço Unit', 'number', [10.5, 4, 1]),
    Column.fromScalars('Data', 'date', [new DateVal(makeDate(2024, 1, 31), 'date'), new DateVal(makeDate(2024, 3, 1), 'date'), null]),
    Column.fromScalars('Ativo', 'bool', [true, false, null])
  ],
  3
)

function ev(expr: string, row = 0): Scalar {
  return compileMExpression(expr, table)(row)
}

describe('linguagem M: operadores', () => {
  it('respeita precedência e parênteses', () => {
    expect(ev('1 + 2 * 3')).toBe(7)
    expect(ev('(1 + 2) * 3')).toBe(9)
    expect(ev('-2 * -3')).toBe(6)
    expect(ev('10 / 4')).toBe(2.5)
    expect(ev('1 + 2 = 3 and 2 > 1')).toBe(true)
    expect(ev('not 1 = 2')).toBe(true)
    expect(ev('1 = 1 or 1 / 0 = 0')).toBe(true)
    expect(ev('"a" & "b" & "c"')).toBe('abc')
    expect(ev('"Qtd: " & [Qtd]')).toBe('Qtd: 2')
  })
  it('acessa colunas com nomes especiais', () => {
    expect(ev('[Qtd] * [Preço Unit]')).toBe(21)
    expect(ev('[#"Preço Unit"] + 1')).toBe(11.5)
    expect(ev('each _[Qtd] + 1')).toBe(3)
  })
  it('propaga nulos como o M', () => {
    expect(ev('[Qtd] * 2', 2)).toBeNull()
    expect(ev('[Nome] & "x"', 2)).toBeNull()
    expect(ev('[Qtd] = null', 2)).toBe(true)
    expect(ev('[Qtd] > 1', 2)).toBeNull()
    expect(ev('null and false')).toBe(false)
    expect(ev('null or true')).toBe(true)
  })
  it('if/then/else e try/otherwise', () => {
    expect(ev('if [Qtd] > 2 then "muito" else "pouco"')).toBe('pouco')
    expect(ev('if [Qtd] > 2 then "muito" else "pouco"', 1)).toBe('muito')
    expect(ev('if [Qtd] = null then 0 else [Qtd]', 2)).toBe(0)
    expect(ev('try [Nome] + 1 otherwise -1')).toBe(-1)
    expect(ev('try Number.From("abc") otherwise 0')).toBe(0)
    expect(ev('try 5 otherwise 0')).toBe(5)
  })
  it('datas: aritmética e literais', () => {
    expect((ev('[Data] + 1') as DateVal).ms).toBe(makeDate(2024, 2, 1))
    expect(ev('[Data] - #date(2024, 1, 1)')).toBe(30)
    expect(ev('Duration.Days(#date(2024, 3, 1) - [Data])')).toBe(30)
    expect(ev('#date(2024, 1, 31) = [Data]')).toBe(true)
    expect((ev('#datetime(2024, 1, 2, 3, 4, 5)') as DateVal).ms).toBe(makeDate(2024, 1, 2, 3, 4, 5))
    expect(ev('Time.Hour(#time(13, 45, 0))')).toBe(13)
    expect(ev('Duration.TotalHours(#duration(1, 12, 0, 0))')).toBe(36)
  })
  it('listas', () => {
    expect(ev('List.Sum({[Qtd], [Preço Unit], 1})')).toBe(13.5)
    expect(ev('List.Max({3, 9, 1})')).toBe(9)
    expect(ev('List.Count({1, null, 2})')).toBe(3)
    expect(ev('List.Contains({"a", "b"}, "b")')).toBe(true)
    expect(ev('Text.Combine({"a", null, "c"}, "-")')).toBe('a-c')
  })
})

describe('linguagem M: funções', () => {
  it('texto', () => {
    expect(ev('Text.Upper([Nome])')).toBe('ANA MARIA')
    expect(ev('Text.Proper("aNA maria")')).toBe('Ana Maria')
    expect(ev('Text.Length([Nome])')).toBe(9)
    expect(ev('Text.Start([Nome], 3)')).toBe('Ana')
    expect(ev('Text.End([Nome], 5)')).toBe('Maria')
    expect(ev('Text.Middle([Nome], 4, 2)')).toBe('Ma')
    expect(ev('Text.Range([Nome], 4)')).toBe('Maria')
    expect(ev('Text.Contains([Nome], "MARIA", Comparer.OrdinalIgnoreCase)')).toBe(true)
    expect(ev('Text.Contains([Nome], "MARIA")')).toBe(false)
    expect(ev('Text.StartsWith([Nome], "Ana")')).toBe(true)
    expect(ev('Text.Replace([Nome], "a", "4")')).toBe('An4 M4ri4')
    expect(ev('Text.PadStart("7", 3, "0")')).toBe('007')
    expect(ev('Text.BeforeDelimiter("a-b-c", "-", 1)')).toBe('a-b')
    expect(ev('Text.AfterDelimiter("a-b-c", "-")')).toBe('b-c')
    expect(ev('Text.BetweenDelimiters("x[1]y", "[", "]")')).toBe('1')
    expect(ev('Text.Trim("  x  ")')).toBe('x')
    expect(ev('Text.Reverse("abc")')).toBe('cba')
    expect(ev('Text.Upper([Nome])', 2)).toBeNull()
    expect(ev('Text.From(1.5)')).toBe('1,5')
    expect(ev('Text.From([Data])')).toBe('31/01/2024')
  })
  it('números', () => {
    expect(ev('Number.Round(2.5)')).toBe(2)
    expect(ev('Number.Round(3.5)')).toBe(4)
    expect(ev('Number.Round(2.345, 2)')).toBe(2.34)
    expect(ev('Number.Round(2.5, 0, RoundingMode.AwayFromZero)')).toBe(3)
    expect(ev('Number.RoundUp(1.01)')).toBe(2)
    expect(ev('Number.RoundDown(-1.5)')).toBe(-2)
    expect(ev('Number.From("1.234,5")')).toBe(1234.5)
    expect(ev('Number.Mod(7, 3)')).toBe(1)
    expect(ev('Number.IntegerDivide(7, 2)')).toBe(3)
    expect(ev('Number.Power(2, 10)')).toBe(1024)
    expect(ev('Number.Abs(-3)')).toBe(3)
    expect(ev('Number.ToText(1234.5, "N2")')).toBe('1.234,50')
    expect(ev('Int64.From("12,6")')).toBe(13)
    expect(compileMExpression('Number.From("1,234.5")', table, CULTURE_EN_US)(0)).toBe(1234.5)
  })
  it('datas', () => {
    expect(ev('Date.Year([Data])')).toBe(2024)
    expect(ev('Date.Month([Data])')).toBe(1)
    expect(ev('Date.Day([Data])')).toBe(31)
    expect(ev('Date.QuarterOfYear([Data])', 1)).toBe(1)
    expect(ev('Date.DayOfWeek([Data])')).toBe(3)
    expect(ev('Date.DayOfWeek([Data], Day.Monday)')).toBe(2)
    expect(ev('Date.DayOfWeekName([Data])')).toBe('quarta-feira')
    expect(ev('Date.MonthName([Data])')).toBe('janeiro')
    expect((ev('Date.AddMonths([Data], 1)') as DateVal).ms).toBe(makeDate(2024, 2, 29))
    expect((ev('Date.StartOfMonth([Data])') as DateVal).ms).toBe(makeDate(2024, 1, 1))
    expect((ev('Date.EndOfMonth(#date(2023, 2, 10))') as DateVal).ms).toBe(makeDate(2023, 2, 28))
    expect((ev('Date.From("15/03/2024")') as DateVal).ms).toBe(makeDate(2024, 3, 15))
    expect(ev('Date.ToText([Data], "dd/MM/yyyy")')).toBe('31/01/2024')
    expect(ev('Date.WeekOfYear(#date(2024, 1, 7))')).toBe(2)
    expect((ev('DateTime.Date(#datetime(2024, 5, 6, 7, 8, 9))') as DateVal).kind).toBe('date')
    expect(ev('Date.IsLeapYear([Data])')).toBe(true)
  })
  it('lógicos', () => {
    expect(ev('Logical.From("true")')).toBe(true)
    expect(ev('[Ativo] and true')).toBe(true)
    expect(ev('not [Ativo]', 1)).toBe(true)
  })
})

describe('linguagem M: erros', () => {
  it('erros de sintaxe com posição', () => {
    expect(() => parseMExpression('1 +')).toThrow(/posição 4/)
    expect(() => parseMExpression('"abc')).toThrow(/aspas/)
    expect(() => parseMExpression('if 1 then 2')).toThrow(/else/)
    expect(() => parseMExpression('')).toThrow(/vazia/)
  })
  it('funções e colunas desconhecidas', () => {
    expect(() => compileMExpression('Text.upper([Nome])', table)).toThrow(/Text\.Upper/)
    expect(() => compileMExpression('[Inexistente]', table)).toThrow('A coluna "Inexistente" da tabela não foi encontrada.')
    expect(() => compileMExpression('Text.Upper()', table)).toThrow(/espera 1/)
    expect(() => compileMExpression('Qtd + 1', table)).toThrow(/\[Qtd\]/)
  })
  it('erros de tipo por linha', () => {
    expect(() => ev('[Nome] + 1')).toThrow(MError)
    expect(() => ev('[Nome] > 1')).toThrow(/comparar/)
    expect(() => ev('{1, 2}')).toThrow(/lista/)
  })
  it('predicados tratam erros como nulos', () => {
    const p = compileMPredicate('[Nome] > 1', table)
    expect(p(0)).toBeNull()
    expect(compileMPredicate('[Qtd] >= 3', table)(1)).toBe(true)
  })
  it('gera coluna com erros por célula e tipo inferido', () => {
    const c = evaluateColumnExpression('if [Qtd] = null then error else [Qtd] * 2', table, 'X')
    expect(c.hasError(2)).toBe(true)
    const ok = evaluateColumnExpression('[Qtd] * 2', table, 'Dobro')
    expect(ok.type).toBe('int')
    expect(ok.toArray()).toEqual([4, 6, null])
    const txt = evaluateColumnExpression('Text.Upper([Nome])', table, 'U')
    expect(txt.type).toBe('text')
    const dt = evaluateColumnExpression('Date.AddDays([Data], 1)', table, 'D')
    expect(dt.type).toBe('date')
    const typed = evaluateColumnExpression('[Qtd]', table, 'T', 'text')
    expect(typed.toArray()).toEqual(['2', '3', null])
  })
})
