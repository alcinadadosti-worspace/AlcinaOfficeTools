// Estado do documento (consultas, modelo e relatório) com desfazer/refazer.
import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { newDoc } from '../report/defaults'
import type { DocState } from '../report/types'

const MAX_HISTORY = 100

interface HistoryEntry {
  doc: DocState
  label: string
}

export interface DocStore {
  doc: DocState
  filePath: string | null
  dirty: boolean
  past: HistoryEntry[]
  future: HistoryEntry[]
  lastCoalesce: { key: string; at: number } | null
  /** Aplica uma alteração (registrada no histórico). */
  update: (label: string, recipe: (d: Draft<DocState>) => void, opts?: { coalesce?: string; history?: boolean }) => void
  undo: () => void
  redo: () => void
  load: (doc: DocState, filePath: string | null) => void
  markSaved: (filePath: string) => void
}

export const useDoc = create<DocStore>((set, get) => ({
  doc: newDoc(),
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  lastCoalesce: null,

  update: (label, recipe, opts) => {
    const s = get()
    const next = produce(s.doc, recipe)
    if (next === s.doc) return
    const now = Date.now()
    const coalesce = opts?.coalesce && s.lastCoalesce && s.lastCoalesce.key === opts.coalesce && now - s.lastCoalesce.at < 1500
    const record = opts?.history !== false && !coalesce
    set({
      doc: next,
      dirty: true,
      past: record ? [...s.past, { doc: s.doc, label }].slice(-MAX_HISTORY) : s.past,
      future: record || coalesce ? [] : s.future,
      lastCoalesce: opts?.coalesce ? { key: opts.coalesce, at: now } : null
    })
  },

  undo: () => {
    const s = get()
    const prev = s.past[s.past.length - 1]
    if (!prev) return
    set({
      doc: prev.doc,
      past: s.past.slice(0, -1),
      future: [{ doc: s.doc, label: prev.label }, ...s.future],
      dirty: true,
      lastCoalesce: null
    })
  },

  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next) return
    set({
      doc: next.doc,
      future: s.future.slice(1),
      past: [...s.past, { doc: s.doc, label: next.label }],
      dirty: true,
      lastCoalesce: null
    })
  },

  load: (doc, filePath) => set({ doc, filePath, dirty: false, past: [], future: [], lastCoalesce: null }),

  markSaved: (filePath) => set({ filePath, dirty: false })
}))

/** Atalho para alterações fora de componentes. */
export function updateDoc(label: string, recipe: (d: Draft<DocState>) => void, opts?: { coalesce?: string; history?: boolean }): void {
  useDoc.getState().update(label, recipe, opts)
}

export function getDoc(): DocState {
  return useDoc.getState().doc
}
