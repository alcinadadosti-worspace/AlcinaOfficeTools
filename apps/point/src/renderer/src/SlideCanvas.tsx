// Canvas de edição de um slide: selecionar, mover, redimensionar e editar texto.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { type Slide, type SlideElement, SLIDE_W, SLIDE_H, isShape } from '../../shared/deck'
import { boxStyle } from './SlideView'
import { ShapeSvg } from './shapes'

interface DragState {
  id: string
  mode: 'move' | 'resize'
  sx: number
  sy: number
  ox: number
  oy: number
  ow: number
  oh: number
}

export function SlideCanvas({
  slide,
  selId,
  onSelect,
  onChange,
  onCommitText
}: {
  slide: Slide
  selId: string | null
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: Partial<SlideElement>) => void
  onCommitText: (id: string, text: string) => void
}): ReactNode {
  const wrap = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [editId, setEditId] = useState<string | null>(null)
  const drag = useRef<DragState | null>(null)

  useEffect(() => {
    const el = wrap.current!
    const ro = new ResizeObserver(() => {
      const pad = 48
      setScale(Math.max(0.1, Math.min((el.clientWidth - pad) / SLIDE_W, (el.clientHeight - pad) / SLIDE_H)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const startDrag = (e: React.PointerEvent, el: SlideElement, mode: 'move' | 'resize'): void => {
    e.stopPropagation()
    onSelect(el.id)
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.sx) / scale
    const dy = (e.clientY - d.sy) / scale
    if (d.mode === 'move') onChange(d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) })
    else onChange(d.id, { w: Math.max(24, Math.round(d.ow + dx)), h: Math.max(20, Math.round(d.oh + dy)) })
  }
  const endDrag = (): void => {
    drag.current = null
  }

  return (
    <div ref={wrap} className="ao-point-stage" onPointerMove={onMove} onPointerUp={endDrag} onPointerDown={() => onSelect(null)}>
      <div className="ao-point-slide" style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, background: slide.background }}>
        <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0 }}>
          {slide.elements.map((el) => {
            const sel = el.id === selId
            return (
              <div
                key={el.id}
                style={{ ...boxStyle(el), cursor: 'move', outline: sel ? '2px solid var(--ao-green)' : el.type === 'text' ? '1px dashed #cfd8d2' : 'none' }}
                onPointerDown={(e) => startDrag(e, el, 'move')}
                onDoubleClick={(e) => {
                  if (el.type === 'text') {
                    e.stopPropagation()
                    setEditId(el.id)
                  }
                }}
              >
                {el.type === 'text' && editId === el.id ? (
                  <textarea
                    autoFocus
                    defaultValue={el.text}
                    onPointerDown={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      onCommitText(el.id, e.target.value)
                      setEditId(null)
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      background: 'transparent',
                      font: 'inherit',
                      color: 'inherit',
                      textAlign: el.align as CSSProperties['textAlign'],
                      padding: 0,
                      lineHeight: 1.25
                    }}
                  />
                ) : el.type === 'text' ? (
                  el.text
                ) : isShape(el.type) ? (
                  <ShapeSvg el={el} />
                ) : null}
                {sel && <div onPointerDown={(e) => startDrag(e, el, 'resize')} style={{ position: 'absolute', right: -5, bottom: -5, width: 11, height: 11, background: 'var(--ao-green)', border: '1px solid #fff', borderRadius: 2, cursor: 'nwse-resize' }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
