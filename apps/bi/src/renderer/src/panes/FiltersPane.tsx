// Painel "Filtros": filtros do visual, da página e de todas as páginas.
import { useEffect, useMemo, useState } from 'react'
import { Checkbox, Dropdown, Option, Input, Radio, RadioGroup } from '@fluentui/react-components'
import { ChevronDown12Regular, ChevronRight12Regular, Dismiss12Regular, LockClosed12Regular, Search16Regular, ChevronDoubleRight20Regular, Eraser20Regular } from '@fluentui/react-icons'
import type { AdvancedOp, FieldRef } from '@engine/vq/types'
import type { JsonScalar } from '@engine/query/types'
import { useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { PaneHeader, IconButton } from '../components/ui'
import { FIELD_MIME, type DraggedField } from '../views/report/ReportView'
import { addFilter, removeFilter, updateFilter, type FilterScope } from '../actions/report'
import { engine } from '../engine/client'
import { enqueue } from '../actions/model'
import type { FilterDef, VisualDef } from '../report/types'
import { fieldLabel, formatKey, keyString } from '../util/fmt'
import { isMeasureLike } from '../visuals/query'
import { sameField } from '../report/defaults'

const OPS: { value: AdvancedOp; label: string; text?: boolean; noValue?: boolean }[] = [
  { value: 'eq', label: 'é' },
  { value: 'ne', label: 'não é' },
  { value: 'gt', label: 'é maior que' },
  { value: 'ge', label: 'é maior ou igual a' },
  { value: 'lt', label: 'é menor que' },
  { value: 'le', label: 'é menor ou igual a' },
  { value: 'contains', label: 'contém', text: true },
  { value: 'notContains', label: 'não contém', text: true },
  { value: 'startsWith', label: 'começa com', text: true },
  { value: 'notStartsWith', label: 'não começa com', text: true },
  { value: 'endsWith', label: 'termina com', text: true },
  { value: 'isBlank', label: 'está em branco', noValue: true },
  { value: 'isNotBlank', label: 'não está em branco', noValue: true },
  { value: 'isEmpty', label: 'está vazio', noValue: true },
  { value: 'isNotEmpty', label: 'não está vazio', noValue: true }
]

function parseInput(text: string, type?: string): JsonScalar {
  if (text === '') return null
  if (type === 'int' || type === 'number' || type === 'currency' || type === undefined) {
    const n = Number(text.replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n) && /^-?[\d.,]+$/.test(text)) return n
  }
  if (type === 'date' || type === 'datetime') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
    if (m) return { date: Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])), kind: 'date' }
  }
  return text
}

function summary(f: FilterDef): string {
  if (f.type === 'basic') {
    if (!f.values?.length) return 'é (Tudo)'
    const vals = f.values.slice(0, 3).map((v) => formatKey(v, f.field)).join(', ')
    return `${f.invert ? 'não é' : 'é'} ${vals}${f.values.length > 3 ? ` e mais ${f.values.length - 3}` : ''}`
  }
  if (f.type === 'advanced') {
    const c = (f.conditions ?? []).filter((x) => x.op)
    if (!c.length) return 'é (Tudo)'
    return c.map((x) => `${OPS.find((o) => o.value === x.op)?.label ?? x.op} ${x.value === null || x.value === undefined ? '' : formatKey(x.value)}`).join(f.logic === 'or' ? ' ou ' : ' e ')
  }
  if (f.type === 'topN') return f.n ? `${f.bottom ? 'Inferior' : 'Superior'} ${f.n}` : 'é (Tudo)'
  if (f.type === 'relative' && f.relative) return `nos ${f.relative.mode === 'last' ? 'últimos' : f.relative.mode === 'next' ? 'próximos' : ''} ${f.relative.count} ${f.relative.unit}`
  return ''
}

function FilterCard({ f, scope, colType, implicit }: { f: FilterDef; scope: FilterScope; colType?: string; implicit?: boolean }) {
  const [open, setOpen] = useState(!f.collapsed && !implicit)
  const [values, setValues] = useState<JsonScalar[]>([])
  const [search, setSearch] = useState('')
  const modelVersion = useUi((s) => s.modelVersion)
  const measureLike = isMeasureLike(f.field)
  const isDate = colType === 'date' || colType === 'datetime'

  useEffect(() => {
    if (!open || measureLike || f.type !== 'basic') return
    let alive = true
    enqueue(() => engine.columnValues(f.field, [], '', 5000))
      .then((r) => alive && setValues(r.values))
      .catch(() => alive && setValues([]))
    return () => {
      alive = false
    }
  }, [open, f.field, f.type, modelVersion, measureLike])

  const patch = (p: Partial<FilterDef>) => {
    if (implicit) {
      addFilter(scope, f.field)
      // aplica a alteração no filtro recém-criado
      setTimeout(() => {
        const list = scopeFilters(scope)
        const created = list.find((x) => sameField(x.field, f.field))
        if (created) updateFilter(scope, created.id, p)
      }, 0)
      return
    }
    updateFilter(scope, f.id, p)
  }
  const sel = new Set((f.values ?? []).map(keyString))
  const shown = search ? values.filter((v) => formatKey(v, f.field).toLowerCase().includes(search.toLowerCase())) : values
  const active = summary(f) !== 'é (Tudo)'

  return (
    <div style={{ background: active ? '#f0f7f8' : '#ffffff', border: '1px solid var(--ab-border)', borderRadius: 6, margin: '6px 0', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 6px 6px 8px', cursor: 'pointer', gap: 4 }} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown12Regular /> : <ChevronRight12Regular />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fieldLabel(f.field)}</div>
          <div style={{ color: 'var(--ab-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary(f)}</div>
        </div>
        {f.locked && <LockClosed12Regular />}
        {active && !implicit && (
          <button title="Limpar filtro" onClick={(e) => (e.stopPropagation(), patch({ values: [], invert: false, conditions: [], n: undefined, relative: undefined }))} style={xBtn}>
            <Eraser20Regular style={{ width: 14, height: 14 }} />
          </button>
        )}
        {!implicit && (
          <button title="Remover filtro" onClick={(e) => (e.stopPropagation(), removeFilter(scope, f.id))} style={xBtn}>
            <Dismiss12Regular />
          </button>
        )}
      </div>
      {open && (
        <div style={{ padding: '0 10px 10px' }}>
          {!measureLike && (
            <Dropdown
              size="small"
              value={{ basic: 'Filtragem básica', advanced: 'Filtragem avançada', topN: 'N superior', relative: 'Data relativa' }[f.type]}
              selectedOptions={[f.type]}
              onOptionSelect={(_, d) => patch({ type: d.optionValue as FilterDef['type'], values: [], conditions: [{ op: isDate ? 'ge' : 'contains', value: null }], n: undefined })}
              style={{ width: '100%', minWidth: 0, marginBottom: 8 }}
            >
              <Option value="basic">Filtragem básica</Option>
              <Option value="advanced">Filtragem avançada</Option>
              {scope.level === 'visual' && <Option value="topN">N superior</Option>}
              {isDate && <Option value="relative">Data relativa</Option>}
            </Dropdown>
          )}
          {f.type === 'basic' && !measureLike && (
            <>
              {values.length > 8 && <Input size="small" contentBefore={<Search16Regular />} placeholder="Pesquisar" value={search} onChange={(_, d) => setSearch(d.value)} style={{ width: '100%', marginBottom: 4 }} />}
              <div style={{ maxHeight: 220, overflow: 'auto' }}>
                <Checkbox
                  size="medium"
                  label="Selecionar tudo"
                  checked={!f.values?.length ? true : f.invert ? 'mixed' : 'mixed'}
                  onChange={() => patch({ values: [], invert: false })}
                />
                {shown.map((v) => {
                  const k = keyString(v)
                  const checked = f.invert ? !sel.has(k) : !f.values?.length ? false : sel.has(k)
                  return (
                    <div key={k}>
                      <Checkbox
                        size="medium"
                        label={formatKey(v, f.field, undefined, colType as never)}
                        checked={checked}
                        onChange={() => {
                          const cur = f.values ?? []
                          const next = sel.has(k) ? cur.filter((x) => keyString(x) !== k) : [...cur, v]
                          patch({ values: next, invert: f.invert })
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {(f.type === 'advanced' || measureLike) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ color: 'var(--ab-text-2)' }}>Mostrar itens quando o valor:</div>
              {(f.conditions?.length ? f.conditions : [{ op: (measureLike ? 'gt' : 'contains') as AdvancedOp, value: null }]).slice(0, measureLike ? 1 : 2).map((c, i, arr) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Dropdown
                    size="small"
                    value={OPS.find((o) => o.value === c.op)?.label ?? ''}
                    selectedOptions={[c.op]}
                    onOptionSelect={(_, d) => {
                      const conds = [...arr]
                      conds[i] = { ...c, op: d.optionValue as AdvancedOp }
                      patch({ conditions: conds, type: 'advanced' })
                    }}
                    style={{ width: '100%', minWidth: 0 }}
                  >
                    {OPS.filter((o) => !(measureLike && o.text)).map((o) => (
                      <Option key={o.value} value={o.value}>
                        {o.label}
                      </Option>
                    ))}
                  </Dropdown>
                  {!OPS.find((o) => o.value === c.op)?.noValue && (
                    <Input
                      size="small"
                      placeholder={isDate ? 'dd/mm/aaaa' : 'Valor'}
                      defaultValue={c.value === null || c.value === undefined ? '' : formatKey(c.value)}
                      onBlur={(e) => {
                        const conds = [...arr]
                        conds[i] = { ...c, value: parseInput(e.target.value, measureLike ? 'number' : colType) }
                        patch({ conditions: conds, type: 'advanced' })
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  )}
                  {i === 0 && !measureLike && (
                    <RadioGroup layout="horizontal" value={f.logic ?? 'and'} onChange={(_, d) => patch({ logic: d.value as 'and' | 'or', conditions: arr.length < 2 ? [...arr, { op: c.op, value: null }] : arr })}>
                      <Radio value="and" label="E" />
                      <Radio value="or" label="Ou" />
                    </RadioGroup>
                  )}
                </div>
              ))}
            </div>
          )}
          {f.type === 'topN' && <TopNEditor f={f} patch={patch} />}
          {f.type === 'relative' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <Dropdown
                  size="small"
                  value={{ last: 'No último', this: 'Neste', next: 'No próximo' }[f.relative?.mode ?? 'last']}
                  selectedOptions={[f.relative?.mode ?? 'last']}
                  onOptionSelect={(_, d) => patch({ relative: { mode: d.optionValue as 'last', count: f.relative?.count ?? 1, unit: f.relative?.unit ?? 'month', includeToday: true } })}
                  style={{ minWidth: 0, flex: 1 }}
                >
                  <Option value="last">No último</Option>
                  <Option value="this">Neste</Option>
                  <Option value="next">No próximo</Option>
                </Dropdown>
                <Input
                  size="small"
                  type="number"
                  value={String(f.relative?.count ?? 1)}
                  onChange={(_, d) => patch({ relative: { mode: f.relative?.mode ?? 'last', count: Math.max(1, Number(d.value) || 1), unit: f.relative?.unit ?? 'month', includeToday: true } })}
                  style={{ width: 60 }}
                />
              </div>
              <Dropdown
                size="small"
                value={{ day: 'dias', week: 'semanas', month: 'meses', quarter: 'trimestres', year: 'anos' }[f.relative?.unit ?? 'month']}
                selectedOptions={[f.relative?.unit ?? 'month']}
                onOptionSelect={(_, d) => patch({ relative: { mode: f.relative?.mode ?? 'last', count: f.relative?.count ?? 1, unit: d.optionValue as 'month', includeToday: true } })}
                style={{ minWidth: 0 }}
              >
                <Option value="day">dias</Option>
                <Option value="week">semanas</Option>
                <Option value="month">meses</Option>
                <Option value="quarter">trimestres</Option>
                <Option value="year">anos</Option>
              </Dropdown>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TopNEditor({ f, patch }: { f: FilterDef; patch: (p: Partial<FilterDef>) => void }) {
  const [over, setOver] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <Dropdown size="small" value={f.bottom ? 'Inferior' : 'Superior'} selectedOptions={[f.bottom ? 'b' : 't']} onOptionSelect={(_, d) => patch({ bottom: d.optionValue === 'b' })} style={{ minWidth: 0, flex: 1 }}>
          <Option value="t">Superior</Option>
          <Option value="b">Inferior</Option>
        </Dropdown>
        <Input size="small" type="number" value={String(f.n ?? 10)} onChange={(_, d) => patch({ n: Math.max(1, Number(d.value) || 1) })} style={{ width: 64 }} />
      </div>
      <div style={{ color: 'var(--ab-text-2)' }}>Por valor</div>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(FIELD_MIME)) {
            e.preventDefault()
            setOver(true)
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false)
          const raw = e.dataTransfer.getData(FIELD_MIME)
          if (!raw) return
          const d = JSON.parse(raw) as DraggedField
          patch({ by: d.field.measure ? d.field : { ...d.field, aggregation: d.isNumeric ? 'sum' : 'count' }, n: f.n ?? 10 })
        }}
        style={{ border: `1px dashed ${over ? 'var(--ab-accent)' : 'var(--ab-border-strong)'}`, borderRadius: 4, padding: '6px 8px', color: f.by ? 'var(--ab-text)' : 'var(--ab-text-3)' }}
      >
        {f.by ? fieldLabel(f.by) : 'Adicionar campos de dados aqui'}
      </div>
    </div>
  )
}

const xBtn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ab-text-2)', display: 'flex', padding: 2 }

function scopeFilters(scope: FilterScope): FilterDef[] {
  const d = useDoc.getState().doc
  if (scope.level === 'report') return d.report.filters
  const p = d.report.pages.find((x) => x.id === scope.pageId)
  if (scope.level === 'page') return p?.filters ?? []
  return p?.visuals.find((v) => v.id === scope.visualId)?.filters ?? []
}

function DropSection({ title, scope, filters, implicitFields }: { title: string; scope: FilterScope; filters: FilterDef[]; implicitFields?: FieldRef[] }) {
  const [over, setOver] = useState(false)
  const info = useUi((s) => s.modelInfo)
  const typeOf = (f: FieldRef) => (f.level ? 'int' : info?.tables.find((t) => t.name === f.table)?.columns.find((c) => c.name === f.column)?.type)
  const implicit = (implicitFields ?? []).filter((f) => !filters.some((x) => sameField(x.field, f)))
  return (
    <div style={{ padding: '6px 10px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ab-text-2)', margin: '4px 0' }}>{title}</div>
      {filters.map((f) => (
        <FilterCard key={f.id} f={f} scope={scope} colType={typeOf(f.field)} />
      ))}
      {implicit.map((f, i) => (
        <FilterCard key={`imp${i}`} f={{ id: `imp${i}`, field: f, type: isMeasureLike(f) ? 'advanced' : 'basic', values: [] }} scope={scope} colType={typeOf(f)} implicit />
      ))}
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(FIELD_MIME)) {
            e.preventDefault()
            setOver(true)
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false)
          const raw = e.dataTransfer.getData(FIELD_MIME)
          if (!raw) return
          const d = JSON.parse(raw) as DraggedField
          addFilter(scope, d.field)
        }}
        style={{
          height: 30,
          border: `1px dashed ${over ? 'var(--ab-accent)' : 'var(--ab-border-strong)'}`,
          background: over ? 'var(--ab-accent-soft)' : 'transparent',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          color: 'var(--ab-text-3)',
          fontSize: 11
        }}
      >
        Adicionar campos de dados aqui
      </div>
    </div>
  )
}

export function FiltersPane() {
  const report = useDoc((s) => s.doc.report)
  const activeId = useUi((s) => s.activePageId)
  const selected = useUi((s) => s.selectedVisualIds)
  const page = report.pages.find((p) => p.id === activeId) ?? report.pages[0]
  const visual: VisualDef | undefined = page?.visuals.find((v) => v.id === selected[0])
  const visualFields = useMemo(() => {
    if (!visual) return []
    const out: FieldRef[] = []
    for (const list of Object.values(visual.fields)) for (const f of list) if (!out.some((x) => sameField(x, f) && (x.aggregation ?? '') === (f.aggregation ?? ''))) out.push(f)
    return out
  }, [visual])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PaneHeader title="Filtros">
        <IconButton icon={<ChevronDoubleRight20Regular />} title="Recolher painel" onClick={() => useUi.getState().set({ panes: { ...useUi.getState().panes, filters: false } })} />
      </PaneHeader>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
        {visual && page && <DropSection title="Filtros neste visual" scope={{ level: 'visual', pageId: page.id, visualId: visual.id }} filters={visual.filters} implicitFields={visualFields} />}
        {page && <DropSection title="Filtros nesta página" scope={{ level: 'page', pageId: page.id }} filters={page.filters} />}
        <DropSection title="Filtros em todas as páginas" scope={{ level: 'report' }} filters={report.filters} />
      </div>
    </div>
  )
}
