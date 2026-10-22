// Leitura de arquivos de texto delimitado (CSV/TXT/TSV).
import Papa from 'papaparse'
import { ColumnBuilder } from '../data/column'
import { DataTable } from '../data/table'
import type { CsvEncoding } from '../query/types'

/** Decodifica bytes em texto, detectando BOM e codificação. */
export function decodeText(bytes: Uint8Array, encoding: CsvEncoding = 'auto'): string {
  // BOM tem prioridade sobre a codificação informada.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  switch (encoding) {
    case 'utf-8':
      return new TextDecoder('utf-8').decode(bytes)
    case 'utf-16le':
      return new TextDecoder('utf-16le').decode(bytes)
    case 'windows-1252':
    case 'iso-8859-1':
      return new TextDecoder('windows-1252').decode(bytes)
    default:
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        return new TextDecoder('windows-1252').decode(bytes)
      }
  }
}

const CANDIDATES = [',', ';', '\t', '|']

/** Conta ocorrências de um caractere fora de aspas em uma linha. */
function countOutsideQuotes(line: string, ch: string): number {
  let n = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (!inQuotes && c === ch) n++
  }
  return n
}

/** Detecta o delimitador mais provável entre vírgula, ponto e vírgula, tabulação e barra vertical. */
export function detectDelimiter(text: string): string {
  const lines: string[] = []
  let start = 0
  while (lines.length < 30 && start < text.length) {
    let end = text.indexOf('\n', start)
    if (end < 0) end = text.length
    const line = text.slice(start, end).replace(/\r$/, '')
    if (line.trim()) lines.push(line)
    start = end + 1
  }
  if (!lines.length) return ','
  let best = ','
  let bestScore = -1
  for (const ch of CANDIDATES) {
    const counts = lines.map((l) => countOutsideQuotes(l, ch))
    const freq = new Map<number, number>()
    for (const c of counts) if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1)
    if (!freq.size) continue
    let mode = 0
    let modeFreq = 0
    for (const [c, f] of freq) {
      if (f > modeFreq || (f === modeFreq && c > mode)) {
        mode = c
        modeFreq = f
      }
    }
    // Consistência entre linhas pesa mais que a quantidade de separadores.
    const score = (modeFreq / lines.length) * 1000 + Math.min(mode, 100)
    if (score > bestScore) {
      bestScore = score
      best = ch
    }
  }
  return best
}

export interface CsvOptions {
  /** Delimitador ou 'auto'. */
  delimiter?: string
  encoding?: CsvEncoding
  /** Interpretar aspas (padrão true). */
  quoted?: boolean
}

/** Converte texto delimitado em tabela com colunas de texto Column1..N. */
export function parseCsvText(text: string, opts: CsvOptions = {}): DataTable {
  let delimiter = opts.delimiter && opts.delimiter !== 'auto' ? opts.delimiter : detectDelimiter(text)
  if (delimiter === '\\t') delimiter = '\t'
  const builders: ColumnBuilder[] = []
  let rows = 0
  const addRow = (fields: string[]) => {
    const n = fields.length
    while (builders.length < n) {
      const b = new ColumnBuilder('text', Math.max(64, rows + 1))
      for (let i = 0; i < rows; i++) b.push(null)
      builders.push(b)
    }
    for (let c = 0; c < builders.length; c++) builders[c].push(c < n ? fields[c] : null)
    rows++
  }
  if (text.length > 0) {
    Papa.parse<string[]>(text, {
      delimiter,
      quoteChar: opts.quoted === false ? '\u0000' : '"',
      skipEmptyLines: true,
      header: false,
      dynamicTyping: false,
      step: (res) => {
        addRow(res.data)
      }
    })
  }
  const cols = builders.map((b, i) => b.build(`Column${i + 1}`))
  return new DataTable(cols, rows)
}

/** Lê bytes de um arquivo delimitado. */
export function parseCsv(bytes: Uint8Array, opts: CsvOptions = {}): DataTable {
  return parseCsvText(decodeText(bytes, opts.encoding ?? 'auto'), opts)
}
