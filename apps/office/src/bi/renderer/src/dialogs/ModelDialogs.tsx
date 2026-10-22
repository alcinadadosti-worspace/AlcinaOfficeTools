// Diálogos do modelo: relações e medidas rápidas.
import { useMemo, useState } from 'react'
import { Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Button, Dropdown, Option, Field, Switch, Input, MessageBar, MessageBarBody } from '@fluentui/react-components'
import type { Cardinality, CrossFilter, RelationshipDef } from '@engine/model/types'
import { useUi } from '../state/ui'
import { useDoc } from '../state/doc'
import { addMeasure, allMeasureNames, autoDetectRelationships, deleteRelationship, uniqueName, upsertRelationship } from '../actions/model'
import { uid } from '../report/defaults'

const close = () => useUi.getState().closeDialog()

const CARD_LABEL: Record<Cardinality, string> = {
  manyToOne: 'Muitos para um (*:1)',
  oneToOne: 'Um para um (1:1)',
  manyToMany: 'Muitos para muitos (*:*)'
}

export function RelationshipDialog(props: { id?: string; fromTable?: string; fromColumn?: string; toTable?: string; toColumn?: string }) {
  const tables = useDoc((s) => s.doc.model.tables)
  const rels = useDoc((s) => s.doc.model.relationships)
  const existing = rels.find((r) => r.id === props.id)
  const [r, setR] = useState<RelationshipDef>(
    existing ?? {
      id: uid('rel'),
      fromTable: props.fromTable ?? tables[0]?.name ?? '',
      fromColumn: props.fromColumn ?? '',
      toTable: props.toTable ?? tables[1]?.name ?? '',
      toColumn: props.toColumn ?? '',
      cardinality: 'manyToOne',
      crossFilter: 'single',
      active: true
    }
  )
  const cols = (t: string) => tables.find((x) => x.name === t)?.columns.map((c) => c.name) ?? []
  const valid = r.fromTable && r.toTable && r.fromColumn && r.toColumn && r.fromTable !== r.toTable
  const otherActive = rels.some(
    (x) => x.id !== r.id && x.active && ((x.fromTable === r.fromTable && x.toTable === r.toTable) || (x.fromTable === r.toTable && x.toTable === r.fromTable))
  )
  const tableSelect = (value: string, onChange: (v: string) => void) => (
    <Dropdown value={value} selectedOptions={[value]} onOptionSelect={(_, d) => onChange(d.optionValue as string)} style={{ minWidth: 0, width: '100%' }}>
      {tables.map((t) => (
        <Option key={t.name} value={t.name}>
          {t.name}
        </Option>
      ))}
    </Dropdown>
  )
  const colSelect = (table: string, value: string, onChange: (v: string) => void) => (
    <Dropdown value={value} placeholder="Selecione a coluna" selectedOptions={[value]} onOptionSelect={(_, d) => onChange(d.optionValue as string)} style={{ minWidth: 0, width: '100%' }}>
      {cols(table).map((c) => (
        <Option key={c} value={c}>
          {c}
        </Option>
      ))}
    </Dropdown>
  )
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 640 }}>
        <DialogBody>
          <DialogTitle>{existing ? 'Editar relação' : 'Nova relação'}</DialogTitle>
          <DialogContent>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Tabela (lado muitos)">{tableSelect(r.fromTable, (v) => setR({ ...r, fromTable: v, fromColumn: '' }))}</Field>
              <Field label="Coluna">{colSelect(r.fromTable, r.fromColumn, (v) => setR({ ...r, fromColumn: v, toColumn: r.toColumn || (cols(r.toTable).includes(v) ? v : '') }))}</Field>
              <Field label="Tabela (lado um)">{tableSelect(r.toTable, (v) => setR({ ...r, toTable: v, toColumn: cols(v).includes(r.fromColumn) ? r.fromColumn : '' }))}</Field>
              <Field label="Coluna">{colSelect(r.toTable, r.toColumn, (v) => setR({ ...r, toColumn: v }))}</Field>
              <Field label="Cardinalidade">
                <Dropdown value={CARD_LABEL[r.cardinality]} selectedOptions={[r.cardinality]} onOptionSelect={(_, d) => setR({ ...r, cardinality: d.optionValue as Cardinality, crossFilter: d.optionValue === 'oneToOne' ? 'both' : r.crossFilter })}>
                  {(Object.keys(CARD_LABEL) as Cardinality[]).map((c) => (
                    <Option key={c} value={c}>
                      {CARD_LABEL[c]}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Direção do filtro cruzado">
                <Dropdown value={r.crossFilter === 'both' ? 'Ambas' : 'Única'} selectedOptions={[r.crossFilter]} onOptionSelect={(_, d) => setR({ ...r, crossFilter: d.optionValue as CrossFilter })}>
                  <Option value="single">Única</Option>
                  <Option value="both">Ambas</Option>
                </Dropdown>
              </Field>
            </div>
            <Switch style={{ marginTop: 12 }} checked={r.active} label="Tornar esta relação ativa" onChange={(_, d) => setR({ ...r, active: d.checked })} />
            {r.active && otherActive && (
              <MessageBar intent="warning" style={{ marginTop: 8 }}>
                <MessageBarBody>Já existe uma relação ativa entre essas tabelas; ela será desativada.</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              disabled={!valid}
              onClick={() => {
                upsertRelationship(r)
                close()
              }}
            >
              OK
            </Button>
            <Button onClick={close}>Cancelar</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function ManageRelationshipsDialog() {
  const rels = useDoc((s) => s.doc.model.relationships)
  const [sel, setSel] = useState<string | null>(null)
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 820, width: '86vw' }}>
        <DialogBody>
          <DialogTitle>Gerenciar relações</DialogTitle>
          <DialogContent>
            <div style={{ border: '1px solid var(--ab-border)', borderRadius: 4, maxHeight: 360, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#faf9f8', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Ativa</th>
                    <th style={{ padding: 8 }}>De: tabela (coluna)</th>
                    <th style={{ padding: 8 }}>Para: tabela (coluna)</th>
                    <th style={{ padding: 8 }}>Cardinalidade</th>
                    <th style={{ padding: 8 }}>Filtro</th>
                  </tr>
                </thead>
                <tbody>
                  {rels.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSel(r.id)}
                      onDoubleClick={() => useUi.getState().openDialog({ kind: 'relationship', id: r.id })}
                      style={{ background: sel === r.id ? 'var(--ab-selected)' : undefined, cursor: 'pointer', borderTop: '1px solid var(--ab-grid-line)' }}
                    >
                      <td style={{ padding: 8 }}>{r.active ? '✓' : ''}</td>
                      <td style={{ padding: 8 }}>
                        {r.fromTable} ({r.fromColumn})
                      </td>
                      <td style={{ padding: 8 }}>
                        {r.toTable} ({r.toColumn})
                      </td>
                      <td style={{ padding: 8 }}>{CARD_LABEL[r.cardinality]}</td>
                      <td style={{ padding: 8 }}>{r.crossFilter === 'both' ? 'Ambas' : 'Única'}</td>
                    </tr>
                  ))}
                  {!rels.length && (
                    <tr>
                      <td colSpan={5} style={{ padding: 16, color: 'var(--ab-text-3)', textAlign: 'center' }}>
                        Nenhuma relação definida.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => useUi.getState().openDialog({ kind: 'relationship' })}>Novo...</Button>
            <Button
              onClick={async () => {
                const n = await autoDetectRelationships()
                useUi.getState().toast({ intent: 'info', title: n ? `${n} relação(ões) detectada(s).` : 'Nenhuma nova relação encontrada.' })
              }}
            >
              Detecção automática...
            </Button>
            <Button disabled={!sel} onClick={() => sel && useUi.getState().openDialog({ kind: 'relationship', id: sel })}>
              Editar...
            </Button>
            <Button disabled={!sel} onClick={() => sel && deleteRelationship(sel)}>
              Excluir
            </Button>
            <Button appearance="primary" onClick={close}>
              Fechar
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Medidas rápidas
// ---------------------------------------------------------------------------

type QuickKind = 'runningTotal' | 'ytd' | 'yoy' | 'pctTotal' | 'avgPerCategory' | 'rank' | 'movingAvg' | 'filtered'

const QUICK: { kind: QuickKind; label: string; needs: ('base' | 'date' | 'category' | 'value')[] }[] = [
  { kind: 'pctTotal', label: '% do total geral', needs: ['base'] },
  { kind: 'runningTotal', label: 'Total acumulado', needs: ['base', 'date'] },
  { kind: 'ytd', label: 'Total no ano até a data (YTD)', needs: ['base', 'date'] },
  { kind: 'yoy', label: 'Variação ano a ano (%)', needs: ['base', 'date'] },
  { kind: 'movingAvg', label: 'Média móvel (3 meses)', needs: ['base', 'date'] },
  { kind: 'avgPerCategory', label: 'Média por categoria', needs: ['base', 'category'] },
  { kind: 'rank', label: 'Classificação (ranking)', needs: ['base', 'category'] },
  { kind: 'filtered', label: 'Valor filtrado', needs: ['base', 'category', 'value'] }
]

function q(t: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(t) ? t : `'${t.replace(/'/g, "''")}'`
}

export function QuickMeasureDialog({ table }: { table: string }) {
  const tables = useDoc((s) => s.doc.model.tables)
  const doc = useDoc((s) => s.doc)
  const [kind, setKind] = useState<QuickKind>('pctTotal')
  const [base, setBase] = useState('')
  const [date, setDate] = useState('')
  const [cat, setCat] = useState('')
  const [value, setValue] = useState('')
  const [target, setTarget] = useState(table || tables[0]?.name || '')
  const bases = useMemo(() => {
    const out: { key: string; label: string; expr: string }[] = []
    for (const t of tables) {
      for (const m of t.measures) out.push({ key: `m:${m.name}`, label: `[${m.name}]`, expr: `[${m.name}]` })
      for (const c of t.columns) if (c.dataType === 'int' || c.dataType === 'number' || c.dataType === 'currency') out.push({ key: `c:${t.name}:${c.name}`, label: `Soma de ${t.name}[${c.name}]`, expr: `SUM(${q(t.name)}[${c.name}])` })
    }
    return out
  }, [tables])
  const dates = tables.flatMap((t) => t.columns.filter((c) => c.dataType === 'date' || c.dataType === 'datetime').map((c) => ({ key: `${q(t.name)}[${c.name}]`, label: `${t.name}[${c.name}]` })))
  const cats = tables.flatMap((t) => t.columns.map((c) => ({ key: `${q(t.name)}[${c.name}]`, label: `${t.name}[${c.name}]` })))
  const def = QUICK.find((x) => x.kind === kind)!
  const b = bases.find((x) => x.key === base)
  const ready = !!b && (!def.needs.includes('date') || !!date) && (!def.needs.includes('category') || !!cat) && (!def.needs.includes('value') || value !== '')
  const baseName = b?.label.replace(/^\[|\]$/g, '') ?? ''
  const build = (): { name: string; expr: string; format?: string } | null => {
    if (!b) return null
    const B = b.expr
    switch (kind) {
      case 'pctTotal':
        return { name: `${baseName} % do total`, expr: `DIVIDE(${B}, CALCULATE(${B}, ALLSELECTED()))`, format: '0.00%' }
      case 'runningTotal':
        return { name: `${baseName} acumulado`, expr: `CALCULATE(\n    ${B},\n    FILTER(ALLSELECTED(${date}), ${date} <= MAX(${date}))\n)` }
      case 'ytd':
        return { name: `${baseName} YTD`, expr: `TOTALYTD(${B}, ${date})` }
      case 'yoy':
        return {
          name: `${baseName} variação % A/A`,
          expr: `VAR __atual = ${B}\nVAR __anterior = CALCULATE(${B}, DATEADD(${date}, -1, YEAR))\nRETURN DIVIDE(__atual - __anterior, __anterior)`,
          format: '0.0%'
        }
      case 'movingAvg':
        return { name: `${baseName} média móvel 3M`, expr: `AVERAGEX(\n    DATESINPERIOD(${date}, MAX(${date}), -3, MONTH),\n    CALCULATE(${B})\n)` }
      case 'avgPerCategory':
        return { name: `${baseName} média por ${cat.replace(/.*\[|\]/g, '')}`, expr: `AVERAGEX(KEEPFILTERS(VALUES(${cat})), CALCULATE(${B}))` }
      case 'rank':
        return { name: `Ranking de ${cat.replace(/.*\[|\]/g, '')}`, expr: `IF(HASONEVALUE(${cat}), RANKX(ALLSELECTED(${cat}), ${B}))`, format: '0' }
      case 'filtered': {
        const lit = isNaN(Number(value)) ? `"${value.replace(/"/g, '""')}"` : value
        return { name: `${baseName} para ${value}`, expr: `CALCULATE(${B}, ${cat} = ${lit})` }
      }
    }
  }
  const out = build()
  const pick = (label: string, items: { key: string; label: string }[], val: string, set: (v: string) => void) => (
    <Field label={label}>
      <Dropdown value={items.find((x) => x.key === val)?.label ?? ''} placeholder="Selecione" selectedOptions={[val]} onOptionSelect={(_, d) => set(d.optionValue as string)} style={{ minWidth: 0 }}>
        {items.map((x) => (
          <Option key={x.key} value={x.key}>
            {x.label}
          </Option>
        ))}
      </Dropdown>
    </Field>
  )
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 720 }}>
        <DialogBody>
          <DialogTitle>Medida rápida</DialogTitle>
          <DialogContent>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Cálculo">
                <Dropdown value={def.label} selectedOptions={[kind]} onOptionSelect={(_, d) => setKind(d.optionValue as QuickKind)} style={{ minWidth: 0 }}>
                  {QUICK.map((x) => (
                    <Option key={x.kind} value={x.kind}>
                      {x.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              {pick('Valor base', bases, base, setBase)}
              {def.needs.includes('date') && pick('Data', dates, date, setDate)}
              {def.needs.includes('category') && pick('Categoria', cats, cat, setCat)}
              {def.needs.includes('value') && (
                <Field label="Item">
                  <Input value={value} onChange={(_, d) => setValue(d.value)} />
                </Field>
              )}
              <Field label="Salvar na tabela">
                <Dropdown value={target} selectedOptions={[target]} onOptionSelect={(_, d) => setTarget(d.optionValue as string)} style={{ minWidth: 0 }}>
                  {tables.map((t) => (
                    <Option key={t.name} value={t.name}>
                      {t.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>
            {out && ready && (
              <pre style={{ background: '#faf9f8', border: '1px solid var(--ab-border)', borderRadius: 4, padding: 10, marginTop: 12, fontSize: 12, whiteSpace: 'pre-wrap' }} className="ab-selectable">
                {`${out.name} =\n${out.expr}`}
              </pre>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              disabled={!ready || !out || !target}
              onClick={() => {
                if (!out) return
                addMeasure(target, { name: uniqueName(out.name, allMeasureNames(doc)), expression: out.expr, formatString: out.format })
                close()
              }}
            >
              OK
            </Button>
            <Button onClick={close}>Cancelar</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
