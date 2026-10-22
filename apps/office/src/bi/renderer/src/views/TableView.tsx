// Exibição de tabela: grade completa de uma tabela do modelo (com ordenação).
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowSortDownLines16Regular, Table16Regular } from '@fluentui/react-icons'
import type { DataType } from '@engine/data/types'
import type { JsonScalar } from '@engine/query/types'
import { engine } from '../engine/client'
import { enqueue } from '../actions/model'
import { useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { PreviewGrid, type GridCell, type GridColumn } from '../components/PreviewGrid'
import { Empty } from '../components/ui'
import { formatValue } from '../util/fmt'

const PAGE = 200

interface ColMeta {
  name: string
  type: DataType
  format?: string
  isCalculated: boolean
}

function toCell(v: JsonScalar, c: ColMeta): GridCell {
  if (v === null) return null
  return formatValue(v, c.format, c.type)
}

export function TableView() {
  const tables = useDoc((s) => s.doc.model.tables)
  const modelVersion = useUi((s) => s.modelVersion)
  const modelInfo = useUi((s) => s.modelInfo)
  const dataView = useUi((s) => s.dataView)
  const active = dataView.table && tables.some((t) => t.name === dataView.table) ? dataView.table : (tables[0]?.name ?? null)
  const sort = dataView.sort

  const [cols, setCols] = useState<ColMeta[]>([])
  const [rows, setRows] = useState<GridCell[][]>([])
  const [rowCount, setRowCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Identidade da consulta atual: respostas de páginas antigas (tabela/ordenação/modelo diferentes) são descartadas.
  const reqKey = `${active}|${sort?.column ?? ''}|${sort?.desc ?? ''}|${modelVersion}`
  const keyRef = useRef(reqKey)
  keyRef.current = reqKey

  // Carrega a primeira página quando muda a tabela, a ordenação ou o modelo.
  useEffect(() => {
    if (!active) {
      setCols([])
      setRows([])
      setRowCount(0)
      return
    }
    let cancelled = false
    void enqueue(() => engine.tableData(active, 0, PAGE, sort))
      .then((res) => {
        if (cancelled) return
        setError(null)
        setCols(res.columns)
        setRows(res.rows.map((r) => r.map((v, i) => toCell(v, res.columns[i]))))
        setRowCount(res.rowCount)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [active, sort, modelVersion])

  const loadMore = (from: number) => {
    if (!active || from >= rowCount) return
    const at = keyRef.current
    void enqueue(() => engine.tableData(active, from, PAGE, sort)).then((res) => {
      if (keyRef.current !== at) return // tabela/ordenação/modelo mudaram: descarta a resposta obsoleta
      setRows((prev) => (prev.length === from ? [...prev, ...res.rows.map((r) => r.map((v, i) => toCell(v, res.columns[i])))] : prev))
    })
  }

  const gridColumns: GridColumn[] = useMemo(
    () =>
      cols.map((c) => ({
        name: c.name,
        type: c.type,
        header: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'space-between' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
            {sort?.column === c.name && <ArrowSortDownLines16Regular style={{ transform: sort.desc ? 'none' : 'scaleY(-1)', flex: 'none' }} />}
          </span>
        )
      })),
    [cols, sort]
  )

  const clickColumn = (index: number) => {
    const name = cols[index]?.name
    if (!name) return
    const desc = sort?.column === name ? !sort.desc : false
    useUi.getState().set({ dataView: { ...dataView, table: active ?? undefined, sort: { column: name, desc } } })
  }

  if (tables.length === 0) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: '#ffffff' }}>
        <Empty>Nenhuma tabela carregada. Use "Obter dados" para começar.</Empty>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, background: '#ffffff' }}>
      <div style={{ width: 220, flex: 'none', borderRight: '1px solid var(--ab-border)', overflow: 'auto', padding: '6px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ab-text-3)', padding: '4px 12px' }}>TABELAS</div>
        {[...tables]
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
          .map((t) => {
            const info = modelInfo?.tables.find((x) => x.name === t.name)
            const on = t.name === active
            return (
              <button
                key={t.name}
                onClick={() => useUi.getState().set({ dataView: { table: t.name } })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 12px',
                  border: 'none',
                  borderLeft: on ? '3px solid var(--ab-accent)' : '3px solid transparent',
                  background: on ? 'var(--ab-selected)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--ab-text)'
                }}
              >
                <Table16Regular style={{ color: 'var(--ab-accent-strong)', flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: on ? 600 : 400 }}>{t.name}</span>
                {info && <span style={{ fontSize: 10, color: 'var(--ab-text-3)' }}>{info.rowCount.toLocaleString('pt-BR')}</span>}
              </button>
            )
          })}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {error ? (
          <Empty>{error}</Empty>
        ) : (
          <PreviewGrid columns={gridColumns} rows={rows} rowCount={rowCount} onLoadMore={loadMore} selectedColumn={cols.findIndex((c) => c.name === sort?.column)} onColumnClick={clickColumn} />
        )}
      </div>
    </div>
  )
}
