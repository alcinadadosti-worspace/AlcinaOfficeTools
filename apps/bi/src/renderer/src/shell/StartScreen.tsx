// Tela inicial (boas-vindas).
import { useEffect, useState, type JSX } from 'react'
import { Button } from '@fluentui/react-components'
import { Database24Regular, FolderOpen24Regular, Sparkle24Regular, Document20Regular, Dismiss20Regular, DocumentAdd24Regular } from '@fluentui/react-icons'
import type { RecentFile } from '@shared/ipc'
import { useUi } from '../state/ui'
import { Logo } from '../components/Logo'
import { commands } from '../actions/commands'
import { openDialogAndFile } from '../actions/file'
import { loadSample } from '../actions/sample'

export function StartScreen() {
  const [recent, setRecent] = useState<RecentFile[]>([])
  useEffect(() => {
    void window.alcina.recent.list().then(setRecent)
  }, [])
  const closeStart = () => useUi.getState().set({ showStart: false })
  const action = (icon: JSX.Element, title: string, desc: string, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1px solid var(--ab-border)', borderRadius: 8, background: '#ffffff', cursor: 'pointer', textAlign: 'left', width: '100%' }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--ab-accent)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--ab-border)')}
    >
      <span style={{ color: 'var(--ab-accent)', display: 'flex' }}>{icon}</span>
      <span>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--ab-text-2)' }}>{desc}</div>
      </span>
    </button>
  )
  return (
    <div style={{ position: 'fixed', inset: 'var(--ab-titlebar-h) 0 0 0', background: 'rgba(0,0,0,0.32)', zIndex: 900, display: 'grid', placeItems: 'center' }} className="ab-fade-in">
      <div style={{ width: 860, maxWidth: '94vw', height: 540, maxHeight: '90vh', background: '#ffffff', borderRadius: 10, boxShadow: 'var(--ab-shadow-lg)', display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <button onClick={closeStart} aria-label="Fechar" style={{ position: 'absolute', right: 10, top: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ab-text-2)' }}>
          <Dismiss20Regular />
        </button>
        <div style={{ width: 300, background: 'linear-gradient(160deg, #0b3f45 0%, #0f7e89 100%)', color: '#ffffff', padding: 28, display: 'flex', flexDirection: 'column' }}>
          <Logo size={44} />
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 16 }}>Analytics</div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>Desktop</div>
          <div style={{ marginTop: 28, fontSize: 14, lineHeight: 1.5, opacity: 0.95 }}>
            Conecte-se aos seus dados, transforme-os, crie medidas DAX e monte relatórios interativos — tudo no seu computador.
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, opacity: 0.75 }}>Dica: arraste campos do painel Dados para a tela para criar visuais.</div>
        </div>
        <div style={{ flex: 1, padding: '28px 28px 20px', overflow: 'auto' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>Comece aqui</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {action(<Database24Regular />, 'Obter dados', 'Excel, CSV, JSON, Web, pastas e bancos', () => {
              closeStart()
              useUi.getState().openDialog({ kind: 'getData' })
            })}
            {action(<Sparkle24Regular />, 'Dados de exemplo', 'Explore um relatório de vendas pronto', () => {
              closeStart()
              void loadSample()
            })}
            {action(<FolderOpen24Regular />, 'Abrir relatório', 'Arquivos .alcbi', () => {
              closeStart()
              commands.open()
            })}
            {action(<DocumentAdd24Regular />, 'Relatório em branco', 'Comece do zero', closeStart)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, margin: '22px 0 8px' }}>Recentes</div>
          {recent.length === 0 && <div style={{ color: 'var(--ab-text-3)', fontSize: 13 }}>Os relatórios abertos recentemente aparecerão aqui.</div>}
          {recent.slice(0, 6).map((r) => (
            <button
              key={r.path}
              onClick={() => {
                closeStart()
                void openDialogAndFile(false, r.path)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '6px 8px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', borderRadius: 6 }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--ab-hover)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              <Document20Regular style={{ color: 'var(--ab-accent)' }} />
              <span style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ab-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 440 }}>{r.path}</div>
              </span>
            </button>
          ))}
          <div style={{ marginTop: 16 }}>
            <Button appearance="subtle" onClick={closeStart}>
              Não mostrar agora
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
