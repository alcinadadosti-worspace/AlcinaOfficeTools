// Definições do editor de consultas (transformação de dados antes da carga).
// Estes tipos são serializados no arquivo .alcbi, portanto devem ser JSON puro.
import type { DataType, Scalar } from '../data/types'
import { DateVal } from '../data/types'

/** Escalar serializável em JSON (datas viram objeto). */
export type JsonScalar = null | number | string | boolean | { date: number; kind: 'date' | 'datetime' | 'time' }

export function toJsonScalar(v: Scalar): JsonScalar {
  if (v instanceof DateVal) return { date: v.ms, kind: v.kind }
  return v
}

export function fromJsonScalar(v: JsonScalar | undefined): Scalar {
  if (v === undefined || v === null) return null
  if (typeof v === 'object') return new DateVal(v.date, v.kind)
  return v
}

export interface DbSourceConnection {
  kind: 'postgres' | 'mysql' | 'sqlserver'
  host: string
  port?: number
  database: string
  user: string
  /** Senha não é salva no arquivo; é solicitada na atualização. */
  password?: string
  ssl?: boolean
}

export type CsvEncoding = 'auto' | 'utf-8' | 'windows-1252' | 'iso-8859-1' | 'utf-16le'

export type SourceDef =
  | { kind: 'csv'; path: string; delimiter: string; encoding: CsvEncoding; quoted?: boolean }
  | { kind: 'excel'; path: string; sheet: string }
  | { kind: 'json'; path: string }
  | { kind: 'parquet'; path: string }
  | { kind: 'web'; url: string; format: 'auto' | 'csv' | 'json'; delimiter?: string }
  | { kind: 'enterData'; columns: { name: string; type: DataType }[]; rows: (string | null)[][] }
  | { kind: 'reference'; queryId: string }
  | { kind: 'database'; connection: DbSourceConnection; sql: string }
  | { kind: 'folder'; path: string; extension: string; delimiter?: string }
  | { kind: 'blank' }

export type CondOp =
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
  | 'notEndsWith'
  | 'isNull'
  | 'isNotNull'
  | 'isEmpty'
  | 'isNotEmpty'

export type RowCondition =
  | { kind: 'compare'; column: string; operator: CondOp; value?: JsonScalar; valueColumn?: string; caseSensitive?: boolean }
  | { kind: 'in'; column: string; values: JsonScalar[]; negate?: boolean }
  | { kind: 'and'; conditions: RowCondition[] }
  | { kind: 'or'; conditions: RowCondition[] }
  | { kind: 'not'; condition: RowCondition }
  /** Expressão booleana na linguagem de fórmulas de coluna (estilo M). */
  | { kind: 'expression'; expression: string }

export type TextTransform =
  | 'lower'
  | 'upper'
  | 'capitalize'
  | 'trim'
  | 'clean'
  | 'prefix'
  | 'suffix'
  | 'length'
  | 'reverse'
  | 'removeSpaces'

export type NumberTransform =
  | 'round'
  | 'roundUp'
  | 'roundDown'
  | 'abs'
  | 'sqrt'
  | 'square'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'integerDivide'
  | 'mod'
  | 'power'
  | 'negate'
  | 'sign'
  | 'log10'
  | 'ln'
  | 'exp'
  | 'percentage'
  | 'isEven'
  | 'isOdd'

export type DatePart =
  | 'year'
  | 'startOfYear'
  | 'endOfYear'
  | 'month'
  | 'monthName'
  | 'startOfMonth'
  | 'endOfMonth'
  | 'daysInMonth'
  | 'quarter'
  | 'startOfQuarter'
  | 'endOfQuarter'
  | 'weekOfYear'
  | 'weekOfMonth'
  | 'startOfWeek'
  | 'endOfWeek'
  | 'day'
  | 'dayOfWeek'
  | 'dayOfYear'
  | 'dayName'
  | 'date'
  | 'time'
  | 'hour'
  | 'minute'
  | 'second'
  | 'age'

export type GroupAggregation = 'sum' | 'avg' | 'median' | 'min' | 'max' | 'count' | 'countNonBlank' | 'countDistinct'

export type JoinKind = 'left' | 'right' | 'full' | 'inner' | 'leftAnti' | 'rightAnti'

export type ExtractMode =
  | 'length'
  | 'first'
  | 'last'
  | 'range'
  | 'beforeDelimiter'
  | 'afterDelimiter'
  | 'betweenDelimiters'

export type StepOp =
  | { op: 'promoteHeaders' }
  | { op: 'demoteHeaders' }
  | {
      op: 'changeTypes'
      columns: { column: string; type: DataType }[]
      /** Cultura usada para interpretar textos (separador decimal, ordem dia/mês). */
      culture?: { decimalSep: ',' | '.'; dayFirst: boolean }
    }
  | { op: 'removeColumns'; columns: string[] }
  | { op: 'selectColumns'; columns: string[] }
  | { op: 'renameColumns'; renames: { from: string; to: string }[] }
  | { op: 'reorderColumns'; columns: string[] }
  | { op: 'duplicateColumn'; column: string; newName: string }
  | { op: 'filterRows'; condition: RowCondition }
  | { op: 'keepRows'; mode: 'top' | 'bottom' | 'range'; count: number; offset?: number }
  | { op: 'removeRows'; mode: 'top' | 'bottom' | 'alternate' | 'blank' | 'errors'; count?: number; offset?: number; keep?: number; columns?: string[] }
  | { op: 'removeDuplicates'; columns: string[] }
  | { op: 'keepDuplicates'; columns: string[] }
  | { op: 'sort'; keys: { column: string; desc: boolean }[] }
  | {
      op: 'replaceValues'
      columns: string[]
      find: JsonScalar
      replace: JsonScalar
      /** Para texto: substitui somente quando a célula inteira coincide. */
      matchEntire: boolean
      caseSensitive?: boolean
    }
  | { op: 'replaceErrors'; columns: string[]; value: JsonScalar }
  | { op: 'fill'; columns: string[]; direction: 'down' | 'up' }
  | {
      op: 'splitColumn'
      column: string
      mode: 'delimiter' | 'positions' | 'length'
      delimiter?: string
      /** Para delimitador: em cada ocorrência, só na primeira (mais à esquerda) ou só na última. */
      at?: 'each' | 'first' | 'last'
      positions?: number[]
      length?: number
      /** Número de colunas resultantes (se omitido, detectado nos dados). */
      parts?: number
      /** Divide em linhas em vez de colunas. */
      intoRows?: boolean
    }
  | { op: 'mergeColumns'; columns: string[]; separator: string; newName: string; keepOriginal?: boolean }
  | {
      op: 'transformText'
      columns: string[]
      fn: TextTransform
      arg?: string
      /** Se informado, cria nova coluna com este nome em vez de transformar no lugar. */
      newName?: string
    }
  | { op: 'transformNumber'; columns: string[]; fn: NumberTransform; arg?: number; newName?: string }
  | { op: 'datePart'; column: string; part: DatePart; newName?: string }
  | { op: 'extractText'; column: string; mode: ExtractMode; count?: number; start?: number; delimiter?: string; endDelimiter?: string; newName?: string }
  | { op: 'addColumn'; name: string; expression: string; type?: DataType }
  | {
      op: 'conditionalColumn'
      name: string
      rules: {
        column: string
        operator: CondOp
        value?: JsonScalar
        valueColumn?: string
        output?: JsonScalar
        outputColumn?: string
      }[]
      otherwise?: JsonScalar
      otherwiseColumn?: string
      type?: DataType
    }
  | { op: 'indexColumn'; name: string; start: number; step: number }
  | { op: 'groupBy'; keys: string[]; aggregations: { name: string; fn: GroupAggregation; column?: string }[] }
  | { op: 'unpivot'; columns: string[]; mode: 'selected' | 'others'; attribute: string; value: string }
  | { op: 'pivot'; column: string; valueColumn: string; fn: GroupAggregation | 'none' }
  | { op: 'transpose' }
  | {
      op: 'merge'
      rightQueryId: string
      leftKeys: string[]
      rightKeys: string[]
      join: JoinKind
      /** Colunas da tabela da direita a expandir. */
      expand: string[]
      /** Prefixo dos nomes expandidos (padrão: nome da consulta da direita + "."). */
      prefix?: string
    }
  | { op: 'append'; queryIds: string[] }

export interface StepDef {
  id: string
  /** Nome exibido em "Etapas aplicadas". */
  name: string
  op: StepOp
}

export interface QueryDef {
  id: string
  name: string
  source: SourceDef
  steps: StepDef[]
  /** Habilitar carga no modelo. */
  load: boolean
  description?: string
}

/** Acesso a recursos externos (arquivos, web, bancos) usado pelo executor. */
export interface SourceHost {
  readFile(path: string): Promise<Uint8Array>
  statFile(path: string): Promise<{ size: number; mtimeMs: number } | null>
  listDir(path: string): Promise<{ name: string; isDir: boolean; size: number; mtimeMs: number }[]>
  fetchUrl(url: string): Promise<{ status: number; contentType: string; data: Uint8Array }>
  dbQuery(connection: DbSourceConnection, sql: string): Promise<{ columns: { name: string; type: string }[]; rows: unknown[][] }>
}

/** Informações de perfil de coluna para a visualização prévia. */
export interface ColumnProfile {
  name: string
  type: DataType
  count: number
  valid: number
  errors: number
  empty: number
  distinct: number
  unique: number
  min?: JsonScalar
  max?: JsonScalar
  /** Até 20 valores mais frequentes (valor formatado, contagem). */
  top: { value: string; count: number }[]
  firstError?: string
}

export interface QueryPreview {
  queryId: string
  stepIndex: number
  columns: { name: string; type: DataType }[]
  /** Linhas formatadas como texto; null = vazio; objeto { error } = erro. */
  rows: (string | null | { error: string })[][]
  rowCount: number
  profiles: ColumnProfile[]
  error?: string
  /** Código estilo M da etapa selecionada (para a barra de fórmulas). */
  formula: string
  elapsedMs: number
}
