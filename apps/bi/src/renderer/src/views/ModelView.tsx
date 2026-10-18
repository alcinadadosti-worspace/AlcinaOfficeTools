// Exibição de modelo: diagrama de tabelas e relações (arrastar para posicionar/criar).
import { useRef, useState } from 'react'
import { Button } from '@fluentui/react-components'
import { Organization24Regular, Lightbulb20Regular, AutoFitWidth20Regular, Key16Filled, NumberSymbol16Regular, Calculator16Regular } from '@fluentui/react-icons'
import type { TableDef } from '@engine/model/types'
import { useDoc, updateDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { autoDetectRelationships } from '../actions/model'
import { commands } from '../actions/commands'
import { Empty } from '../components/ui'

const W = 210
const HEADER = 30
const ROW = 22
const DND = 'application/x-alcinabi-modelcol'

function cardHeight(t: TableDef): number {
  const n = Math.min(t.columns.filter((c) => !c.isHidden).length, 12)
  return HEADER + Math.max(1, n) * ROW + (t.measures.length ? ROW : 0) + 6
}

export function ModelView() {
  const tables = useDoc((s) => s.doc.model.tables)
  const relationships = useDoc((s) => s.doc.model.relationships)
  const layout = useDoc((s) => s.doc.report.modelLayout)
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<{ table: string; dx: number; dy: number } | null>(null)
  const [, force] = useState(0)

  const pos = (name: string, i: number) => layout[name] ?? { x: 40 + (i % 4) * (W + 48), y: 40 + Math.floor(i / 4) * 240 }

  const onHeaderDown = (e: React.PointerEvent, name: string, i: number) => {
    const p = pos(name, i)
    const rect = host.current!.getBoundingClientRect()
    drag.current = { table: name, dx: e.clientX - rect.left - p.x + host.current!.scrollLeft, dy: e.clientY - rect.top - p.y + host.current!.scrollTop }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const rect = host.current!.getBoundingClientRect()
    const x = Math.max(0, e.clientX - rect.left - drag.current.dx + host.current!.scrollLeft)
    const y = Math.max(0, e.clientY - rect.top - drag.current.dy + host.current!.scrollTop)
    const name = drag.current.table
    updateDoc('Mover tabela', (d) => void (d.report.modelLayout[name] = { x, y }), { coalesce: `model:${name}`, history: false })
  }
  const onUp = (e: React.PointerEvent) => {
    if (drag.current) (e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    drag.current = null
  }

  const autoLayout = () => {
    updateDoc('Layout automático', (d) => {
      d.report.modelLayout = {}
      d.model.tables.forEach((t, i) => {
        d.report.modelLayout[t.name] = { x: 40 + (i % 4) * (W + 48), y: 40 + Math.floor(i / 4) * 240 }
      })
    })
    force((n) => n + 1)
  }

  // Colunas usadas em relações (mostram ícone de chave).
  const relCols = new Set<string>()
  for (const r of relationships) {
    relCols.add(`${r.fromTable}|${r.fromColumn}`)
    relCols.add(`${r.toTable}|${r.toColumn}`)
  }

  const createRel = (from: { table: string; column: string }, to: { table: string; column: string }) => {
    if (from.table === to.table) return
    useUi.getState().openDialog({ kind: 'relationship', fromTable: from.table, fromColumn: from.column, toTable: to.table, toColumn: to.column })
  }

  if (tables.length === 0) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--ab-canvas-bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <Organization24Regular style={{ color: 'var(--ab-text-3)', fontSize: 40 }} />
          <Empty>Carregue duas ou mais tabelas para montar o modelo e criar relações.</Empty>
        </div>
      </div>
    )
  }

  const maxX = Math.max(...tables.map((t, i) => pos(t.name, i).x + W)) + 80
  const maxY = Math.max(...tables.map((t, i) => pos(t.name, i).y + cardHeight(t))) + 80

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--ab-border)', background: '#ffffff', flex: 'none' }}>
        <Button appearance="subtle" icon={<Organization24Regular />} onClick={commands.manageRelationships}>
          Gerenciar relações
        </Button>
        <Button
          appearance="subtle"
          icon={<Lightbulb20Regular />}
          onClick={async () => {
            const n = await autoDetectRelationships()
            useUi.getState().toast({ intent: n ? 'success' : 'info', title: n ? `${n} relação(ões) encontrada(s).` : 'Nenhuma nova relação encontrada.' })
          }}
        >
          Detectar relações
        </Button>
        <Button appearance="subtle" icon={<AutoFitWidth20Regular />} onClick={autoLayout}>
          Layout automático
        </Button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--ab-text-2)' }}>
          {tables.length} tabela(s) · {relationships.length} relação(ões)
        </span>
      </div>
      <div ref={host} style={{ flex: 1, position: 'relative', overflow: 'auto', background: 'var(--ab-canvas-bg)' }} onPointerMove={onMove} onPointerUp={onUp}>
        <div style={{ position: 'relative', width: maxX, height: maxY }}>
          <svg style={{ position: 'absolute', inset: 0, width: maxX, height: maxY, pointerEvents: 'none' }}>
            {relationships.map((r) => {
              const fi = tables.findIndex((t) => t.name === r.fromTable)
              const ti = tables.findIndex((t) => t.name === r.toTable)
              if (fi < 0 || ti < 0) return null
              const a = pos(r.fromTable, fi)
              const b = pos(r.toTable, ti)
              const ay = a.y + cardHeight(tables[fi]) / 2
              const by = b.y + cardHeight(tables[ti]) / 2
              const rightward = b.x > a.x
              const x1 = rightward ? a.x + W : a.x
              const x2 = rightward ? b.x : b.x + W
              const midX = (x1 + x2) / 2
              const d = `M ${x1} ${ay} C ${midX} ${ay}, ${midX} ${by}, ${x2} ${by}`
              return (
                <g key={r.id} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onDoubleClick={commands.manageRelationships}>
                  <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
                  <path d={d} fill="none" stroke={r.active ? 'var(--ab-accent-strong)' : 'var(--ab-text-3)'} strokeWidth={1.5} strokeDasharray={r.active ? undefined : '4 3'} />
                  <text x={x1 + (rightward ? -12 : 12)} y={ay - 5} fontSize={12} fill="var(--ab-text-2)" textAnchor="middle">
                    {r.cardinality === 'oneToOne' ? '1' : '*'}
                  </text>
                  <text x={x2 + (rightward ? 10 : -10)} y={by - 5} fontSize={12} fill="var(--ab-text-2)" textAnchor="middle">
                    1
                  </text>
                </g>
              )
            })}
          </svg>
          {tables.map((t, i) => {
            const p = pos(t.name, i)
            const cols = t.columns.filter((c) => !c.isHidden)
            return (
              <div
                key={t.name}
                style={{
                  position: 'absolute',
                  left: p.x,
                  top: p.y,
                  width: W,
                  background: '#ffffff',
                  border: '1px solid var(--ab-border-strong)',
                  borderRadius: 6,
                  boxShadow: 'var(--ab-shadow)',
                  userSelect: 'none'
                }}
              >
                <div
                  onPointerDown={(e) => onHeaderDown(e, t.name, i)}
                  onClick={() => useUi.getState().set({ fieldSelection: { table: t.name } })}
                  style={{
                    height: HEADER,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 8px',
                    background: 'var(--ab-accent-strong)',
                    color: '#fff',
                    borderRadius: '5px 5px 0 0',
                    cursor: 'grab',
                    fontWeight: 600,
                    fontSize: 13
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                </div>
                <div style={{ maxHeight: 12 * ROW, overflow: 'auto' }}>
                  {cols.map((c) => {
                    const isKey = relCols.has(`${t.name}|${c.name}`)
                    return (
                      <div
                        key={c.name}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ table: t.name, column: c.name }))}
                        onDragOver={(e) => e.dataTransfer.types.includes(DND) && e.preventDefault()}
                        onDrop={(e) => {
                          const raw = e.dataTransfer.getData(DND)
                          if (raw) createRel(JSON.parse(raw), { table: t.name, column: c.name })
                        }}
                        title={`Arraste para outra coluna para criar uma relação`}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, height: ROW, padding: '0 8px', fontSize: 12, cursor: 'grab', color: 'var(--ab-text)' }}
                      >
                        {isKey ? <Key16Filled style={{ color: 'var(--ab-accent)' }} /> : c.expression ? <Calculator16Regular style={{ color: 'var(--ab-text-3)' }} /> : <NumberSymbol16Regular style={{ color: 'var(--ab-text-3)' }} />}
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      </div>
                    )
                  })}
                </div>
                {t.measures.length > 0 && (
                  <div style={{ height: ROW, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', fontSize: 11, color: 'var(--ab-text-3)', borderTop: '1px solid var(--ab-border)' }}>
                    <Calculator16Regular style={{ color: 'var(--ab-accent)' }} />
                    {t.measures.length} medida(s)
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
