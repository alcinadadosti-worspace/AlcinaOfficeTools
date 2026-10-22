// Leitura de pastas de trabalho do Excel (xlsx, xlsm, xlsb, xls, ods).
import * as XLSX from 'xlsx'
import { ColumnBuilder } from '../data/column'
import { DataTable } from '../data/table'
import { DateVal, type Scalar } from '../data/types'
import { MS_PER_DAY, OLE_EPOCH_MS, fromLocalDate } from '../data/dates'

const sheetNamesCache = new WeakMap<Uint8Array, string[]>()
const sheetCache = new WeakMap<Uint8Array, Map<string, DataTable>>()

/** Lista as planilhas de uma pasta de trabalho. */
export function listExcelSheets(bytes: Uint8Array): string[] {
  const cached = sheetNamesCache.get(bytes)
  if (cached) return cached
  const wb = XLSX.read(bytes, { type: 'array', bookSheets: true })
  const names = [...wb.SheetNames]
  sheetNamesCache.set(bytes, names)
  return names
}

const EXCEL_ERRORS: Record<number, string> = {
  0x00: '#NULL!',
  0x07: '#DIV/0!',
  0x0f: '#VALUE!',
  0x17: '#REF!',
  0x1d: '#NAME?',
  0x24: '#NUM!',
  0x2a: '#N/A',
  0x2b: '#GETTING_DATA'
}

/** Verifica se um formato numérico do Excel representa data/hora. */
function isDateNumFormat(fmt: string | undefined): boolean {
  if (!fmt || fmt === 'General') return false
  try {
    if (XLSX.SSF && typeof XLSX.SSF.is_date === 'function') return !!XLSX.SSF.is_date(fmt)
  } catch {
    /* formato inválido: tenta heurística abaixo */
  }
  const f = fmt.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
  return /[dmyhs]/i.test(f) && !/[0#?]/.test(f.replace(/[dmyhs]/gi, ''))
}

function stripFormat(fmt: string): string {
  return fmt.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
}

/** Converte um número de série do Excel em data "ingênua" (independe de fuso). */
function serialToDate(serial: number, date1904: boolean, fmt: string): DateVal {
  const f = stripFormat(fmt)
  const hasTime = /[hs]/i.test(f) || /AM\/PM/i.test(fmt)
  const hasDate = /[dy]/i.test(f) || (/m/i.test(f) && !hasTime)
  if (!hasDate && hasTime && serial < 1) {
    return new DateVal(OLE_EPOCH_MS + Math.round(serial * MS_PER_DAY), 'time')
  }
  let s = date1904 ? serial + 1462 : serial
  // O Excel considera 29/02/1900 uma data válida (série 60); séries anteriores
  // ficam um dia à frente do calendário OLE.
  if (!date1904 && s < 60) s += 1
  const ms = Math.round(OLE_EPOCH_MS + s * MS_PER_DAY)
  const whole = Math.abs(s - Math.round(s)) < 1e-9
  return new DateVal(ms, whole && !hasTime ? 'date' : 'datetime')
}

/** Lê uma planilha como tabela de colunas "qualquer" (Column1..N). */
export function readExcelSheet(bytes: Uint8Array, sheet: string): DataTable {
  let perBook = sheetCache.get(bytes)
  const hit = perBook?.get(sheet)
  if (hit) return hit
  const wb = XLSX.read(bytes, {
    type: 'array',
    dense: true,
    cellDates: false,
    cellNF: true,
    cellText: false,
    cellHTML: false,
    cellFormula: false,
    sheets: sheet
  })
  const ws = wb.Sheets[sheet]
  if (!ws) throw new Error(`A planilha "${sheet}" não foi encontrada na pasta de trabalho.`)
  const date1904 = !!wb.Workbook?.WBProps?.date1904
  const data = (ws['!data'] ?? []) as (XLSX.CellObject | undefined)[][]

  // Caixa delimitadora das células não vazias.
  let minR = Infinity
  let maxR = -1
  let minC = Infinity
  let maxC = -1
  for (let r = 0; r < data.length; r++) {
    const row = data[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (!cell || cell.t === 'z' || cell.v === undefined || cell.v === null) continue
      if (cell.t === 's' && cell.v === '') continue
      if (r < minR) minR = r
      if (r > maxR) maxR = r
      if (c < minC) minC = c
      if (c > maxC) maxC = c
    }
  }
  if (maxR < 0) {
    const empty = new DataTable([], 0)
    if (!perBook) sheetCache.set(bytes, (perBook = new Map()))
    perBook.set(sheet, empty)
    return empty
  }
  const nCols = maxC - minC + 1
  const nRows = maxR - minR + 1
  const builders: ColumnBuilder[] = []
  for (let c = 0; c < nCols; c++) builders.push(new ColumnBuilder('any', nRows))
  for (let r = minR; r <= maxR; r++) {
    const row = data[r]
    for (let c = 0; c < nCols; c++) {
      const b = builders[c]
      const cell = row ? row[minC + c] : undefined
      if (!cell || cell.v === undefined || cell.v === null || cell.t === 'z') {
        b.push(null)
        continue
      }
      let v: Scalar
      switch (cell.t) {
        case 'n': {
          const num = cell.v as number
          const fmt = typeof cell.z === 'string' ? cell.z : undefined
          v = fmt && isDateNumFormat(fmt) ? serialToDate(num, date1904, fmt) : num
          break
        }
        case 'b':
          v = !!cell.v
          break
        case 'e': {
          const code = typeof cell.v === 'number' ? cell.v : -1
          b.pushError(`Erro do Excel: ${EXCEL_ERRORS[code] ?? '#ERRO'}`)
          continue
        }
        case 'd': {
          const d = cell.v instanceof Date ? cell.v : new Date(String(cell.v))
          v = Number.isNaN(d.getTime()) ? null : new DateVal(fromLocalDate(d), 'datetime')
          break
        }
        default:
          v = typeof cell.v === 'string' ? cell.v : String(cell.v)
      }
      b.push(v)
    }
  }
  const table = new DataTable(
    builders.map((b, i) => b.build(`Column${i + 1}`)),
    nRows
  )
  if (!perBook) sheetCache.set(bytes, (perBook = new Map()))
  perBook.set(sheet, table)
  return table
}
