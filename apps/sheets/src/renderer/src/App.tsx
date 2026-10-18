// AlcinaSheets: planilha com formatação de células, intervalos, funções e E/S.
import { useEffect, useReducer, useState, type ReactNode } from 'react'
import {
  ClipboardPaste24Regular,
  Copy24Regular,
  Cut24Regular,
  TextBold24Regular,
  TextItalic24Regular,
  TextUnderline24Regular,
  TextAlignLeft24Regular,
  TextAlignCenter24Regular,
  TextAlignRight24Regular,
  Money24Regular,
  Eraser24Regular,
  DocumentAdd24Regular,
  FolderOpen24Regular,
  Save24Regular,
  ArrowUpload24Regular,
  ArrowDownload24Regular,
  DocumentTable24Regular,
  Calculator24Regular,
  Add16Regular
} from '@fluentui/react-icons'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import { colToLetter } from '@alcina/sheets-engine'
import { newSheet, cellKey, type SheetDoc, type CellStyle, type NumFmt } from './model'
import { Grid, type Sel } from './Grid'
import { saveWorkbook, openWorkbook, importCsv, exportCsv, importXlsx, exportXlsx } from './io'

const ROWS = 120
const COLS = 40

const TEXT_COLORS = ['', '#16211a', '#0f7a34', '#9a6d0c', '#b64a38', '#1a5fb4']
const FILL_COLORS = ['', '#eef7f0', '#fdf3d0', '#eef0ee', '#e4eefb', '#fbe4ea']
const QUICK_FUNCS = ['SOMA', 'MÉDIA', 'MÁXIMO', 'MÍNIMO', 'CONT.NÚM', 'SE', 'PROCV', 'ÍNDICE', 'CORRESP', 'SOMASE', 'SOMASES', 'ARRED']

function swatch(c: string, cross = false): ReactNode {
  return <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 3, background: c || '#ffffff', border: '1px solid var(--ao-border)', position: 'relative' }}>{!c && cross ? <span style={{ position: 'absolute', inset: 0, color: '#b64a38', fontSize: 15, lineHeight: '14px', textAlign: 'center' }}>∕</span> : null}</span>
}
function txtIcon(t: string): ReactNode {
  return <span style={{ fontWeight: 700, fontSize: 13 }}>{t}</span>
}

export function App(): ReactNode {
  const [sheets, setSheets] = useState<SheetDoc[]>(() => [newSheet('Planilha1')])
  const [active, setActive] = useState(0)
  const [path, setPath] = useState<string | null>(null)
  const [sel, setSelState] = useState<Sel>({ ar: 0, ac: 0, fr: 0, fc: 0 })
  const [editing, setEditing] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [clip, setClip] = useState<string[][] | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')
  const [, bump] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    return () => off?.()
  }, [])

  const idx = Math.min(active, sheets.length - 1)
  const sheet = sheets[idx]
  const engine = sheet.engine
  const styles = sheet.styles
  const docName = path ? (path.split(/[\\/]/).pop() ?? 'planilha').replace(/\.[^.]+$/, '') : 'Sem título'

  const r1 = Math.min(sel.ar, sel.fr), r2 = Math.max(sel.ar, sel.fr)
  const c1 = Math.min(sel.ac, sel.fc), c2 = Math.max(sel.ac, sel.fc)
  const activeStyle = styles[cellKey(sel.ar, sel.ac)] ?? {}

  const setSel = (s: Sel): void => {
    if (editing !== null) {
      engine.setCell(sel.ar, sel.ac, editing)
      setEditing(null)
      bump()
    }
    setSelState(s)
  }

  const move = (dr: number, dc: number): void => {
    const nr = Math.max(0, Math.min(ROWS - 1, sel.ar + dr))
    const nc = Math.max(0, Math.min(COLS - 1, sel.ac + dc))
    setSelState({ ar: nr, ac: nc, fr: nr, fc: nc })
  }

  const onCommit = (dir: 'down' | 'right'): void => {
    engine.setCell(sel.ar, sel.ac, editing ?? '')
    setEditing(null)
    bump()
    move(dir === 'down' ? 1 : 0, dir === 'right' ? 1 : 0)
  }

  const clearRange = (): void => {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) engine.setCell(r, c, '')
    bump()
  }

  const pasteRows = (rows: string[][]): void => {
    rows.forEach((row, i) => row.forEach((val, j) => engine.setCell(sel.ar + i, sel.ac + j, val)))
    bump()
  }
  const onCopy = (): void => {
    const rows: string[][] = []
    for (let r = r1; r <= r2; r++) {
      const row: string[] = []
      for (let c = c1; c <= c2; c++) row.push(engine.getRaw(r, c))
      rows.push(row)
    }
    setClip(rows)
    try {
      void navigator.clipboard?.writeText(rows.map((r) => r.join('\t')).join('\n'))
    } catch {
      /* clipboard do sistema indisponível: usa o interno */
    }
  }
  const onPaste = (): void => {
    if (clip) {
      pasteRows(clip)
      return
    }
    try {
      void navigator.clipboard?.readText().then((txt) => {
        if (txt) pasteRows(txt.replace(/\r/g, '').split('\n').map((l) => l.split('\t')))
      })
    } catch {
      /* sem clipboard */
    }
  }

  // --- Formatação do intervalo selecionado ---
  const clean = (s: CellStyle): CellStyle => {
    const o: CellStyle = {}
    if (s.bold) o.bold = true
    if (s.italic) o.italic = true
    if (s.underline) o.underline = true
    if (s.align) o.align = s.align
    if (s.color) o.color = s.color
    if (s.fill) o.fill = s.fill
    if (s.fmt && s.fmt !== 'general') o.fmt = s.fmt
    if (s.decimals !== undefined) o.decimals = s.decimals
    return o
  }
  const setStyleRange = (fn: (s: CellStyle) => CellStyle): void => {
    setSheets((arr) =>
      arr.map((sh, i) => {
        if (i !== idx) return sh
        const next = { ...sh.styles }
        for (let r = r1; r <= r2; r++)
          for (let c = c1; c <= c2; c++) {
            const k = cellKey(r, c)
            const merged = clean(fn(next[k] ?? {}))
            if (Object.keys(merged).length === 0) delete next[k]
            else next[k] = merged
          }
        return { ...sh, styles: next }
      })
    )
  }
  const toggle = (key: 'bold' | 'italic' | 'underline'): void => {
    const cur = !!activeStyle[key]
    setStyleRange((s) => ({ ...s, [key]: !cur }))
  }
  const setAlign = (align: 'left' | 'center' | 'right'): void => setStyleRange((s) => ({ ...s, align }))
  const setColor = (color: string): void => setStyleRange((s) => ({ ...s, color }))
  const setFill = (fill: string): void => setStyleRange((s) => ({ ...s, fill }))
  const setFmt = (fmt: NumFmt): void => setStyleRange((s) => ({ ...s, fmt }))
  const changeDecimals = (delta: number): void =>
    setStyleRange((s) => {
      const fmt = s.fmt && s.fmt !== 'general' ? s.fmt : 'number'
      const base = s.decimals ?? 2
      return { ...s, fmt, decimals: Math.max(0, Math.min(10, base + delta)) }
    })

  const insertFunc = (name: string): void => {
    setEditing(`=${name}(`)
  }

  const replace = (next: SheetDoc[], file: string | null): void => {
    setSheets(next)
    setActive(0)
    setPath(file)
    setSelState({ ar: 0, ac: 0, fr: 0, fc: 0 })
    setEditing(null)
    bump()
  }
  const run = (fn: () => Promise<unknown>) => (): void => void fn()

  const ribbon: RibbonTab[] = [
    {
      key: 'home',
      label: 'Página Inicial',
      groups: [
        {
          label: 'Arquivo',
          items: [
            { key: 'new', label: 'Novo', icon: <DocumentAdd24Regular />, onClick: () => replace([newSheet('Planilha1')], null) },
            { key: 'open', label: 'Abrir', icon: <FolderOpen24Regular />, onClick: run(async () => { const r = await openWorkbook(); if (r) replace(r.sheets, r.path) }) },
            { key: 'save', label: 'Salvar', icon: <Save24Regular />, onClick: run(async () => { const p = await saveWorkbook(sheets, docName); if (p) setPath(p) }) }
          ]
        },
        {
          label: 'Área de transferência',
          items: [
            { key: 'paste', label: 'Colar', icon: <ClipboardPaste24Regular />, onClick: onPaste },
            { key: 'copy', label: 'Copiar', icon: <Copy24Regular />, onClick: onCopy },
            { key: 'cut', label: 'Recortar', icon: <Cut24Regular />, onClick: () => { onCopy(); clearRange() } }
          ]
        },
        {
          label: 'Fonte',
          items: [
            { key: 'b', label: 'Negrito', icon: <TextBold24Regular />, active: !!activeStyle.bold, onClick: () => toggle('bold') },
            { key: 'i', label: 'Itálico', icon: <TextItalic24Regular />, active: !!activeStyle.italic, onClick: () => toggle('italic') },
            { key: 'u', label: 'Sublinhado', icon: <TextUnderline24Regular />, active: !!activeStyle.underline, onClick: () => toggle('underline') }
          ]
        },
        {
          label: 'Cor do texto',
          items: TEXT_COLORS.map((c) => ({ key: `tc${c || 'auto'}`, label: c ? '' : 'Auto', icon: swatch(c, true), active: (activeStyle.color ?? '') === c, onClick: () => setColor(c) }))
        },
        {
          label: 'Preenchimento',
          items: FILL_COLORS.map((c) => ({ key: `fl${c || 'none'}`, label: c ? '' : 'Nenhum', icon: swatch(c, true), active: (activeStyle.fill ?? '') === c, onClick: () => setFill(c) }))
        },
        {
          label: 'Alinhamento',
          items: [
            { key: 'al', label: 'Esquerda', icon: <TextAlignLeft24Regular />, active: activeStyle.align === 'left', onClick: () => setAlign('left') },
            { key: 'ac', label: 'Centro', icon: <TextAlignCenter24Regular />, active: activeStyle.align === 'center', onClick: () => setAlign('center') },
            { key: 'ar', label: 'Direita', icon: <TextAlignRight24Regular />, active: activeStyle.align === 'right', onClick: () => setAlign('right') }
          ]
        },
        {
          label: 'Número',
          items: [
            { key: 'gen', label: 'Geral', icon: txtIcon('123'), active: !activeStyle.fmt || activeStyle.fmt === 'general', onClick: () => setFmt('general') },
            { key: 'cur', label: 'Moeda', icon: <Money24Regular />, active: activeStyle.fmt === 'currency', onClick: () => setFmt('currency') },
            { key: 'pct', label: 'Percentual', icon: txtIcon('%'), active: activeStyle.fmt === 'percent', onClick: () => setFmt('percent') },
            { key: 'mil', label: 'Milhar', icon: txtIcon('1.000'), active: activeStyle.fmt === 'thousands', onClick: () => setFmt('thousands') },
            { key: 'dinc', label: '+ casas', icon: txtIcon('+,0'), onClick: () => changeDecimals(1) },
            { key: 'ddec', label: '− casas', icon: txtIcon('−,0'), onClick: () => changeDecimals(-1) }
          ]
        },
        {
          label: 'Células',
          items: [
            { key: 'clear', label: 'Limpar', icon: <Eraser24Regular />, onClick: clearRange }
          ]
        }
      ]
    },
    {
      key: 'insert',
      label: 'Fórmulas',
      groups: [
        {
          label: 'Inserir função',
          items: QUICK_FUNCS.map((f) => ({ key: f, label: f, icon: <Calculator24Regular />, onClick: () => insertFunc(f) }))
        },
        {
          label: 'Dados',
          items: [
            { key: 'icsv', label: 'Importar CSV', icon: <ArrowUpload24Regular />, onClick: run(async () => { const d = await importCsv(); if (d) replace([d], null) }) },
            { key: 'ixlsx', label: 'Importar Excel', icon: <DocumentTable24Regular />, onClick: run(async () => { const d = await importXlsx(); if (d) replace(d, null) }) },
            { key: 'ecsv', label: 'Exportar CSV', icon: <ArrowDownload24Regular />, onClick: run(async () => { await exportCsv(sheet, docName) }) },
            { key: 'exlsx', label: 'Exportar Excel', icon: <DocumentTable24Regular />, onClick: run(async () => { await exportXlsx(sheets, docName) }) }
          ]
        }
      ]
    }
  ]

  const formulaValue = editing !== null ? editing : engine.getRaw(sel.ar, sel.ac)
  const selLabel = r1 === r2 && c1 === c2 ? `${colToLetter(sel.ac)}${sel.ar + 1}` : `${colToLetter(c1)}${r1 + 1}:${colToLetter(c2)}${r2 + 1}`

  return (
    <AppShell
      appName={`${docName} — Planilha`}
      headerRight={version ? <span style={{ fontSize: 12, opacity: 0.85 }}>v{version}</span> : null}
      ribbon={ribbon}
      update={{ status, onInstall: () => void getUpdater()?.install() }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--ao-border)', flex: 'none' }}>
          <div style={{ width: 84, flex: 'none', textAlign: 'center', fontSize: 12, fontWeight: 600, border: '1px solid var(--ao-border)', borderRadius: 4, padding: '3px 0', fontFamily: 'Consolas, monospace' }}>{selLabel}</div>
          <span style={{ color: 'var(--ao-gold-text)', fontWeight: 700, fontFamily: 'serif' }}>fx</span>
          <input
            value={formulaValue}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onCommit('down')
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setEditing(null)
                bump()
              }
            }}
            placeholder="Valor ou fórmula — ex.: =PROCV(A2; D:E; 2)"
            style={{ flex: 1, minWidth: 0, border: '1px solid var(--ao-border)', borderRadius: 4, padding: '4px 8px', fontSize: 13, fontFamily: 'Consolas, monospace', background: 'var(--ao-bg)', color: 'var(--ao-text)' }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Grid
            engine={engine}
            styles={styles}
            rows={ROWS}
            cols={COLS}
            rev={0}
            sel={sel}
            editing={editing}
            setSel={setSel}
            onStartEdit={(init) => setEditing(init)}
            onEditChange={(t) => setEditing(t)}
            onCommit={onCommit}
            onCancel={() => { setEditing(null); bump() }}
            onClear={clearRange}
            onCopy={onCopy}
            onPaste={onPaste}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'stretch', height: 30, borderTop: '1px solid var(--ao-border)', background: 'var(--ao-surface)', flex: 'none' }}>
          {sheets.map((s, i) => {
            const on = i === active
            return (
              <div
                key={i}
                onClick={() => { setActive(i); setSelState({ ar: 0, ac: 0, fr: 0, fc: 0 }); setEditing(null) }}
                onDoubleClick={() => setRenaming(i)}
                style={{ display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 12, cursor: 'pointer', background: on ? 'var(--ao-bg)' : 'transparent', borderRight: '1px solid var(--ao-border)', borderTop: on ? '2px solid var(--ao-green)' : '2px solid transparent', fontWeight: on ? 600 : 400 }}
              >
                {renaming === i ? (
                  <input
                    autoFocus
                    defaultValue={s.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v) setSheets((arr) => arr.map((x, j) => (j === i ? { ...x, name: v } : x))); setRenaming(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }}
                    style={{ width: 90, font: 'inherit', border: '1px solid var(--ao-green)', borderRadius: 3 }}
                  />
                ) : (
                  s.name
                )}
              </div>
            )
          })}
          <button onClick={() => { setSheets((arr) => [...arr, newSheet(`Planilha${arr.length + 1}`)]); setActive(sheets.length) }} aria-label="Nova planilha" style={{ display: 'flex', alignItems: 'center', padding: '0 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ao-green)' }}>
            <Add16Regular />
          </button>
        </div>
      </div>
    </AppShell>
  )
}
