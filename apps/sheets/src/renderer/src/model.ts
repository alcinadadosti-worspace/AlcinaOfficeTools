// Modelo do documento: pasta de trabalho = planilhas (valores + estilos de célula).
import { SheetEngine, type CellEntry } from '@alcina/sheets-engine'

export type NumFmt = 'general' | 'number' | 'currency' | 'percent' | 'thousands'

export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  color?: string
  fill?: string
  fmt?: NumFmt
  decimals?: number
}

export interface SheetDoc {
  name: string
  engine: SheetEngine
  styles: Record<string, CellStyle>
}

export interface SavedSheet {
  name: string
  cells: CellEntry[]
  styles?: Record<string, CellStyle>
}

export interface SavedWorkbook {
  version: 1
  app: 'alcina-sheets'
  sheets: SavedSheet[]
}

export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

export function newSheet(name: string): SheetDoc {
  return { name, engine: new SheetEngine(), styles: {} }
}

export function serialize(sheets: SheetDoc[]): SavedWorkbook {
  return { version: 1, app: 'alcina-sheets', sheets: sheets.map((s) => ({ name: s.name, cells: s.engine.entries(), styles: s.styles })) }
}

export function deserialize(data: SavedWorkbook): SheetDoc[] {
  if (!data || data.app !== 'alcina-sheets') throw new Error('Este arquivo não é uma planilha AlcinaSheets.')
  const out = (data.sheets ?? []).map((s) => {
    const e = new SheetEngine()
    e.load(s.cells ?? [])
    return { name: s.name, engine: e, styles: s.styles ?? {} }
  })
  return out.length ? out : [newSheet('Planilha1')]
}
