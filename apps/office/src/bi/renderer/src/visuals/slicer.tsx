// Segmentação de dados (lista, blocos, lista suspensa e intervalo).
import { useEffect, useMemo, useState } from 'react'
import { Checkbox, Dropdown, Option, Input, Slider } from '@fluentui/react-components'
import { Search16Regular, Dismiss16Regular } from '@fluentui/react-icons'
import type { JsonScalar } from '@engine/query/types'
import { fromJsonScalar } from '@engine/query/types'
import { engine } from '../engine/client'
import { enqueue } from '../actions/model'
import { updateDoc, useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import type { PageDef, VisualDef } from '../report/types'
import { contextFilters } from './query'
import { fmt } from './registry'
import { formatKey, keyString } from '../util/fmt'
import { DATE_LEVEL_LABEL } from '@engine/model/types'

function setSlicer(page: PageDef, v: VisualDef, values: JsonScalar[], range?: { min?: JsonScalar; max?: JsonScalar }) {
  updateDoc(
    'Segmentação',
    (d) => {
      const p = d.report.pages.find((x) => x.id === page.id)
      const vis = p?.visuals.find((x) => x.id === v.id)
      if (vis) vis.slicer = { values: values as never[], range: range as never }
    },
    { coalesce: `slicer:${v.id}` }
  )
}

export function SlicerVisual({ v, page, editMode }: { v: VisualDef; page: PageDef; editMode: boolean }) {
  const field = v.fields.field?.[0]
  const report = useDoc((s) => s.doc.report)
  const modelVersion = useUi((s) => s.modelVersion)
  const selection = useUi((s) => s.selection[page.id] ?? null)
  const info = useUi((s) => s.modelInfo)
  const [values, setValues] = useState<JsonScalar[]>([])
  const [range, setRange] = useState<{ min: JsonScalar; max: JsonScalar } | null>(null)
  const [search, setSearch] = useState('')
  const colType = useMemo(() => {
    if (!field || !info) return undefined
    if (field.level) return 'int'
    return info.tables.find((t) => t.name === field.table)?.columns.find((c) => c.name === field.column)?.type
  }, [field, info])
  const styleSetting = fmt<string>(v, 'slicer', 'style')
  const isRangeType = colType === 'int' || colType === 'number' || colType === 'currency' || colType === 'date' || colType === 'datetime'
  const style = styleSetting === 'auto' ? (isRangeType && !field?.level && colType !== 'int' ? 'between' : 'list') : styleSetting
  const single = fmt<boolean>(v, 'slicer', 'single')
  const fontSize = fmt<number>(v, 'slicer', 'fontSize')

  const filters = useMemo(() => {
    // Filtros de outras segmentações, da página e do relatório (não a própria seleção).
    const { filters: f } = contextFilters({ ...v, slicer: undefined }, { report, page, selection })
    return f
  }, [v, report, page, selection])

  useEffect(() => {
    if (!field || !info) return
    let alive = true
    if (style === 'between') {
      enqueue(() => engine.columnRange(field, filters))
        .then((r) => alive && setRange(r))
        .catch(() => alive && setRange(null))
    } else {
      enqueue(() => engine.columnValues(field, filters, '', 2000))
        .then((r) => alive && setValues(r.values))
        .catch(() => alive && setValues([]))
    }
    return () => {
      alive = false
    }
  }, [field, filters, modelVersion, style, info])

  if (!field) return <div style={{ padding: 12, color: '#8a8886' }}>Adicione um campo à segmentação.</div>

  const selected = new Set((v.slicer?.values ?? []).map(keyString))
  const label = (x: JsonScalar) => formatKey(x, field, undefined, colType)
  const shown = search ? values.filter((x) => label(x).toLowerCase().includes(search.toLowerCase())) : values
  const toggle = (x: JsonScalar, ctrl: boolean) => {
    const k = keyString(x)
    const cur = v.slicer?.values ?? []
    if (single) {
      setSlicer(page, v, selected.has(k) && cur.length === 1 ? [] : [x])
      return
    }
    void ctrl
    if (selected.has(k)) setSlicer(page, v, cur.filter((y) => keyString(y) !== k))
    else setSlicer(page, v, [...cur, x])
  }
  const allSelected = selected.size === 0
  const showHeader = fmt<boolean>(v, 'sheader', 'show') !== false
  const headerText = fmt<string>(v, 'sheader', 'text') || (field.level ? `${field.column} (${DATE_LEVEL_LABEL[field.level]})` : field.column) || ''

  const header = showHeader && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 2px', fontWeight: 600, fontSize: fmt<number>(v, 'sheader', 'fontSize') }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headerText}</span>
      {(selected.size > 0 || v.slicer?.range) && (
        <button
          title="Limpar seleções"
          className="ab-nodrag"
          onClick={() => setSlicer(page, v, [], undefined)}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#605e5c', display: 'flex' }}
        >
          <Dismiss16Regular />
        </button>
      )}
    </div>
  )

  if (style === 'between') {
    const lo = range?.min ?? null
    const hi = range?.max ?? null
    const isDate = colType === 'date' || colType === 'datetime'
    const toNum = (x: JsonScalar | undefined) => (x === null || x === undefined ? NaN : isDate ? (x as { date: number }).date : Number(fromJsonScalar(x)))
    const loN = toNum(lo)
    const hiN = toNum(hi)
    const curMin = v.slicer?.range?.min !== undefined ? toNum(v.slicer.range.min) : loN
    const curMax = v.slicer?.range?.max !== undefined ? toNum(v.slicer.range.max) : hiN
    const fromNum = (n: number): JsonScalar => (isDate ? { date: n, kind: 'date' } : n)
    const disp = (n: number) => (Number.isFinite(n) ? formatKey(fromNum(n), undefined, undefined, colType) : '')
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontSize }}>
        {header}
        <div style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
          <Input size="small" value={disp(curMin)} readOnly style={{ flex: 1, minWidth: 0 }} />
          <Input size="small" value={disp(curMax)} readOnly style={{ flex: 1, minWidth: 0 }} />
        </div>
        {Number.isFinite(loN) && Number.isFinite(hiN) && hiN > loN && (
          <div className="ab-nodrag" style={{ padding: '0 6px' }} onMouseDown={(e) => e.stopPropagation()}>
            <Slider
              min={0}
              max={1000}
              value={Math.round(((curMin - loN) / (hiN - loN)) * 1000)}
              onChange={(_, d) => setSlicer(page, v, [], { min: fromNum(loN + (d.value / 1000) * (hiN - loN)), max: v.slicer?.range?.max })}
            />
            <Slider
              min={0}
              max={1000}
              value={Math.round(((curMax - loN) / (hiN - loN)) * 1000)}
              onChange={(_, d) => setSlicer(page, v, [], { min: v.slicer?.range?.min, max: fromNum(loN + (d.value / 1000) * (hiN - loN)) })}
            />
          </div>
        )}
      </div>
    )
  }

  if (style === 'dropdown') {
    const text = allSelected ? 'Tudo' : selected.size === 1 ? label((v.slicer?.values ?? [])[0]) : 'Várias seleções'
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontSize }}>
        {header}
        <div style={{ padding: '6px 10px' }} className="ab-nodrag" onMouseDown={(e) => e.stopPropagation()}>
          <Dropdown
            size="small"
            multiselect={!single}
            value={text}
            selectedOptions={(v.slicer?.values ?? []).map(keyString)}
            onOptionSelect={(_, d) => {
              const keys = new Set(d.selectedOptions)
              setSlicer(
                page,
                v,
                values.filter((x) => keys.has(keyString(x)))
              )
            }}
            style={{ width: '100%', minWidth: 0 }}
          >
            {values.map((x) => (
              <Option key={keyString(x)} value={keyString(x)} text={label(x)}>
                {label(x)}
              </Option>
            ))}
          </Dropdown>
        </div>
      </div>
    )
  }

  const searchBox = fmt<boolean>(v, 'slicer', 'search') && values.length > 8 && (
    <div style={{ padding: '2px 10px 4px' }} className="ab-nodrag" onMouseDown={(e) => e.stopPropagation()}>
      <Input size="small" contentBefore={<Search16Regular />} placeholder="Pesquisar" value={search} onChange={(_, d) => setSearch(d.value)} style={{ width: '100%' }} />
    </div>
  )

  if (style === 'tile') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontSize }}>
        {header}
        {searchBox}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 10px', alignContent: 'flex-start' }}>
          {shown.map((x) => {
            const on = selected.has(keyString(x))
            return (
              <button
                key={keyString(x)}
                className="ab-nodrag"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => toggle(x, e.ctrlKey)}
                style={{
                  border: `1px solid ${on ? '#0f7e89' : '#c8c6c4'}`,
                  background: on ? '#0f7e89' : '#ffffff',
                  color: on ? '#ffffff' : '#252423',
                  borderRadius: 4,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize
                }}
              >
                {label(x)}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontSize }}>
      {header}
      {searchBox}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 4px 6px' }} className="ab-nodrag" onMouseDown={(e) => !editMode && e.stopPropagation()}>
        {fmt<boolean>(v, 'slicer', 'selectAll') && !single && (
          <div>
            <Checkbox size="medium" label="Selecionar tudo" checked={allSelected ? true : 'mixed'} onChange={() => setSlicer(page, v, [])} />
          </div>
        )}
        {shown.map((x) => (
          <div key={keyString(x)}>
            <Checkbox
              size="medium"
              shape={single ? 'circular' : 'square'}
              label={label(x)}
              checked={selected.has(keyString(x))}
              onChange={() => toggle(x, false)}
            />
          </div>
        ))}
        {values.length === 0 && <div style={{ padding: 8, color: '#8a8886' }}>Sem valores.</div>}
      </div>
    </div>
  )
}
