// Definições do modelo semântico (tabelas, colunas, medidas, relações).
import type { DataType } from '../data/types'

export type Cardinality = 'manyToOne' | 'oneToOne' | 'manyToMany'
export type CrossFilter = 'single' | 'both'

export interface RelationshipDef {
  id: string
  /** Lado "muitos" (ou lado filtrado em 1:1 / *:*). */
  fromTable: string
  fromColumn: string
  /** Lado "um" (ou lado que filtra). */
  toTable: string
  toColumn: string
  cardinality: Cardinality
  crossFilter: CrossFilter
  active: boolean
}

export type SummarizeBy = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct' | 'none'

export type DataCategory =
  | 'uncategorized'
  | 'address'
  | 'city'
  | 'continent'
  | 'country'
  | 'county'
  | 'latitude'
  | 'longitude'
  | 'place'
  | 'postalCode'
  | 'stateOrProvince'
  | 'webUrl'
  | 'imageUrl'

export interface ColumnDef {
  name: string
  dataType: DataType
  formatString?: string
  summarizeBy: SummarizeBy
  sortByColumn?: string
  dataCategory?: DataCategory
  isHidden?: boolean
  description?: string
  displayFolder?: string
  /** Coluna calculada (DAX). */
  expression?: string
  /** Nome da coluna na consulta de origem (permite renomear no modelo). */
  sourceColumn?: string
}

export interface MeasureDef {
  name: string
  expression: string
  formatString?: string
  description?: string
  displayFolder?: string
  isHidden?: boolean
}

export interface HierarchyDef {
  name: string
  levels: { name: string; column: string }[]
  isHidden?: boolean
}

export interface TableDef {
  name: string
  /** Consulta de origem (editor de consultas). */
  queryId?: string
  /** Tabela calculada (expressão DAX). */
  expression?: string
  columns: ColumnDef[]
  measures: MeasureDef[]
  hierarchies: HierarchyDef[]
  isHidden?: boolean
  description?: string
  /** Se marcada como tabela de datas: coluna de data. */
  dateColumn?: string
}

export interface ModelDef {
  tables: TableDef[]
  relationships: RelationshipDef[]
  /** Hierarquia automática de datas (Ano > Trimestre > Mês > Dia). */
  autoDateTime: boolean
}

export function emptyModel(): ModelDef {
  return { tables: [], relationships: [], autoDateTime: true }
}

/** Níveis da hierarquia automática de datas. */
export type DatePartLevel = 'year' | 'quarter' | 'month' | 'day'
export const DATE_LEVELS: DatePartLevel[] = ['year', 'quarter', 'month', 'day']
export const DATE_LEVEL_LABEL: Record<DatePartLevel, string> = {
  year: 'Ano',
  quarter: 'Trimestre',
  month: 'Mês',
  day: 'Dia'
}

/** Nome interno da coluna derivada de data. */
export function datePartColumnName(column: string, level: DatePartLevel): string {
  return `${column}\u0000${level}`
}

export function parseDatePartColumnName(name: string): { column: string; level: DatePartLevel } | null {
  const i = name.indexOf('\u0000')
  if (i < 0) return null
  return { column: name.slice(0, i), level: name.slice(i + 1) as DatePartLevel }
}
