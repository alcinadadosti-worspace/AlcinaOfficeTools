// Central Alcina Office: ponto de entrada da suíte (Fase 1).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SheetsGlyph, DocsGlyph, PointGlyph, NotesGlyph, BiGlyph, appColors } from '@alcina/brand'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'

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
  { key: 'sheets', name: 'AlcinaSheets', short: 'Sheets', desc: 'Planilhas e fórmulas', glyph: <SheetsGlyph size={40} />, color: appColors.sheets, ready: false },
  { key: 'docs', name: 'AlcinaDocs', short: 'Docs', desc: 'Documentos de texto', glyph: <DocsGlyph size={40} />, color: appColors.docs, ready: false },
  { key: 'point', name: 'AlcinaPoint', short: 'Point', desc: 'Apresentações', glyph: <PointGlyph size={40} />, color: appColors.point, ready: false },
  { key: 'notes', name: 'AlcinaNotes', short: 'Notes', desc: 'Anotações', glyph: <NotesGlyph size={40} />, color: appColors.notes, ready: false },
  { key: 'bi', name: 'AlcinaBi', short: 'BI', desc: 'Relatórios e BI', glyph: <BiGlyph size={40} />, color: appColors.bi, ready: false }
]

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
    setNotice(`${a.name} chega nas próximas fases. Por enquanto, a base da suíte — marca, casca de interface e atualização automática — já está pronta e instalável.`)
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
      <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ao-gold-text)', fontWeight: 600 }}>Alcina Dados TI</div>
        <h1 style={{ fontSize: 30, margin: '6px 0 4px', color: 'var(--ao-text)' }}>Bem-vindo à Alcina Office</h1>
        <p style={{ color: 'var(--ao-text-2)', fontSize: 15, maxWidth: 620, marginTop: 0 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 24 }}>
          {APPS.map((a) => (
            <button
              key={a.key}
              onClick={() => launch(a)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 18,
                border: '1px solid var(--ao-border)',
                borderRadius: 10,
                background: 'var(--ao-bg)',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: 'var(--ao-shadow)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = a.color)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--ao-border)')}
            >
              <span style={{ color: a.color, display: 'flex', flex: 'none' }}>{a.glyph}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ao-text)' }}>{a.name}</span>
                  {!a.ready && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ao-gold-text)', background: 'var(--ao-green-soft)', border: '1px solid var(--ao-border)', borderRadius: 100, padding: '1px 7px' }}>EM BREVE</span>}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--ao-text-2)', marginTop: 2 }}>{a.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
