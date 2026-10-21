// Modelo e E/S do bloco de notas (.alcnotes).
import type { EditorApi } from '@alcina/editor'

export interface Note {
  id: string
  title: string
  doc: unknown
  /** Seção (caderno) a que a nota pertence. */
  section?: string
  /** Marcadores/etiquetas. */
  tags?: string[]
}

export interface Notebook {
  version: 1
  app: 'alcina-notes'
  notes: Note[]
}

const enc = new TextEncoder()
const dec = new TextDecoder()
const FILTER = [{ name: 'Bloco de notas AlcinaNotes', extensions: ['alcnotes'] }]

let seq = 0
export function uid(): string {
  seq = (seq + 1) % 1_000_000
  return `n_${Date.now().toString(36)}${seq.toString(36)}`
}

export function emptyDoc(): unknown {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

export function newNote(title: string, section = 'Geral'): Note {
  return { id: uid(), title, doc: emptyDoc(), section, tags: [] }
}

export async function saveNotebook(notes: Note[], suggested: string): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: FILTER, defaultPath: `${suggested}.alcnotes` })
  if (!path) return null
  const data: Notebook = { version: 1, app: 'alcina-notes', notes }
  await window.alcinaFiles.write(path, enc.encode(JSON.stringify(data)))
  return path
}

export async function openNotebook(): Promise<{ notes: Note[]; path: string } | null> {
  const path = await window.alcinaFiles.openDialog({ filters: FILTER })
  if (!path) return null
  const bytes = await window.alcinaFiles.read(path)
  const data = JSON.parse(dec.decode(bytes)) as Notebook
  if (data?.app !== 'alcina-notes' || !Array.isArray(data.notes)) throw new Error('Este arquivo não é um bloco de notas AlcinaNotes.')
  return { notes: data.notes.length ? data.notes : [newNote('Nota 1')], path }
}

const PDF = [{ name: 'PDF', extensions: ['pdf'] }]

/** Exporta a nota ativa como PDF, com o título como cabeçalho. */
export async function exportNotePdf(api: EditorApi, title: string, suggested: string): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: PDF, defaultPath: `${suggested}.pdf` })
  if (!path) return null
  let html = api.getPrintHtml()
  const safe = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()
  if (safe) html = html.replace('<div class="page">', `<div class="page"><h1 style="margin-top:0">${safe}</h1>`)
  await window.alcinaPdf.print(html, path)
  return path
}

export function baseName(path: string | null): string {
  if (!path) return 'Bloco de notas'
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '')
}
