// AlcinaNotes: anotações com lista de notas e o editor compartilhado.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Input } from '@fluentui/react-components'
import {
  DocumentAdd24Regular,
  FolderOpen24Regular,
  Save24Regular,
  Delete24Regular,
  TextBold24Regular,
  TextItalic24Regular,
  TextUnderline24Regular,
  TextBulletList24Regular,
  TextNumberListLtr24Regular,
  TextT24Regular,
  TextHeader124Regular,
  TextHeader224Regular
} from '@fluentui/react-icons'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { Editor, cmd, type EditorApi, type Snapshot } from '@alcina/editor'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import { newNote, saveNotebook, openNotebook, baseName, emptyDoc, type Note } from './io'

const EMPTY: Snapshot = { strong: false, em: false, underline: false, strike: false, sub: false, sup: false, heading: 0, align: null, canUndo: false, canRedo: false }

export function App(): ReactNode {
  const apiRef = useRef<EditorApi | null>(null)
  const [notes, setNotes] = useState<Note[]>(() => [newNote('Nota 1')])
  const [activeId, setActiveId] = useState<string>(notes[0].id)
  const [search, setSearch] = useState('')
  const [path, setPath] = useState<string | null>(null)
  const [snap, setSnap] = useState<Snapshot>(EMPTY)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    return () => off?.()
  }, [])

  const active = notes.find((n) => n.id === activeId) ?? notes[0]

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
    const note = newNote(`Nota ${notes.length + 1}`)
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

  const q = search.trim().toLowerCase()
  const visible = q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : notes

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
            { key: 'del', label: 'Excluir', icon: <Delete24Regular />, disabled: notes.length <= 1, onClick: () => removeNote(activeId) }
          ]
        },
        {
          label: 'Fonte',
          items: [
            { key: 'b', label: 'Negrito', icon: <TextBold24Regular />, active: snap.strong, onClick: () => apiRef.current?.exec(cmd.bold) },
            { key: 'i', label: 'Itálico', icon: <TextItalic24Regular />, active: snap.em, onClick: () => apiRef.current?.exec(cmd.italic) },
            { key: 'u', label: 'Sublinhado', icon: <TextUnderline24Regular />, active: snap.underline, onClick: () => apiRef.current?.exec(cmd.underline) }
          ]
        },
        {
          label: 'Parágrafo',
          items: [
            { key: 'ul', label: 'Marcadores', icon: <TextBulletList24Regular />, onClick: () => apiRef.current?.exec(cmd.bullet) },
            { key: 'ol', label: 'Numerada', icon: <TextNumberListLtr24Regular />, onClick: () => apiRef.current?.exec(cmd.ordered) }
          ]
        },
        {
          label: 'Estilos',
          items: [
            { key: 'p', label: 'Normal', icon: <TextT24Regular />, active: snap.heading === 0, onClick: () => apiRef.current?.exec(cmd.paragraph) },
            { key: 'h1', label: 'Título 1', icon: <TextHeader124Regular />, active: snap.heading === 1, onClick: () => apiRef.current?.exec(cmd.h1) },
            { key: 'h2', label: 'Título 2', icon: <TextHeader224Regular />, active: snap.heading === 2, onClick: () => apiRef.current?.exec(cmd.h2) }
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
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <aside style={{ width: 260, flex: 'none', borderRight: '1px solid var(--ao-border)', background: 'var(--ao-surface)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 8 }}>
            <Input size="small" placeholder="Pesquisar notas…" value={search} onChange={(_, d) => setSearch(d.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {visible.map((n) => {
              const on = n.id === activeId
              return (
                <div
                  key={n.id}
                  onClick={() => selectNote(n.id)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderLeft: on ? '3px solid var(--ao-green)' : '3px solid transparent',
                    background: on ? 'var(--ao-green-soft)' : 'transparent',
                    fontSize: 13,
                    fontWeight: on ? 600 : 400,
                    color: 'var(--ao-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {n.title || 'Sem título'}
                </div>
              )
            })}
            {visible.length === 0 && <div style={{ padding: 16, color: 'var(--ao-text-3)', fontSize: 12 }}>Nenhuma nota encontrada.</div>}
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--ao-surface-2)' }}>
          <div style={{ padding: '10px 16px', background: 'var(--ao-bg)', borderBottom: '1px solid var(--ao-border)', flex: 'none' }}>
            <input
              value={active.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da nota"
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 20, fontWeight: 600, background: 'transparent', color: 'var(--ao-text)' }}
            />
          </div>
          <div className="ao-doc-host" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 28px', background: 'var(--ao-bg)' }}>
            <Editor apiRef={apiRef} onState={setSnap} />
          </div>
        </main>
      </div>
    </AppShell>
  )
}
