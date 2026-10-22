// Composição principal da janela: barra de título, faixa, área de trabalho e painéis.
import { useEffect, type ReactNode } from 'react'
import { ChevronDoubleLeft20Regular, Filter20Regular, PaintBrush20Regular, PanelRightContract20Regular } from '@fluentui/react-icons'
import { useUi, type ViewKind } from '../state/ui'
import { useDoc } from '../state/doc'
import { TitleBar } from './TitleBar'
import { Ribbon } from './Ribbon'
import { FormulaBar } from './FormulaBar'
import { LeftNav } from './LeftNav'
import { StatusBar, Toasts, LoadingOverlay } from './Overlays'
import { StartScreen } from './StartScreen'
import { DataPane } from '../panes/DataPane'
import { VisualizationsPane } from '../panes/VisualizationsPane'
import { FiltersPane } from '../panes/FiltersPane'
import { ReportView } from '../views/report/ReportView'
import { TableView } from '../views/TableView'
import { ModelView } from '../views/ModelView'
import { DaxQueryView } from '../views/DaxQueryView'
import { QueryEditorView } from '../views/QueryEditorView'
import { DialogHost } from '../components/DialogHost'
import { startModelSync } from '../actions/model'
import { commands } from '../actions/commands'
import { openPath, confirmDiscard } from '../actions/file'

function viewContent(view: ViewKind): ReactNode {
  switch (view) {
    case 'report':
      return <ReportView />
    case 'table':
      return <TableView />
    case 'model':
      return <ModelView />
    case 'dax':
      return <DaxQueryView />
  }
}

function Rail({ width, children }: { width: number; children: ReactNode }) {
  return <div style={{ width, flex: 'none', borderLeft: '1px solid var(--ab-border)', background: '#ffffff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
}

function Collapsed({ label, icon, onExpand }: { label: string; icon: ReactNode; onExpand: () => void }) {
  return (
    <div style={{ width: 36, flex: 'none', borderLeft: '1px solid var(--ab-border)', background: 'var(--ab-app-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 8 }}>
      <button aria-label={`Expandir ${label}`} onClick={onExpand} title={label} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ab-accent-strong)', display: 'flex' }}>
        <ChevronDoubleLeft20Regular />
      </button>
      <span style={{ color: 'var(--ab-text-2)', display: 'flex' }}>{icon}</span>
      <div style={{ writingMode: 'vertical-rl', fontSize: 12, color: 'var(--ab-text-2)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

export function Workspace() {
  const view = useUi((s) => s.view)
  const panes = useUi((s) => s.panes)
  const showStart = useUi((s) => s.showStart)
  const queryEditorOpen = useUi((s) => s.queryEditor.open)

  const setPane = (k: keyof typeof panes, v: boolean) => useUi.getState().set({ panes: { ...useUi.getState().panes, [k]: v } })

  useEffect(() => {
    const unsync = startModelSync()
    const unOpen = window.alcina.app.onOpenFile((p) => void openPath(p))
    const unClose = window.alcina.window.onCloseRequested(() => {
      if (confirmDiscard('close')) window.alcina.window.confirmClose()
    })
    const unDirty = useDoc.subscribe((s) => window.alcina.window.setDirty(s.dirty))
    void window.alcina.app.initialFile().then((p) => {
      if (p) void openPath(p)
    })
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      const t = e.target as HTMLElement
      const inEditor = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest('.cm-editor'))
      if (k === 's') {
        e.preventDefault()
        commands.save()
      } else if (k === 'o') {
        e.preventDefault()
        commands.open()
      } else if (k === 'n' && !e.shiftKey) {
        e.preventDefault()
        commands.newFile()
      } else if (!inEditor && k === 'z' && !e.shiftKey) {
        e.preventDefault()
        commands.undo()
      } else if (!inEditor && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault()
        commands.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unsync()
      unOpen()
      unClose()
      unDirty()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const showReportPanes = view === 'report'
  const showData = view === 'report' || view === 'table' || view === 'model'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--ab-app-bg)' }}>
      <TitleBar />
      <Ribbon />
      <FormulaBar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <LeftNav />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{viewContent(view)}</div>

        {showReportPanes &&
          (panes.filters ? (
            <Rail width={240}>
              <FiltersPane />
            </Rail>
          ) : (
            <Collapsed label="Filtros" icon={<Filter20Regular />} onExpand={() => setPane('filters', true)} />
          ))}

        {showReportPanes &&
          (panes.visualizations ? (
            <Rail width={272}>
              <VisualizationsPane />
            </Rail>
          ) : (
            <Collapsed label="Visualizações" icon={<PaintBrush20Regular />} onExpand={() => setPane('visualizations', true)} />
          ))}

        {showData &&
          (panes.data ? (
            <Rail width={260}>
              <DataPane />
            </Rail>
          ) : (
            <Collapsed label="Dados" icon={<PanelRightContract20Regular />} onExpand={() => setPane('data', true)} />
          ))}
      </div>
      <StatusBar />

      {showStart && <StartScreen />}
      {queryEditorOpen && <QueryEditorView />}
      <DialogHost />
      <LoadingOverlay />
      <Toasts />
    </div>
  )
}
