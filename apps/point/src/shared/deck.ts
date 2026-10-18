// Modelo de apresentação (compartilhado renderer ↔ processo principal para .pptx).

export type ElementType = 'text' | 'rect' | 'ellipse' | 'image'

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
  color?: string
  align?: 'left' | 'center' | 'right'
  fill?: string
  /** Imagem em data URL. */
  image?: string
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
