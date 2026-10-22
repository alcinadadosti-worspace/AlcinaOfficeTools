// Painel "Visualizações": galeria de tipos, poços de campos e formatação.
import { useState } from 'react'
import { Tooltip, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, MenuDivider, TabList, Tab } from '@fluentui/react-components'
import { ChevronDown12Regular, Dismiss12Regular, ChevronDoubleRight20Regular, DataBarVertical20Regular, PaintBrush20Regular } from '@fluentui/react-icons'
import type { Aggregation, FieldRef } from '@engine/vq/types'
import { AGGREGATION_LABEL } from '@engine/vq/types'
import { useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { PaneHeader, IconButton, Empty } from '../components/ui'
import { VISUALS, GALLERY_ORDER, visualDef, type RoleDef } from '../visuals/registry'
import { VisualIcon } from '../visuals/icons'
import { activePage, addFieldToVisual, addVisual, moveFieldInVisual, removeFieldFromVisual, setFieldAggregation, updateVisual } from '../actions/report'
import { FIELD_MIME, type DraggedField } from '../views/report/ReportView'
import { fieldLabel } from '../util/fmt'
import { FormatPane } from './FormatPane'
import type { VisualDef, VisualType } from '../report/types'

const WELL_MIME = 'application/x-alcinabi-well'

function convertFields(v: VisualDef, to: VisualType): Record<string, FieldRef[]> {
  // Reaproveita os campos ao trocar o tipo do visual.
  const def = visualDef(to)
  const groups: FieldRef[] = []
  const measures: FieldRef[] = []
  for (const [role, list] of Object.entries(v.fields)) {
    for (const f of list) {
      const isM = !!f.measure || (!!f.aggregation && f.aggregation !== 'none') || role === 'values' || role === 'lineValues' || role === 'x' || role === 'y' || role === 'size' || role === 'value' || role === 'target'
      if (role === 'tooltips') continue
      if (isM && !(role === 'values' && (v.type === 'table') && !f.measure && !f.aggregation)) measures.push(f)
      else groups.push(f)
    }
  }
  const out: Record<string, FieldRef[]> = {}
  const groupRoles = def.roles.filter((r) => r.kind === 'grouping')
  const measureRoles = def.roles.filter((r) => r.kind === 'measure' && r.name !== 'tooltips')
  const anyRoles = def.roles.filter((r) => r.kind === 'any')
  if (anyRoles.length) {
    out[anyRoles[0].name] = [...groups, ...measures].slice(0, anyRoles[0].max ?? 100)
    return out
  }
  let gi = 0
  for (const r of groupRoles) {
    const take = r.hierarchy || r.max === undefined ? groups.slice(gi, r.max ? gi + r.max : undefined) : groups.slice(gi, gi + (r.max ?? 1))
    if (r.name === 'series') continue
    if (take.length) {
      out[r.name] = take
      gi += take.length
    }
  }
  let mi = 0
  for (const r of measureRoles) {
    const take = measures.slice(mi, r.max ? mi + r.max : undefined)
    if (take.length) {
      out[r.name] = take
      mi += take.length
    }
  }
  return out
}

function FieldChip({ f, role, index, visual, pageId }: { f: FieldRef; role: RoleDef; index: number; visual: VisualDef; pageId: string }) {
  const info = useUi((s) => s.modelInfo)
  const col = f.column && !f.level ? info?.tables.find((t) => t.name === f.table)?.columns.find((c) => c.name === f.column) : undefined
  const numeric = col && (col.type === 'int' || col.type === 'number' || col.type === 'currency')
  const aggOptions: Aggregation[] = f.measure
    ? []
    : numeric
      ? ['sum', 'avg', 'min', 'max', 'countDistinct', 'count', 'stdev', 'variance', 'median', 'none']
      : ['first', 'last', 'countDistinct', 'count', 'none']
  const label = fieldLabel(f)
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(WELL_MIME, JSON.stringify({ role: role.name, index }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 28,
        padding: '0 4px 0 8px',
        margin: '3px 0',
        border: '1px solid var(--ab-border)',
        borderRadius: 4,
        background: '#ffffff',
        fontSize: 12
      }}
    >
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${f.table} · ${label}`}>
        {label}
      </span>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <button style={chipBtn} aria-label="Opções do campo">
            <ChevronDown12Regular />
          </button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem onClick={() => removeFieldFromVisual(pageId, visual.id, role.name, index)}>Remover campo</MenuItem>
            {aggOptions.length > 0 && <MenuDivider />}
            {aggOptions.map((a) => (
              <MenuItem key={a} onClick={() => setFieldAggregation(pageId, visual.id, role.name, index, a)}>
                {(f.aggregation ?? 'none') === a ? '✓ ' : ''}
                {a === 'none' ? 'Não resumir' : AGGREGATION_LABEL[a]}
              </MenuItem>
            ))}
            <MenuDivider />
            <MenuItem
              onClick={() => {
                const page = activePage()
                if (page) useUi.getState().set({ panes: { ...useUi.getState().panes, filters: true } })
                void page
              }}
            >
              Mostrar no painel de filtros
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
      <button style={chipBtn} aria-label="Remover" onClick={() => removeFieldFromVisual(pageId, visual.id, role.name, index)}>
        <Dismiss12Regular />
      </button>
    </div>
  )
}

const chipBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--ab-text-2)',
  borderRadius: 3
}

function Well({ role, visual, pageId }: { role: RoleDef; visual: VisualDef; pageId: string }) {
  const [over, setOver] = useState(false)
  const fields = visual.fields[role.name] ?? []
  const full = role.max !== undefined && fields.length >= role.max
  return (
    <div
      style={{ marginBottom: 10 }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(FIELD_MIME) || e.dataTransfer.types.includes(WELL_MIME)) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const raw = e.dataTransfer.getData(FIELD_MIME)
        if (raw) {
          e.preventDefault()
          const d = JSON.parse(raw) as DraggedField
          if (full && role.max === 1) {
            removeFieldFromVisual(pageId, visual.id, role.name, 0)
          }
          const f =
            role.kind === 'measure' && !d.field.measure && !d.field.aggregation
              ? { ...d.field, aggregation: d.isNumeric ? ('sum' as const) : ('count' as const) }
              : d.field
          addFieldToVisual(pageId, visual.id, role.name, f)
          return
        }
        const w = e.dataTransfer.getData(WELL_MIME)
        if (w) {
          e.preventDefault()
          const src = JSON.parse(w) as { role: string; index: number }
          moveFieldInVisual(pageId, visual.id, src.role, src.index, role.name, fields.length)
        }
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ab-text-2)', marginBottom: 2 }}>{role.label}</div>
      {fields.map((f, i) => (
        <FieldChip key={i} f={f} role={role} index={i} visual={visual} pageId={pageId} />
      ))}
      {!full && (
        <div
          style={{
            height: 28,
            border: `1px dashed ${over ? 'var(--ab-accent)' : 'var(--ab-border-strong)'}`,
            background: over ? 'var(--ab-accent-soft)' : 'transparent',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            color: 'var(--ab-text-3)',
            fontSize: 11,
            marginTop: 3
          }}
        >
          Adicionar campos de dados aqui
        </div>
      )}
    </div>
  )
}

export function VisualizationsPane() {
  const tab = useUi((s) => s.vizTab)
  const selectedIds = useUi((s) => s.selectedVisualIds)
  const pages = useDoc((s) => s.doc.report.pages)
  const activeId = useUi((s) => s.activePageId)
  const page = pages.find((p) => p.id === activeId) ?? pages[0]
  const visual = page?.visuals.find((v) => v.id === selectedIds[0])
  const def = visual ? visualDef(visual.type) : null

  const changeType = (t: VisualType) => {
    if (!page) return
    if (!visual) {
      addVisual(t)
      return
    }
    if (visual.type === t) return
    updateVisual(page.id, visual.id, 'Alterar visual', (v) => {
      v.fields = convertFields(visual, t) as never
      v.type = t
      v.drillLevel = 0
      v.drillPath = []
      v.sort = undefined
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PaneHeader title="Visualizações">
        <IconButton icon={<ChevronDoubleRight20Regular />} title="Recolher painel" onClick={() => useUi.getState().set({ panes: { ...useUi.getState().panes, visualizations: false } })} />
      </PaneHeader>
      <div style={{ padding: '4px 8px 0' }}>
        <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => useUi.getState().set({ vizTab: d.value as 'build' | 'format' })}>
          <Tab value="build" icon={<DataBarVertical20Regular />}>
            Criar visual
          </Tab>
          <Tab value="format" icon={<PaintBrush20Regular />}>
            Formatar
          </Tab>
        </TabList>
      </div>
      {tab === 'build' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 10px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 30px)', gap: 2, marginBottom: 10 }}>
            {GALLERY_ORDER.map((t) => {
              const d = VISUALS.find((x) => x.type === t)!
              const active = visual?.type === t
              return (
                <Tooltip key={t} content={d.name} relationship="label">
                  <button
                    onClick={() => changeType(t)}
                    style={{
                      width: 30,
                      height: 30,
                      border: active ? '1px solid var(--ab-accent)' : '1px solid transparent',
                      borderRadius: 4,
                      background: active ? 'var(--ab-accent-soft)' : 'transparent',
                      cursor: 'pointer',
                      color: active ? 'var(--ab-accent-strong)' : 'var(--ab-text)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <VisualIcon type={t} />
                  </button>
                </Tooltip>
              )
            })}
          </div>
          {visual && def && page ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{def.name}</div>
              {def.roles.map((r) => (
                <Well key={r.name} role={r} visual={visual} pageId={page.id} />
              ))}
              {def.roles.length === 0 && <Empty>Este elemento não usa campos de dados.</Empty>}
              {(def.category === 'chart' || def.category === 'table') && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!visual.format.general?.showNoData}
                      onChange={(e) =>
                        updateVisual(page.id, visual.id, 'Mostrar itens sem dados', (v) => {
                          v.format.general = { ...(v.format.general ?? {}), showNoData: e.target.checked }
                        })
                      }
                    />
                    Mostrar itens sem dados
                  </label>
                </div>
              )}
            </>
          ) : (
            <Empty>Selecione um visual na tela ou clique em um tipo acima para criar um novo.</Empty>
          )}
        </div>
      ) : (
        <FormatPane visual={visual ?? null} page={page ?? null} />
      )}
    </div>
  )
}
