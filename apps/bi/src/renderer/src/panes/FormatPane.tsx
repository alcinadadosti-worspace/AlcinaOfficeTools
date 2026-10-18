// Formatação do visual selecionado (ou da página).
import { useState } from 'react'
import { Switch, Input, Dropdown, Option, Slider, Textarea, Button } from '@fluentui/react-components'
import { ChevronDown12Regular, ChevronRight12Regular, ArrowReset20Regular } from '@fluentui/react-icons'
import type { PageDef, VisualDef } from '../report/types'
import { visualDef, fmt, type FormatGroup, type FormatProp } from '../visuals/registry'
import { updateVisual, setPageProps, renamePage } from '../actions/report'
import { PAGE_SIZES } from '../report/defaults'
import { Empty } from '../components/ui'

export function ColorInput({ value, onChange, allowAuto = true }: { value: string; onChange: (v: string) => void; allowAuto?: boolean }) {
  const [text, setText] = useState(value)
  const shown = value || ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <label
        style={{
          width: 28,
          height: 24,
          borderRadius: 4,
          border: '1px solid var(--ab-border-strong)',
          background: shown || 'repeating-linear-gradient(45deg, #fff, #fff 4px, #eee 4px, #eee 8px)',
          cursor: 'pointer',
          position: 'relative',
          flex: 'none'
        }}
        title="Escolher cor"
      >
        <input type="color" value={shown || '#ffffff'} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', position: 'absolute', inset: 0 }} />
      </label>
      <Input
        size="small"
        value={text === value ? shown : text}
        placeholder="Automático"
        onChange={(_, d) => setText(d.value)}
        onBlur={() => {
          if (/^#[0-9a-f]{6}$/i.test(text) || (allowAuto && text === '')) onChange(text)
          setText(value)
        }}
        style={{ width: 96 }}
      />
      {allowAuto && value && (
        <button title="Automático" onClick={() => onChange('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ab-text-2)', display: 'flex' }}>
          <ArrowReset20Regular />
        </button>
      )}
    </div>
  )
}

function PropControl({ p, value, onChange }: { p: FormatProp; value: unknown; onChange: (v: unknown) => void }) {
  switch (p.type) {
    case 'toggle':
      return <Switch checked={!!value} onChange={(_, d) => onChange(d.checked)} />
    case 'color':
      return <ColorInput value={(value as string) ?? ''} onChange={onChange} />
    case 'number':
      return (
        <Input
          size="small"
          type="number"
          value={String(value ?? '')}
          min={p.min}
          max={p.max}
          onChange={(_, d) => {
            const n = Number(d.value)
            if (d.value === '' || !Number.isFinite(n)) return
            onChange(Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, n)))
          }}
          style={{ width: 90 }}
        />
      )
    case 'text':
      return <Input size="small" value={String(value ?? '')} onChange={(_, d) => onChange(d.value)} style={{ width: '100%' }} />
    case 'textarea':
      return <Textarea size="small" value={String(value ?? '')} onChange={(_, d) => onChange(d.value)} style={{ width: '100%' }} />
    case 'select':
      return (
        <Dropdown
          size="small"
          value={p.options?.find((o) => o.value === value)?.label ?? ''}
          selectedOptions={[String(value)]}
          onOptionSelect={(_, d) => onChange(d.optionValue)}
          style={{ minWidth: 0, width: '100%' }}
        >
          {p.options?.map((o) => (
            <Option key={o.value} value={o.value}>
              {o.label}
            </Option>
          ))}
        </Dropdown>
      )
    case 'slider':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Slider size="small" min={p.min} max={p.max} step={p.step ?? 1} value={Number(value ?? 0)} onChange={(_, d) => onChange(d.value)} style={{ flex: 1, minWidth: 0 }} />
          <span style={{ width: 30, fontSize: 12, textAlign: 'right' }}>{String(value ?? 0)}</span>
        </div>
      )
  }
}

function GroupView({ g, get, set }: { g: FormatGroup; get: (key: string) => unknown; set: (key: string, v: unknown) => void }) {
  const [open, setOpen] = useState(false)
  const toggleOn = g.toggle ? !!get(g.toggle) : true
  return (
    <div style={{ borderBottom: '1px solid var(--ab-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 8px', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown12Regular /> : <ChevronRight12Regular />}
        <span style={{ flex: 1, marginLeft: 6, fontWeight: 600, fontSize: 13 }}>{g.label}</span>
        {g.toggle && (
          <span onClick={(e) => e.stopPropagation()}>
            <Switch checked={toggleOn} onChange={(_, d) => set(g.toggle!, d.checked)} />
          </span>
        )}
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px 26px', display: 'flex', flexDirection: 'column', gap: 10, opacity: toggleOn ? 1 : 0.5 }}>
          {g.props
            .filter((p) => p.key !== g.toggle)
            .map((p) => (
              <div key={p.key}>
                <div style={{ fontSize: 12, color: 'var(--ab-text-2)', marginBottom: 4 }}>{p.label}</div>
                <PropControl p={p} value={get(p.key)} onChange={(v) => set(p.key, v)} />
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

export function FormatPane({ visual, page }: { visual: VisualDef | null; page: PageDef | null }) {
  if (!page) return <Empty>Nenhuma página.</Empty>
  if (!visual) return <PageFormat page={page} />
  const def = visualDef(visual.type)
  if (!def) return null
  const get = (group: string) => (key: string) => fmt(visual, group, key)
  const set = (group: string) => (key: string, value: unknown) =>
    updateVisual(
      page.id,
      visual.id,
      'Formatar visual',
      (v) => {
        v.format[group] = { ...(v.format[group] ?? {}), [key]: value }
      },
      `fmt:${visual.id}:${group}:${key}`
    )
  return (
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
      <div style={{ padding: '8px 12px', fontWeight: 600 }}>{def.name}</div>
      {def.format.map((g) => (
        <GroupView key={g.key} g={g} get={get(g.key)} set={set(g.key)} />
      ))}
      <PositionGroup visual={visual} page={page} />
      <div style={{ padding: 12 }}>
        <Button size="small" icon={<ArrowReset20Regular />} onClick={() => updateVisual(page.id, visual.id, 'Redefinir formatação', (v) => void (v.format = {}))}>
          Redefinir para o padrão
        </Button>
      </div>
    </div>
  )
}

function PositionGroup({ visual, page }: { visual: VisualDef; page: PageDef }) {
  const [open, setOpen] = useState(false)
  const field = (key: 'x' | 'y' | 'w' | 'h', label: string) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, color: 'var(--ab-text-2)', marginBottom: 4 }}>{label}</div>
      <Input
        size="small"
        type="number"
        value={String(Math.round(visual[key]))}
        onChange={(_, d) => {
          const n = Number(d.value)
          if (!Number.isFinite(n)) return
          updateVisual(page.id, visual.id, 'Posição', (v) => void (v[key] = Math.max(key === 'w' || key === 'h' ? 20 : 0, n)), `pos:${visual.id}:${key}`)
        }}
        style={{ width: '100%' }}
      />
    </div>
  )
  return (
    <div style={{ borderBottom: '1px solid var(--ab-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 8px', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown12Regular /> : <ChevronRight12Regular />}
        <span style={{ flex: 1, marginLeft: 6, fontWeight: 600, fontSize: 13 }}>Propriedades (tamanho e posição)</span>
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px 26px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {field('x', 'Horizontal')}
            {field('y', 'Vertical')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {field('w', 'Largura')}
            {field('h', 'Altura')}
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <input type="checkbox" checked={!!visual.locked} onChange={(e) => updateVisual(page.id, visual.id, 'Bloquear', (v) => void (v.locked = e.target.checked))} />
            Bloquear posição
          </label>
        </div>
      )}
    </div>
  )
}

function PageFormat({ page }: { page: PageDef }) {
  const sizeKey = Object.entries(PAGE_SIZES).find(([, s]) => s.w === page.width && s.h === page.height)?.[0] ?? 'custom'
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontWeight: 600 }}>Página</div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--ab-text-2)', marginBottom: 4 }}>Nome</div>
        <Input size="small" defaultValue={page.name} key={page.id} onBlur={(e) => renamePage(page.id, e.target.value)} style={{ width: '100%' }} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--ab-text-2)', marginBottom: 4 }}>Tamanho da tela</div>
        <Dropdown
          size="small"
          value={sizeKey === 'custom' ? 'Personalizado' : PAGE_SIZES[sizeKey].label}
          selectedOptions={[sizeKey]}
          onOptionSelect={(_, d) => {
            const s = PAGE_SIZES[d.optionValue as string]
            if (s) setPageProps(page.id, { width: s.w, height: s.h })
          }}
          style={{ width: '100%', minWidth: 0 }}
        >
          {Object.entries(PAGE_SIZES).map(([k, s]) => (
            <Option key={k} value={k}>
              {s.label}
            </Option>
          ))}
          <Option value="custom">Personalizado</Option>
        </Dropdown>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Input size="small" type="number" value={String(page.width)} onChange={(_, d) => Number(d.value) >= 200 && setPageProps(page.id, { width: Number(d.value) })} contentAfter={<span style={{ fontSize: 11 }}>L</span>} />
          <Input size="small" type="number" value={String(page.height)} onChange={(_, d) => Number(d.value) >= 150 && setPageProps(page.id, { height: Number(d.value) })} contentAfter={<span style={{ fontSize: 11 }}>A</span>} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--ab-text-2)', marginBottom: 4 }}>Cor da tela de fundo</div>
        <ColorInput value={page.background.color} allowAuto={false} onChange={(c) => setPageProps(page.id, { background: { ...page.background, color: c || '#ffffff' } })} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--ab-text-2)', marginBottom: 4 }}>Transparência da tela de fundo (%)</div>
        <Slider min={0} max={100} value={page.background.transparency} onChange={(_, d) => setPageProps(page.id, { background: { ...page.background, transparency: d.value } })} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--ab-text-2)', marginBottom: 4 }}>Exibição</div>
        <Dropdown
          size="small"
          value={page.display === 'fit' ? 'Ajustar à página' : page.display === 'fitWidth' ? 'Ajustar à largura' : 'Tamanho real'}
          selectedOptions={[page.display]}
          onOptionSelect={(_, d) => setPageProps(page.id, { display: d.optionValue as PageDef['display'] })}
          style={{ width: '100%', minWidth: 0 }}
        >
          <Option value="fit">Ajustar à página</Option>
          <Option value="fitWidth">Ajustar à largura</Option>
          <Option value="actual">Tamanho real</Option>
        </Dropdown>
      </div>
    </div>
  )
}
