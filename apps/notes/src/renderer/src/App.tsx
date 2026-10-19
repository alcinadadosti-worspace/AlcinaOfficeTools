// AlcinaNotes: anotações com lista de notas e aba Início completa (editor compartilhado).
import { useEffect, useRef, useState, type ReactNode, type JSX } from 'react'
import { MenuList, MenuItem, Input } from '@fluentui/react-components'
import {
  DocumentAdd24Regular,
  FolderOpen24Regular,
  Save24Regular,
  Delete24Regular,
  TextBold24Regular,
  TextItalic24Regular,
  TextUnderline24Regular,
  TextStrikethrough24Regular,
  TextSubscript24Regular,
  TextSuperscript24Regular,
  TextFont24Regular,
  FontIncrease24Regular,
  TextClearFormatting24Regular,
  TextBulletList24Regular,
  TextNumberListLtr24Regular,
  TextIndentIncrease24Regular,
  TextIndentDecrease24Regular,
  TextAlignLeft24Regular,
  TextAlignCenter24Regular,
  TextAlignRight24Regular,
  TextAlignJustify24Regular,
  TextT24Regular,
  TextHeader124Regular,
  TextHeader224Regular,
  TextHeader324Regular,
  Search24Regular,
  ArrowUndo24Regular,
  ArrowRedo24Regular
} from '@fluentui/react-icons'
import type { Command } from 'prosemirror-state'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { Editor, FindBar, cmd, setColor, setHighlight, setFontSize, setFontFamily, setLineHeight, changeCase as cmdCase, type EditorApi, type Snapshot } from '@alcina/editor'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import { newNote, saveNotebook, openNotebook, baseName, emptyDoc, type Note } from './io'

const EMPTY: Snapshot = { strong: false, em: false, underline: false, strike: false, sub: false, sup: false, heading: 0, align: null, canUndo: false, canRedo: false }

const FONTS = ['', 'Arial', 'Calibri', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana']
const SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48]
const TEXT_COLORS: [string, string][] = [['', 'Automática'], ['#16211a', 'Preto'], ['#0f7a34', 'Verde'], ['#9a6d0c', 'Dourado'], ['#b64a38', 'Vermelho'], ['#1a5fb4', 'Azul'], ['#6d3fb0', 'Roxo']]
const HIGHLIGHTS: [string, string][] = [['', 'Nenhum'], ['#fff3a3', 'Amarelo'], ['#bdf0c6', 'Verde'], ['#ffd1dc', 'Rosa'], ['#cfe3ff', 'Azul'], ['#e7d4ff', 'Roxo']]

function swatch(c: string): JSX.Element {
  return <span style={{ display: 'inline-block', width: 15, height: 15, borderRadius: 3, background: c || '#ffffff', border: '1px solid var(--ao-border)' }} />
}
function txt(t: string): JSX.Element {
  return <span style={{ fontWeight: 700, fontSize: 13 }}>{t}</span>
}

export function App(): ReactNode {
  const apiRef = useRef<EditorApi | null>(null)
  const [notes, setNotes] = useState<Note[]>(() => [newNote('Nota 1')])
  const [activeId, setActiveId] = useState<string>(notes[0].id)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [snap, setSnap] = useState<Snapshot>(EMPTY)
  const [findOpen, setFindOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'h')) {
        e.preventDefault()
        setFindOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { off?.(); window.removeEventListener('keydown', onKey) }
  }, [])

  const active = notes.find((n) => n.id === activeId) ?? notes[0]
  const exec = (c: Command): void => void apiRef.current?.exec(c)

  // Captura o conteúdo atual do editor para a nota ativa.
  const synced = (): Note[] => {
    const api = apiRef.current
    if (!api) return notes
    const json = api.getJSON()
    return notes.map((n) => (n.id === activeId ? { ...n, doc: json } : n))
  }

  const selectNote = (id: string): void => {
    const api = apiRef.current
    if (!api || id === activeId) return
    setNotes(synced())
    const target = notes.find((n) => n.id === id)
    api.setJSON(target?.doc ?? emptyDoc())
    setActiveId(id)
  }

  const addNote = (): void => {
    const api = apiRef.current
    if (!api) return
    const note = newNote(`Nota ${notes.length + 1}`, active.section ?? 'Geral')
    setNotes([...synced(), note])
    api.setJSON(note.doc)
    setActiveId(note.id)
  }

  const removeNote = (id: string): void => {
    if (notes.length <= 1) return
    const base = id === activeId ? notes : synced()
    const rest = base.filter((n) => n.id !== id)
    setNotes(rest)
    if (id === activeId) {
      const next = rest[0]
      apiRef.current?.setJSON(next.doc)
      setActiveId(next.id)
    }
  }

  const setTitle = (t: string): void => setNotes((ns) => ns.map((n) => (n.id === activeId ? { ...n, title: t } : n)))
  const moveSection = (section: string): void => setNotes((ns) => ns.map((n) => (n.id === activeId ? { ...n, section } : n)))
  const addSection = (): void => {
    const api = apiRef.current
    if (!api) return
    const existing = new Set(notes.map((n) => n.section ?? 'Geral'))
    let i = 1
    while (existing.has(`Seção ${i}`)) i++
    const note = newNote('Nota 1', `Seção ${i}`)
    setNotes([...synced(), note])
    api.setJSON(note.doc)
    setActiveId(note.id)
  }
  const addTag = (t: string): void => {
    const tag = t.trim()
    if (!tag) return
    setNotes((ns) => ns.map((n) => (n.id === activeId ? { ...n, tags: (n.tags ?? []).includes(tag) ? n.tags : [...(n.tags ?? []), tag] } : n)))
  }
  const removeTag = (t: string): void => setNotes((ns) => ns.map((n) => (n.id === activeId ? { ...n, tags: (n.tags ?? []).filter((x) => x !== t) } : n)))

  const doSave = async (): Promise<void> => {
    const list = synced()
    setNotes(list)
    const p = await saveNotebook(list, baseName(path))
    if (p) setPath(p)
  }
  const doOpen = async (): Promise<void> => {
    const r = await openNotebook()
    if (!r) return
    setNotes(r.notes)
    setActiveId(r.notes[0].id)
    apiRef.current?.setJSON(r.notes[0].doc)
    setPath(r.path)
  }

  const colorMenu = (apply: (c: string) => Command, list: [string, string][]): ReactNode => (
    <MenuList>
      {list.map(([v, label]) => (
        <MenuItem key={v || 'x'} icon={swatch(v)} onClick={() => exec(apply(v))}>
          {label}
        </MenuItem>
      ))}
    </MenuList>
  )

  const q = search.trim().toLowerCase()
  const visible = notes.filter((n) => (!q || n.title.toLowerCase().includes(q)) && (!tagFilter || (n.tags ?? []).includes(tagFilter)))
  const sections = Array.from(new Set(notes.map((n) => n.section ?? 'Geral')))
  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags ?? []))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const grouped = sections.map((sec) => ({ section: sec, items: visible.filter((n) => (n.section ?? 'Geral') === sec) })).filter((g) => g.items.length)
  const activeSection = active.section ?? 'Geral'
  const activeTags = active.tags ?? []

  const ribbon: RibbonTab[] = [
    {
      key: 'home',
      label: 'Início',
      groups: [
        {
          label: 'Arquivo',
          items: [
            { key: 'open', label: 'Abrir', icon: <FolderOpen24Regular />, onClick: () => void doOpen() },
            { key: 'save', label: 'Salvar', icon: <Save24Regular />, onClick: () => void doSave() }
          ]
        },
        {
          label: 'Notas',
          items: [
            { key: 'new', label: 'Nova nota', icon: <DocumentAdd24Regular />, onClick: addNote },
            { key: 'newsec', label: 'Nova seção', icon: txt('§'), onClick: addSection },
            { key: 'del', label: 'Excluir', icon: <Delete24Regular />, disabled: notes.length <= 1, onClick: () => removeNote(activeId) }
          ]
        },
        {
          label: 'Fonte',
          items: [
            { key: 'font', label: 'Fonte', icon: <TextFont24Regular />, menu: <MenuList>{FONTS.map((f) => (<MenuItem key={f || 'def'} onClick={() => exec(setFontFamily(f))} style={{ fontFamily: f || undefined }}>{f || 'Padrão'}</MenuItem>))}</MenuList> },
            { key: 'size', label: 'Tamanho', icon: <FontIncrease24Regular />, menu: <MenuList>{SIZES.map((s) => (<MenuItem key={s} onClick={() => exec(setFontSize(s))}>{s}</MenuItem>))}</MenuList> },
            { key: 'b', label: 'Negrito', icon: <TextBold24Regular />, active: snap.strong, onClick: () => exec(cmd.bold) },
            { key: 'i', label: 'Itálico', icon: <TextItalic24Regular />, active: snap.em, onClick: () => exec(cmd.italic) },
            { key: 'u', label: 'Sublinhado', icon: <TextUnderline24Regular />, active: snap.underline, onClick: () => exec(cmd.underline) },
            { key: 's', label: 'Tachado', icon: <TextStrikethrough24Regular />, active: snap.strike, onClick: () => exec(cmd.strike) },
            { key: 'sub', label: 'Subscrito', icon: <TextSubscript24Regular />, active: snap.sub, onClick: () => exec(cmd.sub) },
            { key: 'sup', label: 'Sobrescrito', icon: <TextSuperscript24Regular />, active: snap.sup, onClick: () => exec(cmd.sup) },
            { key: 'case', label: 'Maiúsc/Minúsc', icon: txt('Aa'), menu: <MenuList><MenuItem onClick={() => exec(cmdCase('upper'))}>MAIÚSCULAS</MenuItem><MenuItem onClick={() => exec(cmdCase('lower'))}>minúsculas</MenuItem><MenuItem onClick={() => exec(cmdCase('title'))}>Iniciais Maiúsculas</MenuItem></MenuList> },
            { key: 'tcolor', label: 'Cor da fonte', icon: <span style={{ fontWeight: 700, borderBottom: '3px solid #b64a38' }}>A</span>, menu: colorMenu(setColor, TEXT_COLORS) },
            { key: 'hl', label: 'Realce', icon: swatch('#fff3a3'), menu: colorMenu(setHighlight, HIGHLIGHTS) },
            { key: 'clear', label: 'Limpar formatação', icon: <TextClearFormatting24Regular />, onClick: () => exec(cmd.clearFormat) }
          ]
        },
        {
          label: 'Parágrafo',
          items: [
            { key: 'ul', label: 'Marcadores', icon: <TextBulletList24Regular />, onClick: () => exec(cmd.bullet) },
            { key: 'ol', label: 'Numerada', icon: <TextNumberListLtr24Regular />, onClick: () => exec(cmd.ordered) },
            { key: 'task', label: 'Lista de tarefas', icon: txt('☑'), onClick: () => exec(cmd.taskList) },
            { key: 'indless', label: 'Diminuir recuo', icon: <TextIndentDecrease24Regular />, onClick: () => exec(cmd.indentLess) },
            { key: 'indmore', label: 'Aumentar recuo', icon: <TextIndentIncrease24Regular />, onClick: () => exec(cmd.indentMore) },
            { key: 'al', label: 'Esquerda', icon: <TextAlignLeft24Regular />, active: snap.align === 'left' || snap.align === null, onClick: () => exec(cmd.alignLeft) },
            { key: 'ac', label: 'Centro', icon: <TextAlignCenter24Regular />, active: snap.align === 'center', onClick: () => exec(cmd.alignCenter) },
            { key: 'ar', label: 'Direita', icon: <TextAlignRight24Regular />, active: snap.align === 'right', onClick: () => exec(cmd.alignRight) },
            { key: 'aj', label: 'Justificar', icon: <TextAlignJustify24Regular />, active: snap.align === 'justify', onClick: () => exec(cmd.alignJustify) },
            { key: 'ls', label: 'Espaçamento', icon: txt('↕'), menu: <MenuList><MenuItem onClick={() => exec(setLineHeight(null))}>Simples</MenuItem><MenuItem onClick={() => exec(setLineHeight('1.15'))}>1,15</MenuItem><MenuItem onClick={() => exec(setLineHeight('1.5'))}>1,5</MenuItem><MenuItem onClick={() => exec(setLineHeight('2'))}>Duplo</MenuItem></MenuList> }
          ]
        },
        {
          label: 'Estilos',
          items: [
            { key: 'p', label: 'Normal', icon: <TextT24Regular />, active: snap.heading === 0, onClick: () => exec(cmd.paragraph) },
            { key: 'h1', label: 'Título 1', icon: <TextHeader124Regular />, active: snap.heading === 1, onClick: () => exec(cmd.h1) },
            { key: 'h2', label: 'Título 2', icon: <TextHeader224Regular />, active: snap.heading === 2, onClick: () => exec(cmd.h2) },
            { key: 'h3', label: 'Título 3', icon: <TextHeader324Regular />, active: snap.heading === 3, onClick: () => exec(cmd.h3) }
          ]
        },
        {
          label: 'Edição',
          items: [
            { key: 'find', label: 'Localizar', icon: <Search24Regular />, onClick: () => setFindOpen(true) },
            { key: 'undo', label: 'Desfazer', icon: <ArrowUndo24Regular />, disabled: !snap.canUndo, onClick: () => exec(cmd.undo) },
            { key: 'redo', label: 'Refazer', icon: <ArrowRedo24Regular />, disabled: !snap.canRedo, onClick: () => exec(cmd.redo) }
          ]
        }
      ]
    }
  ]

  return (
    <AppShell
      appName={`${baseName(path)} — Notas`}
      headerRight={version ? <span style={{ fontSize: 12, opacity: 0.85 }}>v{version}</span> : null}
      ribbon={ribbon}
      update={{ status, onInstall: () => void getUpdater()?.install() }}
    >
      {notice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'var(--ao-green-soft)', borderBottom: '1px solid var(--ao-border)', fontSize: 12, flex: 'none' }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ao-text-2)' }}>×</button>
        </div>
      )}
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <aside style={{ width: 260, flex: 'none', borderRight: '1px solid var(--ao-border)', background: 'var(--ao-surface)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Input size="small" placeholder="Pesquisar notas…" value={search} onChange={(_, d) => setSearch(d.value)} style={{ width: '100%' }} />
            {allTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {allTags.map((t) => (
                  <button key={t} onClick={() => setTagFilter((f) => (f === t ? null : t))} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 100, border: '1px solid var(--ao-border)', cursor: 'pointer', background: tagFilter === t ? 'var(--ao-green)' : 'var(--ao-surface-2)', color: tagFilter === t ? '#fff' : 'var(--ao-text-2)' }}>
                    #{t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {grouped.map((g) => (
              <div key={g.section}>
                <div style={{ padding: '7px 12px 2px', fontSize: 11, fontWeight: 700, color: 'var(--ao-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{g.section}</div>
                {g.items.map((n) => {
                  const on = n.id === activeId
                  return (
                    <div
                      key={n.id}
                      onClick={() => selectNote(n.id)}
                      style={{ padding: '7px 12px', cursor: 'pointer', borderLeft: on ? '3px solid var(--ao-green)' : '3px solid transparent', background: on ? 'var(--ao-green-soft)' : 'transparent', fontSize: 13, fontWeight: on ? 600 : 400, color: 'var(--ao-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {n.title || 'Sem título'}
                    </div>
                  )
                })}
              </div>
            ))}
            {grouped.length === 0 && <div style={{ padding: 16, color: 'var(--ao-text-3)', fontSize: 12 }}>Nenhuma nota encontrada.</div>}
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--ao-surface-2)' }}>
          <div style={{ padding: '10px 16px', background: 'var(--ao-bg)', borderBottom: '1px solid var(--ao-border)', flex: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <input
              value={active.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da nota"
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 20, fontWeight: 600, background: 'transparent', color: 'var(--ao-text)' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select value={activeSection} onChange={(e) => moveSection(e.target.value)} title="Seção" style={{ fontSize: 12, padding: '2px 6px', border: '1px solid var(--ao-border)', borderRadius: 4, background: 'var(--ao-surface)', color: 'var(--ao-text)' }}>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {activeTags.map((t) => (
                <span key={t} style={{ fontSize: 11, padding: '1px 4px 1px 8px', borderRadius: 100, background: 'var(--ao-green-soft)', color: 'var(--ao-green-strong)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  #{t}
                  <button onClick={() => removeTag(t)} aria-label="Remover marcador" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 13, lineHeight: 1 }}>
                    ×
                  </button>
                </span>
              ))}
              <input
                placeholder="+ marcador"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag((e.target as HTMLInputElement).value)
                    ;(e.target as HTMLInputElement).value = ''
                  }
                }}
                style={{ width: 92, fontSize: 12, border: '1px solid var(--ao-border)', borderRadius: 4, padding: '2px 6px', background: 'transparent', color: 'var(--ao-text)' }}
              />
            </div>
          </div>
          {findOpen && <FindBar apiRef={apiRef} onClose={() => setFindOpen(false)} />}
          <div className="ao-doc-host" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 28px', background: 'var(--ao-bg)' }}>
            <Editor apiRef={apiRef} onState={setSnap} />
          </div>
        </main>
      </div>
    </AppShell>
  )
}
