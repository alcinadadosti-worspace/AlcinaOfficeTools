// Modelo do documento: pasta de trabalho = lista de planilhas (cada uma com seu motor).
import { SheetEngine, type CellEntry } from '@alcina/sheets-engine'

export interface SheetDoc {
  name: string
  engine: SheetEngine
}

export interface SavedSheet {
  name: string
  cells: CellEntry[]
}

export interface SavedWorkbook {
  version: 1
  app: 'alcina-sheets'
  sheets: SavedSheet[]
}

export function newSheet(name: string): SheetDoc {
  return { name, engine: new SheetEngine() }
}

export function serialize(sheets: SheetDoc[]): SavedWorkbook {
  return { version: 1, app: 'alcina-sheets', sheets: sheets.map((s) => ({ name: s.name, cells: s.engine.entries() })) }
}

export function deserialize(data: SavedWorkbook): SheetDoc[] {
  if (!data || data.app !== 'alcina-sheets') throw new Error('Este arquivo não é uma planilha AlcinaSheets.')
  const out = (data.sheets ?? []).map((s) => {
    const e = new SheetEngine()
    e.load(s.cells ?? [])
    return { name: s.name, engine: e }
  })
  return out.length ? out : [newSheet('Planilha1')]
}
