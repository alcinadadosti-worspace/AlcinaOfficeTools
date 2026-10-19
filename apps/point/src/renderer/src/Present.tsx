// Modo apresentação: slide em tela cheia, navegação por teclado/clique.
import { useEffect, useState, type ReactNode } from 'react'
import { type Deck, SLIDE_W, SLIDE_H } from '../../shared/deck'
import { SlideView } from './SlideView'

export function Present({ deck, start, onClose }: { deck: Deck; start: number; onClose: () => void }): ReactNode {
  const [i, setI] = useState(start)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const last = deck.slides.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        setI((x) => Math.min(last, x + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setI((x) => Math.max(0, x - 1))
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    const onResize = (): void => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [last, onClose])

  const w = Math.min(size.w, (size.h * SLIDE_W) / SLIDE_H)
  const trans = deck.slides[i].transition ?? 'none'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#000', display: 'grid', placeItems: 'center', cursor: 'default' }} onClick={() => setI((x) => Math.min(last, x + 1))}>
      <div key={i} className={trans !== 'none' ? `ao-trans-${trans}` : undefined}>
        <SlideView slide={deck.slides[i]} width={w} />
      </div>
      <div style={{ position: 'fixed', bottom: 12, right: 16, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
        {i + 1} / {deck.slides.length} — setas para navegar · Esc para sair
      </div>
    </div>
  )
}
