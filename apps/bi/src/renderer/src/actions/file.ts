// Arquivos .alcbi: novo, abrir, salvar.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { engine } from '../engine/client'
import { getDoc, useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { newDoc } from '../report/defaults'
import type { DocState } from '../report/types'
import { enqueue, syncModelNow } from './model'

export const FILE_EXT = 'alcbi'
const FORMAT = 'alcinabi-report'
const FORMAT_VERSION = 1

export function fileTitle(path: string | null): string {
  if (!path) return 'Sem título'
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.alcbi$/i, '')
}

/** Serializa o documento e os dados carregados em um pacote ZIP. */
export async function packDocument(doc: DocState): Promise<Uint8Array> {
  const data = await enqueue(() => engine.exportData())
  const files: Zippable = {
    'manifest.json': strToU8(JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, app: 'AlcinaBi', savedAt: new Date().toISOString() })),
    'document.json': strToU8(JSON.stringify(doc))
  }
  for (const d of data) files[`data/${d.queryId}.abt`] = [d.data, { level: 6 }]
  return zipSync(files, { level: 6 })
}

export async function unpackDocument(bytes: Uint8Array): Promise<{ doc: DocState; data: { queryId: string; data: Uint8Array }[] }> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('O arquivo não é um relatório AlcinaBi válido.')
  }
  const manifest = files['manifest.json'] ? JSON.parse(strFromU8(files['manifest.json'])) : null
  if (!manifest || manifest.format !== FORMAT) throw new Error('O arquivo não é um relatório AlcinaBi válido.')
  if (manifest.version > FORMAT_VERSION) throw new Error('Este arquivo foi salvo em uma versão mais nova do AlcinaBi.')
  const doc = JSON.parse(strFromU8(files['document.json'])) as DocState
  const data = Object.entries(files)
    .filter(([k]) => k.startsWith('data/') && k.endsWith('.abt'))
    .map(([k, v]) => ({ queryId: k.slice(5, -4), data: v }))
  return { doc, data }
}

export async function saveTo(path: string): Promise<boolean> {
  const ui = useUi.getState()
  ui.set({ loading: { message: 'Salvando...' } })
  try {
    const bytes = await packDocument(getDoc())
    await window.alcina.fs.write(path, bytes)
    useDoc.getState().markSaved(path)
    await window.alcina.recent.add(path)
    ui.toast({ intent: 'success', title: 'Relatório salvo', body: path })
    return true
  } catch (e) {
    ui.openDialog({ kind: 'error', title: 'Não foi possível salvar', message: e instanceof Error ? e.message : String(e) })
    return false
  } finally {
    useUi.getState().set({ loading: null })
  }
}

export async function saveAs(): Promise<boolean> {
  const current = useDoc.getState().filePath
  const path = await window.alcina.dialog.save({
    title: 'Salvar como',
    defaultPath: current ?? `${fileTitle(null)}.${FILE_EXT}`,
    filters: [{ name: 'Relatório AlcinaBi', extensions: [FILE_EXT] }]
  })
  if (!path) return false
  return saveTo(path)
}

export async function save(): Promise<boolean> {
  const path = useDoc.getState().filePath
  if (!path) return saveAs()
  return saveTo(path)
}

export async function openPath(path: string): Promise<boolean> {
  const ui = useUi.getState()
  ui.set({ loading: { message: 'Abrindo relatório...', detail: path } })
  try {
    const bytes = await window.alcina.fs.read(path)
    const { doc, data } = await unpackDocument(bytes)
    await enqueue(() => engine.importData(data))
    useDoc.getState().load(doc, path)
    const first = doc.settings.activePageId && doc.report.pages.some((p) => p.id === doc.settings.activePageId) ? doc.settings.activePageId : doc.report.pages[0]?.id
    ui.set({ showStart: false, activePageId: first ?? null, selectedVisualIds: [], selection: {}, view: 'report' })
    await window.alcina.recent.add(path)
    await syncModelNow()
    return true
  } catch (e) {
    ui.openDialog({ kind: 'error', title: 'Não foi possível abrir o arquivo', message: e instanceof Error ? e.message : String(e) })
    await window.alcina.recent.remove(path).catch(() => undefined)
    return false
  } finally {
    useUi.getState().set({ loading: null })
  }
}

/** Confirma alterações não salvas antes de prosseguir. */
export function confirmDiscard(then: 'close' | 'new' | 'open', path?: string): boolean {
  if (!useDoc.getState().dirty) return true
  useUi.getState().openDialog({ kind: 'saveChanges', then, path })
  return false
}

export async function newFile(force = false): Promise<void> {
  if (!force && !confirmDiscard('new')) return
  await enqueue(() => engine.reset())
  const doc = newDoc()
  useDoc.getState().load(doc, null)
  useUi.getState().set({
    showStart: true,
    activePageId: doc.report.pages[0].id,
    selectedVisualIds: [],
    selection: {},
    modelInfo: null,
    view: 'report',
    queryEditor: { open: false, queryId: null, stepIndex: -1 }
  })
  await syncModelNow()
}

export async function openDialogAndFile(force = false, path?: string): Promise<void> {
  let target = path
  if (!target) {
    const paths = await window.alcina.dialog.open({ title: 'Abrir relatório', filters: [{ name: 'Relatório AlcinaBi', extensions: [FILE_EXT] }] })
    if (!paths || !paths[0]) return
    target = paths[0]
  }
  if (!force && !confirmDiscard('open', target)) return
  await openPath(target)
}

/** Continua a ação pendente após o diálogo "Salvar alterações?". */
export async function continueAfterSave(choice: 'save' | 'discard', then: 'close' | 'new' | 'open', path?: string): Promise<void> {
  if (choice === 'save') {
    const ok = await save()
    if (!ok) return
  }
  if (then === 'close') window.alcina.window.confirmClose()
  else if (then === 'new') await newFile(true)
  else await openDialogAndFile(true, path)
}
