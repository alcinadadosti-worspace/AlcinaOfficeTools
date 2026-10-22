// Conteúdo de um visual (gráfico, cartão, tabela...) conforme o tipo.
import { useMemo, useState, type JSX } from 'react'
import { Spinner } from '@fluentui/react-components'
import { ErrorCircle20Regular, ArrowUp16Regular, ArrowDown16Regular, ArrowExpand16Regular, Table16Regular, Filter16Regular, DismissCircle16Regular } from '@fluentui/react-icons'
import type { ECElementEvent } from 'echarts/core'
import { useDoc } from '../../state/doc'
import { useUi } from '../../state/ui'
import type { PageDef, VisualDef } from '../../report/types'
import { useVisualData } from '../../visuals/useVisualData'
import { buildChart, type PointInfo } from '../../visuals/charts/options'
import { EChart } from '../../visuals/charts/EChart'
import { CardVisual, KpiVisual, MultiCardVisual } from '../../visuals/cards'
import { MatrixVisual, TableVisual } from '../../visuals/tables'
import { SlicerVisual } from '../../visuals/slicer'
import { MapVisual } from '../../visuals/map'
import { VisualIcon } from '../../visuals/icons'
import { visualDef, fmt } from '../../visuals/registry'
import { clearSelection, drill, includeExclude, selectPoint, updateVisual } from '../../actions/report'
import { ContextMenu, type MenuEntry } from '../../components/ContextMenu'
import { keyString } from '../../util/fmt'
import { DecorationVisual } from './Decorations'

const CHART_TYPES = new Set([
  'column',
  'stackedColumn',
  'percentColumn',
  'bar',
  'stackedBar',
  'percentBar',
  'line',
  'area',
  'stackedArea',
  'lineColumn',
  'lineStackedColumn',
  'ribbon',
  'waterfall',
  'funnel',
  'scatter',
  'pie',
  'donut',
  'treemap',
  'gauge'
])

function EmptyState({ v }: { v: VisualDef }) {
  const def = visualDef(v.type)
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a19f9d', gap: 8, padding: 8, textAlign: 'center' }}>
      <div style={{ color: '#c8c6c4' }}>
        <VisualIcon type={v.type} size={Math.min(64, 40)} />
      </div>
      <div style={{ fontSize: 12, maxWidth: 240 }}>{def ? `${def.name}: selecione ou arraste campos para o painel Visualizações` : ''}</div>
    </div>
  )
}

export function VisualBody({ v, page, editMode }: { v: VisualDef; page: PageDef; editMode: boolean }) {
  if (v.type === 'slicer') return <SlicerVisual v={v} page={page} editMode={editMode} />
  if (v.type === 'text' || v.type === 'shape' || v.type === 'image' || v.type === 'button') return <DecorationVisual v={v} page={page} editMode={editMode} />
  return <DataVisual v={v} page={page} />
}

function DataVisual({ v, page }: { v: VisualDef; page: PageDef }) {
  const data = useVisualData(v, page)
  const theme = useDoc((s) => s.doc.report.theme)
  const selection = useUi((s) => s.selection[page.id] ?? null)
  const [menu, setMenu] = useState<{ x: number; y: number; point: PointInfo | null } | null>(null)
  const selectedKeys = useMemo(() => (selection && selection.visualId === v.id ? new Set(selection.keys) : null), [selection, v.id])

  const chart = useMemo(() => {
    if (!CHART_TYPES.has(v.type) || !data.result || !data.built) return null
    try {
      return buildChart({ v, r: data.result, built: data.built, theme, selected: selectedKeys })
    } catch (e) {
      console.error(e)
      return null
    }
  }, [v, data.result, data.built, theme, selectedKeys])

  if (data.status === 'empty') return <EmptyState v={v} />
  if (data.status === 'error') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, textAlign: 'center', color: '#605e5c' }}>
        <ErrorCircle20Regular style={{ color: '#c4314b' }} />
        <div style={{ fontWeight: 600, fontSize: 12 }}>Não foi possível exibir este visual</div>
        <div style={{ fontSize: 11, maxWidth: 360, userSelect: 'text' }}>{data.error}</div>
      </div>
    )
  }
  if (!data.result || !data.built) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Spinner size="tiny" />
      </div>
    )
  }
  const r = data.result
  const built = data.built
  const loadingOverlay =
    data.status === 'loading' ? (
      <div style={{ position: 'absolute', right: 6, bottom: 6 }}>
        <Spinner size="extra-tiny" />
      </div>
    ) : null

  const hierarchy = (v.type === 'matrix' ? v.fields.rows : v.fields.category) ?? []
  const level = v.drillLevel ?? 0
  const menuItems = (point: PointInfo | null): MenuEntry[] => {
    const items: MenuEntry[] = []
    if (hierarchy.length > 1) {
      if (point) items.push({ label: 'Fazer drill down', icon: <ArrowDown16Regular />, onClick: () => drill(page.id, v.id, 'down', point), disabled: level >= hierarchy.length - 1 })
      items.push({ label: 'Fazer drill up', icon: <ArrowUp16Regular />, onClick: () => drill(page.id, v.id, 'up'), disabled: level === 0 })
      items.push({ label: 'Ir para o próximo nível', icon: <ArrowExpand16Regular />, onClick: () => drill(page.id, v.id, 'next'), disabled: level >= hierarchy.length - 1 })
      items.push({ kind: 'divider' })
    }
    if (point) {
      items.push({ label: 'Incluir', icon: <Filter16Regular />, onClick: () => includeExclude(page.id, v.id, point, false) })
      items.push({ label: 'Excluir', icon: <DismissCircle16Regular />, onClick: () => includeExclude(page.id, v.id, point, true) })
      items.push({ kind: 'divider' })
    }
    items.push({ label: 'Mostrar como tabela', icon: <Table16Regular />, onClick: () => useUi.getState().openDialog({ kind: 'showData', visualId: v.id }) })
    return items
  }

  let content: JSX.Element
  if (chart) {
    content = (
      <EChart
        option={chart.option}
        onClick={(e: ECElementEvent, ev) => {
          const pt = chart.point(e.seriesIndex ?? 0, e.dataIndex ?? 0, e.name)
          if (pt) selectPoint(page.id, v.id, pt, !!(ev?.ctrlKey || ev?.metaKey))
        }}
        onBlankClick={() => {
          if (selection?.visualId === v.id) clearSelection(page.id)
        }}
        onContextMenu={(e, ev) => {
          const pt = e ? chart.point(e.seriesIndex ?? 0, e.dataIndex ?? 0, e.name) : null
          setMenu({ x: ev.clientX, y: ev.clientY, point: pt })
        }}
      />
    )
  } else if (v.type === 'card') content = <CardVisual v={v} r={r} />
  else if (v.type === 'multiCard') content = <MultiCardVisual v={v} r={r} />
  else if (v.type === 'kpi') content = <KpiVisual v={v} r={r} built={built} theme={theme} />
  else if (v.type === 'table' || v.type === 'matrix') {
    const Comp = v.type === 'table' ? TableVisual : MatrixVisual
    content = (
      <Comp
        v={v}
        r={r}
        built={built}
        theme={theme}
        selected={selectedKeys}
        onSort={(kind, index) =>
          updateVisual(page.id, v.id, 'Classificar', (vd) => {
            const same = vd.sort && vd.sort.kind === kind && vd.sort.index === index
            vd.sort = { kind, index, desc: same ? !vd.sort!.desc : kind === 'value' }
          })
        }
        onSelectRow={(keys, ctrl) => {
          const groups = built.groups
          if (!groups.length) return
          const fields = groups.slice(0, keys.length).map((g) => g.field)
          selectPoint(page.id, v.id, { filters: [{ kind: 'tuple', fields, tuples: [keys] }], key: keys.map(keyString).join('|'), label: '' }, ctrl)
        }}
      />
    )
  } else if (v.type === 'map') content = <MapVisual v={v} r={r} built={built} theme={theme} onSelect={(pt, ctrl) => selectPoint(page.id, v.id, pt, ctrl)} />
  else content = <EmptyState v={v} />

  return (
    <div
      style={{ position: 'relative', height: '100%' }}
      onContextMenu={(e) => {
        if (chart) return
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, point: null })
      }}
    >
      {content}
      {loadingOverlay}
      {r.truncated && CHART_TYPES.has(v.type) && (
        <div title={`Exibindo ${r.rows.length} de ${r.rowCount} pontos de dados`} style={{ position: 'absolute', left: 6, bottom: 4, fontSize: 10, color: '#a19f9d' }}>
          ⚠ amostra
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.point)} onClose={() => setMenu(null)} />}
    </div>
  )
}

export function visualTitle(v: VisualDef): string {
  const t = fmt<string>(v, 'title', 'text')
  if (t) return t
  const vals = (v.fields.values ?? v.fields.value ?? []).map((f) => f.measure ?? f.column ?? '')
  const cats = (v.fields.category ?? v.fields.rows ?? v.fields.location ?? v.fields.details ?? []).map((f) => f.column ?? '')
  const series = (v.fields.series ?? []).map((f) => f.column ?? '')
  const level = v.drillLevel ?? 0
  const catName = cats.length ? cats[Math.min(level, cats.length - 1)] : ''
  if (v.type === 'card' || v.type === 'multiCard' || v.type === 'table') return ''
  if (!vals.length && !catName) return ''
  let s = vals.join(' e ')
  if (catName) s += (s ? ' por ' : '') + catName
  if (series.length) s += ` e ${series[0]}`
  return s
}
