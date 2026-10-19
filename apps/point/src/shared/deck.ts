// Modelo de apresentação (compartilhado renderer ↔ processo principal para .pptx).

export type ElementType = 'text' | 'rect' | 'rounded' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'image' | 'chart'

export interface ChartData {
  type: 'column' | 'bar' | 'line' | 'pie'
  categories: string[]
  series: { name: string; data: number[] }[]
}

export interface SlideElement {
  id: string
  type: ElementType
  /** Posição em unidades lógicas do slide (ver SLIDE_W/SLIDE_H). */
  x: number
  y: number
  w: number
  h: number
  text?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  align?: 'left' | 'center' | 'right'
  fontFamily?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  /** Imagem em data URL. */
  image?: string
  /** Dados do gráfico (type === 'chart'). */
  chart?: ChartData
}

export interface Slide {
  id: string
  background: string
  elements: SlideElement[]
}

export interface Deck {
  version: 1
  app: 'alcina-point'
  slides: Slide[]
}

export const SLIDE_W = 960
export const SLIDE_H = 540
/** Unidades lógicas por polegada (960x540 → 10" x 5,625", 16:9). */
export const UNITS_PER_INCH = 96

export const SHAPE_TYPES: ElementType[] = ['rect', 'rounded', 'ellipse', 'triangle', 'line', 'arrow']
export function isShape(t: ElementType): boolean {
  return SHAPE_TYPES.includes(t)
}
