import { describe, expect, it } from 'vitest'
import { parseNumber, parseDateTime, convertColumn, inferColumnType, CULTURE_PT_BR } from '@engine/data/convert'
import { formatNumber, formatDate, formatCompact, formatScalar } from '@engine/data/format'
import { Column } from '@engine/data/column'
import { makeDate, addMonths, weekNum, eomonthCheck } from './helpers'
import { DateVal } from '@engine/data/types'

describe('parseNumber', () => {
  it('lê números no formato brasileiro', () => {
    expect(parseNumber('1.234,56', ',')).toBe(1234.56)
    expect(parseNumber('12,5', ',')).toBe(12.5)
    expect(parseNumber('R$ 1.000,00', ',')).toBe(1000)
    expect(parseNumber('-3,5%', ',')).toBeCloseTo(-0.035)
    expect(parseNumber('(1.000)', ',')).toBe(-1000)
    expect(parseNumber('abc', ',')).toBeUndefined()
    expect(parseNumber('1,234.56', ',')).toBeUndefined()
  })
  it('lê números no formato americano', () => {
    expect(parseNumber('1,234.56', '.')).toBe(1234.56)
    expect(parseNumber('$12.50', '.')).toBe(12.5)
    expect(parseNumber('1e3', '.')).toBe(1000)
  })
})

describe('parseDateTime', () => {
  it('reconhece formatos comuns', () => {
    expect(parseDateTime('2024-01-31')!.ms).toBe(makeDate(2024, 1, 31))
    expect(parseDateTime('31/01/2024')!.ms).toBe(makeDate(2024, 1, 31))
    expect(parseDateTime('01/02/2024', true)!.ms).toBe(makeDate(2024, 2, 1))
    expect(parseDateTime('01/02/2024', false)!.ms).toBe(makeDate(2024, 1, 2))
    expect(parseDateTime('31/01/2024 13:45:10')!.ms).toBe(makeDate(2024, 1, 31, 13, 45, 10))
    expect(parseDateTime('15 de março de 2023')!.ms).toBe(makeDate(2023, 3, 15))
    expect(parseDateTime('32/01/2024')).toBeUndefined()
  })
})

describe('inferência de tipos', () => {
  it('detecta inteiros, decimais pt-BR e datas', () => {
    expect(inferColumnType(Column.fromScalars('a', 'text', ['1', '2', '30'])).type).toBe('int')
    const dec = inferColumnType(Column.fromScalars('b', 'text', ['1,5', '2.300,10', '7']))
    expect(dec.type).toBe('number')
    expect(dec.decimalSep).toBe(',')
    const decEn = inferColumnType(Column.fromScalars('b', 'text', ['1.5', '2,300.10', '7']))
    expect(decEn.decimalSep).toBe('.')
    expect(inferColumnType(Column.fromScalars('c', 'text', ['31/12/2023', '01/01/2024'])).type).toBe('date')
    expect(inferColumnType(Column.fromScalars('d', 'text', ['00123', '456'])).type).toBe('text')
    expect(inferColumnType(Column.fromScalars('e', 'text', ['true', 'false'])).type).toBe('bool')
    expect(inferColumnType(Column.fromScalars('f', 'text', ['abc', '1'])).type).toBe('text')
  })
  it('converte colunas e marca erros', () => {
    const c = convertColumn(Column.fromScalars('x', 'text', ['1,5', 'x', '', '3']), 'number', CULTURE_PT_BR)
    expect(c.get(0)).toBe(1.5)
    expect(c.hasError(1)).toBe(true)
    expect(c.get(2)).toBeNull()
    expect(c.get(3)).toBe(3)
  })
})

describe('formatação', () => {
  it('formata números com cadeias de formato', () => {
    expect(formatNumber(1234.567, '#,0.00', 'pt-BR')).toBe('1.234,57')
    expect(formatNumber(1234.567, '#,0.00', 'en-US')).toBe('1,234.57')
    expect(formatNumber(0.256, '0.0%', 'pt-BR')).toBe('25,6%')
    expect(formatNumber(-5, '#,0;(#,0)', 'pt-BR')).toBe('(5)')
    expect(formatNumber(1500000, '#,0,,"M"', 'en-US')).toBe('2M')
    expect(formatNumber(12, '00000', 'pt-BR')).toBe('00012')
    expect(formatNumber(12345678, '00000-000', 'pt-BR')).toBe('12345-678')
    expect(formatNumber(1234.5, '"R$" #,0.00', 'pt-BR')).toBe('R$ 1.234,50')
    expect(formatNumber(-0.001, '0.00', 'pt-BR')).toBe('0,00')
    expect(formatNumber(1.005, '0.00', 'pt-BR')).toBe('1,01')
    expect(formatNumber(12345, '0.00E+00', 'en-US')).toBe('1.23E+04')
  })
  it('formata datas', () => {
    const ms = makeDate(2024, 3, 5, 14, 7, 9)
    expect(formatDate(ms, 'dd/MM/yyyy', 'date', 'pt-BR')).toBe('05/03/2024')
    expect(formatDate(ms, 'dd/mm/yyyy hh:mm:ss', 'datetime', 'pt-BR')).toBe('05/03/2024 14:07:09')
    expect(formatDate(ms, 'MMMM yyyy', 'date', 'pt-BR')).toBe('março 2024')
    expect(formatDate(ms, 'ddd, d MMM', 'date', 'en-US')).toBe('Tue, 5 Mar')
    expect(formatDate(ms, 'h:mm tt', 'datetime', 'en-US')).toBe('2:07 PM')
  })
  it('formata valores compactos', () => {
    expect(formatCompact(1234567, { locale: 'pt-BR' })).toBe('1,23 Mi')
    expect(formatCompact(1234567, { locale: 'en-US' })).toBe('1.23M')
    expect(formatCompact(950, { locale: 'pt-BR' })).toBe('950')
    expect(formatCompact(0.256, { fmt: '0.0%', locale: 'pt-BR' })).toBe('26%')
  })
  it('formata escalares', () => {
    expect(formatScalar(new DateVal(makeDate(2024, 1, 2), 'date'), undefined, undefined, 'pt-BR')).toBe('02/01/2024')
    expect(formatScalar(true, undefined, undefined, 'pt-BR')).toBe('Verdadeiro')
    expect(formatScalar(1234, undefined, 'int', 'pt-BR')).toBe('1.234')
  })
})

describe('datas', () => {
  it('soma meses e semana do ano', () => {
    expect(addMonths(makeDate(2024, 1, 31), 1)).toBe(makeDate(2024, 2, 29))
    expect(weekNum(makeDate(2024, 1, 1))).toBe(1)
    expect(weekNum(makeDate(2024, 1, 7))).toBe(2)
    expect(eomonthCheck()).toBe(true)
  })
})
