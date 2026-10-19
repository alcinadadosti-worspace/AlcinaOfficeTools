// Grade de células: seleção de intervalo, edição, estilos e teclado.
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { type SheetEngine, type CellValue, colToLetter } from '@alcina/sheets-engine'
import { cellKey, type CellStyle, type Merge } from './model'
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
  freezeR?: number
  freezeC?: number
  merges?: Merge[]
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
  const freezeR = props.freezeR ?? 0
  const freezeC = props.freezeC ?? 0
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

  // Overlay de derramamento (spill): mapeia células cobertas por matrizes ancoradas.
  const { spillMap, conflict } = useMemo(() => {
    const sm = new Map<string, { value: CellValue; anchor: boolean }>()
    const cf = new Set<string>()
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const m = engine.getSpill(r, c)
        if (!m || (m.rows <= 1 && m.cols <= 1)) continue
        let bad = false
        for (let i = 0; i < m.rows && !bad; i++) {
          for (let j = 0; j < m.cols; j++) {
            if (i === 0 && j === 0) continue
            const tr = r + i
            const tc = c + j
            if (tr < rows && tc < cols && engine.getRaw(tr, tc) !== '') {
              bad = true
              break
            }
          }
        }
        if (bad) {
          cf.add(cellKey(r, c))
          continue
        }
        for (let i = 0; i < m.rows; i++) {
          for (let j = 0; j < m.cols; j++) {
            const tr = r + i
            const tc = c + j
            if (tr < rows && tc < cols) sm.set(cellKey(tr, tc), { value: m.cells[i][j] ?? null, anchor: i === 0 && j === 0 })
          }
        }
      }
    }
    return { spillMap: sm, conflict: cf }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, rows, cols, props.rev])

  // Mesclagem horizontal: âncora -> nº de colunas; conjunto de células cobertas (ocultas).
  const { spanMap, mcovered } = useMemo(() => {
    const sp = new Map<string, number>()
    const cov = new Set<string>()
    for (const m of props.merges ?? []) {
      sp.set(cellKey(m.r, m.c), m.cs)
      for (let j = 1; j < m.cs; j++) cov.add(cellKey(m.r, m.c + j))
    }
    return { spanMap: sp, mcovered: cov }
  }, [props.merges])

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

  const header = (label: string, width: number, sticky: boolean, on: boolean, k: string | number): ReactNode => (
    <div
      key={k}
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
          {header('', RNW, true, false, 'corner')}
          {Array.from({ length: cols }, (_, c) => header(colToLetter(c), W, false, c >= c1 && c <= c2, c))}
        </div>
        {Array.from({ length: rows }, (_, r) => {
          const frozenRow = r < freezeR
          return (
          <div key={r} style={frozenRow ? { display: 'flex', position: 'sticky', top: H * (r + 1), zIndex: 3, background: 'var(--ao-surface)' } : { display: 'flex' }}>
            {header(String(r + 1), RNW, true, r >= r1 && r <= r2, 'rn')}
            {Array.from({ length: cols }, (_, c) => {
              const key = cellKey(r, c)
              if (mcovered.has(key)) return null
              const mspan = spanMap.get(key) ?? 1
              const st = styles[key]
              const v = engine.getValue(r, c)
              const spillInfo = spillMap.get(key)
              const isConflict = conflict.has(key)
              const dv: CellValue = isConflict ? '#DERRAM!' : spillInfo && !spillInfo.anchor ? spillInfo.value : v
              const numeric = typeof dv === 'number'
              const inRange = r >= r1 && r <= r2 && c >= c1 && c <= c2
              const active = r === sel.ar && c === sel.ac
              const frozenCol = c < freezeC
              const align = st?.align ?? (numeric ? 'right' : 'left')
              const bc = 'var(--ao-text-2)'
              const cs: CSSProperties = {
                width: W * mspan,
                height: H,
                flex: 'none',
                padding: '0 5px',
                display: 'flex',
                alignItems: st?.valign === 'top' ? 'flex-start' : st?.valign === 'bottom' ? 'flex-end' : 'center',
                justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
                fontFamily: st?.fontFamily || 'inherit',
                fontSize: st?.fontSize ?? 13,
                fontWeight: st?.bold ? 700 : 400,
                fontStyle: st?.italic ? 'italic' : 'normal',
                textDecoration: st?.underline ? 'underline' : 'none',
                color: st?.color || 'var(--ao-text)',
                background: st?.fill || (inRange && !active ? 'var(--ao-green-soft)' : spillInfo && !isConflict ? 'rgba(16,124,65,0.06)' : '#fff'),
                borderRight: st?.br ? `1.5px solid ${bc}` : '1px solid var(--ao-border)',
                borderBottom: st?.bb ? `1.5px solid ${bc}` : '1px solid var(--ao-border)',
                borderTop: st?.bt ? `1.5px solid ${bc}` : undefined,
                borderLeft: st?.bl ? `1.5px solid ${bc}` : undefined,
                outline: active ? '2px solid var(--ao-green)' : inRange ? '1px solid var(--ao-green)' : 'none',
                outlineOffset: -1,
                overflow: 'hidden',
                whiteSpace: st?.wrap ? 'normal' : 'nowrap',
                wordBreak: st?.wrap ? 'break-word' : 'normal',
                cursor: 'cell',
                position: frozenCol ? 'sticky' : 'relative',
                left: frozenCol ? RNW + c * W : undefined,
                zIndex: frozenCol ? 2 : active ? 1 : 0
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
                  ) : isConflict ? (
                    <span style={{ color: '#b64a38', fontWeight: 600 }} title="O intervalo de derramamento não está vazio.">#DERRAM!</span>
                  ) : (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatCell(dv, st)}</span>
                  )}
                </div>
              )
            })}
          </div>
          )
        })}
      </div>
    </div>
  )
}
