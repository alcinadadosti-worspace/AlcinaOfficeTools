import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { decodeText, detectDelimiter, parseCsv, parseCsvText } from '@engine/io/csv'
import { listExcelSheets, readExcelSheet } from '@engine/io/excel'
import { parseJsonTable, jsonToTable } from '@engine/io/json'
import { autoSteps, looksLikeHeaderRow } from '@engine/io/headers'
import { applyStep } from '@engine/query/steps'
import { DataTable } from '@engine/data/table'
import { Column } from '@engine/data/column'
import { DateVal } from '@engine/data/types'
import { makeDate } from '@engine/data/dates'
import { CULTURE_PT_BR } from '@engine/data/convert'

const enc = (s: string) => new TextEncoder().encode(s)

describe('decodeText', () => {
  it('detecta BOM UTF-8 e UTF-16LE', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xc3, 0xa7]))).toBe('aç')
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0xe7, 0x00]))).toBe('aç')
  })
  it('usa windows-1252 quando o UTF-8 é inválido', () => {
    expect(decodeText(new Uint8Array([0x61, 0xe7, 0xe3, 0x6f]))).toBe('ação')
    expect(decodeText(enc('ação'))).toBe('ação')
    expect(decodeText(new Uint8Array([0x61, 0xe7]), 'windows-1252')).toBe('aç')
  })
})

describe('detectDelimiter', () => {
  it('escolhe o delimitador consistente', () => {
    expect(detectDelimiter('a,b,c\n1,2,3\n4,5,6')).toBe(',')
    expect(detectDelimiter('a;b;c\n1,5;2,5;3\n4;5;6')).toBe(';')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
    expect(detectDelimiter('a|b|c\n1|2|3')).toBe('|')
    expect(detectDelimiter('nome;obs\n"x, y, z";1\n"w, v";2')).toBe(';')
  })
})

describe('parseCsv', () => {
  it('lê colunas de texto Column1..N', () => {
    const t = parseCsvText('Nome;Valor\nAna;10\nBia;20\n')
    expect(t.columnNames()).toEqual(['Column1', 'Column2'])
    expect(t.rowCount).toBe(3)
    expect(t.columns[0].type).toBe('text')
    expect(t.row(1)).toEqual(['Ana', '10'])
  })
  it('trata aspas, quebras de linha e campos vazios', () => {
    const t = parseCsvText('a,b,c\n"x, y","linha1\nlinha2",\n"aspas ""duplas""",,z', { delimiter: ',' })
    expect(t.rowCount).toBe(3)
    expect(t.row(1)).toEqual(['x, y', 'linha1\nlinha2', ''])
    expect(t.row(2)).toEqual(['aspas "duplas"', '', 'z'])
  })
  it('completa linhas irregulares com nulos', () => {
    const t = parseCsvText('a,b\n1\n1,2,3', { delimiter: ',' })
    expect(t.columnCount).toBe(3)
    expect(t.row(0)).toEqual(['a', 'b', null])
    expect(t.row(1)).toEqual(['1', null, null])
    expect(t.row(2)).toEqual(['1', '2', '3'])
  })
  it('respeita quoted=false e codificação', () => {
    const t = parseCsvText('"a",b\n"1",2', { delimiter: ',', quoted: false })
    expect(t.row(0)).toEqual(['"a"', 'b'])
    const bytes = new Uint8Array([0x6e, 0x6f, 0x6d, 0x65, 0x3b, 0x63, 0x69, 0x64, 0x0a, 0x4a, 0x6f, 0xe3, 0x6f, 0x3b, 0x53, 0xe3, 0x6f])
    const t2 = parseCsv(bytes, { delimiter: 'auto', encoding: 'auto' })
    expect(t2.row(1)).toEqual(['João', 'São'])
  })
  it('é rápido para muitas linhas', () => {
    const lines = ['id;nome;valor']
    for (let i = 0; i < 200_000; i++) lines.push(`${i};Cliente ${i % 100};${(i * 1.5).toFixed(2).replace('.', ',')}`)
    const t0 = performance.now()
    const t = parseCsvText(lines.join('\n'))
    const ms = performance.now() - t0
    expect(t.rowCount).toBe(200_001)
    expect(ms).toBeLessThan(5000)
  })
})

function makeWorkbook(): Uint8Array {
  const ws: XLSX.WorkSheet = {
    '!ref': 'A1:E5',
    A1: { t: 's', v: 'Data' },
    B1: { t: 's', v: 'Quando' },
    C1: { t: 's', v: 'Valor' },
    D1: { t: 's', v: 'Ativo' },
    E1: { t: 's', v: 'Hora' },
    A2: { t: 'n', v: 45322, z: 'yyyy-mm-dd' },
    B2: { t: 'n', v: 45322.5, z: 'dd/mm/yyyy hh:mm' },
    C2: { t: 'n', v: 10.5 },
    D2: { t: 'b', v: true },
    E2: { t: 'n', v: 0.75, z: 'hh:mm:ss' },
    A3: { t: 'n', v: 1, z: 'm/d/yy' },
    C3: { t: 'e', v: 0x07 },
    D3: { t: 'b', v: false },
    A4: { t: 's', v: 'texto' },
    C4: { t: 'n', v: 3 }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Vendas')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], [1]]), 'Outra')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Uint8Array(out)
}

describe('Excel', () => {
  const bytes = makeWorkbook()
  it('lista as planilhas', () => {
    expect(listExcelSheets(bytes)).toEqual(['Vendas', 'Outra'])
  })
  it('lê datas sem depender do fuso horário', () => {
    const t = readExcelSheet(bytes, 'Vendas')
    expect(t.columnNames()).toEqual(['Column1', 'Column2', 'Column3', 'Column4', 'Column5'])
    expect(t.rowCount).toBe(4) // linha 5 vazia é descartada
    const d = t.columns[0].get(1) as DateVal
    expect(d).toBeInstanceOf(DateVal)
    expect(d.kind).toBe('date')
    expect(d.ms).toBe(makeDate(2024, 1, 31))
    const dt = t.columns[1].get(1) as DateVal
    expect(dt.kind).toBe('datetime')
    expect(dt.ms).toBe(makeDate(2024, 1, 31, 12, 0, 0))
    const tm = t.columns[4].get(1) as DateVal
    expect(tm.kind).toBe('time')
    expect(new Date(tm.ms).getUTCHours()).toBe(18)
    // Série 1 = 01/01/1900 no Excel.
    expect((t.columns[0].get(2) as DateVal).ms).toBe(makeDate(1900, 1, 1))
    expect(t.columns[2].get(1)).toBe(10.5)
    expect(t.columns[2].hasError(2)).toBe(true)
    expect(t.columns[2].errorMessage).toContain('#DIV/0!')
    expect(t.columns[3].get(1)).toBe(true)
    expect(t.columns[0].get(3)).toBe('texto')
    expect(t.columns[1].get(3)).toBeNull()
  })
  it('promove cabeçalhos e detecta tipos', () => {
    const t = readExcelSheet(bytes, 'Vendas')
    const steps = autoSteps(t)
    expect(steps.map((s) => s.name)).toEqual(['Cabeçalhos Promovidos', 'Tipo Alterado'])
  })
  it('falha com planilha inexistente', () => {
    expect(() => readExcelSheet(bytes, 'Nada')).toThrow(/não foi encontrada/)
  })
})

describe('JSON', () => {
  it('achata registros aninhados', () => {
    const t = parseJsonTable(enc(JSON.stringify([{ id: 1, cliente: { nome: 'Ana', cidade: 'Recife' }, tags: ['a', 'b'] }, { id: 2, extra: true }])))
    expect(t.columnNames()).toEqual(['id', 'cliente.nome', 'cliente.cidade', 'tags', 'extra'])
    expect(t.row(0)).toEqual([1, 'Ana', 'Recife', '["a","b"]', null])
    expect(t.row(1)).toEqual([2, null, null, null, true])
  })
  it('encontra a lista de registros dentro de um objeto', () => {
    const t = jsonToTable({ meta: { total: 2 }, data: { items: [{ a: 1 }, { a: 2 }] } })
    expect(t.rowCount).toBe(2)
    expect(t.columnNames()).toEqual(['a'])
  })
  it('lê registro único, lista simples e JSON Lines', () => {
    expect(jsonToTable({ a: 1, b: 'x' }).rowCount).toBe(1)
    const l = jsonToTable([1, 2, 3])
    expect(l.columnNames()).toEqual(['Column1'])
    expect(l.rowCount).toBe(3)
    const jl = parseJsonTable(enc('{"a":1}\n{"a":2}\n'))
    expect(jl.rowCount).toBe(2)
    expect(() => parseJsonTable(enc('{oops'))).toThrow(/JSON inválido/)
  })
})

function textTable(rows: (string | null)[][]): DataTable {
  const n = rows[0].length
  const cols = Array.from({ length: n }, (_, j) =>
    Column.fromScalars(
      `Column${j + 1}`,
      'text',
      rows.map((r) => r[j])
    )
  )
  return new DataTable(cols, rows.length)
}

describe('cabeçalhos e tipos automáticos', () => {
  it('reconhece cabeçalhos', () => {
    expect(looksLikeHeaderRow(textTable([['Nome', 'Valor'], ['Ana', '10'], ['Bia', '20']]))).toBe(true)
    expect(looksLikeHeaderRow(textTable([['1', '2'], ['3', '4']]))).toBe(false)
    expect(looksLikeHeaderRow(textTable([['Ana', ''], ['Bia', 'x']]))).toBe(false)
    expect(looksLikeHeaderRow(textTable([['Cidade', 'Estado'], ['Recife', 'PE'], ['Natal', 'RN']]))).toBe(true)
    expect(looksLikeHeaderRow(textTable([['Recife', 'PE'], ['Natal', 'RN'], ['Recife', 'PE']]))).toBe(false)
  })
  it('gera etapas com cultura pt-BR', () => {
    const t = parseCsvText('Nome;Valor;Data;Código\nAna;1.234,56;31/01/2024;0012\nBia;10,5;01/02/2024;0450')
    const steps = autoSteps(t, CULTURE_PT_BR)
    expect(steps).toHaveLength(2)
    const ct = steps[1].op
    if (ct.op !== 'changeTypes') throw new Error('esperado changeTypes')
    expect(ct.columns).toEqual([
      { column: 'Nome', type: 'text' },
      { column: 'Valor', type: 'number' },
      { column: 'Data', type: 'date' },
      { column: 'Código', type: 'text' }
    ])
    expect(ct.culture).toEqual({ decimalSep: ',', dayFirst: true })
    let r = t
    for (const s of steps) r = applyStep(r, s.op)
    expect(r.column('Valor')!.get(0)).toBe(1234.56)
    expect((r.column('Data')!.get(1) as DateVal).ms).toBe(makeDate(2024, 2, 1))
  })
  it('detecta cultura americana', () => {
    const t = parseCsvText('Name,Amount,When\nA,"1,234.56",01/31/2024\nB,10.5,02/13/2024')
    const steps = autoSteps(t, CULTURE_PT_BR)
    const ct = steps[1].op
    if (ct.op !== 'changeTypes') throw new Error('esperado changeTypes')
    expect(ct.culture).toEqual({ decimalSep: '.', dayFirst: false })
    let r = t
    for (const s of steps) r = applyStep(r, s.op)
    expect(r.column('Amount')!.get(0)).toBe(1234.56)
    expect((r.column('When')!.get(0) as DateVal).ms).toBe(makeDate(2024, 1, 31))
  })
  it('não promove quando desativado', () => {
    const t = textTable([['Nome'], ['Ana']])
    expect(autoSteps(t, CULTURE_PT_BR, { allowPromote: false }).map((s) => s.op.op)).toEqual(['changeTypes'])
  })
})
