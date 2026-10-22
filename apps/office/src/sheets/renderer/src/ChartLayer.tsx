// Camada de gráficos flutuantes sobre a grade: mover, redimensionar e excluir.
import { useRef, type ReactNode } from 'react'
import type { SheetEngine } from '@alcina/sheets-engine'
import type { ChartObj } from './model'
import { ChartView } from './ChartView'
import { buildOption } from './chartOption'

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

export function ChartLayer({
  charts,
  engine,
  selId,
  onSelect,
  onChange,
  onDelete
}: {
  charts: ChartObj[]
  engine: SheetEngine
  rev: number
  selId: string | null
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: Partial<ChartObj>) => void
  onDelete: (id: string) => void
}): ReactNode {
  const drag = useRef<DragState | null>(null)

  const start = (e: React.PointerEvent, ch: ChartObj, mode: 'move' | 'resize'): void => {
    e.stopPropagation()
    onSelect(ch.id)
    drag.current = { id: ch.id, mode, sx: e.clientX, sy: e.clientY, ox: ch.x, oy: ch.y, ow: ch.w, oh: ch.h }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.mode === 'move') onChange(d.id, { x: Math.max(0, Math.round(d.ox + dx)), y: Math.max(0, Math.round(d.oy + dy)) })
    else onChange(d.id, { w: Math.max(220, Math.round(d.ow + dx)), h: Math.max(150, Math.round(d.oh + dy)) })
  }
  const end = (): void => {
    drag.current = null
  }

  if (!charts.length) return null
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} onPointerMove={onMove} onPointerUp={end}>
      {charts.map((ch) => {
        const sel = ch.id === selId
        return (
          <div
            key={ch.id}
            onPointerDown={() => onSelect(ch.id)}
            style={{
              position: 'absolute',
              left: ch.x,
              top: ch.y,
              width: ch.w,
              height: ch.h,
              pointerEvents: 'auto',
              background: '#fff',
              border: sel ? '2px solid var(--ao-green)' : '1px solid var(--ao-border)',
              borderRadius: 6,
              boxShadow: 'var(--ao-shadow)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: sel ? 6 : 5
            }}
          >
            <div
              onPointerDown={(e) => start(e, ch, 'move')}
              style={{ height: 22, flex: 'none', cursor: 'move', background: 'var(--ao-surface)', borderBottom: '1px solid var(--ao-border)', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 11, color: 'var(--ao-text-2)', gap: 6 }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.title || 'Gráfico'}</span>
              <button onClick={() => onDelete(ch.id)} title="Excluir gráfico" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ao-text-2)', fontSize: 14, lineHeight: 1 }}>
                ×
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ChartView option={buildOption(ch, engine)} />
            </div>
            {sel && <div onPointerDown={(e) => start(e, ch, 'resize')} style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, background: 'var(--ao-green)', border: '1px solid #fff', borderRadius: 2, cursor: 'nwse-resize' }} />}
          </div>
        )
      })}
    </div>
  )
}
