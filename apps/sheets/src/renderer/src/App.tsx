// AlcinaSheets: planilha com grade, barra de fórmulas, abas e E/S de arquivos.
import { useEffect, useReducer, useState, type ReactNode } from 'react'
import { DocumentAdd24Regular, FolderOpen24Regular, Save24Regular, ArrowUpload24Regular, ArrowDownload24Regular, DocumentTable24Regular, Add16Regular } from '@fluentui/react-icons'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import { colToLetter } from '@alcina/sheets-engine'
import { newSheet, type SheetDoc } from './model'
import { Grid } from './Grid'
import { saveWorkbook, openWorkbook, importCsv, exportCsv, importXlsx, exportXlsx } from './io'

const ROWS = 100
const COLS = 26

export function App(): ReactNode {
  const [sheets, setSheets] = useState<SheetDoc[]>(() => [newSheet('Planilha1')])
  const [active, setActive] = useState(0)
  const [path, setPath] = useState<string | null>(null)
  const [sel, setSel] = useState({ row: 0, col: 0 })
  const [editing, setEditing] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')
  const [, bump] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    return () => off?.()
  }, [])

  const sheet = sheets[Math.min(active, sheets.length - 1)]
  const engine = sheet.engine
  const docName = path ? (path.split(/[\\/]/).pop() ?? 'planilha').replace(/\.[^.]+$/, '') : 'Sem título'

  const commitTo = (row: number, col: number, text: string): void => {
    engine.setCell(row, col, text)
  }

  const selectCell = (row: number, col: number): void => {
    if (editing !== null) commitTo(sel.row, sel.col, editing)
    setSel({ row, col })
    setEditing(null)
    bump()
  }

  const move = (dr: number, dc: number): void => {
    if (editing !== null) commitTo(sel.row, sel.col, editing)
    setSel((s) => ({ row: Math.max(0, Math.min(ROWS - 1, s.row + dr)), col: Math.max(0, Math.min(COLS - 1, s.col + dc)) }))
    setEditing(null)
    bump()
  }

  const commit = (dir: 'down' | 'right'): void => {
    if (editing !== null) commitTo(sel.row, sel.col, editing)
    setEditing(null)
    move(dir === 'down' ? 1 : 0, dir === 'right' ? 1 : 0)
  }

  const clearCell = (): void => {
    engine.setCell(sel.row, sel.col, '')
    bump()
  }

  const replaceSheets = (next: SheetDoc[], file: string | null): void => {
    setSheets(next)
    setActive(0)
    setPath(file)
    setSel({ row: 0, col: 0 })
    setEditing(null)
    bump()
  }

  const run = (fn: () => Promise<unknown>) => () => void fn()

  const ribbon: RibbonTab[] = [
    {
      key: 'home',
      label: 'Início',
      groups: [
        {
          label: 'Arquivo',
          items: [
            { key: 'new', label: 'Novo', icon: <DocumentAdd24Regular />, onClick: () => replaceSheets([newSheet('Planilha1')], null) },
            { key: 'open', label: 'Abrir', icon: <FolderOpen24Regular />, onClick: run(async () => { const r = await openWorkbook(); if (r) replaceSheets(r.sheets, r.path) }) },
            { key: 'save', label: 'Salvar', icon: <Save24Regular />, onClick: run(async () => { const p = await saveWorkbook(sheets, docName); if (p) setPath(p) }) }
          ]
        },
        {
          label: 'Importar',
          items: [
            { key: 'icsv', label: 'CSV', icon: <ArrowUpload24Regular />, onClick: run(async () => { const d = await importCsv(); if (d) replaceSheets([d], null) }) },
            { key: 'ixlsx', label: 'Excel', icon: <DocumentTable24Regular />, onClick: run(async () => { const d = await importXlsx(); if (d) replaceSheets(d, null) }) }
          ]
        },
        {
          label: 'Exportar',
          items: [
            { key: 'ecsv', label: 'CSV', icon: <ArrowDownload24Regular />, onClick: run(async () => { await exportCsv(sheet, docName) }) },
            { key: 'exlsx', label: 'Excel', icon: <DocumentTable24Regular />, onClick: run(async () => { await exportXlsx(sheets, docName) }) }
          ]
        }
      ]
    }
  ]

  const formulaValue = editing !== null ? editing : engine.getRaw(sel.row, sel.col)

  return (
    <AppShell
      appName={`${docName} — Planilha`}
      headerRight={version ? <span style={{ fontSize: 12, opacity: 0.85 }}>v{version}</span> : null}
      ribbon={ribbon}
      update={{ status, onInstall: () => void getUpdater()?.install() }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Barra de fórmulas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--ao-border)', flex: 'none' }}>
          <div style={{ width: 64, flex: 'none', textAlign: 'center', fontSize: 12, fontWeight: 600, border: '1px solid var(--ao-border)', borderRadius: 4, padding: '3px 0', fontFamily: 'Consolas, monospace' }}>
            {colToLetter(sel.col)}
            {sel.row + 1}
          </div>
          <span style={{ color: 'var(--ao-gold-text)', fontWeight: 700, fontFamily: 'serif' }}>fx</span>
          <input
            value={formulaValue}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit('down')
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setEditing(null)
                bump()
              }
            }}
            placeholder="Digite um valor ou uma fórmula (=SOMA(A1:A3))"
            style={{ flex: 1, minWidth: 0, border: '1px solid var(--ao-border)', borderRadius: 4, padding: '4px 8px', fontSize: 13, fontFamily: 'Consolas, monospace', background: 'var(--ao-bg)', color: 'var(--ao-text)' }}
          />
        </div>

        {/* Grade */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <Grid
            engine={engine}
            rows={ROWS}
            cols={COLS}
            rev={0}
            sel={sel}
            editing={editing}
            onSelect={selectCell}
            onStartEdit={(init) => setEditing(init)}
            onEditChange={(t) => setEditing(t)}
            onCommit={commit}
            onCancel={() => {
              setEditing(null)
              bump()
            }}
            onClear={clearCell}
            onMove={move}
          />
        </div>

        {/* Abas de planilhas */}
        <div style={{ display: 'flex', alignItems: 'stretch', height: 30, borderTop: '1px solid var(--ao-border)', background: 'var(--ao-surface)', flex: 'none' }}>
          {sheets.map((s, i) => {
            const on = i === active
            return (
              <div
                key={i}
                onClick={() => {
                  setActive(i)
                  setSel({ row: 0, col: 0 })
                  setEditing(null)
                }}
                onDoubleClick={() => setRenaming(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 14px',
                  fontSize: 12,
                  cursor: 'pointer',
                  background: on ? 'var(--ao-bg)' : 'transparent',
                  borderRight: '1px solid var(--ao-border)',
                  borderTop: on ? '2px solid var(--ao-green)' : '2px solid transparent',
                  fontWeight: on ? 600 : 400
                }}
              >
                {renaming === i ? (
                  <input
                    autoFocus
                    defaultValue={s.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v) {
                        setSheets((arr) => arr.map((x, j) => (j === i ? { ...x, name: v } : x)))
                      }
                      setRenaming(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    style={{ width: 90, font: 'inherit', border: '1px solid var(--ao-green)', borderRadius: 3 }}
                  />
                ) : (
                  s.name
                )}
              </div>
            )
          })}
          <button
            onClick={() => {
              setSheets((arr) => [...arr, newSheet(`Planilha${arr.length + 1}`)])
              setActive(sheets.length)
            }}
            aria-label="Nova planilha"
            style={{ display: 'flex', alignItems: 'center', padding: '0 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ao-green)' }}
          >
            <Add16Regular />
          </button>
        </div>
      </div>
    </AppShell>
  )
}
