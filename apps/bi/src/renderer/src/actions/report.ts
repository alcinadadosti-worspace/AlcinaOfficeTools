// Operações do relatório: páginas, visuais, campos, filtros e seleção cruzada.
import type { Draft } from 'immer'
import type { FieldRef, VQFilter } from '@engine/vq/types'
import type { JsonScalar } from '@engine/query/types'
import { getDoc, updateDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { newFilter, newPage, newVisual, sameField, uid } from '../report/defaults'
import type { DocState, FilterDef, PageDef, VisualDef, VisualType } from '../report/types'
import { visualDef, type RoleDef } from '../visuals/registry'
import { isMeasureLike } from '../visuals/query'
import type { PointInfo } from '../visuals/charts/options'
import { keyString } from '../util/fmt'

export function activePage(): PageDef | undefined {
  const d = getDoc()
  const id = useUi.getState().activePageId
  return d.report.pages.find((p) => p.id === id) ?? d.report.pages[0]
}

function pageDraft(d: Draft<DocState>, pageId: string): Draft<PageDef> | undefined {
  return d.report.pages.find((p) => p.id === pageId)
}

export function visualDraft(d: Draft<DocState>, pageId: string, visualId: string): Draft<VisualDef> | undefined {
  return pageDraft(d, pageId)?.visuals.find((v) => v.id === visualId)
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

export function addPage(): void {
  const d = getDoc()
  let n = d.report.pages.length + 1
  while (d.report.pages.some((p) => p.name === `Página ${n}`)) n++
  const p = newPage(`Página ${n}`)
  updateDoc('Nova página', (dd) => {
    dd.report.pages.push(p)
  })
  useUi.getState().set({ activePageId: p.id, selectedVisualIds: [] })
}

export function duplicatePage(pageId: string): void {
  const src = getDoc().report.pages.find((p) => p.id === pageId)
  if (!src) return
  const copy: PageDef = JSON.parse(JSON.stringify(src))
  copy.id = uid('pg')
  copy.name = `Duplicata de ${src.name}`
  for (const v of copy.visuals) v.id = uid('vs')
  updateDoc('Duplicar página', (d) => {
    const i = d.report.pages.findIndex((p) => p.id === pageId)
    d.report.pages.splice(i + 1, 0, copy)
  })
  useUi.getState().set({ activePageId: copy.id, selectedVisualIds: [] })
}

export function deletePage(pageId: string): void {
  const pages = getDoc().report.pages
  if (pages.length <= 1) return
  const i = pages.findIndex((p) => p.id === pageId)
  updateDoc('Excluir página', (d) => {
    d.report.pages = d.report.pages.filter((p) => p.id !== pageId)
  })
  const next = getDoc().report.pages[Math.max(0, i - 1)]
  useUi.getState().set({ activePageId: next.id, selectedVisualIds: [] })
}

export function renamePage(pageId: string, name: string): void {
  if (!name.trim()) return
  updateDoc('Renomear página', (d) => {
    const p = pageDraft(d, pageId)
    if (p) p.name = name.trim()
  })
}

export function movePage(pageId: string, toIndex: number): void {
  updateDoc('Mover página', (d) => {
    const i = d.report.pages.findIndex((p) => p.id === pageId)
    if (i < 0) return
    const [p] = d.report.pages.splice(i, 1)
    d.report.pages.splice(Math.max(0, Math.min(toIndex, d.report.pages.length)), 0, p)
  })
}

export function setPageProps(pageId: string, patch: Partial<PageDef>): void {
  updateDoc('Propriedades da página', (d) => {
    const p = pageDraft(d, pageId)
    if (p) Object.assign(p, patch)
  })
}

// ---------------------------------------------------------------------------
// Visuais
// ---------------------------------------------------------------------------

function nextPosition(page: PageDef, w: number, h: number): { x: number; y: number } {
  // Procura um espaço livre em grade de 20px.
  const occupied = (x: number, y: number) => page.visuals.some((v) => x < v.x + v.w && x + w > v.x && y < v.y + v.h && y + h > v.y)
  for (let y = 20; y + h <= page.height; y += 20) for (let x = 20; x + w <= page.width; x += 20) if (!occupied(x, y)) return { x, y }
  return { x: 40 + (page.visuals.length % 10) * 20, y: 40 + (page.visuals.length % 10) * 20 }
}

export function addVisual(type: VisualType, fields?: Record<string, FieldRef[]>, at?: { x: number; y: number }): string | null {
  const page = activePage()
  if (!page) return null
  const z = page.visuals.reduce((m, v) => Math.max(m, v.z), 0) + 1
  const v = newVisual(type, 0, 0, z)
  const pos = at ?? nextPosition(page, v.w, v.h)
  v.x = Math.max(0, Math.min(pos.x, page.width - v.w))
  v.y = Math.max(0, Math.min(pos.y, page.height - v.h))
  if (fields) v.fields = fields
  if (type === 'text') v.text = 'Digite seu texto aqui'
  updateDoc(`Inserir ${visualDef(type)?.name ?? type}`, (d) => {
    pageDraft(d, page.id)?.visuals.push(v)
  })
  useUi.getState().set({ selectedVisualIds: [v.id], vizTab: 'build' })
  return v.id
}

export function updateVisual(pageId: string, visualId: string, label: string, recipe: (v: Draft<VisualDef>) => void, coalesce?: string): void {
  updateDoc(
    label,
    (d) => {
      const v = visualDraft(d, pageId, visualId)
      if (v) recipe(v)
    },
    coalesce ? { coalesce } : undefined
  )
}

export function deleteVisuals(pageId: string, ids: string[]): void {
  if (!ids.length) return
  updateDoc(ids.length > 1 ? 'Excluir visuais' : 'Excluir visual', (d) => {
    const p = pageDraft(d, pageId)
    if (p) p.visuals = p.visuals.filter((v) => !ids.includes(v.id))
  })
  const ui = useUi.getState()
  const sel = ui.selection[pageId]
  ui.set({
    selectedVisualIds: [],
    selection: sel && ids.includes(sel.visualId) ? { ...ui.selection, [pageId]: null } : ui.selection
  })
}

export function duplicateVisuals(pageId: string, ids: string[]): void {
  const page = getDoc().report.pages.find((p) => p.id === pageId)
  if (!page) return
  const copies: VisualDef[] = []
  let z = page.visuals.reduce((m, v) => Math.max(m, v.z), 0)
  for (const id of ids) {
    const v = page.visuals.find((x) => x.id === id)
    if (!v) continue
    const c: VisualDef = JSON.parse(JSON.stringify(v))
    c.id = uid('vs')
    c.x = Math.min(page.width - c.w, c.x + 20)
    c.y = Math.min(page.height - c.h, c.y + 20)
    c.z = ++z
    copies.push(c)
  }
  updateDoc('Duplicar visual', (d) => {
    pageDraft(d, pageId)?.visuals.push(...copies)
  })
  useUi.getState().set({ selectedVisualIds: copies.map((c) => c.id) })
}

export function copyVisuals(pageId: string, ids: string[]): void {
  const page = getDoc().report.pages.find((p) => p.id === pageId)
  const list = page?.visuals.filter((v) => ids.includes(v.id)) ?? []
  if (list.length) useUi.getState().set({ clipboard: { kind: 'visuals', visuals: JSON.parse(JSON.stringify(list)) } })
}

export function pasteVisuals(pageId: string): void {
  const clip = useUi.getState().clipboard as { kind: string; visuals: VisualDef[] } | null
  if (!clip || clip.kind !== 'visuals') return
  const page = getDoc().report.pages.find((p) => p.id === pageId)
  if (!page) return
  let z = page.visuals.reduce((m, v) => Math.max(m, v.z), 0)
  const copies = clip.visuals.map((v) => ({ ...JSON.parse(JSON.stringify(v)), id: uid('vs'), x: Math.min(page.width - v.w, v.x + 20), y: Math.min(page.height - v.h, v.y + 20), z: ++z }))
  updateDoc('Colar', (d) => {
    pageDraft(d, pageId)?.visuals.push(...copies)
  })
  useUi.getState().set({ selectedVisualIds: copies.map((c) => c.id), clipboard: { kind: 'visuals', visuals: copies } })
}

export function bringTo(pageId: string, ids: string[], where: 'front' | 'back' | 'forward' | 'backward'): void {
  updateDoc('Organizar', (d) => {
    const p = pageDraft(d, pageId)
    if (!p) return
    const sorted = [...p.visuals].sort((a, b) => a.z - b.z)
    const sel = sorted.filter((v) => ids.includes(v.id))
    const rest = sorted.filter((v) => !ids.includes(v.id))
    let order: Draft<VisualDef>[]
    if (where === 'front') order = [...rest, ...sel]
    else if (where === 'back') order = [...sel, ...rest]
    else {
      order = [...sorted]
      for (const v of where === 'forward' ? [...sel].reverse() : sel) {
        const i = order.indexOf(v)
        const j = where === 'forward' ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1)
        order.splice(i, 1)
        order.splice(j, 0, v)
      }
    }
    order.forEach((v, i) => (v.z = i + 1))
  })
}

export function alignVisuals(pageId: string, ids: string[], how: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hdistribute' | 'vdistribute'): void {
  updateDoc('Alinhar', (d) => {
    const p = pageDraft(d, pageId)
    if (!p) return
    const vs = p.visuals.filter((v) => ids.includes(v.id))
    if (vs.length < 2) return
    const minX = Math.min(...vs.map((v) => v.x))
    const maxX = Math.max(...vs.map((v) => v.x + v.w))
    const minY = Math.min(...vs.map((v) => v.y))
    const maxY = Math.max(...vs.map((v) => v.y + v.h))
    for (const v of vs) {
      if (how === 'left') v.x = minX
      if (how === 'right') v.x = maxX - v.w
      if (how === 'center') v.x = Math.round((minX + maxX) / 2 - v.w / 2)
      if (how === 'top') v.y = minY
      if (how === 'bottom') v.y = maxY - v.h
      if (how === 'middle') v.y = Math.round((minY + maxY) / 2 - v.h / 2)
    }
    if (how === 'hdistribute') {
      const s = [...vs].sort((a, b) => a.x - b.x)
      const total = s.reduce((t, v) => t + v.w, 0)
      const gap = (maxX - minX - total) / (s.length - 1)
      let x = minX
      for (const v of s) {
        v.x = Math.round(x)
        x += v.w + gap
      }
    }
    if (how === 'vdistribute') {
      const s = [...vs].sort((a, b) => a.y - b.y)
      const total = s.reduce((t, v) => t + v.h, 0)
      const gap = (maxY - minY - total) / (s.length - 1)
      let y = minY
      for (const v of s) {
        v.y = Math.round(y)
        y += v.h + gap
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Campos (poços)
// ---------------------------------------------------------------------------

/** Escolhe o papel adequado para um campo arrastado/marcado em um visual. */
export function roleForField(v: VisualDef, field: FieldRef, isNumeric: boolean, isDate: boolean): RoleDef | null {
  const def = visualDef(v.type)
  if (!def) return null
  const measureLike = isMeasureLike(field) || (!!field.measure)
  const can = (r: RoleDef) => (r.max === undefined || (v.fields[r.name]?.length ?? 0) < r.max)
  const roles = def.roles
  if (measureLike || (isNumeric && !isDate)) {
    const r = roles.find((x) => x.kind === 'measure' && can(x) && x.name !== 'tooltips') ?? roles.find((x) => x.kind === 'any' && can(x))
    if (r) return r
  }
  const g = roles.find((x) => (x.kind === 'grouping' || x.kind === 'any') && can(x) && (!(v.fields[x.name]?.length) || x.hierarchy || x.max === undefined))
  return g ?? roles.find((x) => x.kind !== 'measure' && can(x)) ?? null
}

export function addFieldToVisual(pageId: string, visualId: string, role: string, field: FieldRef, index?: number): void {
  updateVisual(pageId, visualId, 'Adicionar campo', (v) => {
    const list = (v.fields[role] = v.fields[role] ?? [])
    if (list.some((f) => sameField(f, field) && (f.aggregation ?? '') === (field.aggregation ?? ''))) return
    if (index === undefined || index >= list.length) list.push(field as Draft<FieldRef>)
    else list.splice(Math.max(0, index), 0, field as Draft<FieldRef>)
    v.drillLevel = 0
    v.drillPath = []
  })
}

export function removeFieldFromVisual(pageId: string, visualId: string, role: string, index: number): void {
  updateVisual(pageId, visualId, 'Remover campo', (v) => {
    v.fields[role]?.splice(index, 1)
    if (v.sort) v.sort = undefined
    v.drillLevel = 0
    v.drillPath = []
  })
}

export function moveFieldInVisual(pageId: string, visualId: string, fromRole: string, fromIndex: number, toRole: string, toIndex: number): void {
  updateVisual(pageId, visualId, 'Mover campo', (v) => {
    const src = v.fields[fromRole]
    if (!src) return
    const [f] = src.splice(fromIndex, 1)
    const dst = (v.fields[toRole] = v.fields[toRole] ?? [])
    dst.splice(Math.min(toIndex, dst.length), 0, f)
  })
}

export function setFieldAggregation(pageId: string, visualId: string, role: string, index: number, aggregation: FieldRef['aggregation']): void {
  updateVisual(pageId, visualId, 'Resumir campo', (v) => {
    const f = v.fields[role]?.[index]
    if (f) f.aggregation = aggregation
  })
}

/** Alterna um campo marcado no painel de dados para o visual selecionado. */
export function toggleFieldInSelected(field: FieldRef, isNumeric: boolean, isDate: boolean): void {
  const page = activePage()
  if (!page) return
  const ui = useUi.getState()
  const selId = ui.selectedVisualIds[0]
  const v = page.visuals.find((x) => x.id === selId)
  if (!v) {
    // Sem visual selecionado: cria um automaticamente (como no Power BI).
    const measureLike = isMeasureLike(field) || !!field.measure
    if (measureLike || isNumeric) {
      const f = field.measure ? field : { ...field, aggregation: field.aggregation ?? 'sum' }
      addVisual('column', { values: [f] })
    } else if (isDate) addVisual('line', { category: [field] })
    else addVisual('table', { values: [field] })
    return
  }
  // Já está no visual? remove.
  for (const [role, list] of Object.entries(v.fields)) {
    const idx = list.findIndex((f) => sameField(f, field))
    if (idx >= 0) {
      removeFieldFromVisual(page.id, v.id, role, idx)
      return
    }
  }
  const role = roleForField(v, field, isNumeric, isDate)
  if (!role) {
    ui.toast({ intent: 'warning', title: 'Não há espaço para este campo neste visual.' })
    return
  }
  const f = role.kind === 'measure' && !field.measure && !field.aggregation ? { ...field, aggregation: isNumeric ? ('sum' as const) : ('count' as const) } : field
  addFieldToVisual(page.id, v.id, role.name, f)
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export type FilterScope = { level: 'report' } | { level: 'page'; pageId: string } | { level: 'visual'; pageId: string; visualId: string }

function filtersDraft(d: Draft<DocState>, scope: FilterScope): Draft<FilterDef>[] | undefined {
  if (scope.level === 'report') return d.report.filters
  const p = pageDraft(d, scope.pageId)
  if (scope.level === 'page') return p?.filters
  return p?.visuals.find((v) => v.id === scope.visualId)?.filters
}

export function addFilter(scope: FilterScope, field: FieldRef): void {
  updateDoc('Adicionar filtro', (d) => {
    const list = filtersDraft(d, scope)
    if (!list || list.some((f) => sameField(f.field, field))) return
    const f = newFilter(field)
    if (isMeasureLike(field)) {
      f.type = 'advanced'
      f.conditions = [{ op: 'gt', value: null }]
    }
    list.push(f as Draft<FilterDef>)
  })
}

export function updateFilter(scope: FilterScope, id: string, patch: Partial<FilterDef>): void {
  updateDoc(
    'Filtro',
    (d) => {
      const f = filtersDraft(d, scope)?.find((x) => x.id === id)
      if (f) Object.assign(f, patch)
    },
    { coalesce: `filter:${id}` }
  )
}

export function removeFilter(scope: FilterScope, id: string): void {
  updateDoc('Remover filtro', (d) => {
    const list = filtersDraft(d, scope)
    if (!list) return
    const i = list.findIndex((x) => x.id === id)
    if (i >= 0) list.splice(i, 1)
  })
}

// ---------------------------------------------------------------------------
// Seleção cruzada
// ---------------------------------------------------------------------------

function mergeFilters(points: PointInfo[]): VQFilter[] {
  if (!points.length) return []
  const first = points[0].filters
  if (points.length === 1) return first
  // Mesma forma: une as tuplas/valores.
  if (first.length === 1 && first[0].kind === 'tuple') {
    const f = first[0]
    const tuples: JsonScalar[][] = []
    for (const p of points) for (const x of p.filters) if (x.kind === 'tuple') tuples.push(...x.tuples)
    return [{ kind: 'tuple', fields: f.fields, tuples }]
  }
  if (first.length === 1 && first[0].kind === 'in') {
    const values: JsonScalar[] = []
    for (const p of points) for (const x of p.filters) if (x.kind === 'in') values.push(...x.values)
    return [{ kind: 'in', field: first[0].field, values }]
  }
  return first
}

const pointsByPage = new Map<string, PointInfo[]>()

export function selectPoint(pageId: string, visualId: string, point: PointInfo | null, multi: boolean): void {
  const ui = useUi.getState()
  const cur = ui.selection[pageId]
  let points = cur && cur.visualId === visualId ? (pointsByPage.get(pageId) ?? []) : []
  if (!point) points = []
  else if (multi) {
    points = points.some((p) => p.key === point.key) ? points.filter((p) => p.key !== point.key) : [...points, point]
  } else {
    points = points.length === 1 && points[0].key === point.key ? [] : [point]
  }
  pointsByPage.set(pageId, points)
  ui.set({
    selection: {
      ...ui.selection,
      [pageId]: points.length ? { visualId, filters: mergeFilters(points), keys: points.map((p) => p.key) } : null
    }
  })
}

export function clearSelection(pageId: string): void {
  pointsByPage.delete(pageId)
  const ui = useUi.getState()
  if (ui.selection[pageId]) ui.set({ selection: { ...ui.selection, [pageId]: null } })
}

/** Adiciona um filtro de visual "incluir"/"excluir" a partir de um ponto. */
export function includeExclude(pageId: string, visualId: string, point: PointInfo, exclude: boolean): void {
  const f = point.filters[0]
  if (!f) return
  updateVisual(pageId, visualId, exclude ? 'Excluir' : 'Incluir', (v) => {
    if (f.kind === 'in') {
      v.filters.push({ id: uid('flt'), field: f.field as Draft<FieldRef>, type: 'basic', values: f.values as never[], invert: exclude })
    } else if (f.kind === 'tuple') {
      f.fields.forEach((field, i) => {
        v.filters.push({ id: uid('flt'), field: field as Draft<FieldRef>, type: 'basic', values: [f.tuples[0][i]] as never[], invert: exclude })
      })
    }
  })
  clearSelection(pageId)
}

export function drill(pageId: string, visualId: string, how: 'up' | 'next' | 'down', point?: PointInfo): void {
  const page = getDoc().report.pages.find((p) => p.id === pageId)
  const v = page?.visuals.find((x) => x.id === visualId)
  if (!v) return
  const roleName = v.type === 'matrix' ? 'rows' : 'category'
  const fields = v.fields[roleName] ?? []
  const level = v.drillLevel ?? 0
  if (how === 'up') {
    if (level === 0) return
    updateVisual(pageId, visualId, 'Fazer drill up', (vd) => {
      vd.drillLevel = level - 1
      vd.drillPath = (vd.drillPath ?? []).slice(0, Math.max(0, level - 1))
    })
    return
  }
  if (level >= fields.length - 1) return
  updateVisual(pageId, visualId, how === 'down' ? 'Fazer drill down' : 'Próximo nível', (vd) => {
    vd.drillLevel = level + 1
    if (how === 'down' && point && point.filters[0]) {
      const f = point.filters[0]
      const value = f.kind === 'in' ? f.values[0] : f.kind === 'tuple' ? f.tuples[0][0] : null
      vd.drillPath = [...(vd.drillPath ?? []), { field: fields[level] as Draft<FieldRef>, value: value as never }]
    }
  })
  clearSelection(pageId)
}

export function selectedKeysFor(pageId: string, visualId: string): Set<string> | null {
  const sel = useUi.getState().selection[pageId]
  if (!sel || sel.visualId !== visualId) return null
  return new Set(sel.keys)
}

export function keysFor(values: JsonScalar[]): string {
  return values.map(keyString).join('|')
}
