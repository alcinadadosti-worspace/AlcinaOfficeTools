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

/** Regra de formatação condicional aplicada a um intervalo. */
export interface CondRule {
  r1: number
  c1: number
  r2: number
  c2: number
  op: '>' | '<' | '>=' | '<=' | '=' | '<>' | 'between'
  v1: number
  v2?: number
  fill: string
  color?: string
}

export type ChartType = 'column' | 'bar' | 'line' | 'pie'

/** Gráfico flutuante sobre a grade, alimentado por um intervalo de células. */
export interface ChartObj {
  id: string
  type: ChartType
  r1: number
  c1: number
  r2: number
  c2: number
  x: number
  y: number
  w: number
  h: number
  title?: string
}

export interface SheetDoc {
  name: string
  engine: SheetEngine
  styles: Record<string, CellStyle>
  merges: Merge[]
  charts: ChartObj[]
  condFormats: CondRule[]
}

export interface SavedSheet {
  name: string
  cells: CellEntry[]
  styles?: Record<string, CellStyle>
  merges?: Merge[]
  charts?: ChartObj[]
  condFormats?: CondRule[]
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
  return { name, engine: new SheetEngine(), styles: {}, merges: [], charts: [], condFormats: [] }
}

export function serialize(sheets: SheetDoc[]): SavedWorkbook {
  return { version: 1, app: 'alcina-sheets', sheets: sheets.map((s) => ({ name: s.name, cells: s.engine.entries(), styles: s.styles, merges: s.merges, charts: s.charts, condFormats: s.condFormats })) }
}

export function deserialize(data: SavedWorkbook): SheetDoc[] {
  if (!data || data.app !== 'alcina-sheets') throw new Error('Este arquivo não é uma planilha AlcinaSheets.')
  const out = (data.sheets ?? []).map((s) => {
    const e = new SheetEngine()
    e.load(s.cells ?? [])
    return { name: s.name, engine: e, styles: s.styles ?? {}, merges: s.merges ?? [], charts: s.charts ?? [], condFormats: s.condFormats ?? [] }
  })
  return out.length ? out : [newSheet('Planilha1')]
}
