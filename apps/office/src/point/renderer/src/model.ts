// Modelo e utilidades da apresentação (imutável).
import { type Deck, type Slide, type SlideElement, type ElementType, SLIDE_W, SLIDE_H } from '../../shared/deck'

let seq = 0
export function uid(p: string): string {
  seq = (seq + 1) % 1_000_000
  return `${p}_${Date.now().toString(36)}${seq.toString(36)}`
}

export function newSlide(): Slide {
  return { id: uid('s'), background: '#ffffff', elements: [] }
}

export function newDeck(): Deck {
  return {
    version: 1,
    app: 'alcina-point',
    slides: [
      {
        id: uid('s'),
        background: '#ffffff',
        elements: [
          { id: uid('e'), type: 'text', x: 80, y: 180, w: 800, h: 110, text: 'Clique para adicionar um título', fontSize: 44, bold: true, color: '#0f7a34', align: 'center' },
          { id: uid('e'), type: 'text', x: 80, y: 300, w: 800, h: 60, text: 'Clique para adicionar um subtítulo', fontSize: 22, color: '#5c6e62', align: 'center' }
        ]
      }
    ]
  }
}

export function newElement(type: ElementType, image?: string): SlideElement {
  const base = { id: uid('e'), x: SLIDE_W / 2 - 150, y: SLIDE_H / 2 - 60, w: 300, h: 120 }
  if (type === 'text') return { ...base, type, text: 'Texto', fontSize: 20, color: '#222222', align: 'left' }
  if (type === 'image') return { ...base, type, w: 320, h: 200, image }
  if (type === 'line') return { ...base, type, h: 8, stroke: '#0f7a34', strokeWidth: 3 }
  if (type === 'arrow') return { ...base, type, h: 40, stroke: '#0f7a34', strokeWidth: 3 }
  if (type === 'chart') return { ...base, type, w: 460, h: 300, chart: { type: 'column', categories: ['Jan', 'Fev', 'Mar'], series: [{ name: 'Série 1', data: [120, 200, 150] }] } }
  return { ...base, type, fill: type === 'ellipse' || type === 'triangle' ? '#c79a2a' : '#0f7a34' }
}

export function mapSlide(deck: Deck, i: number, fn: (s: Slide) => Slide): Deck {
  return { ...deck, slides: deck.slides.map((s, j) => (j === i ? fn(s) : s)) }
}

export function mapElement(slide: Slide, id: string, fn: (e: SlideElement) => SlideElement): Slide {
  return { ...slide, elements: slide.elements.map((e) => (e.id === id ? fn(e) : e)) }
}
