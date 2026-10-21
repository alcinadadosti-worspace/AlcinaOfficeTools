// Abrir/salvar: formato próprio .alcdoc, importar/exportar .docx e exportar PDF.
import type { EditorApi } from '@alcina/editor'

const enc = new TextEncoder()
const dec = new TextDecoder()

const ALC = [{ name: 'Documento do Alcina Office', extensions: ['alcdoc'] }]
const DOCX = [{ name: 'Documento do Word', extensions: ['docx'] }]
const PDF = [{ name: 'PDF', extensions: ['pdf'] }]

interface SavedDoc {
  version: 1
  app: 'alcina-docs'
  doc: unknown
}

export async function saveDoc(api: EditorApi, suggested: string): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: ALC, defaultPath: `${suggested}.alcdoc` })
  if (!path) return null
  const data: SavedDoc = { version: 1, app: 'alcina-docs', doc: api.getJSON() }
  await window.alcinaFiles.write(path, enc.encode(JSON.stringify(data)))
  return path
}

export async function openDoc(api: EditorApi): Promise<string | null> {
  const path = await window.alcinaFiles.openDialog({ filters: ALC })
  if (!path) return null
  const bytes = await window.alcinaFiles.read(path)
  const data = JSON.parse(dec.decode(bytes)) as SavedDoc
  if (data?.app !== 'alcina-docs') throw new Error('Este arquivo não é um documento do Alcina Office.')
  api.setJSON(data.doc)
  return path
}

export async function importDocx(api: EditorApi): Promise<string | null> {
  const path = await window.alcinaFiles.openDialog({ filters: DOCX })
  if (!path) return null
  const html = await window.alcinaDocx.toHtml(path)
  api.setHTML(html)
  return path
}

export async function exportDocx(api: EditorApi, suggested: string): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: DOCX, defaultPath: `${suggested}.docx` })
  if (!path) return null
  await window.alcinaDocx.build(api.getBlocks(), path)
  return path
}

export async function exportPdf(api: EditorApi, suggested: string, opts?: { header?: string; footer?: string; pageNumbers?: boolean }): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: PDF, defaultPath: `${suggested}.pdf` })
  if (!path) return null
  await window.alcinaDocx.printPdf(api.getPrintHtml(), path, opts)
  return path
}

export function baseName(path: string | null): string {
  if (!path) return 'Documento'
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '')
}
