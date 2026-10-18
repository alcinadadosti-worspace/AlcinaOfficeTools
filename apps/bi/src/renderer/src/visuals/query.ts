// Monta as consultas do motor a partir da definição de um visual.
import type { FieldRef, VQFilter, VisualQuery } from '@engine/vq/types'
import type { FilterDef, PageDef, ReportDef, VisualDef } from '../report/types'
import type { CrossSelection } from '../state/ui'
import { visualDef } from './registry'

export function isMeasureLike(f: FieldRef): boolean {
  return !!f.measure || (!!f.aggregation && f.aggregation !== 'none')
}

/** Converte um cartão de filtro em filtros do motor. */
export function filterToVQ(f: FilterDef): VQFilter | null {
  if (isMeasureLike(f.field)) {
    // Filtro em medida: aplicado aos grupos do visual (nível do visual).
    const c = f.conditions?.find((x) => x.op)
    if (f.type !== 'advanced' || !c) return null
    return { kind: 'measure', field: f.field, op: c.op, value: c.value }
  }
  switch (f.type) {
    case 'basic':
      if (f.invert) return f.values && f.values.length ? { kind: 'in', field: f.field, values: f.values, not: true } : null
      return f.values && f.values.length ? { kind: 'in', field: f.field, values: f.values } : null
    case 'advanced': {
      const conds = (f.conditions ?? []).filter((c) => c.op)
      if (!conds.length) return null
      return { kind: 'advanced', field: f.field, logic: f.logic ?? 'and', conditions: conds }
    }
    case 'topN':
      if (!f.n || !f.by) return null
      return { kind: 'topN', field: f.field, n: f.n, by: f.by, bottom: f.bottom }
    case 'relative':
      if (!f.relative) return null
      return { kind: 'relativeDate', field: f.field, ...f.relative }
  }
}

export function slicerFilters(v: VisualDef): VQFilter[] {
  const field = v.fields.field?.[0]
  if (!field || !v.slicer) return []
  const out: VQFilter[] = []
  if (v.slicer.values.length) out.push({ kind: 'in', field, values: v.slicer.values })
  const r = v.slicer.range
  if (r && (r.min !== undefined || r.max !== undefined)) out.push({ kind: 'range', field, min: r.min ?? undefined, max: r.max ?? undefined })
  return out
}

export type InteractionMode = 'filter' | 'highlight' | 'none'

export function interactionMode(source: VisualDef, target: VisualDef): InteractionMode {
  const explicit = source.interactions?.[target.id]
  if (explicit) return explicit
  if (target.type === 'slicer' || source.type === 'slicer') return 'filter'
  return visualDef(target.type)?.highlight ? 'highlight' : 'filter'
}

export interface QueryContext {
  report: ReportDef
  page: PageDef
  selection: CrossSelection | null
}

/** Filtros que se aplicam a um visual (relatório, página, visual, segmentações e seleção). */
export function contextFilters(v: VisualDef, ctx: QueryContext): { filters: VQFilter[]; highlight: VQFilter[] } {
  const filters: VQFilter[] = []
  const push = (f: FilterDef) => {
    const x = filterToVQ(f)
    if (x) filters.push(x)
  }
  ctx.report.filters.forEach(push)
  ctx.page.filters.forEach(push)
  v.filters.forEach(push)
  for (const other of ctx.page.visuals) {
    if (other.id === v.id || other.type !== 'slicer' || other.hidden) continue
    if (interactionMode(other, v) === 'none') continue
    filters.push(...slicerFilters(other))
  }
  const highlight: VQFilter[] = []
  const sel = ctx.selection
  if (sel && sel.visualId !== v.id) {
    const src = ctx.page.visuals.find((x) => x.id === sel.visualId)
    const mode = src ? interactionMode(src, v) : 'filter'
    if (mode === 'filter') filters.push(...sel.filters)
    else if (mode === 'highlight') highlight.push(...sel.filters)
  }
  for (const d of v.drillPath ?? []) filters.push({ kind: 'in', field: d.field, values: [d.value] })
  return { filters, highlight }
}

/** Campo da hierarquia no nível de detalhamento atual. */
export function levelField(fields: FieldRef[] | undefined, level = 0): FieldRef | undefined {
  if (!fields || !fields.length) return undefined
  return fields[Math.min(level, fields.length - 1)]
}

export interface BuiltQuery {
  query: VisualQuery
  /** Mapeamento: papéis usados como grupos/valores, na ordem da consulta. */
  groups: { role: string; field: FieldRef }[]
  values: { role: string; field: FieldRef }[]
}

function groupOrValue(fields: FieldRef[], role: string, groups: BuiltQuery['groups'], values: BuiltQuery['values']): void {
  for (const f of fields) {
    if (isMeasureLike(f)) values.push({ role, field: f })
    else groups.push({ role, field: f })
  }
}

/** Constrói a consulta do visual (ou null se faltam campos obrigatórios). */
export function buildQuery(v: VisualDef, ctx: QueryContext): BuiltQuery | null {
  const { filters, highlight } = contextFilters(v, ctx)
  const groups: BuiltQuery['groups'] = []
  const values: BuiltQuery['values'] = []
  const F = v.fields
  const level = v.drillLevel ?? 0
  let limit: number | undefined = 1000
  let groupingSets: number[][] | undefined
  let showItemsWithNoData = false
  switch (v.type) {
    case 'column':
    case 'stackedColumn':
    case 'percentColumn':
    case 'bar':
    case 'stackedBar':
    case 'percentBar':
    case 'line':
    case 'area':
    case 'stackedArea':
    case 'ribbon':
    case 'waterfall':
    case 'funnel':
    case 'pie':
    case 'donut':
    case 'treemap': {
      const cat = levelField(F.category, level)
      const vals = F.values ?? []
      if (!vals.length) return null
      if (cat) groups.push({ role: 'category', field: cat })
      const series = F.series?.[0]
      if (series) groups.push({ role: 'series', field: series })
      for (const f of series ? vals.slice(0, 1) : vals) values.push({ role: 'values', field: f })
      for (const f of F.tooltips ?? []) values.push({ role: 'tooltips', field: f })
      if (v.type === 'waterfall') groupingSets = [[]]
      break
    }
    case 'lineColumn':
    case 'lineStackedColumn': {
      const cat = levelField(F.category, level)
      if (!(F.values?.length || F.lineValues?.length)) return null
      if (cat) groups.push({ role: 'category', field: cat })
      const series = v.type === 'lineStackedColumn' ? F.series?.[0] : undefined
      if (series) groups.push({ role: 'series', field: series })
      for (const f of F.values ?? []) values.push({ role: 'values', field: f })
      for (const f of F.lineValues ?? []) values.push({ role: 'lineValues', field: f })
      for (const f of F.tooltips ?? []) values.push({ role: 'tooltips', field: f })
      break
    }
    case 'scatter': {
      if (!F.x?.length && !F.y?.length) return null
      for (const f of F.details ?? []) groups.push({ role: 'details', field: f })
      if (F.series?.[0]) groups.push({ role: 'series', field: F.series[0] })
      if (F.x?.[0]) values.push({ role: 'x', field: F.x[0] })
      if (F.y?.[0]) values.push({ role: 'y', field: F.y[0] })
      if (F.size?.[0]) values.push({ role: 'size', field: F.size[0] })
      for (const f of F.tooltips ?? []) values.push({ role: 'tooltips', field: f })
      limit = 3000
      break
    }
    case 'gauge': {
      if (!F.value?.length) return null
      for (const r of ['value', 'min', 'max', 'target']) if (F[r]?.[0]) values.push({ role: r, field: F[r][0] })
      break
    }
    case 'card':
    case 'multiCard': {
      const vals = F.values ?? []
      if (!vals.length) return null
      for (const f of vals) values.push({ role: 'values', field: isMeasureLike(f) ? f : { ...f, aggregation: f.aggregation && f.aggregation !== 'none' ? f.aggregation : 'first' } })
      break
    }
    case 'kpi': {
      if (!F.value?.length) return null
      if (F.trend?.[0]) groups.push({ role: 'trend', field: F.trend[0] })
      values.push({ role: 'value', field: F.value[0] })
      if (F.target?.[0]) values.push({ role: 'target', field: F.target[0] })
      groupingSets = [[]]
      break
    }
    case 'table': {
      const vals = F.values ?? []
      if (!vals.length) return null
      groupOrValue(vals, 'values', groups, values)
      groupingSets = [[]]
      limit = 30000
      break
    }
    case 'matrix': {
      const rows = (F.rows ?? []).slice(0, Math.max(1, level + 1))
      const cols = F.columns ?? []
      if (!rows.length && !cols.length && !(F.values ?? []).length) return null
      for (const f of rows) groups.push({ role: 'rows', field: f })
      for (const f of cols) groups.push({ role: 'columns', field: f })
      for (const f of F.values ?? []) values.push({ role: 'values', field: f })
      const nr = rows.length
      const nc = cols.length
      const sets: number[][] = []
      const rowIdx = (k: number) => Array.from({ length: k }, (_, i) => i)
      const colIdx = (k: number) => Array.from({ length: k }, (_, i) => nr + i)
      // subtotais de linha (prefixos) x subtotais de coluna (prefixos)
      for (let r = 0; r <= nr; r++) {
        for (let c = 0; c <= nc; c++) {
          if (r === nr && c === nc) continue
          sets.push([...rowIdx(r), ...colIdx(c)])
        }
      }
      groupingSets = sets
      limit = 20000
      break
    }
    case 'map': {
      if (!F.location?.length) return null
      groups.push({ role: 'location', field: F.location[0] })
      if (F.values?.[0]) values.push({ role: 'values', field: F.values[0] })
      for (const f of F.tooltips ?? []) values.push({ role: 'tooltips', field: f })
      break
    }
    default:
      return null
  }
  if (!values.length && v.type !== 'table' && v.type !== 'matrix' && v.type !== 'scatter') {
    if (!groups.length) return null
  }
  // Ordenação
  let orderBy: VisualQuery['orderBy']
  if (v.sort) orderBy = [{ kind: v.sort.kind, index: v.sort.index, desc: v.sort.desc }]
  else if (['bar', 'stackedBar', 'column', 'stackedColumn', 'funnel', 'pie', 'donut', 'treemap'].includes(v.type) && values.length) {
    // Power BI ordena barras/colunas por valor decrescente por padrão (exceto datas/números).
    const cat = groups.find((g) => g.role === 'category')
    const isOrdinal = cat && (cat.field.level || /^(ano|mes|mês|dia|data|trimestre|year|month|date)/i.test(cat.field.column ?? ''))
    if (!isOrdinal && !groups.some((g) => g.role === 'series')) orderBy = [{ kind: 'value', index: 0, desc: true }]
  }
  if (v.type === 'table' && !groups.length) groupingSets = undefined
  if (v.format?.general?.showNoData) showItemsWithNoData = true
  return {
    query: {
      groupBy: groups.map((g) => g.field),
      values: values.map((x) => x.field),
      filters,
      highlight: highlight.length ? highlight : undefined,
      groupingSets,
      orderBy,
      limit,
      showItemsWithNoData
    },
    groups,
    values
  }
}
