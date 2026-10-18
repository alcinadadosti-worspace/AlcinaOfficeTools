// AlcinaPoint: apresentações com slides, formas, imagens e exportação .pptx.
import { useEffect, useState, type ReactNode } from 'react'
import {
  DocumentAdd24Regular,
  FolderOpen24Regular,
  Save24Regular,
  SlideAdd24Regular,
  Copy24Regular,
  Delete24Regular,
  TextT24Regular,
  Square24Regular,
  Circle24Regular,
  Image24Regular,
  TextBold24Regular,
  TextItalic24Regular,
  FontIncrease24Regular,
  FontDecrease24Regular,
  TextAlignLeft24Regular,
  TextAlignCenter24Regular,
  TextAlignRight24Regular,
  Play24Regular,
  ArrowDownload24Regular
} from '@fluentui/react-icons'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import type { Deck, SlideElement, ElementType } from '../../shared/deck'
import { newDeck, newSlide, newElement, mapSlide, mapElement, uid } from './model'
import { SlideView } from './SlideView'
import { SlideCanvas } from './SlideCanvas'
import { Present } from './Present'
import { saveDeck, openDeck, exportPptx, pickImage, baseName } from './io'

export function App(): ReactNode {
  const [deck, setDeck] = useState<Deck>(() => newDeck())
  const [current, setCurrent] = useState(0)
  const [selId, setSelId] = useState<string | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    return () => off?.()
  }, [])

  const idx = Math.min(current, deck.slides.length - 1)
  const slide = deck.slides[idx]
  const selEl = slide.elements.find((e) => e.id === selId) ?? null
  const selText = selEl && selEl.type === 'text' ? selEl : null
  const name = baseName(path)

  const changeEl = (id: string, patch: Partial<SlideElement>): void => setDeck((d) => mapSlide(d, idx, (s) => mapElement(s, id, (e) => ({ ...e, ...patch }))))
  const add = (type: ElementType, image?: string): void => {
    const el = newElement(type, image)
    setDeck((d) => mapSlide(d, idx, (s) => ({ ...s, elements: [...s.elements, el] })))
    setSelId(el.id)
  }
  const fmt = (patch: Partial<SlideElement>): void => {
    if (selText) changeEl(selText.id, patch)
  }
  const bumpFont = (delta: number): void => {
    if (selText) changeEl(selText.id, { fontSize: Math.max(8, (selText.fontSize ?? 20) + delta) })
  }

  const addSlide = (): void => {
    const s = newSlide()
    setDeck((d) => ({ ...d, slides: [...d.slides.slice(0, idx + 1), s, ...d.slides.slice(idx + 1)] }))
    setCurrent(idx + 1)
    setSelId(null)
  }
  const dupSlide = (): void => {
    const src = deck.slides[idx]
    const copy = { id: uid('s'), background: src.background, elements: src.elements.map((e) => ({ ...e, id: uid('e') })) }
    setDeck((d) => ({ ...d, slides: [...d.slides.slice(0, idx + 1), copy, ...d.slides.slice(idx + 1)] }))
    setCurrent(idx + 1)
    setSelId(null)
  }
  const delSlide = (): void => {
    if (deck.slides.length <= 1) return
    setDeck((d) => ({ ...d, slides: d.slides.filter((_, j) => j !== idx) }))
    setCurrent(Math.max(0, idx - 1))
    setSelId(null)
  }

  const run = (fn: () => Promise<unknown>) => (): void => void fn()

  const ribbon: RibbonTab[] = [
    {
      key: 'home',
      label: 'Início',
      groups: [
        {
          label: 'Arquivo',
          items: [
            { key: 'new', label: 'Novo', icon: <DocumentAdd24Regular />, onClick: () => { setDeck(newDeck()); setCurrent(0); setSelId(null); setPath(null) } },
            { key: 'open', label: 'Abrir', icon: <FolderOpen24Regular />, onClick: run(async () => { const r = await openDeck(); if (r) { setDeck(r.deck); setCurrent(0); setSelId(null); setPath(r.path) } }) },
            { key: 'save', label: 'Salvar', icon: <Save24Regular />, onClick: run(async () => { const p = await saveDeck(deck, name); if (p) setPath(p) }) }
          ]
        },
        {
          label: 'Slides',
          items: [
            { key: 'add', label: 'Novo slide', icon: <SlideAdd24Regular />, onClick: addSlide },
            { key: 'dup', label: 'Duplicar', icon: <Copy24Regular />, onClick: dupSlide },
            { key: 'del', label: 'Excluir', icon: <Delete24Regular />, disabled: deck.slides.length <= 1, onClick: delSlide }
          ]
        },
        {
          label: 'Inserir',
          items: [
            { key: 'text', label: 'Texto', icon: <TextT24Regular />, onClick: () => add('text') },
            { key: 'rect', label: 'Retângulo', icon: <Square24Regular />, onClick: () => add('rect') },
            { key: 'ellipse', label: 'Elipse', icon: <Circle24Regular />, onClick: () => add('ellipse') },
            { key: 'img', label: 'Imagem', icon: <Image24Regular />, onClick: run(async () => { const url = await pickImage(); if (url) add('image', url) }) }
          ]
        },
        {
          label: 'Texto',
          items: [
            { key: 'b', label: 'Negrito', icon: <TextBold24Regular />, disabled: !selText, active: !!selText?.bold, onClick: () => fmt({ bold: !selText?.bold }) },
            { key: 'i', label: 'Itálico', icon: <TextItalic24Regular />, disabled: !selText, active: !!selText?.italic, onClick: () => fmt({ italic: !selText?.italic }) },
            { key: 'fup', label: 'Maior', icon: <FontIncrease24Regular />, disabled: !selText, onClick: () => bumpFont(2) },
            { key: 'fdn', label: 'Menor', icon: <FontDecrease24Regular />, disabled: !selText, onClick: () => bumpFont(-2) },
            { key: 'al', label: 'Esquerda', icon: <TextAlignLeft24Regular />, disabled: !selText, active: selText?.align === 'left', onClick: () => fmt({ align: 'left' }) },
            { key: 'ac', label: 'Centro', icon: <TextAlignCenter24Regular />, disabled: !selText, active: selText?.align === 'center', onClick: () => fmt({ align: 'center' }) },
            { key: 'ar', label: 'Direita', icon: <TextAlignRight24Regular />, disabled: !selText, active: selText?.align === 'right', onClick: () => fmt({ align: 'right' }) }
          ]
        },
        {
          label: 'Apresentar',
          items: [
            { key: 'play', label: 'Iniciar', icon: <Play24Regular />, onClick: () => setPresenting(true) },
            { key: 'pptx', label: 'Exportar PPTX', icon: <ArrowDownload24Regular />, onClick: run(async () => { await exportPptx(deck, name) }) }
          ]
        }
      ]
    }
  ]

  return (
    <AppShell
      appName={`${name} — Apresentação`}
      headerRight={version ? <span style={{ fontSize: 12, opacity: 0.85 }}>v{version}</span> : null}
      ribbon={ribbon}
      update={{ status, onInstall: () => void getUpdater()?.install() }}
    >
      <div className="ao-point-root">
        <div className="ao-point-thumbs">
          {deck.slides.map((s, i) => (
            <div
              key={s.id}
              className={`ao-point-thumb${i === idx ? ' sel' : ''}`}
              onClick={() => {
                setCurrent(i)
                setSelId(null)
              }}
            >
              <span className="num">{i + 1}</span>
              <SlideView slide={s} width={152} />
            </div>
          ))}
        </div>
        <SlideCanvas slide={slide} selId={selId} onSelect={setSelId} onChange={changeEl} onCommitText={(id, text) => changeEl(id, { text })} />
      </div>
      {presenting && <Present deck={deck} start={idx} onClose={() => setPresenting(false)} />}
    </AppShell>
  )
}
