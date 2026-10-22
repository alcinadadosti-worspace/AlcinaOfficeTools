// Grade de células: seleção de intervalo, edição, estilos e teclado.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Menu, MenuTrigger, MenuPopover, MenuList, MenuItem } from '@fluentui/react-components'
import { type SheetEngine, type CellValue, colToLetter } from '@alcina/sheets-engine'
import { cellKey, type CellStyle, type Merge, type CondRule, type Validation } from './model'
import { fillPlan } from './ops'
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
  condFormats?: CondRule[]
  hiddenRows?: Set<number>
  validations?: Validation[]
  comments?: Record<string, string>
  onSetValue?: (r: number, c: number, text: string) => void
  onFill?: (r: number, c: number) => void
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
  const condFormats = props.condFormats ?? []
  const hiddenRows = props.hiddenRows
  const validations = props.validations ?? []
  const comments = props.comments
  const selRef = useRef(sel)
  selRef.current = sel
  const dragging = useRef(false)
  const filling = useRef(false)
  const fillToRef = useRef<{ r: number; c: number } | null>(null)
  const onFillRef = useRef(props.onFill)
  onFillRef.current = props.onFill
  const [fillTo, setFillTo] = useState<{ r: number; c: number } | null>(null)

  useEffect(() => {
    const up = (): void => {
      dragging.current = false
      if (filling.current) {
        filling.current = false
        const t = fillToRef.current
        if (t) onFillRef.current?.(t.r, t.c)
        fillToRef.current = null
        setFillTo(null)
      }
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

  const showHandle = editing === null && !hiddenRows && !!props.onFill
  const handleLeft = RNW + (c2 + 1) * W
  const handleTop = H + (r2 + 1) * H
  let preview: { left: number; top: number; w: number; h: number } | null = null
  if (fillTo) {
    const plan = fillPlan({ r1, c1, r2, c2 }, fillTo.r, fillTo.c)
    if (plan) {
      const nr1 = plan.axis === 'row' && plan.back ? r1 - plan.g : r1
      const nr2 = plan.axis === 'row' && !plan.back ? r2 + plan.g : r2
      const nc1 = plan.axis === 'col' && plan.back ? c1 - plan.g : c1
      const nc2 = plan.axis === 'col' && !plan.back ? c2 + plan.g : c2
      preview = { left: RNW + nc1 * W, top: H + nr1 * H, w: (nc2 - nc1 + 1) * W, h: (nr2 - nr1 + 1) * H }
    }
  }

  return (
    <div tabIndex={0} onKeyDown={onKeyDown} style={{ height: '100%', overflow: 'auto', outline: 'none', background: 'var(--ao-bg)' }}>
      <div style={{ width: RNW + cols * W, minWidth: '100%', position: 'relative' }}>
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2 }}>
          {header('', RNW, true, false, 'corner')}
          {Array.from({ length: cols }, (_, c) => header(colToLetter(c), W, false, c >= c1 && c <= c2, c))}
        </div>
        {Array.from({ length: rows }, (_, r) => {
          if (hiddenRows?.has(r)) return null
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
              let cfFill: string | undefined
              let cfColor: string | undefined
              if (typeof dv === 'number' && condFormats.length) {
                for (const rule of condFormats) {
                  if (r >= Math.min(rule.r1, rule.r2) && r <= Math.max(rule.r1, rule.r2) && c >= Math.min(rule.c1, rule.c2) && c <= Math.max(rule.c1, rule.c2) && matchCond(rule, dv)) {
                    cfFill = rule.fill
                    cfColor = rule.color
                  }
                }
              }
              const numeric = typeof dv === 'number'
              const inRange = r >= r1 && r <= r2 && c >= c1 && c <= c2
              const active = r === sel.ar && c === sel.ac
              const frozenCol = c < freezeC
              const val = validations.length ? validations.find((x) => r >= Math.min(x.r1, x.r2) && r <= Math.max(x.r1, x.r2) && c >= Math.min(x.c1, x.c2) && c <= Math.max(x.c1, x.c2)) : undefined
              const invalid = !!val && dv !== null && dv !== '' && !val.list.includes(String(dv))
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
                color: st?.color || cfColor || 'var(--ao-text)',
                background: st?.fill || cfFill || (inRange && !active ? 'var(--ao-green-soft)' : spillInfo && !isConflict ? 'rgba(16,124,65,0.06)' : '#fff'),
                borderRight: st?.br ? `1.5px solid ${bc}` : '1px solid var(--ao-border)',
                borderBottom: st?.bb ? `1.5px solid ${bc}` : '1px solid var(--ao-border)',
                borderTop: st?.bt ? `1.5px solid ${bc}` : undefined,
                borderLeft: st?.bl ? `1.5px solid ${bc}` : undefined,
                outline: active ? '2px solid var(--ao-green)' : invalid ? '1.5px solid #d14343' : inRange ? '1px solid var(--ao-green)' : 'none',
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
                    if (filling.current) {
                      fillToRef.current = { r, c }
                      setFillTo({ r, c })
                    } else if (dragging.current) props.setSel({ ar: selRef.current.ar, ac: selRef.current.ac, fr: r, fc: c })
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
                  {comments?.[key] && (
                    <span
                      title={comments[key]}
                      style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTop: '7px solid #d14343', borderLeft: '7px solid transparent' }}
                    />
                  )}
                  {active && editing === null && val && (
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <button onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} title="Escolher da lista" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 16, border: 'none', borderLeft: '1px solid var(--ao-border)', background: 'var(--ao-green-soft)', color: 'var(--ao-green)', cursor: 'pointer', fontSize: 9, padding: 0 }}>
                          ▾
                        </button>
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          {val.list.map((v) => (
                            <MenuItem key={v} onClick={() => props.onSetValue?.(r, c, v)}>
                              {v || '(vazio)'}
                            </MenuItem>
                          ))}
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  )}
                </div>
              )
            })}
          </div>
          )
        })}
        {preview && (
          <div style={{ position: 'absolute', left: preview.left, top: preview.top, width: preview.w, height: preview.h, border: '2px dashed var(--ao-green)', background: 'rgba(16,124,65,0.06)', pointerEvents: 'none', zIndex: 5 }} />
        )}
        {showHandle && (
          <div
            title="Arraste para preencher"
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              filling.current = true
              fillToRef.current = null
              setFillTo(null)
            }}
            style={{ position: 'absolute', left: handleLeft - 4, top: handleTop - 4, width: 7, height: 7, background: 'var(--ao-green)', border: '1px solid #fff', borderRadius: 1, cursor: 'crosshair', zIndex: 6 }}
          />
        )}
      </div>
    </div>
  )
}

function matchCond(rule: CondRule, n: number): boolean {
  switch (rule.op) {
    case '>':
      return n > rule.v1
    case '<':
      return n < rule.v1
    case '>=':
      return n >= rule.v1
    case '<=':
      return n <= rule.v1
    case '=':
      return n === rule.v1
    case '<>':
      return n !== rule.v1
    case 'between':
      return n >= rule.v1 && n <= (rule.v2 ?? rule.v1)
  }
  return false
}
