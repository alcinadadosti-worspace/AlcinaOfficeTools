// Visuais de tabela e matriz.
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import type { JsonScalar } from '@engine/query/types'
import type { VQColumn, VQResult } from '@engine/vq/types'
import { fromJsonScalar } from '@engine/query/types'
import type { DisplayUnits } from '@engine/data/format'
import type { BuiltQuery } from './query'
import type { ReportTheme, VisualDef } from '../report/types'
import { fmt } from './registry'
import { formatKey, formatValue, keyString, mixColor, readableText } from '../util/fmt'

interface TableProps {
  v: VisualDef
  r: VQResult
  built: BuiltQuery
  theme: ReportTheme
  selected: Set<string> | null
  onSort: (kind: 'group' | 'value', index: number) => void
  onSelectRow: (keys: JsonScalar[], ctrl: boolean) => void
}

function isNumericCol(c: VQColumn): boolean {
  return c.kind === 'value' || c.type === 'int' || c.type === 'number' || c.type === 'currency'
}

function cellText(c: VQColumn, v: JsonScalar, units: DisplayUnits): string {
  if (c.kind === 'group') return v === null ? '' : formatKey(v, c.field, c.format, c.type)
  if (v === null) return ''
  const s = fromJsonScalar(v)
  if (typeof s === 'number' && units !== 'none') return formatValue(v, c.format, c.type, { units })
  return formatValue(v, c.format, c.type)
}

interface CondScale {
  mode: string
  min: number
  max: number
  minColor: string
  maxColor: string
}

function condStyle(cs: CondScale | null, v: JsonScalar): CSSProperties | undefined {
  if (!cs || cs.mode === 'none' || v === null) return undefined
  const x = Number(fromJsonScalar(v))
  if (!Number.isFinite(x)) return undefined
  const t = cs.max > cs.min ? (x - cs.min) / (cs.max - cs.min) : 1
  const color = mixColor(cs.minColor, cs.maxColor, Math.max(0, Math.min(1, t)))
  if (cs.mode === 'background') return { background: color, color: readableText(color) }
  if (cs.mode === 'font') return { color }
  if (cs.mode === 'bars') {
    const pct = Math.max(0, Math.min(100, t * 100))
    return { background: `linear-gradient(90deg, ${cs.maxColor}55 ${pct}%, transparent ${pct}%)` }
  }
  return undefined
}

function useTableStyle(v: VisualDef, theme: ReportTheme) {
  const style = fmt<string>(v, 'grid', 'style')
  const fontSize = fmt<number>(v, 'grid', 'fontSize')
  const pad = fmt<number>(v, 'grid', 'rowPadding')
  const hLines = fmt<boolean>(v, 'grid', 'horizontal')
  const vLines = fmt<boolean>(v, 'grid', 'vertical') || style === 'bold'
  const wrap = fmt<boolean>(v, 'grid', 'wrap')
  const headerBg = fmt<string>(v, 'headers', 'background') || (style === 'bold' ? theme.tableAccent : '')
  const headerColor = fmt<string>(v, 'headers', 'color') || (headerBg ? readableText(headerBg) : '#252423')
  const alt = fmt<string>(v, 'values', 'alternate') || (style === 'alternate' ? '#f3f2f1' : '')
  const border = hLines && style !== 'minimal' && style !== 'sparse' ? '1px solid #edebe9' : 'none'
  const cell: CSSProperties = {
    padding: `${pad}px 8px`,
    borderBottom: border,
    borderRight: vLines ? '1px solid #edebe9' : 'none',
    whiteSpace: wrap ? 'normal' : 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 360
  }
  const header: CSSProperties = {
    ...cell,
    position: 'sticky',
    top: 0,
    zIndex: 1,
    background: headerBg || '#ffffff',
    color: headerColor,
    fontWeight: fmt<boolean>(v, 'headers', 'bold') ? 600 : 400,
    fontSize: fmt<number>(v, 'headers', 'fontSize'),
    borderBottom: `2px solid ${style === 'minimal' ? '#e1dfdd' : theme.tableAccent}`,
    cursor: 'pointer',
    textAlign: 'left',
    verticalAlign: 'bottom'
  }
  return { fontSize, cell, header, alt, rowHeight: fontSize + pad * 2 + 7 }
}

function sortMark(v: VisualDef, kind: 'group' | 'value', index: number): string {
  if (!v.sort || v.sort.kind !== kind || v.sort.index !== index) return ''
  return v.sort.desc ? ' ▼' : ' ▲'
}

export function TableVisual({ v, r, built, theme, selected, onSort, onSelectRow }: TableProps) {
  const s = useTableStyle(v, theme)
  const units = (fmt<string>(v, 'values', 'units') || 'none') as DisplayUnits
  const nG = built.groups.length
  // Ordem das colunas como no poço "Colunas"
  const order = useMemo(() => {
    const fields = v.fields.values ?? []
    let gi = 0
    let vi = 0
    return fields.map((f) => {
      const isVal = !!f.measure || (!!f.aggregation && f.aggregation !== 'none')
      return isVal ? nG + vi++ : gi++
    })
  }, [v.fields.values, nG])
  const totals = r.sets.find((x) => x.indexes.length === 0)?.rows[0]
  const showTotals = fmt<boolean>(v, 'totals', 'show') !== false && !!totals && nG > 0
  const cond = useMemo((): CondScale | null => {
    const mode = fmt<string>(v, 'cond', 'mode')
    if (!mode || mode === 'none') return null
    let min = Infinity
    let max = -Infinity
    for (const row of r.rows)
      for (let i = nG; i < row.length; i++) {
        const x = Number(fromJsonScalar(row[i]))
        if (Number.isFinite(x) && row[i] !== null) {
          min = Math.min(min, x)
          max = Math.max(max, x)
        }
      }
    return { mode, min, max, minColor: fmt<string>(v, 'cond', 'minColor'), maxColor: fmt<string>(v, 'cond', 'maxColor') }
  }, [v, r, nG])

  // Virtualização simples
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(400)
  const rowH = s.rowHeight
  const start = Math.max(0, Math.floor(scrollTop / rowH) - 10)
  const end = Math.min(r.rows.length, start + Math.ceil(viewH / rowH) + 30)

  return (
    <div
      ref={(el) => {
        scroller.current = el
        if (el && el.clientHeight !== viewH) setViewH(el.clientHeight)
      }}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{ height: '100%', overflow: 'auto', fontSize: s.fontSize, fontVariantNumeric: 'tabular-nums' }}
    >
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
        <thead>
          <tr>
            {order.map((ci, k) => {
              const c = r.columns[ci]
              const kind = c.kind
              const index = kind === 'group' ? ci : ci - nG
              return (
                <th key={k} style={{ ...s.header, textAlign: isNumericCol(c) && kind === 'value' ? 'right' : 'left' }} onClick={() => onSort(kind, index)} title={c.name}>
                  {c.name}
                  {sortMark(v, kind, index)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {start > 0 && (
            <tr style={{ height: start * rowH }}>
              <td colSpan={order.length} />
            </tr>
          )}
          {r.rows.slice(start, end).map((row, i) => {
            const ri = start + i
            const keys = row.slice(0, nG)
            const ks = keys.map(keyString).join('|')
            const dim = selected && selected.size > 0 && !selected.has(ks)
            return (
              <tr
                key={ri}
                style={{ background: s.alt && ri % 2 === 1 ? s.alt : undefined, opacity: dim ? 0.45 : 1, cursor: nG ? 'pointer' : 'default' }}
                onClick={(e) => nG && onSelectRow(keys, e.ctrlKey || e.metaKey)}
              >
                {order.map((ci, k) => {
                  const c = r.columns[ci]
                  const val = row[ci]
                  return (
                    <td key={k} style={{ ...s.cell, textAlign: c.kind === 'value' && isNumericCol(c) ? 'right' : 'left', ...(c.kind === 'value' ? condStyle(cond, val) : undefined) }} title={cellText(c, val, 'none')}>
                      {cellText(c, val, units)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {end < r.rows.length && (
            <tr style={{ height: (r.rows.length - end) * rowH }}>
              <td colSpan={order.length} />
            </tr>
          )}
        </tbody>
        {showTotals && (
          <tfoot>
            <tr>
              {order.map((ci, k) => {
                const c = r.columns[ci]
                const val = c.kind === 'value' ? totals!.values[ci - nG] : null
                return (
                  <td
                    key={k}
                    style={{
                      ...s.cell,
                      position: 'sticky',
                      bottom: 0,
                      background: '#ffffff',
                      fontWeight: 600,
                      borderTop: `1px solid ${theme.tableAccent}`,
                      textAlign: c.kind === 'value' ? 'right' : 'left'
                    }}
                  >
                    {k === 0 && c.kind === 'group' ? fmt<string>(v, 'totals', 'label') : c.kind === 'value' ? cellText(c, val, units) : ''}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        )}
      </table>
      {r.truncated && <div style={{ padding: 6, color: '#8a8886', fontSize: 11 }}>Mostrando {r.rows.length.toLocaleString('pt-BR')} de {r.rowCount.toLocaleString('pt-BR')} linhas.</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Matriz
// ---------------------------------------------------------------------------

interface RowNode {
  keys: JsonScalar[]
  label: string
  level: number
  children: RowNode[]
  ks: string
}

function buildTree(paths: JsonScalar[][], depth: number, fieldsFmt: (level: number, v: JsonScalar) => string): RowNode[] {
  const root: RowNode = { keys: [], label: '', level: -1, children: [], ks: '' }
  const index = new Map<string, RowNode>()
  for (const p of paths) {
    let parent = root
    for (let l = 0; l < depth; l++) {
      const keys = p.slice(0, l + 1)
      const ks = keys.map(keyString).join('|')
      let node = index.get(ks)
      if (!node) {
        node = { keys, label: fieldsFmt(l, p[l]), level: l, children: [], ks }
        index.set(ks, node)
        parent.children.push(node)
      }
      parent = node
    }
  }
  return root.children
}

export function MatrixVisual({ v, r, built, theme, onSelectRow }: TableProps) {
  const s = useTableStyle(v, theme)
  const units = (fmt<string>(v, 'values', 'units') || 'none') as DisplayUnits
  const rowIdx = built.groups.map((g, i) => ({ g, i })).filter((x) => x.g.role === 'rows').map((x) => x.i)
  const colIdx = built.groups.map((g, i) => ({ g, i })).filter((x) => x.g.role === 'columns').map((x) => x.i)
  const nr = rowIdx.length
  const nc = colIdx.length
  const nG = built.groups.length
  const nv = built.values.length
  const valueCols = r.columns.slice(nG)
  const showTotals = fmt<boolean>(v, 'totals', 'show') !== false
  const rowSub = showTotals && fmt<boolean>(v, 'totals', 'rowSubtotals') !== false
  const colSub = showTotals && fmt<boolean>(v, 'totals', 'columnSubtotals') !== false
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const data = useMemo(() => {
    const maps = new Map<string, Map<string, JsonScalar[]>>()
    const put = (rl: number, cl: number, rk: JsonScalar[], ck: JsonScalar[], vals: JsonScalar[]) => {
      const mk = `${rl}|${cl}`
      let m = maps.get(mk)
      if (!m) maps.set(mk, (m = new Map()))
      m.set(rk.map(keyString).join('|') + '§' + ck.map(keyString).join('|'), vals)
    }
    for (const row of r.rows) put(nr, nc, rowIdx.map((i) => row[i]), colIdx.map((i) => row[i]), row.slice(nG))
    for (const set of r.sets) {
      const rl = set.indexes.filter((i) => i < nr).length
      const cl = set.indexes.length - rl
      for (const row of set.rows) put(rl, cl, row.keys.slice(0, rl), row.keys.slice(rl), row.values)
    }
    return maps
  }, [r, nr, nc, nG, rowIdx, colIdx])

  const get = (rk: JsonScalar[], ck: JsonScalar[]): JsonScalar[] | undefined =>
    data.get(`${rk.length}|${ck.length}`)?.get(rk.map(keyString).join('|') + '§' + ck.map(keyString).join('|'))

  const rowTree = useMemo(
    () =>
      buildTree(
        r.rows.map((row) => rowIdx.map((i) => row[i])),
        nr,
        (l, val) => formatKey(val, built.groups[rowIdx[l]].field, r.columns[rowIdx[l]].format, r.columns[rowIdx[l]].type)
      ),
    [r, rowIdx, nr, built]
  )
  // Colunas: caminhos únicos ordenados
  const colPaths = useMemo(() => {
    const seen = new Map<string, JsonScalar[]>()
    for (const row of r.rows) {
      const p = colIdx.map((i) => row[i])
      const k = p.map(keyString).join('|')
      if (!seen.has(k)) seen.set(k, p)
    }
    return [...seen.values()]
  }, [r, colIdx])
  const colTree = useMemo(
    () => buildTree(colPaths, nc, (l, val) => formatKey(val, built.groups[colIdx[l]].field, r.columns[colIdx[l]].format, r.columns[colIdx[l]].type)),
    [colPaths, nc, built, colIdx, r]
  )
  // Lista de colunas de dados (folhas + subtotais + total geral)
  const leafCols = useMemo(() => {
    const out: { keys: JsonScalar[]; label: string; total: boolean }[] = []
    const walk = (nodes: RowNode[]) => {
      for (const n of nodes) {
        if (n.level === nc - 1) out.push({ keys: n.keys, label: n.label, total: false })
        else {
          walk(n.children)
          if (colSub) out.push({ keys: n.keys, label: `Total ${n.label}`, total: true })
        }
      }
    }
    if (nc) {
      walk(colTree)
      if (showTotals) out.push({ keys: [], label: fmt<string>(v, 'totals', 'label'), total: true })
    } else out.push({ keys: [], label: '', total: false })
    return out
  }, [colTree, nc, colSub, showTotals, v])

  const rowsOut: { node: RowNode | null; label: string; level: number; total: boolean }[] = []
  const walkRows = (nodes: RowNode[]) => {
    for (const n of nodes) {
      const isLeaf = n.level === nr - 1
      rowsOut.push({ node: n, label: n.label, level: n.level, total: !isLeaf })
      if (!isLeaf && !collapsed.has(n.ks)) walkRows(n.children)
    }
  }
  walkRows(rowTree)
  if (showTotals && nr > 0) rowsOut.push({ node: null, label: fmt<string>(v, 'totals', 'label'), level: 0, total: true })
  if (nr === 0) rowsOut.push({ node: null, label: '', level: 0, total: false })

  const toggle = (ks: string) => {
    const next = new Set(collapsed)
    if (next.has(ks)) next.delete(ks)
    else next.add(ks)
    setCollapsed(next)
  }
  const headerLabel = rowIdx.map((i) => r.columns[i].name).join(' / ')
  const maxRows = 3000

  return (
    <div style={{ height: '100%', overflow: 'auto', fontSize: s.fontSize, fontVariantNumeric: 'tabular-nums' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
        <thead>
          {nc > 0 && (
            <tr>
              <th style={{ ...s.header, cursor: 'default' }} />
              {leafCols.map((c, i) => (
                <th key={i} colSpan={nv || 1} style={{ ...s.header, cursor: 'default', textAlign: 'center', fontWeight: c.total ? 700 : s.header.fontWeight }}>
                  {c.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            <th style={{ ...s.header, cursor: 'default', top: nc > 0 ? s.rowHeight : 0 }}>{headerLabel}</th>
            {leafCols.flatMap((c, i) =>
              (nv ? valueCols : [{ name: '' } as VQColumn]).map((vc, k) => (
                <th key={`${i}-${k}`} style={{ ...s.header, cursor: 'default', textAlign: 'right', top: nc > 0 ? s.rowHeight : 0 }}>
                  {vc.name}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {rowsOut.slice(0, maxRows).map((row, ri) => {
            const rk = row.node ? row.node.keys : []
            const isGrand = !row.node && row.total
            const isSub = row.total && !!row.node
            if (isSub && !rowSub && collapsed.has(row.node!.ks) === false) {
              // sem subtotais de linha: o pai aparece só como cabeçalho
            }
            return (
              <tr key={ri} style={{ background: s.alt && ri % 2 === 1 ? s.alt : undefined, fontWeight: isGrand || (isSub && rowSub) ? 600 : 400 }}>
                <td
                  style={{ ...s.cell, paddingLeft: 8 + row.level * 16, cursor: row.node ? 'pointer' : 'default', position: 'sticky', left: 0, background: '#ffffff', borderTop: isGrand ? `1px solid ${theme.tableAccent}` : undefined }}
                  onClick={(e) => {
                    if (isSub) toggle(row.node!.ks)
                    else if (row.node) onSelectRow(row.node.keys, e.ctrlKey || e.metaKey)
                  }}
                >
                  {isSub && <span style={{ display: 'inline-block', width: 14, color: '#605e5c' }}>{collapsed.has(row.node!.ks) ? '⊞' : '⊟'}</span>}
                  {row.label}
                </td>
                {leafCols.flatMap((c, i) => {
                  const vals = (isSub && !rowSub && !collapsed.has(row.node!.ks)) ? undefined : get(rk, c.keys)
                  return (nv ? valueCols : [null]).map((vc, k) => (
                    <td key={`${i}-${k}`} style={{ ...s.cell, textAlign: 'right', fontWeight: c.total ? 600 : undefined, borderTop: isGrand ? `1px solid ${theme.tableAccent}` : undefined }}>
                      {vc && vals ? cellText(vc, vals[k] ?? null, units) : ''}
                    </td>
                  ))
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      {rowsOut.length > maxRows && <div style={{ padding: 6, color: '#8a8886', fontSize: 11 }}>Mostrando as primeiras {maxRows} linhas.</div>}
    </div>
  )
}
