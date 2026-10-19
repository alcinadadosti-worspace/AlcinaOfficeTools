// Modo apresentação: slide em tela cheia + modo do apresentador (próximo slide, anotações, tempo).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { type Deck, SLIDE_W, SLIDE_H } from '../../shared/deck'
import { SlideView } from './SlideView'

function mmss(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function Present({ deck, start, onClose }: { deck: Deck; start: number; onClose: () => void }): ReactNode {
  const [i, setI] = useState(start)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [presenter, setPresenter] = useState(false)
  const [black, setBlack] = useState<false | 'black' | 'white'>(false)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())
  const last = deck.slides.length - 1

  const next = (): void => setI((x) => Math.min(last, x + 1))
  const prev = (): void => setI((x) => Math.max(0, x - 1))

  useEffect(() => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key
      if (black && k !== 'Escape') { setBlack(false); return }
      if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'ArrowDown' || k === 'Enter') { e.preventDefault(); next() }
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp' || k === 'Backspace') { e.preventDefault(); prev() }
      else if (k === 'Home') { e.preventDefault(); setI(0) }
      else if (k === 'End') { e.preventDefault(); setI(last) }
      else if (k === 'Escape') onClose()
      else if (k === 'p' || k === 'P' || k === 's' || k === 'S') setPresenter((v) => !v)
      else if (k === 'b' || k === 'B') setBlack((v) => (v === 'black' ? false : 'black'))
      else if (k === 'w' || k === 'W') setBlack((v) => (v === 'white' ? false : 'white'))
    }
    const onResize = (): void => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [last, onClose, black])

  const trans = deck.slides[i].transition ?? 'none'
  const slideBox = (width: number): ReactNode => (
    <div key={i} className={trans !== 'none' ? `ao-trans-${trans}` : undefined}>
      <SlideView slide={deck.slides[i]} width={width} />
    </div>
  )

  if (black) {
    return <div onClick={() => setBlack(false)} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: black === 'white' ? '#fff' : '#000', cursor: 'default' }} />
  }

  // --- Modo do apresentador ---
  if (presenter) {
    const leftW = size.w * 0.63
    const rightW = size.w - leftW
    const curW = Math.min(leftW - 48, ((size.h - 120) * SLIDE_W) / SLIDE_H)
    const nextW = Math.min(rightW - 48, 360)
    const hasNext = i < last
    const clock = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const btn: React.CSSProperties = { border: '1px solid #555', background: '#2a2a2a', color: '#fff', borderRadius: 6, padding: '8px 14px', fontSize: 14, cursor: 'pointer' }
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#151515', color: '#eee', display: 'flex', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
        <div style={{ width: leftW, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, boxSizing: 'border-box' }} onClick={next}>
          <div style={{ alignSelf: 'flex-start', fontSize: 13, color: '#9a9a9a' }}>Slide {i + 1} de {deck.slides.length}</div>
          {slideBox(curW)}
        </div>
        <div style={{ width: rightW, borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column', padding: 20, boxSizing: 'border-box', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'Consolas, monospace' }}>{mmss(elapsed)}</div>
              <button onClick={() => { startedAt.current = Date.now(); setElapsed(0) }} style={{ ...btn, padding: '2px 8px', fontSize: 11, marginTop: 2 }}>Zerar tempo</button>
            </div>
            <div style={{ fontSize: 16, color: '#bbb' }}>{clock}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8a8a8a', marginBottom: 6 }}>Próximo slide</div>
            {hasNext ? (
              <div style={{ border: '1px solid #333', borderRadius: 4, overflow: 'hidden', width: nextW }}>
                <SlideView slide={deck.slides[i + 1]} width={nextW} />
              </div>
            ) : (
              <div style={{ color: '#777', fontSize: 14, fontStyle: 'italic' }}>Fim da apresentação</div>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: '#8a8a8a', marginBottom: 6 }}>Anotações</div>
            <div style={{ flex: 1, overflow: 'auto', background: '#1e1e1e', border: '1px solid #333', borderRadius: 4, padding: 12, fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#ddd' }}>
              {deck.slides[i].notes?.trim() || <span style={{ color: '#666', fontStyle: 'italic' }}>Sem anotações para este slide.</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={prev} disabled={i === 0} style={{ ...btn, opacity: i === 0 ? 0.4 : 1 }}>‹ Anterior</button>
            <button onClick={next} disabled={i === last} style={{ ...btn, opacity: i === last ? 0.4 : 1 }}>Próxima ›</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setPresenter(false)} style={btn}>Sair do modo</button>
            <button onClick={onClose} style={{ ...btn, borderColor: '#7a3a3a' }}>Encerrar</button>
          </div>
        </div>
      </div>
    )
  }

  // --- Tela cheia simples ---
  const w = Math.min(size.w, (size.h * SLIDE_W) / SLIDE_H)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#000', display: 'grid', placeItems: 'center', cursor: 'default' }} onClick={next}>
      {slideBox(w)}
      <div style={{ position: 'fixed', bottom: 12, right: 16, color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
        {i + 1} / {deck.slides.length} — setas navegam · P: apresentador · B: tela preta · Esc sai
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setPresenter(true) }}
        title="Modo do apresentador (P)"
        style={{ position: 'fixed', bottom: 10, left: 16, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
      >
        Modo do apresentador
      </button>
    </div>
  )
}
