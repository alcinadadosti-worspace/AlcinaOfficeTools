// Faixa de opções (ribbon) genérica e reutilizável, dirigida por configuração.
import { useState, type ReactNode } from 'react'

export interface RibbonItem {
  key: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  /** Realça o botão (estado ativado, ex.: negrito aplicado). */
  active?: boolean
}
export interface RibbonGroup {
  label: string
  items: RibbonItem[]
}
export interface RibbonTab {
  key: string
  label: string
  groups: RibbonGroup[]
}

export function Ribbon({ tabs }: { tabs: RibbonTab[] }): ReactNode {
  const [active, setActive] = useState(tabs[0]?.key)
  if (!tabs.length) return null
  const tab = tabs.find((t) => t.key === active) ?? tabs[0]
  return (
    <div style={{ background: 'var(--ao-bg)', borderBottom: '1px solid var(--ao-border)', flex: 'none' }}>
      <div style={{ display: 'flex', gap: 2, padding: '0 8px', height: 32, alignItems: 'flex-end' }}>
        {tabs.map((t) => {
          const on = t.key === tab.key
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              style={{
                height: 30,
                padding: '0 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: on ? 'var(--ao-green)' : 'var(--ao-text)',
                fontWeight: on ? 600 : 400,
                borderBottom: on ? '2px solid var(--ao-green)' : '2px solid transparent'
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', height: 84, padding: 4, overflowX: 'auto' }}>
        {tab.groups.map((g, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '0 8px', borderRight: '1px solid var(--ao-border)' }}>
            <div style={{ display: 'flex', gap: 2, flex: 1, alignItems: 'flex-start' }}>
              {g.items.map((it) => (
                <button
                  key={it.key}
                  disabled={it.disabled}
                  onClick={it.onClick}
                  title={it.label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    width: 66,
                    padding: '6px 4px',
                    border: 'none',
                    borderRadius: 4,
                    background: it.active ? 'var(--ao-green-soft)' : 'transparent',
                    cursor: it.disabled ? 'default' : 'pointer',
                    color: it.disabled ? 'var(--ao-text-3)' : it.active ? 'var(--ao-green-strong)' : 'var(--ao-text)',
                    fontSize: 12,
                    lineHeight: '13px'
                  }}
                >
                  <span style={{ color: it.disabled ? 'var(--ao-text-3)' : 'var(--ao-green)', display: 'flex', height: 24, alignItems: 'center' }}>{it.icon}</span>
                  <span style={{ textAlign: 'center' }}>{it.label}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ao-text-3)', textAlign: 'center', paddingBottom: 2 }}>{g.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
