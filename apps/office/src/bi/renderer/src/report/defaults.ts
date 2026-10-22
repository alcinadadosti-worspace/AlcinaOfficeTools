// Valores padrão para documentos, páginas e visuais.
import { emptyModel } from '@engine/model/types'
import { DEFAULT_THEME } from './themes'
import type { DocState, FilterDef, PageDef, VisualDef, VisualType } from './types'
import type { FieldRef } from '@engine/vq/types'

let counter = 0
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export const PAGE_SIZES: Record<string, { w: number; h: number; label: string }> = {
  '16:9': { w: 1280, h: 720, label: '16:9' },
  '4:3': { w: 960, h: 720, label: '4:3' },
  carta: { w: 816, h: 1056, label: 'Carta' },
  a4: { w: 794, h: 1123, label: 'A4 (retrato)' },
  dica: { w: 320, h: 240, label: 'Dica de ferramenta' }
}

export function newPage(name: string): PageDef {
  return {
    id: uid('pg'),
    name,
    width: 1280,
    height: 720,
    background: { color: '#ffffff', transparency: 0 },
    wallpaper: { color: '#ffffff', transparency: 100 },
    visuals: [],
    filters: [],
    display: 'fit'
  }
}

export function newDoc(): DocState {
  const page = newPage('Página 1')
  return {
    version: 1,
    queries: [],
    model: emptyModel(),
    report: { pages: [page], filters: [], theme: DEFAULT_THEME, modelLayout: {} },
    settings: { locale: 'pt-BR', activePageId: page.id }
  }
}

const DEFAULT_SIZE: Partial<Record<VisualType, { w: number; h: number }>> = {
  card: { w: 220, h: 120 },
  multiCard: { w: 320, h: 200 },
  kpi: { w: 260, h: 160 },
  slicer: { w: 220, h: 260 },
  text: { w: 300, h: 80 },
  shape: { w: 200, h: 120 },
  button: { w: 160, h: 48 },
  gauge: { w: 300, h: 220 },
  table: { w: 480, h: 300 },
  matrix: { w: 520, h: 320 }
}

export function newVisual(type: VisualType, x: number, y: number, z: number): VisualDef {
  const size = DEFAULT_SIZE[type] ?? { w: 440, h: 280 }
  return {
    id: uid('vs'),
    type,
    x,
    y,
    w: size.w,
    h: size.h,
    z,
    fields: {},
    format: {},
    filters: []
  }
}

export function newFilter(field: FieldRef): FilterDef {
  return { id: uid('flt'), field, type: 'basic', values: [] }
}

export function sameField(a: FieldRef, b: FieldRef): boolean {
  return (
    a.table.toLowerCase() === b.table.toLowerCase() &&
    (a.column ?? '').toLowerCase() === (b.column ?? '').toLowerCase() &&
    (a.measure ?? '').toLowerCase() === (b.measure ?? '').toLowerCase() &&
    (a.level ?? '') === (b.level ?? '')
  )
}
