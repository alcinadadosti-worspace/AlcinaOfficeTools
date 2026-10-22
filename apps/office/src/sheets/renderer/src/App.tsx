// AlcinaSheets: planilha com aba Página Inicial completa (formatação, estilos, edição).
import { useEffect, useReducer, useState, type ReactNode, type JSX } from 'react'
import { MenuList, MenuItem, MenuDivider, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Button, Input, Field, Checkbox } from '@fluentui/react-components'
import {
  ClipboardPaste24Regular,
  Copy24Regular,
  Cut24Regular,
  PaintBrush24Regular,
  TextBold24Regular,
  TextItalic24Regular,
  TextUnderline24Regular,
  TextFont24Regular,
  FontIncrease24Regular,
  Table24Regular,
  TextAlignLeft24Regular,
  TextAlignCenter24Regular,
  TextAlignRight24Regular,
  Money24Regular,
  Eraser24Regular,
  Add24Regular,
  Delete24Regular,
  Search24Regular,
  DocumentAdd24Regular,
  FolderOpen24Regular,
  Save24Regular,
  ArrowUpload24Regular,
  ArrowDownload24Regular,
  DocumentTable24Regular,
  Calculator24Regular,
  Comment24Regular,
  CommentAdd24Regular,
  Add16Regular
} from '@fluentui/react-icons'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import { colToLetter } from '@alcina/sheets-engine'
import { newSheet, cellKey, type SheetDoc, type CellStyle, type NumFmt, type ChartObj, type ChartType, type CondRule, type Merge, type Validation } from './model'
import { remap, sortBlock, findReplaceAll, fillPlan, fillSeries } from './ops'
import { buildPivot, AGG_LABEL, type Agg, type PivotCfg } from './pivot'
import { Grid, type Sel } from './Grid'
import { ChartLayer } from './ChartLayer'
import { saveWorkbook, openWorkbook, loadFromPath, importCsv, exportCsv, importXlsx, exportXlsx } from './io'

const ROWS = 200
const COLS = 40

const FONTS = ['', 'Arial', 'Calibri', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Consolas']
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48]
const TEXT_COLORS: [string, string][] = [['', 'Automática'], ['#16211a', 'Preto'], ['#0f7a34', 'Verde'], ['#9a6d0c', 'Dourado'], ['#b64a38', 'Vermelho'], ['#1a5fb4', 'Azul'], ['#6d3fb0', 'Roxo']]
const FILL_COLORS: [string, string][] = [['', 'Nenhum'], ['#eef7f0', 'Verde'], ['#fdf3d0', 'Amarelo'], ['#eef0ee', 'Cinza'], ['#e4eefb', 'Azul'], ['#fbe4ea', 'Rosa'], ['#0f7a34', 'Verde forte']]
const QUICK_FUNCS = ['SOMA', 'MÉDIA', 'MÁXIMO', 'MÍNIMO', 'CONT.NÚM', 'SE', 'SE.ERRO', 'PROCV', 'ÍNDICE', 'CORRESP', 'SOMASE', 'SOMASES', 'CONT.SE', 'ARRED', 'CONCATENAR']
const NUM_FORMATS: [NumFmt, string][] = [['general', 'Geral'], ['number', 'Número'], ['currency', 'Moeda'], ['accounting', 'Contábil'], ['percent', 'Porcentagem'], ['thousands', 'Milhar'], ['scientific', 'Científico'], ['text', 'Texto']]

function swatch(c: string): JSX.Element {
  return <span style={{ display: 'inline-block', width: 15, height: 15, borderRadius: 3, background: c || '#ffffff', border: '1px solid var(--ao-border)' }} />
}
function txtIcon(t: string): JSX.Element {
  return <span style={{ fontWeight: 700, fontSize: 13 }}>{t}</span>
}

type RangeLike = { r1: number; c1: number; r2: number; c2: number }

// Reposiciona um índice (linha/coluna) após inserir/excluir; null se o próprio índice foi excluído.
function shiftOne(v: number, at: number, n: number, del: boolean): number | null {
  if (del) return v < at ? v : v < at + n ? null : v - n
  return v < at ? v : v + n
}
// Reposiciona um intervalo fechado [lo,hi] em um eixo; null se foi totalmente excluído.
function shiftSpan(lo: number, hi: number, at: number, n: number, del: boolean): [number, number] | null {
  if (!del) return [lo < at ? lo : lo + n, hi < at ? hi : hi + n]
  if (lo >= at && hi < at + n) return null
  const nlo = lo < at ? lo : lo >= at + n ? lo - n : at
  const nhi = hi < at ? hi : hi >= at + n ? hi - n : at - 1
  return nhi < nlo ? null : [nlo, nhi]
}

export function App(): ReactNode {
  const [sheets, setSheets] = useState<SheetDoc[]>(() => [newSheet('Planilha1')])
  const [active, setActive] = useState(0)
  const [path, setPath] = useState<string | null>(null)
  const [sel, setSelState] = useState<Sel>({ ar: 0, ac: 0, fr: 0, fc: 0 })
  const [editing, setEditing] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [clip, setClip] = useState<string[][] | null>(null)
  const [painter, setPainter] = useState<CellStyle | null>(null)
  const [fr, setFr] = useState<{ open: boolean; find: string; replace: string; matchCase: boolean }>({ open: false, find: '', replace: '', matchCase: false })
  const [notice, setNotice] = useState<string | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')
  const [rev, bump] = useReducer((n: number) => n + 1, 0)
  const [freeze, setFreeze] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [selChart, setSelChart] = useState<string | null>(null)
  const [cf, setCf] = useState<{ open: boolean; op: CondRule['op']; v1: string; v2: string; fill: string }>({ open: false, op: '>', v1: '', v2: '', fill: '#fdf3d0' })
  const [filter, setFilter] = useState<{ r1: number; r2: number; cols: Record<number, string[]> } | null>(null)
  const [filterDlg, setFilterDlg] = useState<{ col: number; values: string[]; checked: Record<string, boolean> } | null>(null)
  const [valDlg, setValDlg] = useState<{ open: boolean; list: string }>({ open: false, list: '' })
  const [pivot, setPivot] = useState<{ open: boolean; headers: { idx: number; name: string }[]; rowField: number; colField: number; valField: number; agg: Agg } | null>(null)
  const [cmt, setCmt] = useState<{ open: boolean; text: string } | null>(null)

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    // Abrir arquivo vindo do "Abrir com" do Windows: ao abrir (arquivo inicial) e enquanto estiver aberto.
    const load = (p: string): void => { void loadFromPath(p).then((r) => { if (r) replace(r.sheets, r.path) }).catch(() => undefined) }
    window.alcinaFiles?.getInitialFile?.().then((p) => { if (p) load(p) }).catch(() => undefined)
    const offOpen = window.alcinaFiles?.onOpenFile?.(load)
    return () => { off?.(); offOpen?.() }
  }, [])

  const idx = Math.min(active, sheets.length - 1)
  const sheet = sheets[idx]
  const engine = sheet.engine
  const styles = sheet.styles
  const docName = path ? (path.split(/[\\/]/).pop() ?? 'planilha').replace(/\.[^.]+$/, '') : 'Sem título'

  const r1 = Math.min(sel.ar, sel.fr), r2 = Math.max(sel.ar, sel.fr)
  const c1 = Math.min(sel.ac, sel.fc), c2 = Math.max(sel.ac, sel.fc)
  const activeStyle = styles[cellKey(sel.ar, sel.ac)] ?? {}
  const merges = sheet.merges ?? []
  const hasMergeInSel = merges.some((m) => m.r >= r1 && m.r <= r2 && m.c <= c2 && m.c + m.cs - 1 >= c1)
  const mergeCells = (): void => {
    if (!(r1 === r2 && c1 < c2)) return
    const m = { r: r1, c: c1, cs: c2 - c1 + 1 }
    setSheets((arr) =>
      arr.map((sh, i) => {
        if (i !== idx) return sh
        const kept = (sh.merges ?? []).filter((x) => !(x.r === m.r && x.c <= c2 && x.c + x.cs - 1 >= c1))
        const k = cellKey(r1, c1)
        return { ...sh, merges: [...kept, m], styles: { ...sh.styles, [k]: { ...sh.styles[k], align: 'center' as const } } }
      })
    )
  }
  const unmergeCells = (): void => {
    setSheets((arr) => arr.map((sh, i) => (i === idx ? { ...sh, merges: (sh.merges ?? []).filter((m) => !(m.r >= r1 && m.r <= r2 && m.c <= c2 && m.c + m.cs - 1 >= c1)) } : sh)))
  }
  const charts = sheet.charts ?? []
  const insertChart = (type: ChartType): void => {
    const id = `chart_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
    const ch: ChartObj = { id, type, r1, c1, r2, c2, x: 60, y: 40, w: 440, h: 300 }
    setSheets((arr) => arr.map((sh, i) => (i === idx ? { ...sh, charts: [...(sh.charts ?? []), ch] } : sh)))
    setSelChart(id)
  }
  const updateChart = (id: string, patch: Partial<ChartObj>): void => setSheets((arr) => arr.map((sh, i) => (i === idx ? { ...sh, charts: (sh.charts ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) } : sh)))
  const deleteChart = (id: string): void => {
    setSheets((arr) => arr.map((sh, i) => (i === idx ? { ...sh, charts: (sh.charts ?? []).filter((c) => c.id !== id) } : sh)))
    setSelChart(null)
  }
  const condFormats = sheet.condFormats ?? []
  const openCf = (op: CondRule['op']): void => setCf({ open: true, op, v1: '', v2: '', fill: '#fdf3d0' })
  const applyCf = (): void => {
    const v1 = parseFloat(cf.v1.replace(',', '.'))
    if (!isFinite(v1)) { setCf((c) => ({ ...c, open: false })); return }
    const v2raw = parseFloat(cf.v2.replace(',', '.'))
    const rule: CondRule = { r1, c1, r2, c2, op: cf.op, v1, v2: cf.op === 'between' && isFinite(v2raw) ? v2raw : undefined, fill: cf.fill }
    setSheets((arr) => arr.map((sh, i) => (i === idx ? { ...sh, condFormats: [...(sh.condFormats ?? []), rule] } : sh)))
    setCf((c) => ({ ...c, open: false }))
  }
  const clearCf = (): void => setSheets((arr) => arr.map((sh, i) => (i === idx ? { ...sh, condFormats: [] } : sh)))

  const cellText = (v: unknown): string => (v === null || v === undefined || typeof v === 'object' ? '' : String(v))
  const openFilter = (): void => {
    const hr = filter?.r1 ?? r1
    const lr = filter?.r2 ?? r2
    const col = sel.ac
    const seen = new Set<string>()
    const values: string[] = []
    for (let r = hr + 1; r <= lr; r++) {
      const t = cellText(engine.getValue(r, col))
      if (!seen.has(t)) { seen.add(t); values.push(t) }
    }
    values.sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const allowed = filter?.cols[col]
    const checked: Record<string, boolean> = {}
    for (const v of values) checked[v] = allowed ? allowed.includes(v) : true
    if (!filter) setFilter({ r1: hr, r2: lr, cols: {} })
    setFilterDlg({ col, values, checked })
  }
  const applyFilter = (): void => {
    if (!filterDlg) return
    const allowed = filterDlg.values.filter((v) => filterDlg.checked[v])
    setFilter((f) => { const base = f ?? { r1, r2, cols: {} }; return { ...base, cols: { ...base.cols, [filterDlg.col]: allowed } } })
    setFilterDlg(null)
  }
  const clearFilter = (): void => { setFilter(null); setFilterDlg(null) }

  const validations = sheet.validations ?? []
  const openValidation = (): void => {
    const existing = validations.find((x) => sel.ar >= Math.min(x.r1, x.r2) && sel.ar <= Math.max(x.r1, x.r2) && sel.ac >= Math.min(x.c1, x.c2) && sel.ac <= Math.max(x.c1, x.c2))
    setValDlg({ open: true, list: existing ? existing.list.join(', ') : '' })
  }
  const applyValidation = (): void => {
    const list = valDlg.list.split(',').map((s) => s.trim()).filter((s, i, a) => s !== '' && a.indexOf(s) === i)
    setSheets((arr) => arr.map((sh, i) => {
      if (i !== idx) return sh
      const kept = (sh.validations ?? []).filter((x) => !(Math.min(x.r1, x.r2) <= r2 && Math.max(x.r1, x.r2) >= r1 && Math.min(x.c1, x.c2) <= c2 && Math.max(x.c1, x.c2) >= c1))
      return { ...sh, validations: list.length ? [...kept, { r1, c1, r2, c2, list }] : kept }
    }))
    setValDlg({ open: false, list: '' })
  }
  const onSetCellValue = (r: number, c: number, text: string): void => {
    engine.setCell(r, c, text)
    bump()
  }
  // Alça de preenchimento: arrastar até (tr,tc) estende a série da seleção.
  const onFill = (tr: number, tc: number): void => {
    const plan = fillPlan({ r1, c1, r2, c2 }, tr, tc)
    if (!plan) return
    const { axis, g, back } = plan
    const styleCopies: Array<[string, CellStyle]> = []
    const addFill = (seed: string[], L: number, targets: Array<{ p: number; tr: number; tc: number }>, seedAt: (b: number, t: { tr: number; tc: number }) => string): void => {
      const vals = fillSeries(seed, targets.map((t) => t.p), axis)
      targets.forEach((t, k) => {
        engine.setCell(t.tr, t.tc, vals[k])
        const b = ((t.p % L) + L) % L
        const st = styles[seedAt(b, t)]
        if (st) styleCopies.push([cellKey(t.tr, t.tc), st])
      })
    }
    if (axis === 'row') {
      const L = r2 - r1 + 1
      for (let c = c1; c <= c2; c++) {
        const seed: string[] = []
        for (let r = r1; r <= r2; r++) seed.push(engine.getRaw(r, c))
        const targets: Array<{ p: number; tr: number; tc: number }> = []
        for (let i = 1; i <= g; i++) {
          const row = back ? r1 - i : r2 + i
          if (row < 0 || row >= ROWS) continue
          targets.push({ p: row - r1, tr: row, tc: c })
        }
        addFill(seed, L, targets, (b) => cellKey(r1 + b, c))
      }
    } else {
      const L = c2 - c1 + 1
      for (let r = r1; r <= r2; r++) {
        const seed: string[] = []
        for (let c = c1; c <= c2; c++) seed.push(engine.getRaw(r, c))
        const targets: Array<{ p: number; tr: number; tc: number }> = []
        for (let i = 1; i <= g; i++) {
          const col = back ? c1 - i : c2 + i
          if (col < 0 || col >= COLS) continue
          targets.push({ p: col - c1, tr: r, tc: col })
        }
        addFill(seed, L, targets, (b) => cellKey(r, c1 + b))
      }
    }
    if (styleCopies.length) setSheets((arr) => arr.map((sh, i) => (i === idx ? { ...sh, styles: { ...sh.styles, ...Object.fromEntries(styleCopies) } } : sh)))
    const nr2 = axis === 'row' ? (back ? Math.max(0, r1 - g) : Math.min(ROWS - 1, r2 + g)) : r2
    const nc2 = axis === 'col' ? (back ? Math.max(0, c1 - g) : Math.min(COLS - 1, c2 + g)) : c2
    setSelState({ ar: r1, ac: c1, fr: nr2, fc: nc2 })
    bump()
  }
  // Tabela dinâmica: usa a seleção como intervalo de dados (1ª linha = cabeçalho).
  const openPivot = (): void => {
    if (c2 <= c1 || r2 <= r1) { setNotice('Selecione um intervalo com cabeçalho e ao menos duas colunas e duas linhas.'); return }
    const headers: { idx: number; name: string }[] = []
    for (let c = c1; c <= c2; c++) {
      const h = engine.getValue(r1, c)
      headers.push({ idx: c, name: h === null || h === '' || typeof h === 'object' ? colToLetter(c) : String(h) })
    }
    const valDefault = headers.length > 1 ? headers[headers.length - 1].idx : headers[0].idx
    setPivot({ open: true, headers, rowField: headers[0].idx, colField: -1, valField: valDefault, agg: 'sum' })
  }
  const applyPivot = (): void => {
    if (!pivot) return
    const cfg: PivotCfg = { rowField: pivot.rowField, colField: pivot.colField < 0 ? null : pivot.colField, valField: pivot.valField, agg: pivot.agg }
    const names = pivot.headers.reduce<string[]>((acc, h) => { acc[h.idx] = h.name; return acc }, [])
    const { grid, colKeys, rowKeys } = buildPivot(engine, r1, r2, names, cfg)
    const doc = newSheet(`Dinâmica${sheets.length + 1}`)
    const styles: Record<string, CellStyle> = {}
    const lastRow = grid.length - 1
    const lastCol = (grid[0]?.length ?? 1) - 1
    grid.forEach((row, r) => {
      row.forEach((txt, c) => {
        if (txt !== '') doc.engine.setCell(r, c, txt)
        const header = r === 0
        const totalRow = r === lastRow
        const totalCol = cfg.colField !== null && c === lastCol
        const firstCol = c === 0
        const s: CellStyle = {}
        if (header) { s.bold = true; s.fill = '#0f7a34'; s.color = '#ffffff'; s.align = c === 0 ? 'left' : 'center' }
        else if (totalRow) { s.bold = true; s.fill = '#eef7f0'; s.bt = true }
        else if (firstCol) s.bold = true
        if (totalCol && !header) { s.bold = true; s.bl = true }
        if (!header && c > 0) s.align = 'right'
        if (Object.keys(s).length) styles[cellKey(r, c)] = s
      })
    })
    doc.styles = styles
    setSheets((arr) => [...arr, doc])
    setActive(sheets.length)
    setSelState({ ar: 0, ac: 0, fr: 0, fc: 0 })
    setPivot(null)
    setNotice(`Tabela dinâmica criada em "${doc.name}" (${rowKeys.length} linha(s)${cfg.colField !== null ? ` × ${colKeys.length} coluna(s)` : ''}).`)
  }

  // Comentários/notas em célula.
  const comments = sheet.comments ?? {}
  const activeComment = comments[cellKey(sel.ar, sel.ac)]
  const openComment = (): void => setCmt({ open: true, text: activeComment ?? '' })
  const applyComment = (): void => {
    if (!cmt) return
    const key = cellKey(sel.ar, sel.ac)
    const text = cmt.text.trim()
    setSheets((arr) =>
      arr.map((sh, i) => {
        if (i !== idx) return sh
        const next = { ...(sh.comments ?? {}) }
        if (text) next[key] = text
        else delete next[key]
        return { ...sh, comments: next }
      })
    )
    setCmt(null)
  }
  const deleteComment = (): void => {
    const key = cellKey(sel.ar, sel.ac)
    setSheets((arr) => arr.map((sh, i) => (i === idx ? { ...sh, comments: Object.fromEntries(Object.entries(sh.comments ?? {}).filter(([k]) => k !== key)) } : sh)))
  }

  const selStats = ((): { count: number; sum: number; nonEmpty: number } => {
    let count = 0
    let sum = 0
    let nonEmpty = 0
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const v = engine.getValue(r, c)
        if (v !== null && v !== '') nonEmpty++
        if (typeof v === 'number') { count++; sum += v }
      }
    }
    return { count, sum, nonEmpty }
  })()
  const hiddenRows = ((): Set<number> | undefined => {
    if (!filter) return undefined
    const entries = Object.entries(filter.cols)
    if (!entries.length) return undefined
    const hidden = new Set<number>()
    for (let r = filter.r1 + 1; r <= filter.r2; r++) {
      for (const [colStr, allowed] of entries) {
        if (!allowed.includes(cellText(engine.getValue(r, Number(colStr))))) { hidden.add(r); break }
      }
    }
    return hidden
  })()

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
    // editing === null => nenhuma edição em curso (ex.: Enter na barra de fórmulas sem digitar): não apagar.
    if (editing !== null) {
      engine.setCell(sel.ar, sel.ac, editing)
      setEditing(null)
      bump()
    }
    move(dir === 'down' ? 1 : 0, dir === 'right' ? 1 : 0)
  }

  const applyData = (d: { entries: Parameters<typeof engine.load>[0]; styles: Record<string, CellStyle> }): void => {
    engine.load(d.entries)
    setSheets((arr) => arr.map((sh, i) => (i === idx ? { ...sh, styles: d.styles } : sh)))
    bump()
  }

  // Inserir/excluir linhas ou colunas: além das células e estilos, reposiciona comentários,
  // mesclagens, gráficos, formatação condicional e validações para não dessincronizarem.
  const applyStructural = (
    mapFn: (r: number, c: number) => { r: number; c: number } | null,
    op: { axis: 'row' | 'col'; at: number; n: number; del: boolean }
  ): void => {
    const d = remap(engine, styles, mapFn)
    engine.load(d.entries)
    const { axis, at, n, del } = op
    const remapRange = <T extends RangeLike>(o: T): T | null => {
      if (axis === 'row') { const s = shiftSpan(o.r1, o.r2, at, n, del); return s ? ({ ...o, r1: s[0], r2: s[1] } as T) : null }
      const s = shiftSpan(o.c1, o.c2, at, n, del)
      return s ? ({ ...o, c1: s[0], c2: s[1] } as T) : null
    }
    setSheets((arr) =>
      arr.map((sh, i) => {
        if (i !== idx) return sh
        const comments: Record<string, string> = {}
        for (const [k, v] of Object.entries(sh.comments ?? {})) {
          const ci = k.indexOf(',')
          const m = mapFn(Number(k.slice(0, ci)), Number(k.slice(ci + 1)))
          if (m) comments[`${m.r},${m.c}`] = v
        }
        const merges = (sh.merges ?? [])
          .map((mg) => {
            if (axis === 'row') { const r = shiftOne(mg.r, at, n, del); return r === null ? null : { ...mg, r } }
            const s = shiftSpan(mg.c, mg.c + mg.cs - 1, at, n, del)
            return s ? { ...mg, c: s[0], cs: s[1] - s[0] + 1 } : null
          })
          .filter((x): x is Merge => x !== null)
        const charts = (sh.charts ?? []).map(remapRange).filter((x): x is ChartObj => x !== null)
        const condFormats = (sh.condFormats ?? []).map(remapRange).filter((x): x is CondRule => x !== null)
        const validations = (sh.validations ?? []).map(remapRange).filter((x): x is Validation => x !== null)
        return { ...sh, styles: d.styles, comments, merges, charts, condFormats, validations }
      })
    )
    bump()
  }

  const clearContent = (): void => {
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
      /* usa clipboard interno */
    }
  }
  const onPaste = (): void => {
    // Prefere a área de transferência do sistema; só usa a cópia interna se o conteúdo externo for o mesmo (ou indisponível).
    const internal = clip ? clip.map((r) => r.join('\t')).join('\n') : null
    const useInternal = (): void => { if (clip) pasteRows(clip) }
    try {
      const p = navigator.clipboard?.readText?.()
      if (p && typeof p.then === 'function') {
        void p
          .then((txt) => {
            if (txt && txt !== internal) pasteRows(txt.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t')))
            else useInternal()
          })
          .catch(() => useInternal())
      } else {
        useInternal()
      }
    } catch {
      useInternal()
    }
  }

  // --- Estilos ---
  const clean = (s: CellStyle): CellStyle => {
    const o: CellStyle = {}
    if (s.bold) o.bold = true
    if (s.italic) o.italic = true
    if (s.underline) o.underline = true
    if (s.align) o.align = s.align
    if (s.valign) o.valign = s.valign
    if (s.wrap) o.wrap = true
    if (s.color) o.color = s.color
    if (s.fill) o.fill = s.fill
    if (s.fontFamily) o.fontFamily = s.fontFamily
    if (s.fontSize) o.fontSize = s.fontSize
    if (s.fmt && s.fmt !== 'general') o.fmt = s.fmt
    if (s.decimals !== undefined) o.decimals = s.decimals
    if (s.bt) o.bt = true
    if (s.bb) o.bb = true
    if (s.bl) o.bl = true
    if (s.br) o.br = true
    return o
  }
  const setStyleRange = (fn: (s: CellStyle, r: number, c: number) => CellStyle): void => {
    setSheets((arr) =>
      arr.map((sh, i) => {
        if (i !== idx) return sh
        const next = { ...sh.styles }
        for (let r = r1; r <= r2; r++)
          for (let c = c1; c <= c2; c++) {
            const k = cellKey(r, c)
            const merged = clean(fn(next[k] ?? {}, r, c))
            if (Object.keys(merged).length === 0) delete next[k]
            else next[k] = merged
          }
        return { ...sh, styles: next }
      })
    )
  }
  const toggle = (key: 'bold' | 'italic' | 'underline' | 'wrap'): void => {
    const cur = !!activeStyle[key]
    setStyleRange((s) => ({ ...s, [key]: !cur }))
  }
  const set = (patch: Partial<CellStyle>): void => setStyleRange((s) => ({ ...s, ...patch }))
  const setFmt = (fmt: NumFmt): void => setStyleRange((s) => ({ ...s, fmt }))
  const changeDecimals = (delta: number): void =>
    setStyleRange((s) => {
      const fmt = s.fmt && s.fmt !== 'general' ? s.fmt : 'number'
      return { ...s, fmt, decimals: Math.max(0, Math.min(10, (s.decimals ?? 2) + delta)) }
    })
  const setBorders = (which: 'all' | 'outline' | 'none' | 'top' | 'bottom' | 'left' | 'right'): void =>
    setStyleRange((s, r, c) => {
      if (which === 'none') return { ...s, bt: false, bb: false, bl: false, br: false }
      if (which === 'all') return { ...s, bt: true, bb: true, bl: true, br: true }
      if (which === 'outline') return { ...s, bt: r === r1 ? true : s.bt, bb: r === r2 ? true : s.bb, bl: c === c1 ? true : s.bl, br: c === c2 ? true : s.br }
      if (which === 'top') return { ...s, bt: true }
      if (which === 'bottom') return { ...s, bb: true }
      if (which === 'left') return { ...s, bl: true }
      return { ...s, br: true }
    })
  const cellStyle = (preset: CellStyle): void => setStyleRange(() => ({ ...preset }))
  const formatAsTable = (): void =>
    setStyleRange((s, r, c) => {
      const o: CellStyle = { ...s, bt: r === r1 ? true : s.bt, bb: r === r2 ? true : s.bb, bl: c === c1 ? true : s.bl, br: c === c2 ? true : s.br }
      if (r === r1) return { ...o, bold: true, fill: '#0f7a34', color: '#ffffff' }
      return { ...o, fill: (r - r1) % 2 === 0 ? '#eef7f0' : undefined }
    })
  const paintBrush = (): void => {
    if (painter === null) setPainter(clean(activeStyle))
    else {
      const p = painter
      setStyleRange(() => ({ ...p }))
      setPainter(null)
    }
  }

  // --- Edição ---
  const autoSum = (fn: string): void => {
    let start = sel.ar - 1
    while (start >= 0 && engine.getRaw(start, sel.ac) !== '') start--
    start++
    const ref = start <= sel.ar - 1 ? `${colToLetter(sel.ac)}${start + 1}:${colToLetter(sel.ac)}${sel.ar}` : ''
    setEditing(`=${fn}(${ref})`)
  }
  const doSort = (desc: boolean): void => applyData(sortBlock(engine, styles, r1, r2, c1, c2, c1, desc))
  const insRows = (): void => { const n = r2 - r1 + 1; applyStructural((r, c) => ({ r: r >= r1 ? r + n : r, c }), { axis: 'row', at: r1, n, del: false }) }
  const delRows = (): void => { const n = r2 - r1 + 1; applyStructural((r, c) => (r >= r1 && r <= r2 ? null : { r: r > r2 ? r - n : r, c }), { axis: 'row', at: r1, n, del: true }) }
  const insCols = (): void => { const n = c2 - c1 + 1; applyStructural((r, c) => ({ r, c: c >= c1 ? c + n : c }), { axis: 'col', at: c1, n, del: false }) }
  const delCols = (): void => { const n = c2 - c1 + 1; applyStructural((r, c) => (c >= c1 && c <= c2 ? null : { r, c: c > c2 ? c - n : c }), { axis: 'col', at: c1, n, del: true }) }
  const runFindReplace = (): void => {
    const n = findReplaceAll(engine, fr.find, fr.replace, fr.matchCase)
    bump()
    setNotice(`${n} substituição(ões) feita(s).`)
    setFr((f) => ({ ...f, open: false }))
  }

  const replace = (next: SheetDoc[], file: string | null): void => {
    setSheets(next)
    setActive(0)
    setPath(file)
    setSelState({ ar: 0, ac: 0, fr: 0, fc: 0 })
    setEditing(null)
    bump()
  }
  const run = (f: () => Promise<unknown>) => (): void => void f()

  // --- Menus (conteúdos suspensos) ---
  const colorMenu = (apply: (c: string) => void, list: [string, string][]): ReactNode => (
    <MenuList>
      {list.map(([v, name]) => (
        <MenuItem key={v || 'x'} icon={swatch(v)} onClick={() => apply(v)}>
          {name}
        </MenuItem>
      ))}
    </MenuList>
  )

  const ribbon: RibbonTab[] = [
    {
      key: 'file',
      label: 'Arquivo',
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
          label: 'Importar / Exportar',
          items: [
            { key: 'icsv', label: 'Importar CSV', icon: <ArrowUpload24Regular />, onClick: run(async () => { const d = await importCsv(); if (d) replace([d], null) }) },
            { key: 'ixlsx', label: 'Importar Excel', icon: <DocumentTable24Regular />, onClick: run(async () => { const d = await importXlsx(); if (d) replace(d, null) }) },
            { key: 'ecsv', label: 'Exportar CSV', icon: <ArrowDownload24Regular />, onClick: run(async () => { await exportCsv(sheet, docName) }) },
            { key: 'exlsx', label: 'Exportar Excel', icon: <DocumentTable24Regular />, onClick: run(async () => { await exportXlsx(sheets, docName) }) }
          ]
        }
      ]
    },
    {
      key: 'home',
      label: 'Página Inicial',
      groups: [
        {
          label: 'Área de transferência',
          items: [
            { key: 'paste', label: 'Colar', icon: <ClipboardPaste24Regular />, onClick: onPaste },
            { key: 'copy', label: 'Copiar', icon: <Copy24Regular />, onClick: onCopy },
            { key: 'cut', label: 'Recortar', icon: <Cut24Regular />, onClick: () => { onCopy(); clearContent() } },
            { key: 'paint', label: 'Pincel', icon: <PaintBrush24Regular />, active: painter !== null, onClick: paintBrush }
          ]
        },
        {
          label: 'Fonte',
          items: [
            { key: 'font', label: 'Fonte', icon: <TextFont24Regular />, menu: <MenuList>{FONTS.map((f) => (<MenuItem key={f || 'def'} onClick={() => set({ fontFamily: f || undefined })} style={{ fontFamily: f || undefined }}>{f || 'Padrão'}</MenuItem>))}</MenuList> },
            { key: 'size', label: 'Tamanho', icon: <FontIncrease24Regular />, menu: <MenuList>{SIZES.map((s) => (<MenuItem key={s} onClick={() => set({ fontSize: s })}>{s}</MenuItem>))}</MenuList> },
            { key: 'b', label: 'Negrito', icon: <TextBold24Regular />, active: !!activeStyle.bold, onClick: () => toggle('bold') },
            { key: 'i', label: 'Itálico', icon: <TextItalic24Regular />, active: !!activeStyle.italic, onClick: () => toggle('italic') },
            { key: 'u', label: 'Sublinhado', icon: <TextUnderline24Regular />, active: !!activeStyle.underline, onClick: () => toggle('underline') },
            { key: 'bord', label: 'Bordas', icon: <Table24Regular />, menu: <MenuList><MenuItem onClick={() => setBorders('all')}>Todas as bordas</MenuItem><MenuItem onClick={() => setBorders('outline')}>Contorno</MenuItem><MenuItem onClick={() => setBorders('bottom')}>Borda inferior</MenuItem><MenuItem onClick={() => setBorders('top')}>Borda superior</MenuItem><MenuItem onClick={() => setBorders('left')}>Borda esquerda</MenuItem><MenuItem onClick={() => setBorders('right')}>Borda direita</MenuItem><MenuDivider /><MenuItem onClick={() => setBorders('none')}>Sem borda</MenuItem></MenuList> },
            { key: 'tcolor', label: 'Cor do texto', icon: <span style={{ fontWeight: 700, borderBottom: `3px solid ${activeStyle.color || '#b64a38'}` }}>A</span>, menu: colorMenu((c) => set({ color: c || undefined }), TEXT_COLORS) },
            { key: 'fill', label: 'Preenchimento', icon: swatch(activeStyle.fill || '#fdf3d0'), menu: colorMenu((c) => set({ fill: c || undefined }), FILL_COLORS) }
          ]
        },
        {
          label: 'Alinhamento',
          items: [
            { key: 'vt', label: 'Superior', icon: txtIcon('↑'), active: activeStyle.valign === 'top', onClick: () => set({ valign: 'top' }) },
            { key: 'vm', label: 'Meio', icon: txtIcon('↕'), active: activeStyle.valign === 'middle', onClick: () => set({ valign: 'middle' }) },
            { key: 'vb', label: 'Inferior', icon: txtIcon('↓'), active: activeStyle.valign === 'bottom', onClick: () => set({ valign: 'bottom' }) },
            { key: 'al', label: 'Esquerda', icon: <TextAlignLeft24Regular />, active: activeStyle.align === 'left', onClick: () => set({ align: 'left' }) },
            { key: 'ac', label: 'Centro', icon: <TextAlignCenter24Regular />, active: activeStyle.align === 'center', onClick: () => set({ align: 'center' }) },
            { key: 'ar', label: 'Direita', icon: <TextAlignRight24Regular />, active: activeStyle.align === 'right', onClick: () => set({ align: 'right' }) },
            { key: 'wrap', label: 'Quebrar texto', icon: txtIcon('⤶'), active: !!activeStyle.wrap, onClick: () => toggle('wrap') },
            { key: 'merge', label: 'Mesclar e centralizar', icon: txtIcon('⬌'), disabled: !(r1 === r2 && c1 < c2), onClick: mergeCells },
            { key: 'unmerge', label: 'Separar', icon: txtIcon('⬍'), disabled: !hasMergeInSel, onClick: unmergeCells },
            { key: 'condfmt', label: 'Form. condicional', icon: txtIcon('▦'), menu: <MenuList><MenuItem onClick={() => openCf('>')}>Maior que…</MenuItem><MenuItem onClick={() => openCf('<')}>Menor que…</MenuItem><MenuItem onClick={() => openCf('between')}>Entre…</MenuItem><MenuItem onClick={clearCf}>Limpar regras</MenuItem></MenuList> }
          ]
        },
        {
          label: 'Número',
          items: [
            { key: 'fmt', label: 'Formato', icon: txtIcon('123'), menu: <MenuList>{NUM_FORMATS.map(([v, name]) => (<MenuItem key={v} onClick={() => setFmt(v)}>{name}</MenuItem>))}</MenuList> },
            { key: 'cur', label: 'Moeda', icon: <Money24Regular />, active: activeStyle.fmt === 'currency', onClick: () => setFmt('currency') },
            { key: 'pct', label: 'Percentual', icon: txtIcon('%'), active: activeStyle.fmt === 'percent', onClick: () => setFmt('percent') },
            { key: 'mil', label: 'Milhar', icon: txtIcon('1.000'), active: activeStyle.fmt === 'thousands', onClick: () => setFmt('thousands') },
            { key: 'dinc', label: '+ casas', icon: txtIcon('+,0'), onClick: () => changeDecimals(1) },
            { key: 'ddec', label: '− casas', icon: txtIcon('−,0'), onClick: () => changeDecimals(-1) }
          ]
        },
        {
          label: 'Estilos',
          items: [
            {
              key: 'cellstyles',
              label: 'Estilos de célula',
              icon: txtIcon('Aa'),
              menu: (
                <MenuList>
                  <MenuItem onClick={() => cellStyle({})}>Normal</MenuItem>
                  <MenuItem onClick={() => cellStyle({ bold: true, fontSize: 18, color: '#0f7a34' })}>Título</MenuItem>
                  <MenuItem onClick={() => cellStyle({ bold: true, fill: '#eef7f0', bb: true })}>Cabeçalho</MenuItem>
                  <MenuDivider />
                  <MenuItem onClick={() => cellStyle({ fill: '#e6f4ea', color: '#0a5831' })}>Bom</MenuItem>
                  <MenuItem onClick={() => cellStyle({ fill: '#fbe4ea', color: '#b64a38' })}>Ruim</MenuItem>
                  <MenuItem onClick={() => cellStyle({ fill: '#fdf3d0', color: '#9a6d0c' })}>Neutro</MenuItem>
                  <MenuItem onClick={() => cellStyle({ bold: true, color: '#0f7a34' })}>Destaque</MenuItem>
                  <MenuDivider />
                  <MenuItem onClick={() => cellStyle({ fmt: 'currency' })}>Moeda</MenuItem>
                  <MenuItem onClick={() => cellStyle({ fmt: 'percent' })}>Percentual</MenuItem>
                </MenuList>
              )
            },
            { key: 'astable', label: 'Formatar como tabela', icon: <DocumentTable24Regular />, onClick: formatAsTable }
          ]
        },
        {
          label: 'Células',
          items: [
            { key: 'ins', label: 'Inserir', icon: <Add24Regular />, menu: <MenuList><MenuItem onClick={insRows}>Inserir linhas</MenuItem><MenuItem onClick={insCols}>Inserir colunas</MenuItem></MenuList> },
            { key: 'del', label: 'Excluir', icon: <Delete24Regular />, menu: <MenuList><MenuItem onClick={delRows}>Excluir linhas</MenuItem><MenuItem onClick={delCols}>Excluir colunas</MenuItem></MenuList> }
          ]
        },
        {
          label: 'Edição',
          items: [
            { key: 'sum', label: 'AutoSoma', icon: txtIcon('Σ'), menu: <MenuList><MenuItem onClick={() => autoSum('SOMA')}>Soma</MenuItem><MenuItem onClick={() => autoSum('MÉDIA')}>Média</MenuItem><MenuItem onClick={() => autoSum('CONT.NÚM')}>Contar números</MenuItem><MenuItem onClick={() => autoSum('MÁXIMO')}>Máximo</MenuItem><MenuItem onClick={() => autoSum('MÍNIMO')}>Mínimo</MenuItem></MenuList> },
            { key: 'sort', label: 'Classificar', icon: txtIcon('A↓'), menu: <MenuList><MenuItem onClick={() => doSort(false)}>Crescente (A → Z)</MenuItem><MenuItem onClick={() => doSort(true)}>Decrescente (Z → A)</MenuItem></MenuList> },
            { key: 'find', label: 'Localizar', icon: <Search24Regular />, onClick: () => setFr((f) => ({ ...f, open: true })) },
            { key: 'clear', label: 'Limpar', icon: <Eraser24Regular />, menu: <MenuList><MenuItem onClick={() => { clearContent(); setStyleRange(() => ({})) }}>Limpar tudo</MenuItem><MenuItem onClick={clearContent}>Limpar conteúdo</MenuItem><MenuItem onClick={() => setStyleRange(() => ({}))}>Limpar formatação</MenuItem></MenuList> }
          ]
        }
      ]
    },
    {
      key: 'insert',
      label: 'Inserir',
      groups: [
        {
          label: 'Tabelas',
          items: [{ key: 'pivot', label: 'Tabela dinâmica', icon: <DocumentTable24Regular />, onClick: openPivot }]
        },
        {
          label: 'Gráficos',
          items: [
            { key: 'ccol', label: 'Coluna', icon: txtIcon('▊'), disabled: editing !== null, onClick: () => insertChart('column') },
            { key: 'cbar', label: 'Barra', icon: txtIcon('▆'), disabled: editing !== null, onClick: () => insertChart('bar') },
            { key: 'cline', label: 'Linha', icon: txtIcon('/'), disabled: editing !== null, onClick: () => insertChart('line') },
            { key: 'cpie', label: 'Pizza', icon: txtIcon('◔'), disabled: editing !== null, onClick: () => insertChart('pie') }
          ]
        }
      ]
    },
    {
      key: 'formulas',
      label: 'Fórmulas',
      groups: [
        { label: 'Inserir função', items: QUICK_FUNCS.map((f) => ({ key: f, label: f, icon: <Calculator24Regular />, onClick: () => setEditing(`=${f}(`) })) }
      ]
    },
    {
      key: 'view',
      label: 'Exibir',
      groups: [
        {
          label: 'Janela',
          items: [
            { key: 'fp', label: 'Congelar painéis', icon: txtIcon('❄'), onClick: () => setFreeze({ r: sel.ar, c: sel.ac }) },
            { key: 'frow', label: 'Congelar linha', icon: txtIcon('▤'), onClick: () => setFreeze((f) => ({ ...f, r: 1 })) },
            { key: 'fcol', label: 'Congelar coluna', icon: txtIcon('▥'), onClick: () => setFreeze((f) => ({ ...f, c: 1 })) },
            { key: 'unf', label: 'Descongelar', icon: txtIcon('✕'), disabled: freeze.r === 0 && freeze.c === 0, onClick: () => setFreeze({ r: 0, c: 0 }) }
          ]
        },
        {
          label: 'Dados',
          items: [
            { key: 'filter', label: 'Filtrar coluna', icon: txtIcon('▼'), onClick: openFilter },
            { key: 'clearfilter', label: 'Limpar filtro', icon: txtIcon('✕'), disabled: !filter, onClick: clearFilter },
            { key: 'valid', label: 'Validação de dados', icon: txtIcon('☑'), onClick: openValidation }
          ]
        }
      ]
    },
    {
      key: 'review',
      label: 'Revisão',
      groups: [
        {
          label: 'Comentários',
          items: [
            { key: 'newcmt', label: activeComment ? 'Editar comentário' : 'Novo comentário', icon: <CommentAdd24Regular />, onClick: openComment },
            { key: 'delcmt', label: 'Excluir comentário', icon: <Comment24Regular />, disabled: !activeComment, onClick: deleteComment }
          ]
        }
      ]
    }
  ]

  const formulaValue = editing !== null ? editing : engine.getRaw(sel.ar, sel.ac)
  const selLabel = r1 === r2 && c1 === c2 ? `${colToLetter(sel.ac)}${sel.ar + 1}` : `${colToLetter(c1)}${r1 + 1}:${colToLetter(c2)}${r2 + 1}`

  return (
    <AppShell appName={`${docName} — Planilha`} headerRight={version ? <span style={{ fontSize: 12, opacity: 0.85 }}>v{version}</span> : null} ribbon={ribbon} update={{ status, onInstall: () => void getUpdater()?.install() }}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'var(--ao-green-soft)', borderBottom: '1px solid var(--ao-border)', fontSize: 12, flex: 'none' }}>
            <span style={{ flex: 1 }}>{notice}</span>
            <button onClick={() => setNotice(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ao-text-2)' }}>×</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--ao-border)', flex: 'none' }}>
          <div style={{ width: 84, flex: 'none', textAlign: 'center', fontSize: 12, fontWeight: 600, border: '1px solid var(--ao-border)', borderRadius: 4, padding: '3px 0', fontFamily: 'Consolas, monospace' }}>{selLabel}</div>
          <span style={{ color: 'var(--ao-gold-text)', fontWeight: 700, fontFamily: 'serif' }}>fx</span>
          <input
            value={formulaValue}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onCommit('down') } else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); bump() }
            }}
            placeholder="Valor ou fórmula — ex.: =PROCV(A2; D2:E20; 2)"
            style={{ flex: 1, minWidth: 0, border: '1px solid var(--ao-border)', borderRadius: 4, padding: '4px 8px', fontSize: 13, fontFamily: 'Consolas, monospace', background: 'var(--ao-bg)', color: 'var(--ao-text)' }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <Grid engine={engine} styles={styles} merges={merges} condFormats={condFormats} hiddenRows={hiddenRows} validations={validations} comments={comments} onSetValue={onSetCellValue} onFill={onFill} rows={ROWS} cols={COLS} rev={rev} freezeR={freeze.r} freezeC={freeze.c} sel={sel} editing={editing} setSel={setSel} onStartEdit={(init) => setEditing(init)} onEditChange={(t) => setEditing(t)} onCommit={onCommit} onCancel={() => { setEditing(null); bump() }} onClear={clearContent} onCopy={onCopy} onPaste={onPaste} />
          <ChartLayer charts={charts} engine={engine} rev={rev} selId={selChart} onSelect={setSelChart} onChange={updateChart} onDelete={deleteChart} />
        </div>

        <div style={{ display: 'flex', alignItems: 'stretch', height: 30, borderTop: '1px solid var(--ao-border)', background: 'var(--ao-surface)', flex: 'none' }}>
          {sheets.map((s, i) => {
            const on = i === active
            return (
              <div key={i} onClick={() => { setActive(i); setSelState({ ar: 0, ac: 0, fr: 0, fc: 0 }); setEditing(null); setFilter(null); setSelChart(null) }} onDoubleClick={() => setRenaming(i)} style={{ display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 12, cursor: 'pointer', background: on ? 'var(--ao-bg)' : 'transparent', borderRight: '1px solid var(--ao-border)', borderTop: on ? '2px solid var(--ao-green)' : '2px solid transparent', fontWeight: on ? 600 : 400 }}>
                {renaming === i ? (
                  <input autoFocus defaultValue={s.name} onClick={(e) => e.stopPropagation()} onBlur={(e) => { const v = e.target.value.trim(); if (v) setSheets((arr) => arr.map((x, j) => (j === i ? { ...x, name: v } : x))); setRenaming(null) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }} style={{ width: 90, font: 'inherit', border: '1px solid var(--ao-green)', borderRadius: 3 }} />
                ) : (
                  s.name
                )}
              </div>
            )
          })}
          <button onClick={() => { setSheets((arr) => [...arr, newSheet(`Planilha${arr.length + 1}`)]); setActive(sheets.length) }} aria-label="Nova planilha" style={{ display: 'flex', alignItems: 'center', padding: '0 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ao-green)' }}>
            <Add16Regular />
          </button>
          <div style={{ flex: 1 }} />
          {(r2 > r1 || c2 > c1) && selStats.count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', fontSize: 12, color: 'var(--ao-text-2)', fontFamily: 'Consolas, monospace' }}>
              <span>Média: {(selStats.sum / selStats.count).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
              <span>Contagem: {selStats.nonEmpty}</span>
              <span>Soma: {selStats.sum.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>
      </div>

      <Dialog open={fr.open} onOpenChange={(_, d) => setFr((f) => ({ ...f, open: d.open }))}>
        <DialogSurface style={{ maxWidth: 440 }}>
          <DialogBody>
            <DialogTitle>Localizar e substituir</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Localizar">
                  <Input value={fr.find} onChange={(_, d) => setFr((f) => ({ ...f, find: d.value }))} />
                </Field>
                <Field label="Substituir por">
                  <Input value={fr.replace} onChange={(_, d) => setFr((f) => ({ ...f, replace: d.value }))} />
                </Field>
                <Checkbox label="Diferenciar maiúsculas de minúsculas" checked={fr.matchCase} onChange={(_, d) => setFr((f) => ({ ...f, matchCase: !!d.checked }))} />
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setFr((f) => ({ ...f, open: false }))}>Cancelar</Button>
              <Button appearance="primary" onClick={runFindReplace} disabled={!fr.find}>Substituir tudo</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={cf.open} onOpenChange={(_, d) => setCf((c) => ({ ...c, open: d.open }))}>
        <DialogSurface style={{ maxWidth: 420 }}>
          <DialogBody>
            <DialogTitle>Formatação condicional</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Realçar células do intervalo selecionado onde o valor for:">
                  <select value={cf.op} onChange={(e) => setCf((c) => ({ ...c, op: e.target.value as CondRule['op'] }))} style={{ padding: '5px 6px', border: '1px solid var(--ao-border)', borderRadius: 4 }}>
                    <option value=">">Maior que</option>
                    <option value="<">Menor que</option>
                    <option value=">=">Maior ou igual a</option>
                    <option value="<=">Menor ou igual a</option>
                    <option value="=">Igual a</option>
                    <option value="<>">Diferente de</option>
                    <option value="between">Entre</option>
                  </select>
                </Field>
                <Field label="Valor">
                  <Input value={cf.v1} onChange={(_, d) => setCf((c) => ({ ...c, v1: d.value }))} />
                </Field>
                {cf.op === 'between' && (
                  <Field label="e">
                    <Input value={cf.v2} onChange={(_, d) => setCf((c) => ({ ...c, v2: d.value }))} />
                  </Field>
                )}
                <Field label="Cor de preenchimento">
                  <select value={cf.fill} onChange={(e) => setCf((c) => ({ ...c, fill: e.target.value }))} style={{ padding: '5px 6px', border: '1px solid var(--ao-border)', borderRadius: 4 }}>
                    <option value="#fdf3d0">Amarelo</option>
                    <option value="#eef7f0">Verde</option>
                    <option value="#fbe4ea">Rosa</option>
                    <option value="#e4eefb">Azul</option>
                    <option value="#eef0ee">Cinza</option>
                  </select>
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCf((c) => ({ ...c, open: false }))}>Cancelar</Button>
              <Button appearance="primary" onClick={applyCf} disabled={!cf.v1}>Aplicar</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!filterDlg} onOpenChange={(_, d) => !d.open && setFilterDlg(null)}>
        <DialogSurface style={{ maxWidth: 360 }}>
          <DialogBody>
            <DialogTitle>Filtrar coluna {filterDlg ? colToLetter(filterDlg.col) : ''}</DialogTitle>
            <DialogContent>
              <div style={{ maxHeight: 280, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filterDlg?.values.map((v) => (
                  <Checkbox key={v} label={v === '' ? '(vazias)' : v} checked={filterDlg.checked[v]} onChange={(_, d) => setFilterDlg((f) => (f ? { ...f, checked: { ...f.checked, [v]: !!d.checked } } : f))} />
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setFilterDlg(null)}>Cancelar</Button>
              <Button appearance="primary" onClick={applyFilter}>Aplicar</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={valDlg.open} onOpenChange={(_, d) => setValDlg((v) => ({ ...v, open: d.open }))}>
        <DialogSurface style={{ maxWidth: 420 }}>
          <DialogBody>
            <DialogTitle>Validação de dados (lista)</DialogTitle>
            <DialogContent>
              <Field label="Valores permitidos (separados por vírgula). Deixe vazio para remover a validação.">
                <Input value={valDlg.list} onChange={(_, d) => setValDlg((v) => ({ ...v, list: d.value }))} placeholder="Ex.: Sim, Não, Talvez" />
              </Field>
              <div style={{ fontSize: 12, color: 'var(--ao-text-3)', marginTop: 8 }}>As células do intervalo ganham uma lista suspensa; valores fora da lista ficam com borda vermelha.</div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setValDlg((v) => ({ ...v, open: false }))}>Cancelar</Button>
              <Button appearance="primary" onClick={applyValidation}>Aplicar</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!pivot?.open} onOpenChange={(_, d) => !d.open && setPivot(null)}>
        <DialogSurface style={{ maxWidth: 460 }}>
          <DialogBody>
            <DialogTitle>Tabela dinâmica</DialogTitle>
            <DialogContent>
              {pivot && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--ao-text-3)' }}>Resume o intervalo selecionado em uma nova planilha. A primeira linha é usada como cabeçalho.</div>
                  <Field label="Linhas (agrupar por)">
                    <select value={pivot.rowField} onChange={(e) => setPivot((p) => (p ? { ...p, rowField: Number(e.target.value) } : p))} style={{ padding: '5px 6px', border: '1px solid var(--ao-border)', borderRadius: 4 }}>
                      {pivot.headers.map((h) => (<option key={h.idx} value={h.idx}>{h.name}</option>))}
                    </select>
                  </Field>
                  <Field label="Colunas (opcional)">
                    <select value={pivot.colField} onChange={(e) => setPivot((p) => (p ? { ...p, colField: Number(e.target.value) } : p))} style={{ padding: '5px 6px', border: '1px solid var(--ao-border)', borderRadius: 4 }}>
                      <option value={-1}>(nenhuma)</option>
                      {pivot.headers.map((h) => (<option key={h.idx} value={h.idx}>{h.name}</option>))}
                    </select>
                  </Field>
                  <Field label="Valores">
                    <select value={pivot.valField} onChange={(e) => setPivot((p) => (p ? { ...p, valField: Number(e.target.value) } : p))} style={{ padding: '5px 6px', border: '1px solid var(--ao-border)', borderRadius: 4 }}>
                      {pivot.headers.map((h) => (<option key={h.idx} value={h.idx}>{h.name}</option>))}
                    </select>
                  </Field>
                  <Field label="Resumir por">
                    <select value={pivot.agg} onChange={(e) => setPivot((p) => (p ? { ...p, agg: e.target.value as Agg } : p))} style={{ padding: '5px 6px', border: '1px solid var(--ao-border)', borderRadius: 4 }}>
                      {(Object.keys(AGG_LABEL) as Agg[]).map((a) => (<option key={a} value={a}>{AGG_LABEL[a]}</option>))}
                    </select>
                  </Field>
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPivot(null)}>Cancelar</Button>
              <Button appearance="primary" onClick={applyPivot}>Criar</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!cmt?.open} onOpenChange={(_, d) => !d.open && setCmt(null)}>
        <DialogSurface style={{ maxWidth: 420 }}>
          <DialogBody>
            <DialogTitle>Comentário em {colToLetter(sel.ac)}{sel.ar + 1}</DialogTitle>
            <DialogContent>
              <textarea
                autoFocus
                value={cmt?.text ?? ''}
                onChange={(e) => setCmt((c) => (c ? { ...c, text: e.target.value } : c))}
                placeholder="Escreva uma nota para esta célula…"
                style={{ width: '100%', height: 110, resize: 'vertical', border: '1px solid var(--ao-border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: 'var(--ao-bg)', color: 'var(--ao-text)' }}
              />
              <div style={{ fontSize: 12, color: 'var(--ao-text-3)', marginTop: 8 }}>A célula ganha um marcador vermelho no canto; passe o mouse para ler. Deixe vazio para remover.</div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCmt(null)}>Cancelar</Button>
              <Button appearance="primary" onClick={applyComment}>Salvar</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </AppShell>
  )
}
