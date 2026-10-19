// Modelo do documento: pasta de trabalho = planilhas (valores + estilos de célula).
import { SheetEngine, type CellEntry } from '@alcina/sheets-engine'

export type NumFmt = 'general' | 'number' | 'currency' | 'accounting' | 'percent' | 'thousands' | 'scientific' | 'text'

export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  wrap?: boolean
  color?: string
  fill?: string
  fontFamily?: string
  fontSize?: number
  fmt?: NumFmt
  decimals?: number
  /** Bordas: topo, base, esquerda, direita. */
  bt?: boolean
  bb?: boolean
  bl?: boolean
  br?: boolean
}

/** Mesclagem horizontal: âncora (r,c) ocupando `cs` colunas. */
export interface Merge {
  r: number
  c: number
  cs: number
}

export interface SheetDoc {
  name: string
  engine: SheetEngine
  styles: Record<string, CellStyle>
  merges: Merge[]
}

export interface SavedSheet {
  name: string
  cells: CellEntry[]
  styles?: Record<string, CellStyle>
  merges?: Merge[]
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
  return { name, engine: new SheetEngine(), styles: {}, merges: [] }
}

export function serialize(sheets: SheetDoc[]): SavedWorkbook {
  return { version: 1, app: 'alcina-sheets', sheets: sheets.map((s) => ({ name: s.name, cells: s.engine.entries(), styles: s.styles, merges: s.merges })) }
}

export function deserialize(data: SavedWorkbook): SheetDoc[] {
  if (!data || data.app !== 'alcina-sheets') throw new Error('Este arquivo não é uma planilha AlcinaSheets.')
  const out = (data.sheets ?? []).map((s) => {
    const e = new SheetEngine()
    e.load(s.cells ?? [])
    return { name: s.name, engine: e, styles: s.styles ?? {}, merges: s.merges ?? [] }
  })
  return out.length ? out : [newSheet('Planilha1')]
}
