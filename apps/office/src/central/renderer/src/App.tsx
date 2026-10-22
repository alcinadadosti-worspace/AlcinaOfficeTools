// Central Alcina Office: ponto de entrada da suíte (Fase 1).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SheetsGlyph, DocsGlyph, PointGlyph, NotesGlyph, BiGlyph, appColors } from '@alcina/brand'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import './hub.css'

interface SuiteApp {
  key: string
  name: string
  short: string
  desc: string
  glyph: ReactNode
  color: string
  ready: boolean
}

const APPS: SuiteApp[] = [
  { key: 'sheets', name: 'Planilhas', short: 'Planilhas', desc: 'Cálculos, tabelas e gráficos', glyph: <SheetsGlyph size={40} />, color: appColors.sheets, ready: true },
  { key: 'docs', name: 'Documentos', short: 'Documentos', desc: 'Textos, páginas e PDF', glyph: <DocsGlyph size={40} />, color: appColors.docs, ready: true },
  { key: 'point', name: 'Apresentações', short: 'Apresentações', desc: 'Slides e exposições', glyph: <PointGlyph size={40} />, color: appColors.point, ready: true },
  { key: 'notes', name: 'Notas', short: 'Notas', desc: 'Cadernos e anotações', glyph: <NotesGlyph size={40} />, color: appColors.notes, ready: true },
  { key: 'bi', name: 'Analytics', short: 'Analytics', desc: 'Relatórios e análises', glyph: <BiGlyph size={40} />, color: appColors.bi, ready: true }
]

// Cartão com brilho que segue o cursor e leve inclinação 3D (atualiza variáveis CSS via ref).
function SuiteCard({ app, index, onLaunch }: { app: SuiteApp; index: number; onLaunch: (a: SuiteApp) => void }): ReactNode {
  const ref = useRef<HTMLButtonElement>(null)
  const onMove = (e: React.MouseEvent): void => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${px * 100}%`)
    el.style.setProperty('--my', `${py * 100}%`)
    el.style.setProperty('--rx', `${(0.5 - py) * 7}deg`)
    el.style.setProperty('--ry', `${(px - 0.5) * 7}deg`)
  }
  const reset = (): void => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }
  return (
    <button
      ref={ref}
      className="ao-hub-card ao-rise"
      style={{ '--accent': app.color, animationDelay: `${0.2 + index * 0.08}s` } as CSSProperties}
      onMouseMove={onMove}
      onMouseLeave={reset}
      onClick={() => onLaunch(app)}
    >
      <span className="ao-hub-spot" />
      <span className="ao-hub-ico" style={{ color: app.color }}>
        {app.glyph}
      </span>
      <span className="ao-hub-meta">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ao-text)' }}>{app.name}</span>
          {!app.ready && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ao-gold-text)', background: 'var(--ao-green-soft)', border: '1px solid var(--ao-border)', borderRadius: 100, padding: '1px 7px' }}>EM BREVE</span>}
        </span>
        <span style={{ display: 'block', fontSize: 13, color: 'var(--ao-text-2)', marginTop: 2 }}>{app.desc}</span>
      </span>
      <span className="ao-hub-arrow" aria-hidden>→</span>
    </button>
  )
}

export function App(): ReactNode {
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    return () => off?.()
  }, [])

  const launch = (a: SuiteApp): void => {
    const api = window.alcinaSuite
    if (!api) { setNotice('Ponte de inicialização indisponível.'); return }
    setNotice(`Abrindo ${a.name}…`)
    void api.launch(a.key).then((r) => {
      setNotice(r.ok ? `${a.name} está abrindo em uma nova janela.` : r.error || `Não foi possível abrir ${a.name}.`)
    })
  }

  const ribbon: RibbonTab[] = useMemo(
    () => [
      {
        key: 'home',
        label: 'Início',
        groups: [
          { label: 'Aplicativos', items: APPS.map((a) => ({ key: a.key, label: a.short, icon: a.glyph, onClick: () => launch(a) })) },
          { label: 'Atualizações', items: [{ key: 'check', label: 'Verificar', icon: <BiGlyph size={24} />, onClick: () => void getUpdater()?.check() }] }
        ]
      }
    ],
    []
  )

  return (
    <AppShell
      appName="Central"
      headerRight={version ? <span style={{ fontSize: 12, opacity: 0.85 }}>v{version}</span> : null}
      ribbon={ribbon}
      update={{ status, onInstall: () => void getUpdater()?.install() }}
    >
      <div className="ao-hub">
        <div className="ao-hub-aurora" aria-hidden />
        <div className="ao-hub-inner" style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
          <div className="ao-rise" style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ao-gold-text)', fontWeight: 600 }}>Alcina Dados TI</div>
          <h1 className="ao-hub-title ao-rise" style={{ animationDelay: '0.05s' }}>Bem-vindo à Alcina Office</h1>
          <p className="ao-rise" style={{ color: 'var(--ao-text-2)', fontSize: 15, maxWidth: 620, marginTop: 0, animationDelay: '0.1s' }}>
            Sua suíte de produtividade. Escolha um aplicativo para começar — todos compartilham a mesma identidade, o mesmo motor e atualização automática.
          </p>

          {notice && (
            <div
              className="ao-fade-in"
              style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, padding: '12px 16px', background: 'var(--ao-green-soft)', border: '1px solid var(--ao-border)', borderRadius: 8, color: 'var(--ao-text)', fontSize: 14 }}
            >
              <span style={{ flex: 1 }}>{notice}</span>
              <button onClick={() => setNotice(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ao-text-2)', fontSize: 18, lineHeight: 1 }} aria-label="Fechar">
                ×
              </button>
            </div>
          )}

          <div className="ao-hub-grid">
            {APPS.map((a, i) => (
              <SuiteCard key={a.key} app={a} index={i} onLaunch={launch} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
