// Estrutura do relatório (páginas, visuais, filtros, tema).
import type { FieldRef, AdvancedOp, RelativeUnit } from '@engine/vq/types'
import type { JsonScalar, QueryDef } from '@engine/query/types'
import type { ModelDef } from '@engine/model/types'

export type VisualType =
  | 'column'
  | 'stackedColumn'
  | 'percentColumn'
  | 'bar'
  | 'stackedBar'
  | 'percentBar'
  | 'line'
  | 'area'
  | 'stackedArea'
  | 'lineColumn'
  | 'lineStackedColumn'
  | 'ribbon'
  | 'waterfall'
  | 'funnel'
  | 'scatter'
  | 'pie'
  | 'donut'
  | 'treemap'
  | 'gauge'
  | 'card'
  | 'multiCard'
  | 'kpi'
  | 'table'
  | 'matrix'
  | 'slicer'
  | 'map'
  | 'text'
  | 'shape'
  | 'image'
  | 'button'

export type FilterKind = 'basic' | 'advanced' | 'topN' | 'relative'

export interface FilterDef {
  id: string
  field: FieldRef
  type: FilterKind
  /** Básico: valores selecionados. */
  values?: JsonScalar[]
  /** Básico: "selecionar tudo" com exceções (values = exceções). */
  invert?: boolean
  /** Avançado */
  logic?: 'and' | 'or'
  conditions?: { op: AdvancedOp; value?: JsonScalar }[]
  /** Top N */
  n?: number
  bottom?: boolean
  by?: FieldRef
  /** Data relativa */
  relative?: { mode: 'last' | 'this' | 'next'; count: number; unit: RelativeUnit; includeToday: boolean }
  locked?: boolean
  hidden?: boolean
  collapsed?: boolean
}

export interface SlicerState {
  values: JsonScalar[]
  range?: { min?: JsonScalar; max?: JsonScalar }
  search?: string
}

export type FormatProps = Record<string, Record<string, unknown>>

export interface VisualDef {
  id: string
  type: VisualType
  x: number
  y: number
  w: number
  h: number
  z: number
  /** Campos por papel (eixo, legenda, valores...). */
  fields: Record<string, FieldRef[]>
  format: FormatProps
  filters: FilterDef[]
  /** Ordenação escolhida no visual. */
  sort?: { kind: 'group' | 'value'; index: number; desc: boolean }
  /** Nível atual da hierarquia (detalhamento). */
  drillLevel?: number
  /** Caminho de detalhamento (filtros dos níveis acima). */
  drillPath?: { field: FieldRef; value: JsonScalar }[]
  slicer?: SlicerState
  /** Conteúdo da caixa de texto. */
  text?: string
  /** Imagem (data URL). */
  image?: string
  hidden?: boolean
  locked?: boolean
  /** Interações com outros visuais: id do visual alvo -> modo. */
  interactions?: Record<string, 'filter' | 'highlight' | 'none'>
}

export interface PageDef {
  id: string
  name: string
  width: number
  height: number
  background: { color: string; transparency: number }
  wallpaper: { color: string; transparency: number }
  visuals: VisualDef[]
  filters: FilterDef[]
  hidden?: boolean
  display: 'fit' | 'fitWidth' | 'actual'
}

export interface ReportTheme {
  name: string
  dataColors: string[]
  background: string
  foreground: string
  tableAccent: string
  good: string
  neutral: string
  bad: string
  visualBackground?: string
  pageBackground?: string
  fontFamily?: string
  /** Cores para o modo escuro do relatório (opcional). */
  dark?: boolean
}

export interface ReportDef {
  pages: PageDef[]
  filters: FilterDef[]
  theme: ReportTheme
  /** Posições das tabelas na exibição de modelo. */
  modelLayout: Record<string, { x: number; y: number }>
}

/** Documento completo (salvo no arquivo .alcbi). */
export interface DocState {
  version: 1
  queries: QueryDef[]
  model: ModelDef
  report: ReportDef
  /** Configurações do arquivo atual. */
  settings: {
    locale: 'pt-BR' | 'en-US'
    activePageId?: string
  }
}
