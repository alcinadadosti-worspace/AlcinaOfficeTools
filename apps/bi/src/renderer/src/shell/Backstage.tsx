// Menu "Arquivo" (tela de bastidores).
import { useEffect, useState, type JSX } from 'react'
import {
  ArrowLeft24Regular,
  DocumentAdd24Regular,
  FolderOpen24Regular,
  Save24Regular,
  SaveEdit24Regular,
  DocumentPdf24Regular,
  Settings24Regular,
  Info24Regular,
  SignOut24Regular,
  Document24Regular,
  Window24Regular
} from '@fluentui/react-icons'
import type { RecentFile } from '@shared/ipc'
import { commands } from '../actions/commands'
import { openDialogAndFile } from '../actions/file'
import { useUi } from '../state/ui'
import { Logo } from '../components/Logo'

export function Backstage({ onClose }: { onClose: () => void }) {
  const [recent, setRecent] = useState<RecentFile[]>([])
  useEffect(() => {
    void window.alcina.recent.list().then(setRecent)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }
  const item = (icon: JSX.Element, label: string, fn: () => void) => (
    <button
      onClick={run(fn)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 20px', border: 'none', background: 'transparent', color: '#ffffff', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
    >
      {icon}
      {label}
    </button>
  )
  return (
    <div style={{ position: 'fixed', inset: 'var(--ab-titlebar-h) 0 0 0', zIndex: 1000, display: 'flex', background: '#ffffff' }} className="ab-fade-in">
      <div style={{ width: 240, background: '#0b3f45', color: '#ffffff', display: 'flex', flexDirection: 'column', paddingTop: 8 }}>
        {item(<ArrowLeft24Regular />, 'Voltar', () => undefined)}
        <div style={{ height: 8 }} />
        {item(<DocumentAdd24Regular />, 'Novo', commands.newFile)}
        {item(<FolderOpen24Regular />, 'Abrir relatório', commands.open)}
        {item(<Window24Regular />, 'Nova janela', () => window.alcina.window.newWindow())}
        {item(<Save24Regular />, 'Salvar', commands.save)}
        {item(<SaveEdit24Regular />, 'Salvar como', commands.saveAs)}
        {item(<DocumentPdf24Regular />, 'Exportar para PDF', commands.exportPdf)}
        <div style={{ flex: 1 }} />
        {item(<Settings24Regular />, 'Opções e configurações', () => useUi.getState().openDialog({ kind: 'options' }))}
        {item(<Info24Regular />, 'Sobre', () => useUi.getState().openDialog({ kind: 'about' }))}
        {item(<SignOut24Regular />, 'Sair', () => window.alcina.window.close())}
        <div style={{ height: 12 }} />
      </div>
      <div style={{ flex: 1, padding: '32px 48px', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Logo size={36} />
          <div style={{ fontSize: 26, fontWeight: 600 }}>Analytics</div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Relatórios recentes</div>
        {recent.length === 0 && <div style={{ color: 'var(--ab-text-3)' }}>Nenhum relatório aberto recentemente.</div>}
        {recent.map((r) => (
          <button
            key={r.path}
            onClick={run(() => void openDialogAndFile(false, r.path))}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 720, padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', borderRadius: 6 }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--ab-hover)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
          >
            <Document24Regular style={{ color: 'var(--ab-accent)' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ab-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path}</div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ab-text-3)', whiteSpace: 'nowrap' }}>{new Date(r.openedAt).toLocaleString('pt-BR')}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
