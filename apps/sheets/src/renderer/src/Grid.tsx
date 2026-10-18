// Grade de células da planilha (seleção, edição em célula, teclado).
import { useRef, type ReactNode } from 'react'
import { type SheetEngine, colToLetter, displayValue, isError } from '@alcina/sheets-engine'

const W = 96
const H = 25
const RNW = 46

export interface GridProps {
  engine: SheetEngine
  rows: number
  cols: number
  rev: number
  sel: { row: number; col: number }
  editing: string | null
  onSelect: (row: number, col: number) => void
  onStartEdit: (initial: string) => void
  onEditChange: (text: string) => void
  onCommit: (move: 'down' | 'right') => void
  onCancel: () => void
  onClear: () => void
  onMove: (dr: number, dc: number) => void
}

export function Grid(props: GridProps): ReactNode {
  const { engine, rows, cols, sel, editing } = props
  const ref = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (editing !== null) return
    const k = e.key
    if (k === 'ArrowUp') {
      e.preventDefault()
      props.onMove(-1, 0)
    } else if (k === 'ArrowDown' || k === 'Enter') {
      e.preventDefault()
      if (k === 'Enter') props.onStartEdit(engine.getRaw(sel.row, sel.col))
      else props.onMove(1, 0)
    } else if (k === 'ArrowLeft') {
      e.preventDefault()
      props.onMove(0, -1)
    } else if (k === 'ArrowRight' || k === 'Tab') {
      e.preventDefault()
      props.onMove(0, 1)
    } else if (k === 'F2') {
      e.preventDefault()
      props.onStartEdit(engine.getRaw(sel.row, sel.col))
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault()
      props.onClear()
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      props.onStartEdit(k)
    }
  }

  const headerCell = (label: string, width: number, sticky: boolean, highlighted: boolean): ReactNode => (
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
        color: highlighted ? 'var(--ao-green-strong)' : 'var(--ao-text-2)',
        background: highlighted ? 'var(--ao-green-soft)' : 'var(--ao-surface)',
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
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ height: '100%', overflow: 'auto', outline: 'none', background: 'var(--ao-bg)' }}
    >
      <div style={{ width: RNW + cols * W, minWidth: '100%' }}>
        {/* Cabeçalho de colunas */}
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2 }}>
          {headerCell('', RNW, true, false)}
          {Array.from({ length: cols }, (_, c) => headerCell(colToLetter(c), W, false, c === sel.col))}
        </div>
        {/* Linhas */}
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} style={{ display: 'flex' }}>
            {headerCell(String(r + 1), RNW, true, r === sel.row)}
            {Array.from({ length: cols }, (_, c) => {
              const selected = r === sel.row && c === sel.col
              const v = engine.getValue(r, c)
              const numeric = typeof v === 'number'
              const text = displayValue(v)
              return (
                <div
                  key={c}
                  onMouseDown={() => props.onSelect(r, c)}
                  onDoubleClick={() => props.onStartEdit(engine.getRaw(r, c))}
                  style={{
                    width: W,
                    height: H,
                    flex: 'none',
                    padding: '0 5px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: numeric ? 'flex-end' : 'flex-start',
                    fontSize: 13,
                    color: isError(v) ? 'var(--ao-gold-text)' : 'var(--ao-text)',
                    background: '#fff',
                    borderRight: '1px solid var(--ao-border)',
                    borderBottom: '1px solid var(--ao-border)',
                    outline: selected ? '2px solid var(--ao-green)' : 'none',
                    outlineOffset: -1,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: 'cell',
                    position: 'relative',
                    zIndex: selected ? 1 : 0
                  }}
                >
                  {selected && editing !== null ? (
                    <input
                      autoFocus
                      value={editing}
                      onChange={(e) => props.onEditChange(e.target.value)}
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
                      style={{ width: '100%', height: '100%', border: 'none', outline: 'none', font: 'inherit', background: 'transparent', padding: 0 }}
                    />
                  ) : (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
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
