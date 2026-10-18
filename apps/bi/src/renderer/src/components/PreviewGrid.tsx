// Grade virtualizada para visualização de dados (consultas, navegador, tabela).
import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { DataType } from '@engine/data/types'

export type GridCell = string | null | { error: string }

export interface GridColumn {
  name: string
  type?: DataType
  header?: ReactNode
  width?: number
}

const NUMERIC = new Set(['int', 'number', 'currency'])

export function PreviewGrid({
  columns,
  rows,
  rowCount,
  onLoadMore,
  selectedColumn,
  onColumnClick,
  onHeaderContextMenu,
  rowNumbers = true,
  height = '100%',
  headerHeight = 30,
  extraHeader
}: {
  columns: GridColumn[]
  rows: GridCell[][]
  rowCount?: number
  onLoadMore?: (from: number) => void
  selectedColumn?: number | null
  onColumnClick?: (index: number, e: React.MouseEvent) => void
  onHeaderContextMenu?: (index: number, e: React.MouseEvent) => void
  rowNumbers?: boolean
  height?: number | string
  headerHeight?: number
  extraHeader?: (index: number) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(400)
  const rowH = 25
  const widths = useMemo(
    () =>
      columns.map((c, i) => {
        if (c.width) return c.width
        let max = Math.min(260, Math.max(90, c.name.length * 8 + 40))
        for (let r = 0; r < Math.min(rows.length, 60); r++) {
          const v = rows[r][i]
          const len = typeof v === 'string' ? v.length : v && typeof v === 'object' ? 5 : 4
          max = Math.max(max, Math.min(320, len * 7 + 20))
        }
        return max
      }),
    [columns, rows]
  )
  const totalW = widths.reduce((s, w) => s + w, 0) + (rowNumbers ? 48 : 0)
  const start = Math.max(0, Math.floor(scrollTop / rowH) - 5)
  const end = Math.min(rows.length, start + Math.ceil(viewH / rowH) + 15)
  const extraH = extraHeader ? 30 : 0
  return (
    <div
      ref={(el) => {
        ref.current = el
        if (el && Math.abs(el.clientHeight - viewH) > 2) setViewH(el.clientHeight)
      }}
      className="ab-grid ab-selectable"
      style={{ height }}
      onScroll={(e) => {
        const el = e.target as HTMLDivElement
        setScrollTop(el.scrollTop)
        if (onLoadMore && el.scrollTop + el.clientHeight > el.scrollHeight - 300) onLoadMore(rows.length)
      }}
    >
      <div style={{ width: totalW, position: 'relative', height: headerHeight + extraH + rows.length * rowH }}>
        <div className="ab-grid-header" style={{ width: totalW, flexDirection: 'column' }}>
          <div style={{ display: 'flex' }}>
            {rowNumbers && <div className="ab-grid-hcell" style={{ width: 48, height: headerHeight, lineHeight: `${headerHeight}px` }} />}
            {columns.map((c, i) => (
              <div
                key={i}
                className="ab-grid-hcell"
                title={c.name}
                onClick={(e) => onColumnClick?.(i, e)}
                onContextMenu={(e) => {
                  if (onHeaderContextMenu) {
                    e.preventDefault()
                    onHeaderContextMenu(i, e)
                  }
                }}
                style={{
                  width: widths[i],
                  height: headerHeight,
                  lineHeight: `${headerHeight}px`,
                  cursor: onColumnClick ? 'pointer' : 'default',
                  background: selectedColumn === i ? 'var(--ab-selected)' : undefined,
                  textAlign: c.type && NUMERIC.has(c.type) ? 'right' : 'left'
                }}
              >
                {c.header ?? c.name}
              </div>
            ))}
          </div>
          {extraHeader && (
            <div style={{ display: 'flex' }}>
              {rowNumbers && <div style={{ width: 48, flex: 'none' }} />}
              {columns.map((_, i) => (
                <div key={i} style={{ width: widths[i], flex: 'none', height: 30, padding: '2px 6px', borderRight: '1px solid var(--ab-border)', background: selectedColumn === i ? 'var(--ab-selected)' : '#fff' }}>
                  {extraHeader(i)}
                </div>
              ))}
            </div>
          )}
        </div>
        {rows.slice(start, end).map((row, k) => {
          const r = start + k
          return (
            <div key={r} className="ab-grid-row" style={{ top: headerHeight + extraH + r * rowH, width: totalW }}>
              {rowNumbers && (
                <div className="ab-grid-cell" style={{ width: 48, color: 'var(--ab-text-3)', textAlign: 'right', background: '#faf9f8' }}>
                  {r + 1}
                </div>
              )}
              {row.map((v, i) => {
                const isErr = v !== null && typeof v === 'object'
                const cls = `ab-grid-cell${isErr ? ' err' : ''}${v === null ? ' null' : ''}${columns[i]?.type && NUMERIC.has(columns[i].type!) ? ' num' : ''}`
                return (
                  <div key={i} className={cls} style={{ width: widths[i], background: selectedColumn === i ? '#f4fafb' : undefined }} title={isErr ? (v as { error: string }).error : (v ?? '')}>
                    {isErr ? 'Error' : v === null ? 'null' : v}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {rowCount !== undefined && rowCount > rows.length && !onLoadMore && (
        <div style={{ position: 'sticky', left: 0, padding: 6, color: 'var(--ab-text-3)', fontSize: 11 }}>
          Mostrando {rows.length.toLocaleString('pt-BR')} de {rowCount.toLocaleString('pt-BR')} linhas.
        </div>
      )}
    </div>
  )
}
