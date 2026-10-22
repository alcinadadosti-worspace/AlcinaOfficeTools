// Painel "Dados": tabelas, colunas, medidas e hierarquias do modelo.
import { useMemo, useState } from 'react'
import { Input, Checkbox, Tooltip } from '@fluentui/react-components'
import {
  Search16Regular,
  Table16Regular,
  TableLightning16Regular,
  ChevronRight12Regular,
  ChevronDown12Regular,
  Calculator16Regular,
  Calendar16Regular,
  NumberSymbol16Regular,
  TextCaseTitle16Regular,
  ToggleLeft16Regular,
  Clock16Regular,
  Eye16Regular,
  EyeOff16Regular,
  Globe16Regular,
  Key16Regular,
  MathSymbols16Regular,
  Add16Regular,
  Organization16Regular,
  ChevronDoubleRight20Regular
} from '@fluentui/react-icons'
import type { ColumnDef, TableDef } from '@engine/model/types'
import { DATE_LEVELS, DATE_LEVEL_LABEL, type DatePartLevel } from '@engine/model/types'
import type { FieldRef } from '@engine/vq/types'
import { useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { PaneHeader, IconButton, Empty } from '../components/ui'
import { ContextMenu, type MenuEntry } from '../components/ContextMenu'
import { FIELD_MIME, type DraggedField } from '../views/report/ReportView'
import { activePage, addFilter, toggleFieldInSelected } from '../actions/report'
import { deleteColumn, deleteMeasure, deleteTable, renameColumn, renameTable, setColumnProps, setTableProps, updateMeasure } from '../actions/model'
import { editCalculated, editMeasure, newColumn, newMeasure, openQueryEditor } from '../actions/commands'
import { applyQueries } from '../actions/data'
import { sameField } from '../report/defaults'

function typeIcon(c: ColumnDef) {
  if (c.expression) return <TableLightning16Regular />
  if (c.dataCategory && c.dataCategory !== 'uncategorized' && c.dataCategory !== 'webUrl' && c.dataCategory !== 'imageUrl') return <Globe16Regular />
  switch (c.dataType) {
    case 'int':
    case 'number':
    case 'currency':
      return c.summarizeBy !== 'none' ? <MathSymbols16Regular /> : <NumberSymbol16Regular />
    case 'date':
    case 'datetime':
      return <Calendar16Regular />
    case 'time':
      return <Clock16Regular />
    case 'bool':
      return <ToggleLeft16Regular />
    default:
      return <TextCaseTitle16Regular />
  }
}

export function startFieldDrag(e: React.DragEvent, d: DraggedField): void {
  e.dataTransfer.setData(FIELD_MIME, JSON.stringify(d))
  e.dataTransfer.effectAllowed = 'copy'
}

function isNumeric(c: ColumnDef): boolean {
  return c.dataType === 'int' || c.dataType === 'number' || c.dataType === 'currency'
}

export function DataPane({ collapsedOnly = false }: { collapsedOnly?: boolean }) {
  const tables = useDoc((s) => s.doc.model.tables)
  const view = useUi((s) => s.view)
  const selectedIds = useUi((s) => s.selectedVisualIds)
  const pages = useDoc((s) => s.doc.report.pages)
  const fieldSel = useUi((s) => s.fieldSelection)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({})
  const [showHidden, setShowHidden] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null)
  const [renaming, setRenaming] = useState<{ table: string; column?: string; measure?: string } | null>(null)

  const selectedVisual = useMemo(() => {
    const p = pages.find((x) => x.id === useUi.getState().activePageId) ?? pages[0]
    return p?.visuals.find((v) => v.id === selectedIds[0])
  }, [pages, selectedIds])
  const used = (f: FieldRef) => !!selectedVisual && Object.values(selectedVisual.fields).some((list) => list.some((x) => sameField(x, f)))

  const q = search.trim().toLowerCase()
  const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  if (collapsedOnly) return null

  const tableMenu = (t: TableDef): MenuEntry[] => [
    { label: 'Nova medida', onClick: () => newMeasure(t.name) },
    { label: 'Nova coluna', onClick: () => newColumn(t.name) },
    { kind: 'divider' },
    { label: 'Atualizar dados', onClick: () => t.queryId && void applyQueries([t.queryId]), disabled: !t.queryId },
    { label: 'Editar consulta', onClick: () => openQueryEditor(t.queryId), disabled: !t.queryId },
    ...(t.expression ? [{ label: 'Editar expressão da tabela', onClick: () => editCalculated(t.name) }] : []),
    { kind: 'divider' },
    { label: 'Renomear', onClick: () => setRenaming({ table: t.name }) },
    { label: t.isHidden ? 'Reexibir' : 'Ocultar na exibição de relatório', onClick: () => setTableProps(t.name, { isHidden: !t.isHidden }) },
    { label: 'Excluir do modelo', onClick: () => deleteTable(t.name) },
    { kind: 'divider' },
    { label: 'Expandir tudo', onClick: () => setOpen(Object.fromEntries(tables.map((x) => [x.name, true]))) },
    { label: 'Recolher tudo', onClick: () => setOpen({}) }
  ]

  const filterTargets = (field: FieldRef): MenuEntry => {
    const page = activePage()
    const items: MenuEntry[] = []
    if (page && selectedVisual) items.push({ label: 'Filtros deste visual', onClick: () => addFilter({ level: 'visual', pageId: page.id, visualId: selectedVisual.id }, field) })
    if (page) items.push({ label: 'Filtros desta página', onClick: () => addFilter({ level: 'page', pageId: page.id }, field) })
    items.push({ label: 'Filtros em todas as páginas', onClick: () => addFilter({ level: 'report' }, field) })
    return { kind: 'submenu', label: 'Adicionar a filtros', items }
  }

  const columnMenu = (t: TableDef, c: ColumnDef): MenuEntry[] => [
    ...(c.expression ? [{ label: 'Editar fórmula', onClick: () => editCalculated(t.name, c.name) }] : []),
    filterTargets({ table: t.name, column: c.name }),
    { kind: 'divider' },
    { label: 'Nova medida', onClick: () => newMeasure(t.name) },
    { label: 'Nova coluna', onClick: () => newColumn(t.name) },
    { kind: 'divider' },
    { label: 'Renomear', onClick: () => setRenaming({ table: t.name, column: c.name }) },
    { label: c.isHidden ? 'Reexibir' : 'Ocultar', onClick: () => setColumnProps(t.name, c.name, { isHidden: !c.isHidden }) },
    { label: 'Excluir do modelo', onClick: () => deleteColumn(t.name, c.name) },
    ...((c.dataType === 'date' || c.dataType === 'datetime') && t.dateColumn !== c.name
      ? [{ label: 'Marcar como tabela de datas (esta coluna)', onClick: () => setTableProps(t.name, { dateColumn: c.name }) }]
      : [])
  ]

  const measureMenu = (t: TableDef, name: string): MenuEntry[] => [
    { label: 'Editar fórmula', onClick: () => editMeasure(t.name, name) },
    filterTargets({ table: t.name, measure: name }),
    { kind: 'divider' },
    { label: 'Renomear', onClick: () => setRenaming({ table: t.name, measure: name }) },
    { label: 'Excluir do modelo', onClick: () => deleteMeasure(t.name, name) }
  ]

  const rowStyle = (selected: boolean, depth: number): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingLeft: 6 + depth * 16,
    paddingRight: 6,
    cursor: 'pointer',
    background: selected ? 'var(--ab-selected)' : undefined,
    borderRadius: 4,
    whiteSpace: 'nowrap'
  })

  const renameInput = (current: string, commit: (v: string) => void) => (
    <Input
      size="small"
      autoFocus
      defaultValue={current}
      style={{ flex: 1, minWidth: 0 }}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        commit(e.target.value.trim())
        setRenaming(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setRenaming(null)
      }}
    />
  )

  const showCheck = view === 'report'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PaneHeader title="Dados">
        <IconButton icon={showHidden ? <Eye16Regular /> : <EyeOff16Regular />} title={showHidden ? 'Ocultar itens ocultos' : 'Mostrar itens ocultos'} onClick={() => setShowHidden(!showHidden)} />
        <IconButton icon={<ChevronDoubleRight20Regular />} title="Recolher painel" onClick={() => useUi.getState().set({ panes: { ...useUi.getState().panes, data: false } })} />
      </PaneHeader>
      <div style={{ padding: '8px 10px' }}>
        <Input size="small" contentBefore={<Search16Regular />} placeholder="Pesquisar" value={search} onChange={(_, d) => setSearch(d.value)} style={{ width: '100%' }} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 12px', fontSize: 13 }}>
        {tables.length === 0 && <Empty>Carregue dados para ver as tabelas aqui. Use "Obter dados" na Página Inicial.</Empty>}
        {sorted
          .filter((t) => showHidden || !t.isHidden)
          .map((t) => {
            const matchT = !q || t.name.toLowerCase().includes(q)
            const cols = t.columns.filter((c) => (showHidden || !c.isHidden) && (matchT || c.name.toLowerCase().includes(q)))
            const ms = t.measures.filter((m) => (showHidden || !m.isHidden) && (matchT || m.name.toLowerCase().includes(q)))
            if (!matchT && !cols.length && !ms.length) return null
            const isOpen = open[t.name] ?? (!!q || tables.length <= 3)
            const tSel = fieldSel?.table === t.name && !fieldSel.column && !fieldSel.measure
            return (
              <div key={t.name} style={{ opacity: t.isHidden ? 0.6 : 1 }}>
                <div
                  style={{ ...rowStyle(tSel, 0), fontWeight: 600 }}
                  onClick={() => {
                    setOpen({ ...open, [t.name]: !isOpen })
                    useUi.getState().set({ fieldSelection: { table: t.name } })
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, items: tableMenu(t) })
                  }}
                >
                  {isOpen ? <ChevronDown12Regular /> : <ChevronRight12Regular />}
                  {t.expression ? <TableLightning16Regular /> : <Table16Regular />}
                  {renaming?.table === t.name && !renaming.column && !renaming.measure ? (
                    renameInput(t.name, (v) => v && renameTable(t.name, v))
                  ) : (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                  )}
                  {t.dateColumn && (
                    <Tooltip content="Tabela de datas" relationship="label">
                      <Calendar16Regular style={{ color: 'var(--ab-accent)' }} />
                    </Tooltip>
                  )}
                </div>
                {isOpen && (
                  <div>
                    {ms
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                      .map((m) => {
                        const f: FieldRef = { table: t.name, measure: m.name }
                        const sel = fieldSel?.table === t.name && fieldSel.measure === m.name
                        return (
                          <div
                            key={'m:' + m.name}
                            draggable
                            onDragStart={(e) => startFieldDrag(e, { field: f, isNumeric: true, isDate: false })}
                            style={{ ...rowStyle(sel, 1), opacity: m.isHidden ? 0.55 : 1 }}
                            onClick={() => {
                              useUi.getState().set({ fieldSelection: { table: t.name, measure: m.name } })
                              editMeasure(t.name, m.name)
                            }}
                            onDoubleClick={() => setRenaming({ table: t.name, measure: m.name })}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              setMenu({ x: e.clientX, y: e.clientY, items: measureMenu(t, m.name) })
                            }}
                            title={m.description || m.expression}
                          >
                            {showCheck && (
                              <Checkbox size="medium" checked={used(f)} onClick={(e) => e.stopPropagation()} onChange={() => toggleFieldInSelected(f, true, false)} style={{ margin: '-6px -2px' }} />
                            )}
                            <Calculator16Regular style={{ color: 'var(--ab-accent-strong)' }} />
                            {renaming?.measure === m.name && renaming.table === t.name ? (
                              renameInput(m.name, (v) => v && v !== m.name && updateMeasure(t.name, m.name, { name: v }))
                            ) : (
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                            )}
                          </div>
                        )
                      })}
                    {cols.map((c) => {
                      const f: FieldRef = { table: t.name, column: c.name }
                      const isDate = c.dataType === 'date' || c.dataType === 'datetime'
                      const sel = fieldSel?.table === t.name && fieldSel.column === c.name
                      const dKey = `${t.name}|${c.name}`
                      const datesOpen = openDates[dKey]
                      return (
                        <div key={'c:' + c.name}>
                          <div
                            draggable
                            onDragStart={(e) => startFieldDrag(e, { field: f, isNumeric: isNumeric(c), isDate })}
                            style={{ ...rowStyle(sel, 1), opacity: c.isHidden ? 0.55 : 1 }}
                            onClick={() => {
                              useUi.getState().set({ fieldSelection: { table: t.name, column: c.name } })
                              if (c.expression) editCalculated(t.name, c.name)
                              else if (useUi.getState().formula) useUi.getState().set({ formula: null })
                            }}
                            onDoubleClick={() => setRenaming({ table: t.name, column: c.name })}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              setMenu({ x: e.clientX, y: e.clientY, items: columnMenu(t, c) })
                            }}
                            title={c.description || undefined}
                          >
                            {isDate ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenDates({ ...openDates, [dKey]: !datesOpen })
                                }}
                                style={{ display: 'flex', marginLeft: -14 }}
                              >
                                {datesOpen ? <ChevronDown12Regular /> : <ChevronRight12Regular />}
                              </span>
                            ) : null}
                            {showCheck && (
                              <Checkbox
                                size="medium"
                                checked={used(f) || (isDate && DATE_LEVELS.some((l) => used({ ...f, level: l })))}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => {
                                  // Datas entram com a hierarquia completa (Ano > Trimestre > Mês > Dia).
                                  if (isDate && !used(f)) {
                                    const anyLevel = DATE_LEVELS.some((l) => used({ ...f, level: l }))
                                    if (anyLevel) {
                                      for (const l of DATE_LEVELS) if (used({ ...f, level: l })) toggleFieldInSelected({ ...f, level: l }, false, false)
                                      return
                                    }
                                    const v = selectedVisual
                                    if (v && (v.type !== 'card' && v.type !== 'multiCard' && v.type !== 'table' && v.type !== 'slicer')) {
                                      for (const l of DATE_LEVELS) toggleFieldInSelected({ ...f, level: l }, false, false)
                                      return
                                    }
                                  }
                                  toggleFieldInSelected(f, isNumeric(c) && c.summarizeBy !== 'none', isDate)
                                }}
                                style={{ margin: '-6px -2px' }}
                              />
                            )}
                            <span style={{ display: 'flex', color: 'var(--ab-text-2)' }}>{typeIcon(c)}</span>
                            {renaming?.column === c.name && renaming.table === t.name ? (
                              renameInput(c.name, (v) => v && renameColumn(t.name, c.name, v))
                            ) : (
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                            )}
                            {t.dateColumn === c.name && <Key16Regular style={{ color: 'var(--ab-accent)' }} />}
                          </div>
                          {isDate && datesOpen && (
                            <div>
                              <div style={{ ...rowStyle(false, 2), color: 'var(--ab-text-2)' }}>
                                <Organization16Regular /> Hierarquia de datas
                              </div>
                              {DATE_LEVELS.map((l: DatePartLevel) => {
                                const lf: FieldRef = { table: t.name, column: c.name, level: l }
                                return (
                                  <div
                                    key={l}
                                    draggable
                                    onDragStart={(e) => startFieldDrag(e, { field: lf, isNumeric: false, isDate: false })}
                                    style={rowStyle(false, 3)}
                                  >
                                    {showCheck && <Checkbox size="medium" checked={used(lf)} onChange={() => toggleFieldInSelected(lf, false, false)} style={{ margin: '-6px -2px' }} />}
                                    <span>{DATE_LEVEL_LABEL[l]}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {!cols.length && !ms.length && <div style={{ ...rowStyle(false, 1), color: 'var(--ab-text-3)' }}>(sem campos)</div>}
                  </div>
                )}
              </div>
            )
          })}
        {tables.length > 0 && (
          <button
            onClick={() => newMeasure()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 6px', border: 'none', background: 'transparent', color: 'var(--ab-accent-strong)', cursor: 'pointer', fontSize: 12 }}
          >
            <Add16Regular /> Nova medida
          </button>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}
