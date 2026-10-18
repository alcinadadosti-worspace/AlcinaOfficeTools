// Grade de células: seleção de intervalo, edição, estilos e teclado.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { type SheetEngine, colToLetter } from '@alcina/sheets-engine'
import { cellKey, type CellStyle } from './model'
import { formatCell } from './format'

const W = 94
const H = 25
const RNW = 46

export interface Sel {
  ar: number
  ac: number
  fr: number
  fc: number
}

export interface GridProps {
  engine: SheetEngine
  styles: Record<string, CellStyle>
  rows: number
  cols: number
  rev: number
  sel: Sel
  editing: string | null
  setSel: (s: Sel) => void
  onStartEdit: (initial: string) => void
  onEditChange: (t: string) => void
  onCommit: (move: 'down' | 'right') => void
  onCancel: () => void
  onClear: () => void
  onCopy: () => void
  onPaste: () => void
}

export function Grid(props: GridProps): ReactNode {
  const { engine, styles, rows, cols, sel, editing } = props
  const selRef = useRef(sel)
  selRef.current = sel
  const dragging = useRef(false)

  useEffect(() => {
    const up = (): void => {
      dragging.current = false
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const r1 = Math.min(sel.ar, sel.fr)
  const r2 = Math.max(sel.ar, sel.fr)
  const c1 = Math.min(sel.ac, sel.fc)
  const c2 = Math.max(sel.ac, sel.fc)
  const clampR = (r: number): number => Math.max(0, Math.min(rows - 1, r))
  const clampC = (c: number): number => Math.max(0, Math.min(cols - 1, c))

  const move = (dr: number, dc: number, extend: boolean): void => {
    if (extend) props.setSel({ ...sel, fr: clampR(sel.fr + dr), fc: clampC(sel.fc + dc) })
    else {
      const nr = clampR(sel.ar + dr)
      const nc = clampC(sel.ac + dc)
      props.setSel({ ar: nr, ac: nc, fr: nr, fc: nc })
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (editing !== null) return
    const k = e.key
    if (k === 'ArrowUp') {
      e.preventDefault()
      move(-1, 0, e.shiftKey)
    } else if (k === 'ArrowDown') {
      e.preventDefault()
      move(1, 0, e.shiftKey)
    } else if (k === 'ArrowLeft') {
      e.preventDefault()
      move(0, -1, e.shiftKey)
    } else if (k === 'ArrowRight') {
      e.preventDefault()
      move(0, 1, e.shiftKey)
    } else if (k === 'Tab') {
      e.preventDefault()
      move(0, 1, false)
    } else if (k === 'Enter' || k === 'F2') {
      e.preventDefault()
      props.onStartEdit(engine.getRaw(sel.ar, sel.ac))
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault()
      props.onClear()
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'c') {
      e.preventDefault()
      props.onCopy()
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'v') {
      e.preventDefault()
      props.onPaste()
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      props.onStartEdit(k)
    }
  }

  const header = (label: string, width: number, sticky: boolean, on: boolean): ReactNode => (
    <div
      style={{
        width,
        height: H,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 600,
        color: on ? 'var(--ao-green-strong)' : 'var(--ao-text-2)',
        background: on ? 'var(--ao-green-soft)' : 'var(--ao-surface)',
        borderRight: '1px solid var(--ao-border)',
        borderBottom: '1px solid var(--ao-border)',
        position: sticky ? 'sticky' : undefined,
        left: sticky ? 0 : undefined,
        zIndex: sticky ? 3 : 2
      }}
    >
      {label}
    </div>
  )

  return (
    <div tabIndex={0} onKeyDown={onKeyDown} style={{ height: '100%', overflow: 'auto', outline: 'none', background: 'var(--ao-bg)' }}>
      <div style={{ width: RNW + cols * W, minWidth: '100%' }}>
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2 }}>
          {header('', RNW, true, false)}
          {Array.from({ length: cols }, (_, c) => header(colToLetter(c), W, false, c >= c1 && c <= c2))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} style={{ display: 'flex' }}>
            {header(String(r + 1), RNW, true, r >= r1 && r <= r2)}
            {Array.from({ length: cols }, (_, c) => {
              const st = styles[cellKey(r, c)]
              const v = engine.getValue(r, c)
              const numeric = typeof v === 'number'
              const inRange = r >= r1 && r <= r2 && c >= c1 && c <= c2
              const active = r === sel.ar && c === sel.ac
              const align = st?.align ?? (numeric ? 'right' : 'left')
              const cs: CSSProperties = {
                width: W,
                height: H,
                flex: 'none',
                padding: '0 5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
                fontSize: 13,
                fontWeight: st?.bold ? 700 : 400,
                fontStyle: st?.italic ? 'italic' : 'normal',
                textDecoration: st?.underline ? 'underline' : 'none',
                color: st?.color || 'var(--ao-text)',
                background: st?.fill || (inRange && !active ? 'var(--ao-green-soft)' : '#fff'),
                borderRight: '1px solid var(--ao-border)',
                borderBottom: '1px solid var(--ao-border)',
                outline: active ? '2px solid var(--ao-green)' : inRange ? '1px solid var(--ao-green)' : 'none',
                outlineOffset: -1,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                cursor: 'cell',
                position: 'relative',
                zIndex: active ? 1 : 0
              }
              return (
                <div
                  key={c}
                  style={cs}
                  onPointerDown={(e) => {
                    if (e.shiftKey) props.setSel({ ...selRef.current, fr: r, fc: c })
                    else {
                      props.setSel({ ar: r, ac: c, fr: r, fc: c })
                      dragging.current = true
                    }
                  }}
                  onPointerEnter={() => {
                    if (dragging.current) props.setSel({ ar: selRef.current.ar, ac: selRef.current.ac, fr: r, fc: c })
                  }}
                  onDoubleClick={() => props.onStartEdit(engine.getRaw(r, c))}
                >
                  {active && editing !== null ? (
                    <input
                      autoFocus
                      value={editing}
                      onChange={(e) => props.onEditChange(e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          props.onCommit('down')
                        } else if (e.key === 'Tab') {
                          e.preventDefault()
                          props.onCommit('right')
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          props.onCancel()
                        }
                        e.stopPropagation()
                      }}
                      style={{ width: '100%', height: '100%', border: 'none', outline: 'none', font: 'inherit', background: 'transparent', padding: 0, textAlign: align }}
                    />
                  ) : (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatCell(v, st)}</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
