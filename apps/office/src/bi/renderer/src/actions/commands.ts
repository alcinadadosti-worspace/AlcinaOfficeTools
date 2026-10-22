// Comandos da interface (faixa de opções, menus e atalhos).
import { getDoc, useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { allMeasureNames, uniqueName } from './model'
import { refreshAll } from './data'
import { save, saveAs, newFile, openDialogAndFile } from './file'
import { exportPdf } from './export'

export type SourceKind = 'excel' | 'csv' | 'json' | 'web' | 'folder' | 'enterData' | 'database' | 'blank'

export async function getData(kind: SourceKind): Promise<void> {
  const ui = useUi.getState()
  ui.set({ showStart: false })
  const pick = async (title: string, name: string, extensions: string[]) => {
    const paths = await window.alcina.dialog.open({ title, filters: [{ name, extensions }, { name: 'Todos os arquivos', extensions: ['*'] }] })
    return paths?.[0] ?? null
  }
  switch (kind) {
    case 'excel': {
      const p = await pick('Abrir pasta de trabalho do Excel', 'Pastas de trabalho do Excel', ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods'])
      if (p) ui.openDialog({ kind: 'excel', path: p })
      break
    }
    case 'csv': {
      const p = await pick('Abrir arquivo de texto/CSV', 'Arquivos de texto', ['csv', 'txt', 'tsv', 'prn'])
      if (p) ui.openDialog({ kind: 'csv', path: p })
      break
    }
    case 'json': {
      const p = await pick('Abrir arquivo JSON', 'JSON', ['json', 'jsonl', 'ndjson'])
      if (p) ui.openDialog({ kind: 'json', path: p })
      break
    }
    case 'web':
      ui.openDialog({ kind: 'web' })
      break
    case 'folder':
      ui.openDialog({ kind: 'folder' })
      break
    case 'enterData':
      ui.openDialog({ kind: 'enterData' })
      break
    case 'database':
      ui.openDialog({ kind: 'database' })
      break
    default:
      ui.openDialog({ kind: 'getData' })
  }
}

export function openQueryEditor(queryId?: string): void {
  const doc = getDoc()
  const q = doc.queries.find((x) => x.id === queryId) ?? doc.queries[0] ?? null
  useUi.getState().set({ queryEditor: { open: true, queryId: q?.id ?? null, stepIndex: q ? q.steps.length - 1 : -1 } })
}

function defaultTable(): string | null {
  const ui = useUi.getState()
  const doc = getDoc()
  if (ui.fieldSelection?.table && doc.model.tables.some((t) => t.name === ui.fieldSelection!.table)) return ui.fieldSelection.table
  if (ui.view === 'table' && ui.dataView.table) return ui.dataView.table
  return doc.model.tables[0]?.name ?? null
}

export function newMeasure(table?: string): void {
  const t = table ?? defaultTable()
  const ui = useUi.getState()
  if (!t) {
    ui.toast({ intent: 'warning', title: 'Carregue dados antes de criar medidas.' })
    return
  }
  const name = uniqueName('Medida', allMeasureNames(getDoc()))
  ui.set({ formula: { kind: 'measure', table: t, text: `${name} = ` } })
}

export function newColumn(table?: string): void {
  const t = table ?? defaultTable()
  const ui = useUi.getState()
  if (!t) {
    ui.toast({ intent: 'warning', title: 'Carregue dados antes de criar colunas.' })
    return
  }
  const cols = getDoc().model.tables.find((x) => x.name === t)?.columns.map((c) => c.name) ?? []
  ui.set({ formula: { kind: 'column', table: t, text: `${uniqueName('Coluna', cols)} = ` } })
}

export function newTable(): void {
  const names = getDoc().model.tables.map((t) => t.name)
  useUi.getState().set({ formula: { kind: 'table', table: '', text: `${uniqueName('Tabela', names)} = ` } })
}

export function editMeasure(table: string, name: string): void {
  const m = getDoc().model.tables.find((t) => t.name === table)?.measures.find((x) => x.name === name)
  if (!m) return
  useUi.getState().set({ formula: { kind: 'measure', table, original: name, text: `${name} = ${m.expression}` }, fieldSelection: { table, measure: name } })
}

export function editCalculated(table: string, column?: string): void {
  const t = getDoc().model.tables.find((x) => x.name === table)
  if (!t) return
  if (column) {
    const c = t.columns.find((x) => x.name === column)
    if (!c?.expression) return
    useUi.getState().set({ formula: { kind: 'column', table, original: column, text: `${column} = ${c.expression}` } })
  } else if (t.expression) {
    useUi.getState().set({ formula: { kind: 'table', table, original: table, text: `${table} = ${t.expression}` } })
  }
}

export const commands = {
  save: () => void save(),
  saveAs: () => void saveAs(),
  open: () => void openDialogAndFile(),
  newFile: () => void newFile(),
  refresh: () => void refreshAll(),
  exportPdf: () => void exportPdf(),
  undo: () => useDoc.getState().undo(),
  redo: () => useDoc.getState().redo(),
  transform: () => openQueryEditor(),
  manageRelationships: () => useUi.getState().openDialog({ kind: 'manageRelationships' })
}
