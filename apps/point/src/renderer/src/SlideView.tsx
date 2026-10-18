// Renderização (somente leitura) de um slide, usada em miniaturas e na apresentação.
import type { CSSProperties, ReactNode } from 'react'
import { type Slide, type SlideElement, SLIDE_W, SLIDE_H } from '../../shared/deck'

export function boxStyle(el: SlideElement): CSSProperties {
  const s: CSSProperties = { position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, boxSizing: 'border-box' }
  if (el.type === 'rect') s.background = el.fill
  if (el.type === 'ellipse') {
    s.background = el.fill
    s.borderRadius = '50%'
  }
  if (el.type === 'image') {
    s.backgroundImage = `url(${el.image})`
    s.backgroundSize = 'contain'
    s.backgroundRepeat = 'no-repeat'
    s.backgroundPosition = 'center'
  }
  if (el.type === 'text') {
    s.color = el.color
    s.fontSize = el.fontSize
    s.fontWeight = el.bold ? 700 : 400
    s.fontStyle = el.italic ? 'italic' : 'normal'
    s.textAlign = el.align
    s.whiteSpace = 'pre-wrap'
    s.overflow = 'hidden'
    s.padding = 4
    s.lineHeight = 1.25
  }
  return s
}

export function SlideView({ slide, width }: { slide: Slide; width: number }): ReactNode {
  const scale = width / SLIDE_W
  return (
    <div style={{ width, height: (width * SLIDE_H) / SLIDE_W, background: slide.background, position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0 }}>
        {slide.elements.map((el) => (
          <div key={el.id} style={boxStyle(el)}>
            {el.type === 'text' ? el.text : null}
          </div>
        ))}
      </div>
    </div>
  )
}
