// Diálogos de obtenção de dados: origem, CSV, Excel (navegador), JSON, Web, pasta e inserir dados.
import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Dropdown,
  Option,
  Spinner,
  Checkbox,
  Input,
  Field,
  MessageBar,
  MessageBarBody
} from '@fluentui/react-components'
import { DocumentTable24Regular, DocumentText24Regular, Braces24Regular, Folder24Regular, Globe24Regular, TableEdit24Regular, Database24Regular, Table16Regular } from '@fluentui/react-icons'
import type { CsvEncoding, QueryPreview, SourceDef, StepDef } from '@engine/query/types'
import { engine, EngineError } from '../engine/client'
import { enqueue } from '../actions/model'
import { addQueries, nameForSource, type NewQuery } from '../actions/data'
import { getData, type SourceKind } from '../actions/commands'
import { useUi } from '../state/ui'
import { PreviewGrid } from '../components/PreviewGrid'
import { DATA_TYPE_LABEL } from '@engine/data/types'

function close() {
  useUi.getState().closeDialog()
}

function errorText(e: unknown): string {
  return e instanceof EngineError || e instanceof Error ? e.message : String(e)
}

function PreviewPane({ preview, loading, error }: { preview: QueryPreview | null; loading: boolean; error?: string | null }) {
  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    )
  }
  if (loading || !preview) {
    return (
      <div style={{ height: 360, display: 'grid', placeItems: 'center' }}>
        <Spinner label="Lendo dados..." />
      </div>
    )
  }
  return (
    <div style={{ border: '1px solid var(--ab-border)', borderRadius: 4, overflow: 'hidden' }}>
      <PreviewGrid
        height={360}
        columns={preview.columns.map((c) => ({ name: c.name, type: c.type, header: <span title={DATA_TYPE_LABEL[c.type]}>{c.name}</span> }))}
        rows={preview.rows}
        rowCount={preview.rowCount}
        rowNumbers={false}
      />
      <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--ab-text-3)', borderTop: '1px solid var(--ab-border)' }}>
        {preview.rowCount.toLocaleString('pt-BR')} linhas · {preview.columns.length} colunas · tipos detectados automaticamente
      </div>
    </div>
  )
}

function useInspect(source: SourceDef | null, allowPromote?: boolean) {
  const [state, setState] = useState<{ preview: QueryPreview | null; steps: StepDef[]; loading: boolean; error: string | null }>({ preview: null, steps: [], loading: true, error: null })
  const key = JSON.stringify(source)
  useEffect(() => {
    if (!source) return
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    enqueue(() => engine.inspectSource(source, { maxRows: 200, allowPromote }))
      .then((r) => alive && setState({ preview: r.preview, steps: r.steps, loading: false, error: null }))
      .catch((e) => alive && setState({ preview: null, steps: [], loading: false, error: errorText(e) }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

function Actions({ onLoad, onTransform, disabled }: { onLoad: () => void; onTransform: () => void; disabled?: boolean }) {
  return (
    <DialogActions>
      <Button appearance="primary" onClick={onLoad} disabled={disabled}>
        Carregar
      </Button>
      <Button onClick={onTransform} disabled={disabled}>
        Transformar Dados
      </Button>
      <Button onClick={close}>Cancelar</Button>
    </DialogActions>
  )
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

// ---------------------------------------------------------------------------

export function GetDataDialog() {
  const items: { kind: SourceKind; label: string; desc: string; icon: JSX.Element }[] = [
    { kind: 'excel', label: 'Pasta de trabalho do Excel', desc: 'Arquivos .xlsx, .xlsm, .xls, .ods', icon: <DocumentTable24Regular /> },
    { kind: 'csv', label: 'Texto/CSV', desc: 'Arquivos delimitados (.csv, .txt)', icon: <DocumentText24Regular /> },
    { kind: 'json', label: 'JSON', desc: 'Arquivos JSON e JSON Lines', icon: <Braces24Regular /> },
    { kind: 'folder', label: 'Pasta', desc: 'Combina todos os arquivos de uma pasta', icon: <Folder24Regular /> },
    { kind: 'web', label: 'Web', desc: 'CSV ou JSON a partir de uma URL', icon: <Globe24Regular /> },
    { kind: 'database', label: 'Banco de dados', desc: 'PostgreSQL, MySQL e SQL Server', icon: <Database24Regular /> },
    { kind: 'enterData', label: 'Inserir dados', desc: 'Digite ou cole uma tabela', icon: <TableEdit24Regular /> }
  ]
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 640 }}>
        <DialogBody>
          <DialogTitle>Obter dados</DialogTitle>
          <DialogContent>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {items.map((it) => (
                <button
                  key={it.kind}
                  onClick={() => {
                    close()
                    void getData(it.kind)
                  }}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', padding: 12, border: '1px solid var(--ab-border)', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                >
                  <span style={{ color: 'var(--ab-accent)' }}>{it.icon}</span>
                  <span>
                    <div style={{ fontWeight: 600 }}>{it.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--ab-text-2)' }}>{it.desc}</div>
                  </span>
                </button>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Cancelar</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

const DELIMS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Detectar automaticamente' },
  { value: ',', label: 'Vírgula' },
  { value: ';', label: 'Ponto e vírgula' },
  { value: '\t', label: 'Tabulação' },
  { value: '|', label: 'Barra vertical' },
  { value: ' ', label: 'Espaço' }
]

const ENCODINGS: { value: CsvEncoding; label: string }[] = [
  { value: 'auto', label: 'Detectar automaticamente' },
  { value: 'utf-8', label: '65001: Unicode (UTF-8)' },
  { value: 'windows-1252', label: '1252: Europa Ocidental (Windows)' },
  { value: 'iso-8859-1', label: '28591: Europa Ocidental (ISO)' },
  { value: 'utf-16le', label: '1200: Unicode (UTF-16)' }
]

export function CsvDialog({ path }: { path: string }) {
  const [delimiter, setDelimiter] = useState('auto')
  const [encoding, setEncoding] = useState<CsvEncoding>('auto')
  const source = useMemo<SourceDef>(() => ({ kind: 'csv', path, delimiter, encoding }), [path, delimiter, encoding])
  const st = useInspect(source)
  const items = (): NewQuery[] => [{ name: nameForSource(source), source, steps: st.steps }]
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 980, width: '90vw' }}>
        <DialogBody>
          <DialogTitle>{fileName(path)}</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <Field label="Origem do arquivo" style={{ flex: 1 }}>
                <Dropdown value={ENCODINGS.find((e) => e.value === encoding)?.label} selectedOptions={[encoding]} onOptionSelect={(_, d) => setEncoding(d.optionValue as CsvEncoding)}>
                  {ENCODINGS.map((e) => (
                    <Option key={e.value} value={e.value}>
                      {e.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Delimitador" style={{ flex: 1 }}>
                <Dropdown value={DELIMS.find((e) => e.value === delimiter)?.label} selectedOptions={[delimiter]} onOptionSelect={(_, d) => setDelimiter(d.optionValue as string)}>
                  {DELIMS.map((e) => (
                    <Option key={e.label} value={e.value}>
                      {e.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>
            <PreviewPane preview={st.preview} loading={st.loading} error={st.error} />
          </DialogContent>
          <Actions
            disabled={st.loading || !!st.error}
            onLoad={() => {
              close()
              void addQueries(items(), 'load')
            }}
            onTransform={() => {
              close()
              void addQueries(items(), 'transform')
            }}
          />
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function ExcelDialog({ path }: { path: string }) {
  const [sheets, setSheets] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<string | null>(null)
  useEffect(() => {
    enqueue(() => engine.excelSheets(path))
      .then((s) => {
        setSheets(s)
        if (s.length) {
          setFocus(s[0])
          if (s.length === 1) setChecked(new Set(s))
        }
      })
      .catch((e) => setError(errorText(e)))
  }, [path])
  const source = useMemo<SourceDef | null>(() => (focus ? { kind: 'excel', path, sheet: focus } : null), [focus, path])
  const st = useInspect(source)
  const stepsCache = useMemo(() => new Map<string, StepDef[]>(), [])
  if (focus && st.steps.length) stepsCache.set(focus, st.steps)
  const build = async (): Promise<NewQuery[]> => {
    const out: NewQuery[] = []
    for (const sheet of checked) {
      const src: SourceDef = { kind: 'excel', path, sheet }
      let steps = stepsCache.get(sheet)
      if (!steps) steps = (await enqueue(() => engine.inspectSource(src, { maxRows: 5 }))).steps
      out.push({ name: sheet, source: src, steps })
    }
    return out
  }
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 1080, width: '92vw' }}>
        <DialogBody>
          <DialogTitle>Navegador — {fileName(path)}</DialogTitle>
          <DialogContent>
            {error ? (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            ) : (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 260, border: '1px solid var(--ab-border)', borderRadius: 4, padding: 6, maxHeight: 400, overflow: 'auto' }}>
                  {!sheets && <Spinner size="tiny" />}
                  {sheets?.map((s) => (
                    <div
                      key={s}
                      onClick={() => setFocus(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', borderRadius: 4, background: focus === s ? 'var(--ab-selected)' : undefined, cursor: 'pointer' }}
                    >
                      <Checkbox
                        checked={checked.has(s)}
                        onChange={(_, d) => {
                          const n = new Set(checked)
                          if (d.checked) n.add(s)
                          else n.delete(s)
                          setChecked(n)
                          setFocus(s)
                        }}
                      />
                      <Table16Regular />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>{focus ? <PreviewPane preview={st.preview} loading={st.loading} error={st.error} /> : null}</div>
              </div>
            )}
          </DialogContent>
          <Actions
            disabled={!checked.size}
            onLoad={async () => {
              const items = await build()
              close()
              void addQueries(items, 'load')
            }}
            onTransform={async () => {
              const items = await build()
              close()
              void addQueries(items, 'transform')
            }}
          />
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function JsonDialog({ path }: { path: string }) {
  const source = useMemo<SourceDef>(() => ({ kind: 'json', path }), [path])
  const st = useInspect(source, false)
  const items = (): NewQuery[] => [{ name: nameForSource(source), source, steps: st.steps }]
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 980, width: '90vw' }}>
        <DialogBody>
          <DialogTitle>{fileName(path)}</DialogTitle>
          <DialogContent>
            <PreviewPane preview={st.preview} loading={st.loading} error={st.error} />
          </DialogContent>
          <Actions
            disabled={st.loading || !!st.error}
            onLoad={() => {
              close()
              void addQueries(items(), 'load')
            }}
            onTransform={() => {
              close()
              void addQueries(items(), 'transform')
            }}
          />
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function WebDialog() {
  const [url, setUrl] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const source = useMemo<SourceDef | null>(() => (submitted ? { kind: 'web', url: submitted, format: 'auto' } : null), [submitted])
  const st = useInspect(source)
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 980, width: '90vw' }}>
        <DialogBody>
          <DialogTitle>Da Web</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
              <Field label="URL (arquivo CSV ou JSON)" style={{ flex: 1 }}>
                <Input value={url} placeholder="https://exemplo.com/dados.csv" onChange={(_, d) => setUrl(d.value)} onKeyDown={(e) => e.key === 'Enter' && setSubmitted(url.trim())} />
              </Field>
              <Button appearance="secondary" onClick={() => setSubmitted(url.trim())} disabled={!/^https?:\/\//i.test(url.trim())}>
                Visualizar
              </Button>
            </div>
            {submitted && <PreviewPane preview={st.preview} loading={st.loading} error={st.error} />}
          </DialogContent>
          <Actions
            disabled={!source || st.loading || !!st.error}
            onLoad={() => {
              close()
              if (source) void addQueries([{ name: nameForSource(source), source, steps: st.steps }], 'load')
            }}
            onTransform={() => {
              close()
              if (source) void addQueries([{ name: nameForSource(source), source, steps: st.steps }], 'transform')
            }}
          />
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function FolderDialog() {
  const [path, setPath] = useState('')
  const [ext, setExt] = useState('.csv')
  const [submitted, setSubmitted] = useState<SourceDef | null>(null)
  const st = useInspect(submitted, false)
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 980, width: '90vw' }}>
        <DialogBody>
          <DialogTitle>Pasta</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
              <Field label="Caminho da pasta" style={{ flex: 1 }}>
                <Input value={path} placeholder="C:\\Dados\\Vendas" onChange={(_, d) => setPath(d.value)} />
              </Field>
              <Field label="Extensão">
                <Dropdown value={ext} selectedOptions={[ext]} onOptionSelect={(_, d) => setExt(d.optionValue as string)} style={{ minWidth: 110 }}>
                  {['.csv', '.txt', '.xlsx', '.json'].map((e) => (
                    <Option key={e} value={e}>
                      {e}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Button onClick={() => setSubmitted({ kind: 'folder', path: path.trim(), extension: ext })} disabled={!path.trim()}>
                Combinar
              </Button>
            </div>
            {submitted && <PreviewPane preview={st.preview} loading={st.loading} error={st.error} />}
          </DialogContent>
          <Actions
            disabled={!submitted || st.loading || !!st.error}
            onLoad={() => {
              close()
              if (submitted) void addQueries([{ name: nameForSource(submitted), source: submitted, steps: st.steps }], 'load')
            }}
            onTransform={() => {
              close()
              if (submitted) void addQueries([{ name: nameForSource(submitted), source: submitted, steps: st.steps }], 'transform')
            }}
          />
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function EnterDataDialog() {
  const [name, setName] = useState('Tabela')
  const [cols, setCols] = useState<string[]>(['Coluna1', 'Coluna2'])
  const [rows, setRows] = useState<string[][]>([
    ['', ''],
    ['', '']
  ])
  const setCell = (r: number, c: number, v: string) => {
    const next = rows.map((x) => [...x])
    next[r][c] = v
    if (r === rows.length - 1 && v) next.push(cols.map(() => ''))
    setRows(next)
  }
  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.length)
    const grid = lines.map((l) => l.split('\t'))
    const width = Math.max(...grid.map((r) => r.length))
    const header = grid[0].every((x) => x && isNaN(Number(x.replace(',', '.'))))
    const newCols = header ? grid[0].map((x, i) => x || `Coluna${i + 1}`) : Array.from({ length: width }, (_, i) => `Coluna${i + 1}`)
    const body = (header ? grid.slice(1) : grid).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''))
    setCols(newCols)
    setRows([...body, newCols.map(() => '')])
  }
  const load = (mode: 'load' | 'transform') => {
    const data = rows.filter((r) => r.some((x) => x !== ''))
    const source: SourceDef = { kind: 'enterData', columns: cols.map((c) => ({ name: c, type: 'text' })), rows: data.map((r) => r.map((x) => (x === '' ? null : x))) }
    close()
    void (async () => {
      const steps = (await enqueue(() => engine.inspectSource(source, { allowPromote: false }))).steps
      await addQueries([{ name, source, steps }], mode)
    })()
  }
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 900, width: '88vw' }}>
        <DialogBody>
          <DialogTitle>Criar tabela</DialogTitle>
          <DialogContent>
            <div style={{ fontSize: 12, color: 'var(--ab-text-2)', marginBottom: 8 }}>Digite os valores ou cole (Ctrl+V) dados copiados do Excel.</div>
            <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid var(--ab-border)', borderRadius: 4 }} onPaste={onPaste}>
              <table style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 36, background: '#faf9f8' }} />
                    {cols.map((c, i) => (
                      <th key={i} style={{ padding: 0, background: '#faf9f8', borderRight: '1px solid var(--ab-border)' }}>
                        <input
                          value={c}
                          onChange={(e) => setCols(cols.map((x, k) => (k === i ? e.target.value : x)))}
                          style={{ border: 'none', background: 'transparent', fontWeight: 600, padding: '6px 8px', width: 140 }}
                        />
                      </th>
                    ))}
                    <th>
                      <Button
                        size="small"
                        appearance="subtle"
                        onClick={() => {
                          setCols([...cols, `Coluna${cols.length + 1}`])
                          setRows(rows.map((r) => [...r, '']))
                        }}
                      >
                        +
                      </Button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      <td style={{ textAlign: 'right', padding: '0 6px', color: 'var(--ab-text-3)', fontSize: 11, background: '#faf9f8' }}>{ri + 1}</td>
                      {r.map((v, ci) => (
                        <td key={ci} style={{ padding: 0, borderTop: '1px solid var(--ab-grid-line)', borderRight: '1px solid var(--ab-grid-line)' }}>
                          <input value={v} onChange={(e) => setCell(ri, ci, e.target.value)} style={{ border: 'none', padding: '4px 8px', width: 140 }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Field label="Nome" style={{ marginTop: 12, maxWidth: 320 }}>
              <Input value={name} onChange={(_, d) => setName(d.value)} />
            </Field>
          </DialogContent>
          <Actions onLoad={() => load('load')} onTransform={() => load('transform')} />
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function DatabaseDialog() {
  const [kind, setKind] = useState<'postgres' | 'mysql' | 'sqlserver'>('postgres')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('')
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [sql, setSql] = useState('')
  const [preview, setPreview] = useState<QueryPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connection = { kind, host, port: port ? Number(port) : undefined, database, user, password }
  const source: SourceDef = { kind: 'database', connection: { kind, host, port: port ? Number(port) : undefined, database, user }, sql }
  const test = async () => {
    setLoading(true)
    setError(null)
    try {
      const { setDbPassword } = await import('../engine/client')
      setDbPassword(connection, password)
      const r = await enqueue(() => engine.inspectSource(source, { allowPromote: false }))
      setPreview(r.preview)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 980, width: '90vw' }}>
        <DialogBody>
          <DialogTitle>Banco de dados</DialogTitle>
          <DialogContent>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8 }}>
              <Field label="Sistema">
                <Dropdown value={{ postgres: 'PostgreSQL', mysql: 'MySQL / MariaDB', sqlserver: 'SQL Server' }[kind]} selectedOptions={[kind]} onOptionSelect={(_, d) => setKind(d.optionValue as 'postgres')}>
                  <Option value="postgres">PostgreSQL</Option>
                  <Option value="mysql">MySQL / MariaDB</Option>
                  <Option value="sqlserver">SQL Server</Option>
                </Dropdown>
              </Field>
              <Field label="Servidor">
                <Input value={host} onChange={(_, d) => setHost(d.value)} />
              </Field>
              <Field label="Porta">
                <Input value={port} placeholder="padrão" onChange={(_, d) => setPort(d.value)} />
              </Field>
              <Field label="Banco de dados">
                <Input value={database} onChange={(_, d) => setDatabase(d.value)} />
              </Field>
              <Field label="Usuário">
                <Input value={user} onChange={(_, d) => setUser(d.value)} />
              </Field>
              <Field label="Senha (não é salva no arquivo)">
                <Input type="password" value={password} onChange={(_, d) => setPassword(d.value)} />
              </Field>
            </div>
            <Field label="Consulta SQL" style={{ marginTop: 8 }}>
              <textarea value={sql} onChange={(e) => setSql(e.target.value)} placeholder="SELECT * FROM vendas" style={{ width: '100%', height: 80, fontFamily: 'Consolas, monospace', fontSize: 13, padding: 8, border: '1px solid var(--ab-border-strong)', borderRadius: 4 }} />
            </Field>
            <div style={{ margin: '8px 0' }}>
              <Button onClick={test} disabled={!database || !sql.trim() || loading}>
                Visualizar
              </Button>
            </div>
            {(preview || loading || error) && <PreviewPane preview={preview} loading={loading} error={error} />}
          </DialogContent>
          <Actions
            disabled={!preview}
            onLoad={() => {
              close()
              void addQueries([{ name: database || 'Banco', source, steps: [] }], 'load')
            }}
            onTransform={() => {
              close()
              void addQueries([{ name: database || 'Banco', source, steps: [] }], 'transform')
            }}
          />
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
