// Faixa de opções (ribbon) genérica e reutilizável, dirigida por configuração.
// Layout compacto: botões pequenos (ícone + rótulo lado a lado) que quebram em até 3 linhas por grupo.
import { useState, type ReactNode, type CSSProperties } from 'react'
import { Menu, MenuTrigger, MenuPopover } from '@fluentui/react-components'

export interface RibbonItem {
  key: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  /** Realça o botão (estado ativado, ex.: negrito aplicado). */
  active?: boolean
  /** Menu suspenso (um <MenuList> do Fluent); se presente, o botão o abre. */
  menu?: ReactNode
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

  const itemStyle = (it: RibbonItem): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 23,
    padding: '0 7px',
    minWidth: 0,
    border: 'none',
    borderRadius: 4,
    background: it.active ? 'var(--ao-green-soft)' : 'transparent',
    cursor: it.disabled ? 'default' : 'pointer',
    color: it.disabled ? 'var(--ao-text-3)' : it.active ? 'var(--ao-green-strong)' : 'var(--ao-text)',
    fontSize: 12,
    whiteSpace: 'nowrap',
    textAlign: 'left'
  })

  return (
    <div style={{ background: 'var(--ao-bg)', borderBottom: '1px solid var(--ao-border)', flex: 'none' }}>
      <style>{'.ao-rib-ico svg{width:18px;height:18px}'}</style>
      {/* Abas */}
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
      {/* Grupos */}
      <div style={{ display: 'flex', alignItems: 'stretch', height: 98, padding: '4px 2px', overflowX: 'auto' }}>
        {tab.groups.map((g, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '0 6px', borderRight: '1px solid var(--ao-border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'wrap', alignContent: 'flex-start', height: 74, columnGap: 3, rowGap: 1 }}>
              {g.items.map((it) => {
                const btn = (
                  <button
                    key={it.key}
                    disabled={it.disabled}
                    onClick={it.menu ? undefined : it.onClick}
                    title={it.label}
                    style={itemStyle(it)}
                    onMouseEnter={(e) => {
                      if (!it.disabled && !it.active) (e.currentTarget as HTMLElement).style.background = 'rgba(15,122,52,0.08)'
                    }}
                    onMouseLeave={(e) => {
                      if (!it.active) (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    <span className="ao-rib-ico" style={{ color: it.disabled ? 'var(--ao-text-3)' : 'var(--ao-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, fontSize: 18, lineHeight: 0, flex: 'none' }}>
                      {it.icon}
                    </span>
                    <span>
                      {it.label}
                      {it.menu ? ' ▾' : ''}
                    </span>
                  </button>
                )
                if (!it.menu) return btn
                return (
                  <Menu key={it.key}>
                    <MenuTrigger disableButtonEnhancement>{btn}</MenuTrigger>
                    <MenuPopover>{it.menu}</MenuPopover>
                  </Menu>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ao-text-3)', textAlign: 'center', paddingTop: 3, marginTop: 'auto' }}>{g.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
