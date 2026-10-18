// Editor de Consultas (estilo Power Query): etapas, transformações e visualização.
import { useEffect, useMemo, useState } from 'react'
import { Button, Dropdown, Option, Input, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Menu, MenuList, MenuItem, MenuPopover, MenuDivider, Field, Spinner } from '@fluentui/react-components'
import {
  CheckmarkCircle20Filled,
  Dismiss24Regular,
  Delete16Regular,
  ArrowSortDown16Regular,
  ArrowSortUp16Regular,
  TableDeleteColumn20Regular,
  TableDeleteRow20Regular,
  ArrowUp20Regular,
  Filter20Regular,
  TextNumberFormat20Regular,
  Table20Regular,
  Add16Regular
} from '@fluentui/react-icons'
import { DATA_TYPES, DATA_TYPE_LABEL, type DataType } from '@engine/data/types'
import type { QueryPreview, StepOp } from '@engine/query/types'
import { engine } from '../engine/client'
import { enqueue } from '../actions/model'
import { applyQueries } from '../actions/data'
import { useDoc, updateDoc, getDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { uid } from '../report/defaults'
import { PreviewGrid } from '../components/PreviewGrid'
import { Empty } from '../components/ui'
import { Logo } from '../components/Logo'

type ParamState =
  | { kind: 'keepTop' | 'removeTop'; count: string }
  | { kind: 'replace'; column: string; find: string; replace: string }
  | null

function stepName(op: StepOp): string {
  switch (op.op) {
    case 'promoteHeaders':
      return 'Cabeçalhos Promovidos'
    case 'demoteHeaders':
      return 'Cabeçalhos Rebaixados'
    case 'changeTypes':
      return 'Tipo Alterado'
    case 'removeColumns':
      return 'Colunas Removidas'
    case 'selectColumns':
      return 'Outras Colunas Removidas'
    case 'renameColumns':
      return 'Colunas Renomeadas'
    case 'sort':
      return 'Linhas Classificadas'
    case 'removeDuplicates':
      return 'Duplicatas Removidas'
    case 'keepRows':
      return 'Primeiras Linhas Mantidas'
    case 'removeRows':
      return op.mode === 'blank' ? 'Linhas em Branco Removidas' : 'Linhas Removidas'
    case 'replaceValues':
      return 'Valor Substituído'
    default:
      return 'Etapa'
  }
}

export function QueryEditorView() {
  const open = useUi((s) => s.queryEditor.open)
  const queryId = useUi((s) => s.queryEditor.queryId)
  const stepIndex = useUi((s) => s.queryEditor.stepIndex)
  const queries = useDoc((s) => s.doc.queries)
  const [preview, setPreview] = useState<QueryPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [selCol, setSelCol] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; column: string } | null>(null)
  const [renaming, setRenaming] = useState<{ column: string } | null>(null)
  const [param, setParam] = useState<ParamState>(null)

  const query = queries.find((q) => q.id === queryId) ?? queries[0] ?? null
  const stepsKey = query ? JSON.stringify(query.steps) : ''

  useEffect(() => {
    if (!open || !query) {
      setPreview(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void enqueue(() => engine.previewQuery(getDoc().queries, query.id, stepIndex, 500))
      .then((p) => {
        if (!cancelled) setPreview(p)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, queryId, stepIndex, stepsKey])

  const selColName = selCol !== null ? preview?.columns[selCol]?.name : undefined

  const addStep = (op: StepOp) => {
    if (!query) return
    const id = uid('st')
    updateDoc(stepName(op), (d) => {
      const q = d.queries.find((x) => x.id === query.id)
      if (q) q.steps.push({ id, name: stepName(op), op })
    })
    const q2 = getDoc().queries.find((x) => x.id === query.id)
    useUi.getState().set({ queryEditor: { open: true, queryId: query.id, stepIndex: (q2?.steps.length ?? 1) - 1 } })
  }

  const deleteStep = (i: number) => {
    if (!query) return
    updateDoc('Excluir etapa', (d) => {
      const q = d.queries.find((x) => x.id === query.id)
      if (q) q.steps.splice(i, 1)
    })
    const len = (getDoc().queries.find((x) => x.id === query.id)?.steps.length ?? 0)
    useUi.getState().set({ queryEditor: { open: true, queryId: query.id, stepIndex: Math.min(stepIndex, len - 1) } })
  }

  const renameStep = (i: number, name: string) => {
    if (!query || !name.trim()) return
    updateDoc('Renomear etapa', (d) => {
      const q = d.queries.find((x) => x.id === query.id)
      if (q && q.steps[i]) q.steps[i].name = name.trim()
    })
  }

  const selectStep = (i: number) => query && useUi.getState().set({ queryEditor: { open: true, queryId: query.id, stepIndex: i } })

  const changeType = (type: DataType) => selColName && addStep({ op: 'changeTypes', columns: [{ column: selColName, type }] })
  const removeColumn = () => selColName && addStep({ op: 'removeColumns', columns: [selColName] })
  const keepOnly = () => selColName && addStep({ op: 'selectColumns', columns: [selColName] })
  const sortCol = (desc: boolean) => selColName && addStep({ op: 'sort', keys: [{ column: selColName, desc }] })
  const dedup = () => addStep({ op: 'removeDuplicates', columns: selColName ? [selColName] : [] })
  const renameColumnCommit = (to: string) => {
    if (renaming && to.trim() && to !== renaming.column) addStep({ op: 'renameColumns', renames: [{ from: renaming.column, to: to.trim() }] })
    setRenaming(null)
  }

  const runParam = () => {
    if (!param) return
    if (param.kind === 'keepTop') addStep({ op: 'keepRows', mode: 'top', count: Math.max(1, Number(param.count) || 1) })
    else if (param.kind === 'removeTop') addStep({ op: 'removeRows', mode: 'top', count: Math.max(1, Number(param.count) || 1) })
    else if (param.kind === 'replace') addStep({ op: 'replaceValues', columns: [param.column], find: param.find, replace: param.replace, matchEntire: false })
    setParam(null)
  }

  const close = () => useUi.getState().set({ queryEditor: { open: false, queryId: null, stepIndex: -1 } })
  const closeAndApply = async () => {
    close()
    await applyQueries('all')
    useUi.getState().set({ view: 'report' })
  }

  const gridColumns = useMemo(() => (preview ? preview.columns.map((c) => ({ name: c.name, type: c.type })) : []), [preview])

  if (!open) return null

  const Tool = ({ icon, label, onClick, disabled }: { icon: React.ReactElement; label: string; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ab-ribbon-small"
      style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', border: 'none', borderRadius: 4, background: 'transparent', cursor: disabled ? 'default' : 'pointer', color: disabled ? 'var(--ab-text-3)' : 'var(--ab-text)', fontSize: 12, whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'flex', color: disabled ? 'var(--ab-text-3)' : 'var(--ab-accent-strong)' }}>{icon}</span>
      {label}
    </button>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'var(--ab-app-bg)', display: 'flex', flexDirection: 'column' }} className="ab-fade-in">
      {/* Cabeçalho */}
      <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: 'var(--ab-titlebar)', color: '#fff', flex: 'none' }}>
        <Logo size={20} />
        <span style={{ fontWeight: 600 }}>Editor de Consultas</span>
        <div style={{ flex: 1 }} />
        <Button appearance="primary" icon={<CheckmarkCircle20Filled />} onClick={() => void closeAndApply()}>
          Fechar e Aplicar
        </Button>
        <button onClick={close} aria-label="Fechar" style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex' }}>
          <Dismiss24Regular />
        </button>
      </div>

      {/* Barra de transformações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px', background: '#fff', borderBottom: '1px solid var(--ab-border)', flex: 'none', flexWrap: 'wrap' }}>
        <Tool icon={<ArrowUp20Regular />} label="Usar primeira linha como cabeçalho" onClick={() => addStep({ op: 'promoteHeaders' })} />
        <span style={{ width: 1, height: 20, background: 'var(--ab-border)', margin: '0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
          <TextNumberFormat20Regular style={{ color: selColName ? 'var(--ab-accent-strong)' : 'var(--ab-text-3)' }} />
          <Dropdown
            size="small"
            disabled={!selColName}
            placeholder="Tipo de dados"
            selectedOptions={[]}
            value=""
            style={{ minWidth: 150 }}
            onOptionSelect={(_, d) => d.optionValue && changeType(d.optionValue as DataType)}
          >
            {DATA_TYPES.filter((t) => t !== 'any').map((t) => (
              <Option key={t} value={t}>
                {DATA_TYPE_LABEL[t]}
              </Option>
            ))}
          </Dropdown>
        </div>
        <span style={{ width: 1, height: 20, background: 'var(--ab-border)', margin: '0 4px' }} />
        <Tool icon={<TableDeleteColumn20Regular />} label="Remover coluna" onClick={removeColumn} disabled={!selColName} />
        <Tool icon={<Table20Regular />} label="Manter só esta coluna" onClick={keepOnly} disabled={!selColName} />
        <Tool icon={<ArrowSortUp16Regular />} label="Crescente" onClick={() => sortCol(false)} disabled={!selColName} />
        <Tool icon={<ArrowSortDown16Regular />} label="Decrescente" onClick={() => sortCol(true)} disabled={!selColName} />
        <Tool icon={<Filter20Regular />} label="Substituir valores" onClick={() => selColName && setParam({ kind: 'replace', column: selColName, find: '', replace: '' })} disabled={!selColName} />
        <span style={{ width: 1, height: 20, background: 'var(--ab-border)', margin: '0 4px' }} />
        <Tool icon={<TableDeleteRow20Regular />} label="Remover duplicatas" onClick={dedup} />
        <Tool icon={<TableDeleteRow20Regular />} label="Remover linhas em branco" onClick={() => addStep({ op: 'removeRows', mode: 'blank' })} />
        <Tool icon={<Table20Regular />} label="Manter primeiras linhas" onClick={() => setParam({ kind: 'keepTop', count: '100' })} />
        <Tool icon={<Table20Regular />} label="Remover primeiras linhas" onClick={() => setParam({ kind: 'removeTop', count: '1' })} />
      </div>

      {/* Corpo: consultas | grade | etapas */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Consultas */}
        <div style={{ width: 230, flex: 'none', borderRight: '1px solid var(--ab-border)', background: '#fff', overflow: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ab-text-3)', padding: '8px 12px 4px' }}>CONSULTAS [{queries.length}]</div>
          {queries.map((q) => (
            <button
              key={q.id}
              onClick={() => useUi.getState().set({ queryEditor: { open: true, queryId: q.id, stepIndex: q.steps.length - 1 } })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 12px',
                border: 'none',
                borderLeft: q.id === query?.id ? '3px solid var(--ab-accent)' : '3px solid transparent',
                background: q.id === query?.id ? 'var(--ab-selected)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--ab-text)'
              }}
            >
              <Table20Regular style={{ color: 'var(--ab-accent-strong)', flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: q.id === query?.id ? 600 : 400 }}>{q.name}</span>
            </button>
          ))}
        </div>

        {/* Grade + fórmula */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderBottom: '1px solid var(--ab-border)', fontSize: 12, fontFamily: 'Consolas, monospace', color: 'var(--ab-text-2)', minHeight: 28 }}>
            <span style={{ color: 'var(--ab-accent-strong)', fontWeight: 700 }}>fx</span>
            <span className="ab-selectable" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview?.formula}</span>
            {loading && <Spinner size="extra-tiny" />}
          </div>
          {preview?.error ? (
            <div className="ab-selectable" style={{ padding: 16, color: 'var(--ab-danger)', fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {preview.error}
            </div>
          ) : query ? (
            <PreviewGrid
              columns={gridColumns}
              rows={preview?.rows ?? []}
              rowCount={preview?.rowCount}
              selectedColumn={selCol}
              onColumnClick={(i) => setSelCol(i === selCol ? null : i)}
              onHeaderContextMenu={(i, e) => {
                setSelCol(i)
                setMenu({ x: e.clientX, y: e.clientY, column: preview!.columns[i].name })
              }}
            />
          ) : (
            <Empty>Nenhuma consulta. Feche o editor e use "Obter dados".</Empty>
          )}
          {preview && !preview.error && (
            <div style={{ height: 22, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', fontSize: 11, color: 'var(--ab-text-2)', borderTop: '1px solid var(--ab-border)' }}>
              <span>{preview.columns.length} coluna(s), {preview.rowCount.toLocaleString('pt-BR')} linha(s)</span>
            </div>
          )}
        </div>

        {/* Propriedades + etapas */}
        <div style={{ width: 260, flex: 'none', borderLeft: '1px solid var(--ab-border)', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--ab-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ab-text-3)', marginBottom: 4 }}>PROPRIEDADES</div>
            <Field label="Nome">
              <Input
                size="small"
                value={query?.name ?? ''}
                onChange={(_, d) =>
                  query &&
                  updateDoc('Renomear consulta', (dd) => {
                    const q = dd.queries.find((x) => x.id === query.id)
                    if (q) q.name = d.value
                  })
                }
              />
            </Field>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ab-text-3)', padding: '8px 12px 4px' }}>ETAPAS APLICADAS</div>
          <div style={{ flex: 1, overflow: 'auto', paddingBottom: 12 }}>
            <StepItem label="Origem" active={stepIndex < 0} onClick={() => selectStep(-1)} />
            {(query?.steps ?? []).map((s, i) => (
              <StepItem
                key={s.id}
                label={s.name}
                active={stepIndex === i}
                onClick={() => selectStep(i)}
                onDelete={() => deleteStep(i)}
                onRename={(name) => renameStep(i, name)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Menu de contexto do cabeçalho */}
      {menu && (
        <Menu open onOpenChange={(_, d) => !d.open && setMenu(null)} positioning={{ target: virtualTarget(menu.x, menu.y) }}>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<Add16Regular />} onClick={() => setRenaming({ column: menu.column })}>
                Renomear
              </MenuItem>
              <MenuItem icon={<TableDeleteColumn20Regular />} onClick={removeColumn}>
                Remover
              </MenuItem>
              <MenuItem onClick={keepOnly}>Remover outras colunas</MenuItem>
              <MenuDivider />
              <MenuItem icon={<ArrowSortUp16Regular />} onClick={() => sortCol(false)}>
                Classificar crescente
              </MenuItem>
              <MenuItem icon={<ArrowSortDown16Regular />} onClick={() => sortCol(true)}>
                Classificar decrescente
              </MenuItem>
              <MenuDivider />
              <MenuItem icon={<Filter20Regular />} onClick={() => setParam({ kind: 'replace', column: menu.column, find: '', replace: '' })}>
                Substituir valores
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      )}

      {/* Renomear coluna */}
      {renaming && (
        <Dialog open onOpenChange={(_, d) => !d.open && setRenaming(null)}>
          <DialogSurface style={{ maxWidth: 420 }}>
            <DialogBody>
              <DialogTitle>Renomear coluna</DialogTitle>
              <DialogContent>
                <Input
                  autoFocus
                  defaultValue={renaming.column}
                  style={{ width: '100%' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameColumnCommit((e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  id="ab-rename-col"
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setRenaming(null)}>Cancelar</Button>
                <Button appearance="primary" onClick={() => renameColumnCommit((document.getElementById('ab-rename-col') as HTMLInputElement)?.value ?? '')}>
                  OK
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}

      {/* Parâmetros (manter/remover linhas, substituir) */}
      {param && (
        <Dialog open onOpenChange={(_, d) => !d.open && setParam(null)}>
          <DialogSurface style={{ maxWidth: 420 }}>
            <DialogBody>
              <DialogTitle>{param.kind === 'replace' ? 'Substituir valores' : param.kind === 'keepTop' ? 'Manter primeiras linhas' : 'Remover primeiras linhas'}</DialogTitle>
              <DialogContent>
                {param.kind === 'replace' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Field label="Valor a localizar">
                      <Input value={param.find} onChange={(_, d) => setParam({ ...param, find: d.value })} />
                    </Field>
                    <Field label="Substituir por">
                      <Input value={param.replace} onChange={(_, d) => setParam({ ...param, replace: d.value })} />
                    </Field>
                  </div>
                ) : (
                  <Field label="Número de linhas">
                    <Input type="number" value={param.count} onChange={(_, d) => setParam({ ...param, count: d.value })} />
                  </Field>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setParam(null)}>Cancelar</Button>
                <Button appearance="primary" onClick={runParam}>
                  OK
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  )
}

function StepItem({ label, active, onClick, onDelete, onRename }: { label: string; active: boolean; onClick: () => void; onDelete?: () => void; onRename?: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  return (
    <div
      onClick={onClick}
      onDoubleClick={() => onRename && setEditing(true)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderLeft: active ? '3px solid var(--ab-accent)' : '3px solid transparent',
        background: active ? 'var(--ab-selected)' : 'transparent',
        cursor: 'pointer',
        fontSize: 13
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--ab-text-3)', flex: 'none' }} />
      {editing ? (
        <Input
          size="small"
          autoFocus
          defaultValue={label}
          style={{ flex: 1 }}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            onRename?.(e.target.value)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      )}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Excluir etapa"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ab-text-3)', display: 'flex', flex: 'none' }}
        >
          <Delete16Regular />
        </button>
      )}
    </div>
  )
}

function virtualTarget(x: number, y: number) {
  return {
    getBoundingClientRect: () => ({ x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect
  }
}
