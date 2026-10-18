// Estado da interface (não salvo no arquivo).
import { create } from 'zustand'
import type { ModelInfo } from '@engine/service'
import type { VQFilter } from '@engine/vq/types'

export type ViewKind = 'report' | 'table' | 'model' | 'dax'

export interface CrossSelection {
  visualId: string
  filters: VQFilter[]
  /** chaves selecionadas (para destacar no próprio visual) */
  keys: string[]
}

export type DialogState =
  | { kind: 'getData' }
  | { kind: 'csv'; path: string; replaceQueryId?: string }
  | { kind: 'excel'; path: string }
  | { kind: 'json'; path: string }
  | { kind: 'web' }
  | { kind: 'enterData'; queryId?: string }
  | { kind: 'database' }
  | { kind: 'folder' }
  | { kind: 'relationship'; id?: string; fromTable?: string; fromColumn?: string; toTable?: string; toColumn?: string }
  | { kind: 'manageRelationships' }
  | { kind: 'measure'; table: string; name?: string; kindOf: 'measure' | 'column' | 'table' }
  | { kind: 'theme' }
  | { kind: 'options' }
  | { kind: 'about' }
  | { kind: 'pageSettings'; pageId: string }
  | { kind: 'showData'; visualId: string }
  | { kind: 'saveChanges'; then: 'close' | 'new' | 'open'; path?: string }
  | { kind: 'error'; title: string; message: string }
  | { kind: 'publish' }

export interface Toast {
  id: number
  intent: 'info' | 'success' | 'warning' | 'error'
  title: string
  body?: string
}

export interface UiStore {
  view: ViewKind
  showStart: boolean
  activePageId: string | null
  selectedVisualIds: string[]
  panes: { filters: boolean; visualizations: boolean; data: boolean }
  vizTab: 'build' | 'format'
  selection: Record<string, CrossSelection | null>
  modelInfo: ModelInfo | null
  /** Incrementa quando o modelo/dados mudam (visuais recalculam). */
  modelVersion: number
  loading: { message: string; detail?: string } | null
  queryEditor: { open: boolean; queryId: string | null; stepIndex: number }
  dataView: { table: string | null; sort?: { column: string; desc: boolean } }
  modelSelection: { table: string | null }
  dialog: DialogState | null
  focusVisualId: string | null
  zoom: number
  toasts: Toast[]
  engineBusy: boolean
  clipboard: unknown
  /** Barra de fórmulas (edição de medida/coluna/tabela calculada). */
  formula: { kind: 'measure' | 'column' | 'table'; table: string; original?: string; text: string; error?: string } | null
  /** Seleção atual no painel de dados (para propriedades/ferramentas). */
  fieldSelection: { table: string; column?: string; measure?: string } | null
  set: (patch: Partial<UiStore>) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  openDialog: (d: DialogState) => void
  closeDialog: () => void
}

let toastSeq = 1

export const useUi = create<UiStore>((set, get) => ({
  view: 'report',
  showStart: true,
  activePageId: null,
  selectedVisualIds: [],
  panes: { filters: true, visualizations: true, data: true },
  vizTab: 'build',
  selection: {},
  modelInfo: null,
  modelVersion: 0,
  loading: null,
  queryEditor: { open: false, queryId: null, stepIndex: -1 },
  dataView: { table: null },
  modelSelection: { table: null },
  dialog: null,
  focusVisualId: null,
  zoom: 1,
  toasts: [],
  engineBusy: false,
  clipboard: null,
  formula: null,
  fieldSelection: null,
  set: (patch) => set(patch),
  toast: (t) => {
    const id = toastSeq++
    set({ toasts: [...get().toasts, { ...t, id }] })
    setTimeout(() => get().dismissToast(id), t.intent === 'error' ? 8000 : 4000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  openDialog: (d) => set({ dialog: d }),
  closeDialog: () => set({ dialog: null })
}))

export function ui(): UiStore {
  return useUi.getState()
}
