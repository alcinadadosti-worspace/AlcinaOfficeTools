// Consultas dos visuais (equivalente ao SUMMARIZECOLUMNS gerado pelos visuais).
import type { DataType } from '../data/types'
import type { JsonScalar } from '../query/types'
import type { DatePartLevel } from '../model/types'

export type Aggregation =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'countDistinct'
  | 'median'
  | 'stdev'
  | 'variance'
  | 'first'
  | 'last'
  | 'none'

export const AGGREGATION_LABEL: Record<Aggregation, string> = {
  sum: 'Soma',
  avg: 'Média',
  min: 'Mínimo',
  max: 'Máximo',
  count: 'Contagem',
  countDistinct: 'Contagem (distinta)',
  median: 'Mediana',
  stdev: 'Desvio padrão',
  variance: 'Variância',
  first: 'Primeiro',
  last: 'Último',
  none: 'Não resumir'
}

/** Referência a um campo do modelo usada em visuais e filtros. */
export interface FieldRef {
  table: string
  /** Coluna (ou coluna base da hierarquia de datas). */
  column?: string
  /** Nível da hierarquia automática de datas. */
  level?: DatePartLevel
  /** Medida. */
  measure?: string
  /** Agregação implícita (para colunas em poços de valores). */
  aggregation?: Aggregation
}

export type AdvancedOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'ge'
  | 'lt'
  | 'le'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'notStartsWith'
  | 'endsWith'
  | 'isBlank'
  | 'isNotBlank'
  | 'isEmpty'
  | 'isNotEmpty'

export type RelativeUnit = 'day' | 'week' | 'month' | 'quarter' | 'year'

export type VQFilter =
  | { kind: 'in'; field: FieldRef; values: JsonScalar[]; not?: boolean }
  | { kind: 'tuple'; fields: FieldRef[]; tuples: JsonScalar[][] }
  | { kind: 'advanced'; field: FieldRef; logic: 'and' | 'or'; conditions: { op: AdvancedOp; value?: JsonScalar }[] }
  | { kind: 'range'; field: FieldRef; min?: JsonScalar; max?: JsonScalar }
  | {
      kind: 'relativeDate'
      field: FieldRef
      mode: 'last' | 'this' | 'next'
      count: number
      unit: RelativeUnit
      includeToday?: boolean
    }
  | { kind: 'topN'; field: FieldRef; n: number; by: FieldRef; bottom?: boolean }
  /** Filtro sobre o valor de uma medida/agregação (aplicado aos grupos do visual). */
  | { kind: 'measure'; field: FieldRef; op: AdvancedOp; value?: JsonScalar }

export interface VisualQuery {
  groupBy: FieldRef[]
  values: FieldRef[]
  filters: VQFilter[]
  /** Seleção de outro visual para realce (destaque cruzado). */
  highlight?: VQFilter[]
  /**
   * Conjuntos de agrupamento adicionais (índices em groupBy): [] = total geral.
   * O conjunto principal (todos os índices) é sempre calculado.
   */
  groupingSets?: number[][]
  orderBy?: { kind: 'group' | 'value'; index: number; desc: boolean }[]
  limit?: number
  /** Mostrar itens sem dados (todas as combinações). */
  showItemsWithNoData?: boolean
}

export interface VQColumn {
  name: string
  kind: 'group' | 'value'
  type: DataType
  format?: string
  field: FieldRef
}

export interface VQSetResult {
  indexes: number[]
  rows: { keys: JsonScalar[]; values: JsonScalar[] }[]
}

export interface VQResult {
  columns: VQColumn[]
  /** Linhas do conjunto principal: chaves seguidas dos valores. */
  rows: JsonScalar[][]
  /** Valores sob realce, alinhados com rows (somente colunas de valor). */
  highlights?: JsonScalar[][]
  /** Chaves de ordenação dos grupos (ex.: coluna "classificar por"). */
  sortKeys?: JsonScalar[][]
  sets: VQSetResult[]
  rowCount: number
  truncated: boolean
  elapsedMs: number
}
