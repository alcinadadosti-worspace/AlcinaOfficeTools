// Exibição de consulta DAX: editor EVALUATE, execução e referência de funções.
import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Spinner } from '@fluentui/react-components'
import { Play20Filled, BookQuestionMark20Regular, Dismiss16Regular } from '@fluentui/react-icons'
import type { DaxQueryResult, FunctionInfo } from '@engine/service'
import { engine } from '../engine/client'
import { enqueue } from '../actions/model'
import { useDoc } from '../state/doc'
import { DaxEditor } from '../components/DaxEditor'
import { PreviewGrid, type GridColumn } from '../components/PreviewGrid'
import { Empty } from '../components/ui'
import { formatValue } from '../util/fmt'

const SAMPLE = `EVALUATE\n    TOPN(\n        100,\n        SUMMARIZECOLUMNS(\n            -- arraste colunas e medidas aqui\n        )\n    )`

export function DaxQueryView() {
  const hasModel = useDoc((s) => s.doc.model.tables.length > 0)
  const firstTable = useDoc((s) => s.doc.model.tables[0]?.name ?? null)
  const [text, setText] = useState(SAMPLE)
  const [result, setResult] = useState<DaxQueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [funcs, setFuncs] = useState<FunctionInfo[]>([])
  const [search, setSearch] = useState('')
  const [showRef, setShowRef] = useState(true)

  useEffect(() => {
    void enqueue(() => engine.functions()).then(setFuncs)
  }, [])

  const run = async () => {
    if (!text.trim() || running) return
    setRunning(true)
    try {
      const res = await enqueue(() => engine.daxQuery(text))
      setResult(res)
    } finally {
      setRunning(false)
    }
  }

  const gridColumns: GridColumn[] = useMemo(() => (result ? result.columns.map((c) => ({ name: c.name, type: c.type })) : []), [result])
  const gridRows = useMemo(() => (result ? result.rows.map((r) => r.map((v, i) => (v === null ? null : formatValue(v, undefined, result.columns[i].type)))) : []), [result])

  const filteredFuncs = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? funcs.filter((f) => f.name.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q)) : funcs
    const byCat = new Map<string, FunctionInfo[]>()
    for (const f of list) {
      const arr = byCat.get(f.category) ?? []
      arr.push(f)
      byCat.set(f.category, arr)
    }
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [funcs, search])

  if (!hasModel) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: '#ffffff' }}>
        <Empty>Carregue dados e crie um modelo para executar consultas DAX.</Empty>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, background: '#ffffff' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--ab-border)', flex: 'none' }}>
          <Button appearance="primary" icon={running ? <Spinner size="tiny" /> : <Play20Filled />} onClick={() => void run()} disabled={running}>
            Executar (Ctrl+Enter)
          </Button>
          <Button appearance="subtle" onClick={() => setText(firstTable ? `EVALUATE\n    ${firstTable}` : SAMPLE)}>
            Exemplo
          </Button>
          <div style={{ flex: 1 }} />
          {result && !result.error && (
            <span style={{ fontSize: 12, color: 'var(--ab-text-2)' }}>
              {result.rowCount.toLocaleString('pt-BR')} linha(s) · {Math.round(result.elapsedMs)} ms
            </span>
          )}
          <Button appearance="subtle" icon={<BookQuestionMark20Regular />} onClick={() => setShowRef((s) => !s)}>
            Funções
          </Button>
        </div>
        <div style={{ height: 220, flex: 'none', borderBottom: '1px solid var(--ab-border)', overflow: 'auto' }}>
          <DaxEditor value={text} onChange={setText} onSubmit={() => void run()} lineNumbers minHeight={220} maxHeight={220} placeholder="Digite uma consulta DAX: EVALUATE ..." />
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {result?.error ? (
            <div className="ab-selectable" style={{ padding: 16, color: 'var(--ab-danger)', fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {result.error}
            </div>
          ) : result ? (
            <PreviewGrid columns={gridColumns} rows={gridRows} rowCount={result.rowCount} />
          ) : (
            <Empty>Escreva uma consulta e clique em Executar.</Empty>
          )}
        </div>
      </div>
      {showRef && (
        <div style={{ width: 300, flex: 'none', borderLeft: '1px solid var(--ab-border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--ab-border)' }}>
            <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Referência DAX</span>
            <button onClick={() => setShowRef(false)} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ab-text-2)', display: 'flex' }}>
              <Dismiss16Regular />
            </button>
          </div>
          <div style={{ padding: 8 }}>
            <Input size="small" placeholder="Pesquisar função..." value={search} onChange={(_, d) => setSearch(d.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 4px 12px' }}>
            {filteredFuncs.map(([cat, list]) => (
              <div key={cat}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ab-text-3)', padding: '8px 8px 2px', textTransform: 'uppercase' }}>{cat}</div>
                {list.map((f) => (
                  <button
                    key={f.name}
                    title={`${f.sig}\n\n${f.desc}`}
                    onClick={() => setText((t) => `${t}${/\s$|^$/.test(t) ? '' : ' '}${f.name}(`)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '3px 8px', borderRadius: 4, color: 'var(--ab-text)' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--ab-hover)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Consolas, monospace' }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ab-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.desc}</div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
