// AlcinaDocs: editor de documentos (ProseMirror) com faixa de opções e E/S.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DocumentAdd24Regular,
  FolderOpen24Regular,
  Save24Regular,
  TextBold24Regular,
  TextItalic24Regular,
  TextUnderline24Regular,
  TextBulletList24Regular,
  TextNumberListLtr24Regular,
  TextAlignLeft24Regular,
  TextAlignCenter24Regular,
  TextAlignRight24Regular,
  TextAlignJustify24Regular,
  TextT24Regular,
  TextHeader124Regular,
  TextHeader224Regular,
  TextHeader324Regular,
  ArrowDownload24Regular,
  DocumentPdf24Regular,
  DocumentTable24Regular,
  ArrowUndo24Regular,
  ArrowRedo24Regular
} from '@fluentui/react-icons'
import type { Command } from 'prosemirror-state'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import { Editor, type EditorApi, type Snapshot, cmd } from '@alcina/editor'
import { saveDoc, openDoc, importDocx, exportDocx, exportPdf, baseName } from './io'

const EMPTY: Snapshot = { strong: false, em: false, underline: false, heading: 0, align: null, canUndo: false, canRedo: false }

export function App(): ReactNode {
  const apiRef = useRef<EditorApi | null>(null)
  const [snap, setSnap] = useState<Snapshot>(EMPTY)
  const [path, setPath] = useState<string | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    return () => off?.()
  }, [])

  const exec = (c: Command): void => void apiRef.current?.exec(c)
  const run = (fn: (api: EditorApi) => Promise<unknown>) => (): void => {
    const api = apiRef.current
    if (api) void fn(api)
  }
  const name = baseName(path)

  const ribbon: RibbonTab[] = [
    {
      key: 'home',
      label: 'Início',
      groups: [
        {
          label: 'Arquivo',
          items: [
            { key: 'new', label: 'Novo', icon: <DocumentAdd24Regular />, onClick: () => { apiRef.current?.setJSON({ type: 'doc', content: [{ type: 'paragraph' }] }); setPath(null) } },
            { key: 'open', label: 'Abrir', icon: <FolderOpen24Regular />, onClick: run(async (a) => { const p = await openDoc(a); if (p) setPath(p) }) },
            { key: 'save', label: 'Salvar', icon: <Save24Regular />, onClick: run(async (a) => { const p = await saveDoc(a, name); if (p) setPath(p) }) }
          ]
        },
        {
          label: 'Fonte',
          items: [
            { key: 'b', label: 'Negrito', icon: <TextBold24Regular />, active: snap.strong, onClick: () => exec(cmd.bold) },
            { key: 'i', label: 'Itálico', icon: <TextItalic24Regular />, active: snap.em, onClick: () => exec(cmd.italic) },
            { key: 'u', label: 'Sublinhado', icon: <TextUnderline24Regular />, active: snap.underline, onClick: () => exec(cmd.underline) }
          ]
        },
        {
          label: 'Parágrafo',
          items: [
            { key: 'ul', label: 'Marcadores', icon: <TextBulletList24Regular />, onClick: () => exec(cmd.bullet) },
            { key: 'ol', label: 'Numerada', icon: <TextNumberListLtr24Regular />, onClick: () => exec(cmd.ordered) },
            { key: 'al', label: 'Esquerda', icon: <TextAlignLeft24Regular />, active: snap.align === 'left' || snap.align === null, onClick: () => exec(cmd.alignLeft) },
            { key: 'ac', label: 'Centro', icon: <TextAlignCenter24Regular />, active: snap.align === 'center', onClick: () => exec(cmd.alignCenter) },
            { key: 'ar', label: 'Direita', icon: <TextAlignRight24Regular />, active: snap.align === 'right', onClick: () => exec(cmd.alignRight) },
            { key: 'aj', label: 'Justificar', icon: <TextAlignJustify24Regular />, active: snap.align === 'justify', onClick: () => exec(cmd.alignJustify) }
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
          label: 'Word / PDF',
          items: [
            { key: 'idocx', label: 'Abrir Word', icon: <DocumentTable24Regular />, onClick: run(async (a) => { const p = await importDocx(a); if (p) setPath(null) }) },
            { key: 'edocx', label: 'Salvar Word', icon: <ArrowDownload24Regular />, onClick: run(async (a) => { await exportDocx(a, name) }) },
            { key: 'epdf', label: 'Exportar PDF', icon: <DocumentPdf24Regular />, onClick: run(async (a) => { await exportPdf(a, name) }) }
          ]
        },
        {
          label: 'Histórico',
          items: [
            { key: 'undo', label: 'Desfazer', icon: <ArrowUndo24Regular />, disabled: !snap.canUndo, onClick: () => exec(cmd.undo) },
            { key: 'redo', label: 'Refazer', icon: <ArrowRedo24Regular />, disabled: !snap.canRedo, onClick: () => exec(cmd.redo) }
          ]
        }
      ]
    }
  ]

  return (
    <AppShell
      appName={`${name} — Documento`}
      headerRight={version ? <span style={{ fontSize: 12, opacity: 0.85 }}>v{version}</span> : null}
      ribbon={ribbon}
      update={{ status, onInstall: () => void getUpdater()?.install() }}
    >
      <div className="ao-doc-scroll">
        <div className="ao-doc-page">
          <Editor apiRef={apiRef} onState={setSnap} />
        </div>
      </div>
    </AppShell>
  )
}
