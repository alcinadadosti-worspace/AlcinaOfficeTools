// Abrir/salvar: formato próprio .alcsheet, CSV e .xlsx (via SheetJS — valores).
import * as XLSX from 'xlsx'
import { displayValue, isError, type CellValue } from '@alcina/sheets-engine'
import { serialize, deserialize, newSheet, type SheetDoc } from './model'

const enc = new TextEncoder()
const dec = new TextDecoder()

const ALC = [{ name: 'Planilha AlcinaSheets', extensions: ['alcsheet'] }]
const XLSXF = [{ name: 'Pasta de trabalho do Excel', extensions: ['xlsx'] }]
const CSVF = [{ name: 'Valores separados (CSV)', extensions: ['csv', 'txt'] }]

function baseName(path: string): string {
  const f = path.split(/[\\/]/).pop() ?? path
  return f.replace(/\.[^.]+$/, '')
}

function plain(v: CellValue): string | number | boolean | null {
  if (v === null) return null
  if (isError(v)) return v.error
  return v
}

export async function saveWorkbook(sheets: SheetDoc[], suggested: string): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: ALC, defaultPath: `${suggested}.alcsheet` })
  if (!path) return null
  await window.alcinaFiles.write(path, enc.encode(JSON.stringify(serialize(sheets))))
  return path
}

export async function openWorkbook(): Promise<{ sheets: SheetDoc[]; path: string } | null> {
  const path = await window.alcinaFiles.openDialog({ filters: ALC })
  if (!path) return null
  const bytes = await window.alcinaFiles.read(path)
  const data = JSON.parse(dec.decode(bytes)) as import('./model').SavedWorkbook
  return { sheets: deserialize(data), path }
}

export async function importXlsx(): Promise<SheetDoc[] | null> {
  const path = await window.alcinaFiles.openDialog({ filters: XLSXF })
  if (!path) return null
  const bytes = await window.alcinaFiles.read(path)
  const wb = XLSX.read(bytes, { type: 'array', cellNF: true })
  // SSF: formatador de números do SheetJS — usado para reconhecer e formatar células de data.
  const SSF = (XLSX as unknown as { SSF?: { is_date: (f: string) => boolean; format: (f: string, v: number) => string } }).SSF
  const out: SheetDoc[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const doc = newSheet(name)
    const ref = ws['!ref']
    if (ref) {
      const range = XLSX.utils.decode_range(ref)
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
          if (!cell) continue
          let raw: string
          if (cell.t === 'n') {
            // Célula com formato de data: mostra como dd/mm/aaaa em vez do número de série (ex.: 45306).
            const z = cell.z ? String(cell.z) : ''
            raw = z && SSF && SSF.is_date(z) ? SSF.format('dd/mm/yyyy', cell.v as number) : String(cell.v)
          } else if (cell.t === 'b') raw = cell.v ? 'VERDADEIRO' : 'FALSO'
          else raw = String(cell.w ?? cell.v ?? '')
          if (raw !== '') doc.engine.setCell(r, c, raw)
        }
      }
    }
    out.push(doc)
  }
  return out.length ? out : null
}

export async function exportXlsx(sheets: SheetDoc[], suggested: string): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: XLSXF, defaultPath: `${suggested}.xlsx` })
  if (!path) return null
  const wb = XLSX.utils.book_new()
  // Nomes de aba válidos e únicos: o Excel proíbe \ / ? * [ ] : e nomes repetidos (book_append_sheet lança exceção).
  const used = new Set<string>()
  const safeName = (name: string): string => {
    let n = (name || 'Planilha').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31).trim() || 'Planilha'
    const base = n
    let i = 1
    while (used.has(n.toLowerCase())) { const suffix = ` (${++i})`; n = base.slice(0, 31 - suffix.length).trim() + suffix }
    used.add(n.toLowerCase())
    return n
  }
  for (const s of sheets) {
    const e = s.engine
    const aoa: (string | number | boolean | null)[][] = []
    const rows = Math.max(e.rows, 1)
    const cols = Math.max(e.cols, 1)
    for (let r = 0; r < rows; r++) {
      const row: (string | number | boolean | null)[] = []
      for (let c = 0; c < cols; c++) row.push(plain(e.getValue(r, c)))
      aoa.push(row)
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), safeName(s.name))
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  await window.alcinaFiles.write(path, new Uint8Array(buf))
  return path
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split('\n')[0] ?? ''
  const delim = firstLine.split(';').length > firstLine.split(',').length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQ = false
  let i = 0
  const pushField = (): void => {
    row.push(field)
    field = ''
  }
  const pushRow = (): void => {
    pushField()
    rows.push(row)
    row = []
  }
  while (i < text.length) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQ = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQ = true
      i++
    } else if (c === delim) {
      pushField()
      i++
    } else if (c === '\r') {
      i++
    } else if (c === '\n') {
      pushRow()
      i++
    } else {
      field += c
      i++
    }
  }
  if (field !== '' || row.length) pushRow()
  return rows
}

function csvEscape(s: string): string {
  return /[;",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function importCsv(): Promise<SheetDoc | null> {
  const path = await window.alcinaFiles.openDialog({ filters: CSVF })
  if (!path) return null
  const bytes = await window.alcinaFiles.read(path)
  const doc = newSheet(baseName(path))
  const rows = parseCsv(dec.decode(bytes))
  rows.forEach((cells, r) => cells.forEach((val, c) => val !== '' && doc.engine.setCell(r, c, val)))
  return doc
}

export async function exportCsv(sheet: SheetDoc, suggested: string): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: CSVF, defaultPath: `${suggested}.csv` })
  if (!path) return null
  const e = sheet.engine
  const lines: string[] = []
  const rows = Math.max(e.rows, 1)
  const cols = Math.max(e.cols, 1)
  for (let r = 0; r < rows; r++) {
    const cells: string[] = []
    for (let c = 0; c < cols; c++) cells.push(csvEscape(displayValue(e.getValue(r, c))))
    lines.push(cells.join(';'))
  }
  await window.alcinaFiles.write(path, enc.encode(lines.join('\r\n')))
  return path
}
