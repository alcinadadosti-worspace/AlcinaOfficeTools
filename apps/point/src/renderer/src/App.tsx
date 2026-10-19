// AlcinaPoint: apresentações com formas, formatação, organização e exportação .pptx.
import { useEffect, useState, type ReactNode, type JSX } from 'react'
import { MenuList, MenuItem, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Button, Field, Textarea } from '@fluentui/react-components'
import {
  SlideAdd24Regular,
  Copy24Regular,
  Delete24Regular,
  TextT24Regular,
  Image24Regular,
  Shapes24Regular,
  TextFont24Regular,
  FontIncrease24Regular,
  FontDecrease24Regular,
  TextBold24Regular,
  TextItalic24Regular,
  TextUnderline24Regular,
  TextAlignLeft24Regular,
  TextAlignCenter24Regular,
  TextAlignRight24Regular,
  Play24Regular,
  ArrowDownload24Regular,
  FolderOpen24Regular
} from '@fluentui/react-icons'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import { type ElementType, type SlideElement, type Deck, type ChartData, isShape, SLIDE_W, SLIDE_H } from '../../shared/deck'
import { newDeck, newSlide, newElement, mapSlide, mapElement, uid } from './model'
import { SlideView } from './SlideView'
import { SlideCanvas } from './SlideCanvas'
import { Present } from './Present'
import { saveDeck, openDeck, exportPptx, importPptx, pickImage, baseName } from './io'

const FONTS = ['', 'Arial', 'Calibri', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana']
const TEXT_COLORS: [string, string][] = [['#16211a', 'Preto'], ['#ffffff', 'Branco'], ['#0f7a34', 'Verde'], ['#9a6d0c', 'Dourado'], ['#b64a38', 'Vermelho'], ['#1a5fb4', 'Azul'], ['#6d3fb0', 'Roxo']]
const FILL_COLORS: [string, string][] = [['#0f7a34', 'Verde'], ['#c79a2a', 'Dourado'], ['#b64a38', 'Vermelho'], ['#1a5fb4', 'Azul'], ['#6d3fb0', 'Roxo'], ['#5c6e62', 'Cinza'], ['#16211a', 'Preto'], ['#ffffff', 'Branco']]
const SLIDE_BGS: [string, string][] = [['#ffffff', 'Branco'], ['#f4f7f3', 'Verde claro'], ['#0f7a34', 'Verde'], ['#0a5831', 'Verde escuro'], ['#16211a', 'Preto'], ['#1a2b3c', 'Azul escuro']]
const SHAPES: [ElementType, string][] = [['rect', 'Retângulo'], ['rounded', 'Arredondado'], ['ellipse', 'Elipse'], ['triangle', 'Triângulo'], ['line', 'Linha'], ['arrow', 'Seta']]

function swatch(c: string): JSX.Element {
  return <span style={{ display: 'inline-block', width: 15, height: 15, borderRadius: 3, background: c, border: '1px solid var(--ao-border)' }} />
}
function txt(t: string): JSX.Element {
  return <span style={{ fontWeight: 700, fontSize: 13 }}>{t}</span>
}
function shapeGlyph(type: ElementType): JSX.Element {
  const c = 'var(--ao-green)'
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
      {type === 'rect' && <rect x={2} y={4} width={14} height={10} fill={c} />}
      {type === 'rounded' && <rect x={2} y={4} width={14} height={10} rx={3} fill={c} />}
      {type === 'ellipse' && <ellipse cx={9} cy={9} rx={7} ry={5} fill={c} />}
      {type === 'triangle' && <polygon points="9,2 16,16 2,16" fill={c} />}
      {type === 'line' && <line x1={2} y1={16} x2={16} y2={2} stroke={c} strokeWidth={2.5} strokeLinecap="round" />}
      {type === 'arrow' && <g stroke={c} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1={2} y1={9} x2={14} y2={9} /><polyline points="10,5 15,9 10,13" /></g>}
    </svg>
  )
}

const CHART_TYPES: [ChartData['type'], string][] = [['column', 'Coluna'], ['bar', 'Barra'], ['line', 'Linha'], ['pie', 'Pizza']]
function chartToText(c: ChartData): string {
  return [c.categories.join(', '), ...c.series.map((s) => [s.name, ...s.data].join(', '))].join('\n')
}
function textToChart(text: string, type: ChartData['type']): ChartData {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const categories = (lines[0] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const series = lines.slice(1).map((line) => {
    const p = line.split(',').map((s) => s.trim())
    return { name: p[0] || 'Série', data: p.slice(1).map((x) => { const n = Number(x); return isFinite(n) ? n : 0 }) }
  })
  return { type, categories, series: series.length ? series : [{ name: 'Série 1', data: [] }] }
}

export function App(): ReactNode {
  const [deck, setDeck] = useState<Deck>(() => newDeck())
  const [current, setCurrent] = useState(0)
  const [selId, setSelId] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')
  const [path, setPath] = useState<string | null>(null)
  const [chartEdit, setChartEdit] = useState<{ id: string; text: string; type: ChartData['type'] } | null>(null)

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    return () => off?.()
  }, [])

  const idx = Math.min(current, deck.slides.length - 1)
  const slide = deck.slides[idx]
  const selEl = slide.elements.find((e) => e.id === selId) ?? null
  const selText = selEl && selEl.type === 'text' ? selEl : null
  const selShape = selEl && isShape(selEl.type) ? selEl : null
  const selChartEl = selEl && selEl.type === 'chart' && selEl.chart ? selEl : null
  const name = baseName(path)

  const changeEl = (id: string, patch: Partial<SlideElement>): void => setDeck((d) => mapSlide(d, idx, (s) => mapElement(s, id, (e) => ({ ...e, ...patch }))))
  const add = (type: ElementType, image?: string): void => {
    const el = newElement(type, image)
    setDeck((d) => mapSlide(d, idx, (s) => ({ ...s, elements: [...s.elements, el] })))
    setSelId(el.id)
  }
  const fmt = (patch: Partial<SlideElement>): void => { if (selText) changeEl(selText.id, patch) }
  const bumpFont = (delta: number): void => { if (selText) changeEl(selText.id, { fontSize: Math.max(8, (selText.fontSize ?? 20) + delta) }) }
  const duplicate = (): void => {
    if (!selEl) return
    const copy = { ...selEl, id: uid('e'), x: selEl.x + 16, y: selEl.y + 16 }
    setDeck((d) => mapSlide(d, idx, (s) => ({ ...s, elements: [...s.elements, copy] })))
    setSelId(copy.id)
  }
  const del = (): void => {
    if (!selId) return
    setDeck((d) => mapSlide(d, idx, (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== selId) })))
    setSelId(null)
  }
  const arrange = (mode: 'front' | 'back' | 'forward' | 'backward'): void =>
    setDeck((d) =>
      mapSlide(d, idx, (s) => {
        const els = [...s.elements]
        const i = els.findIndex((e) => e.id === selId)
        if (i < 0) return s
        const [el] = els.splice(i, 1)
        if (mode === 'front') els.push(el)
        else if (mode === 'back') els.unshift(el)
        else if (mode === 'forward') els.splice(Math.min(els.length, i + 1), 0, el)
        else els.splice(Math.max(0, i - 1), 0, el)
        return { ...s, elements: els }
      })
    )
  const setBg = (color: string): void => setDeck((d) => mapSlide(d, idx, (s) => ({ ...s, background: color })))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (presenting || !selId) return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const addSlide = (): void => { const s = newSlide(); setDeck((d) => ({ ...d, slides: [...d.slides.slice(0, idx + 1), s, ...d.slides.slice(idx + 1)] })); setCurrent(idx + 1); setSelId(null) }
  const dupSlide = (): void => { const src = deck.slides[idx]; const copy = { id: uid('s'), background: src.background, elements: src.elements.map((e) => ({ ...e, id: uid('e') })) }; setDeck((d) => ({ ...d, slides: [...d.slides.slice(0, idx + 1), copy, ...d.slides.slice(idx + 1)] })); setCurrent(idx + 1); setSelId(null) }
  const delSlide = (): void => { if (deck.slides.length <= 1) return; setDeck((d) => ({ ...d, slides: d.slides.filter((_, j) => j !== idx) })); setCurrent(Math.max(0, idx - 1)); setSelId(null) }
  const moveSlide = (dir: -1 | 1): void => {
    const j = idx + dir
    if (j < 0 || j >= deck.slides.length) return
    setDeck((d) => { const s = [...d.slides]; const [m] = s.splice(idx, 1); s.splice(j, 0, m); return { ...d, slides: s } })
    setCurrent(j)
  }
  const centerEl = (axis: 'x' | 'y'): void => {
    if (!selEl) return
    changeEl(selEl.id, axis === 'x' ? { x: Math.round((SLIDE_W - selEl.w) / 2) } : { y: Math.round((SLIDE_H - selEl.h) / 2) })
  }

  const run = (fn: () => Promise<unknown>) => (): void => void fn()
  const colorMenu = (apply: (c: string) => void, list: [string, string][]): ReactNode => (
    <MenuList>{list.map(([v, n]) => (<MenuItem key={v} icon={swatch(v)} onClick={() => apply(v)}>{n}</MenuItem>))}</MenuList>
  )

  const ribbon: RibbonTab[] = [
    {
      key: 'home',
      label: 'Página Inicial',
      groups: [
        {
          label: 'Arquivo',
          items: [
            { key: 'new', label: 'Novo', icon: <TextT24Regular />, onClick: () => { setDeck(newDeck()); setCurrent(0); setSelId(null); setPath(null) } },
            { key: 'open', label: 'Abrir', icon: <Image24Regular />, onClick: run(async () => { const r = await openDeck(); if (r) { setDeck(r.deck); setCurrent(0); setSelId(null); setPath(r.path) } }) },
            { key: 'importpptx', label: 'Abrir PPTX', icon: <FolderOpen24Regular />, onClick: run(async () => { const r = await importPptx(); if (r) { setDeck(r.deck); setCurrent(0); setSelId(null); setPath(null) } }) },
            { key: 'save', label: 'Salvar', icon: <ArrowDownload24Regular />, onClick: run(async () => { const p = await saveDeck(deck, name); if (p) setPath(p) }) }
          ]
        },
        {
          label: 'Slides',
          items: [
            { key: 'add', label: 'Novo slide', icon: <SlideAdd24Regular />, onClick: addSlide },
            { key: 'dup', label: 'Duplicar', icon: <Copy24Regular />, onClick: dupSlide },
            { key: 'del', label: 'Excluir', icon: <Delete24Regular />, disabled: deck.slides.length <= 1, onClick: delSlide },
            { key: 'mup', label: 'Mover ↑', icon: txt('↑'), disabled: idx <= 0, onClick: () => moveSlide(-1) },
            { key: 'mdn', label: 'Mover ↓', icon: txt('↓'), disabled: idx >= deck.slides.length - 1, onClick: () => moveSlide(1) },
            { key: 'bg', label: 'Fundo', icon: swatch(slide.background), menu: colorMenu(setBg, SLIDE_BGS) }
          ]
        },
        {
          label: 'Inserir',
          items: [
            { key: 'text', label: 'Texto', icon: <TextT24Regular />, onClick: () => add('text') },
            { key: 'img', label: 'Imagem', icon: <Image24Regular />, onClick: run(async () => { const url = await pickImage(); if (url) add('image', url) }) },
            { key: 'shapes', label: 'Formas', icon: <Shapes24Regular />, menu: <MenuList>{SHAPES.map(([t, n]) => (<MenuItem key={t} icon={shapeGlyph(t)} onClick={() => add(t)}>{n}</MenuItem>))}</MenuList> },
            { key: 'chart', label: 'Gráfico', icon: txt('▊'), onClick: () => add('chart') },
            { key: 'ctype', label: 'Tipo', icon: txt('◴'), disabled: !selChartEl, menu: <MenuList>{CHART_TYPES.map(([v, n]) => (<MenuItem key={v} onClick={() => selChartEl && changeEl(selChartEl.id, { chart: { ...selChartEl.chart!, type: v } })}>{n}</MenuItem>))}</MenuList> },
            { key: 'cdata', label: 'Editar dados', icon: txt('⋯'), disabled: !selChartEl, onClick: () => selChartEl && setChartEdit({ id: selChartEl.id, text: chartToText(selChartEl.chart!), type: selChartEl.chart!.type }) }
          ]
        },
        {
          label: 'Fonte',
          items: [
            { key: 'font', label: 'Fonte', icon: <TextFont24Regular />, disabled: !selText, menu: <MenuList>{FONTS.map((f) => (<MenuItem key={f || 'def'} onClick={() => fmt({ fontFamily: f || undefined })} style={{ fontFamily: f || undefined }}>{f || 'Padrão'}</MenuItem>))}</MenuList> },
            { key: 'fup', label: 'Maior', icon: <FontIncrease24Regular />, disabled: !selText, onClick: () => bumpFont(2) },
            { key: 'fdn', label: 'Menor', icon: <FontDecrease24Regular />, disabled: !selText, onClick: () => bumpFont(-2) },
            { key: 'b', label: 'Negrito', icon: <TextBold24Regular />, disabled: !selText, active: !!selText?.bold, onClick: () => fmt({ bold: !selText?.bold }) },
            { key: 'i', label: 'Itálico', icon: <TextItalic24Regular />, disabled: !selText, active: !!selText?.italic, onClick: () => fmt({ italic: !selText?.italic }) },
            { key: 'u', label: 'Sublinhado', icon: <TextUnderline24Regular />, disabled: !selText, active: !!selText?.underline, onClick: () => fmt({ underline: !selText?.underline }) },
            { key: 'tc', label: 'Cor', icon: <span style={{ fontWeight: 700, borderBottom: '3px solid #b64a38' }}>A</span>, disabled: !selText, menu: colorMenu((c) => fmt({ color: c }), TEXT_COLORS) }
          ]
        },
        {
          label: 'Alinhamento',
          items: [
            { key: 'al', label: 'Esquerda', icon: <TextAlignLeft24Regular />, disabled: !selText, active: selText?.align === 'left', onClick: () => fmt({ align: 'left' }) },
            { key: 'ac', label: 'Centro', icon: <TextAlignCenter24Regular />, disabled: !selText, active: selText?.align === 'center', onClick: () => fmt({ align: 'center' }) },
            { key: 'ar', label: 'Direita', icon: <TextAlignRight24Regular />, disabled: !selText, active: selText?.align === 'right', onClick: () => fmt({ align: 'right' }) }
          ]
        },
        {
          label: 'Forma',
          items: [
            { key: 'fill', label: 'Preenchimento', icon: swatch(selShape?.fill || '#0f7a34'), disabled: !selShape, menu: colorMenu((c) => selShape && changeEl(selShape.id, { fill: c }), FILL_COLORS) },
            { key: 'line', label: 'Contorno', icon: swatch(selShape?.stroke || '#16211a'), disabled: !selShape, menu: colorMenu((c) => selShape && changeEl(selShape.id, { stroke: c, strokeWidth: selShape.strokeWidth || 2 }), FILL_COLORS) }
          ]
        },
        {
          label: 'Organizar',
          items: [
            { key: 'front', label: 'Para frente', icon: txt('⬆'), disabled: !selId, onClick: () => arrange('front') },
            { key: 'back', label: 'Para trás', icon: txt('⬇'), disabled: !selId, onClick: () => arrange('back') },
            { key: 'eldup', label: 'Duplicar', icon: <Copy24Regular />, disabled: !selId, onClick: duplicate },
            { key: 'eldel', label: 'Excluir', icon: <Delete24Regular />, disabled: !selId, onClick: del },
            { key: 'cx', label: 'Centralizar H', icon: txt('↔'), disabled: !selId, onClick: () => centerEl('x') },
            { key: 'cy', label: 'Centralizar V', icon: txt('↕'), disabled: !selId, onClick: () => centerEl('y') }
          ]
        },
        {
          label: 'Apresentação',
          items: [
            { key: 'play', label: 'Iniciar', icon: <Play24Regular />, onClick: () => setPresenting(true) },
            { key: 'pptx', label: 'Exportar PPTX', icon: <ArrowDownload24Regular />, onClick: run(async () => { await exportPptx(deck, name) }) }
          ]
        }
      ]
    }
  ]

  return (
    <AppShell appName={`${name} — Apresentação`} headerRight={version ? <span style={{ fontSize: 12, opacity: 0.85 }}>v{version}</span> : null} ribbon={ribbon} update={{ status, onInstall: () => void getUpdater()?.install() }}>
      <div className="ao-point-root">
        <div className="ao-point-thumbs">
          {deck.slides.map((s, i) => (
            <div key={s.id} className={`ao-point-thumb${i === idx ? ' sel' : ''}`} onClick={() => { setCurrent(i); setSelId(null) }}>
              <span className="num">{i + 1}</span>
              <SlideView slide={s} width={152} />
            </div>
          ))}
        </div>
        <SlideCanvas slide={slide} selId={selId} onSelect={setSelId} onChange={changeEl} onCommitText={(id, text) => changeEl(id, { text })} />
      </div>
      {presenting && <Present deck={deck} start={idx} onClose={() => setPresenting(false)} />}
      <Dialog open={!!chartEdit} onOpenChange={(_, d) => !d.open && setChartEdit(null)}>
        <DialogSurface style={{ maxWidth: 520 }}>
          <DialogBody>
            <DialogTitle>Dados do gráfico</DialogTitle>
            <DialogContent>
              <Field label="1ª linha = categorias; demais linhas = Nome,valor,valor… (vírgula separa; ponto é decimal)">
                <Textarea value={chartEdit?.text ?? ''} onChange={(_, d) => setChartEdit((c) => (c ? { ...c, text: d.value } : c))} textarea={{ rows: 8, style: { fontFamily: 'Consolas, monospace' } }} />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setChartEdit(null)}>Cancelar</Button>
              <Button appearance="primary" onClick={() => { if (chartEdit) changeEl(chartEdit.id, { chart: textToChart(chartEdit.text, chartEdit.type) }); setChartEdit(null) }}>Aplicar</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </AppShell>
  )
}
