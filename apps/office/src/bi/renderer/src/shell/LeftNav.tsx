// Navegação lateral entre exibições.
import type { JSX } from 'react'
import { Tooltip } from '@fluentui/react-components'
import { DataBarVertical24Regular, Table24Regular, Organization24Regular, Code24Regular } from '@fluentui/react-icons'
import { useUi, type ViewKind } from '../state/ui'

const ITEMS: { view: ViewKind; label: string; icon: JSX.Element }[] = [
  { view: 'report', label: 'Exibição de relatório', icon: <DataBarVertical24Regular /> },
  { view: 'table', label: 'Exibição de tabela', icon: <Table24Regular /> },
  { view: 'model', label: 'Exibição de modelo', icon: <Organization24Regular /> },
  { view: 'dax', label: 'Exibição de consulta DAX', icon: <Code24Regular /> }
]

export function LeftNav() {
  const view = useUi((s) => s.view)
  return (
    <div style={{ width: 48, flex: 'none', background: 'var(--ab-app-bg)', borderRight: '1px solid var(--ab-border)', display: 'flex', flexDirection: 'column', paddingTop: 6, gap: 2 }}>
      {ITEMS.map((it) => {
        const active = view === it.view
        return (
          <Tooltip key={it.view} content={it.label} relationship="label" positioning="after">
            <button
              aria-label={it.label}
              onClick={() => useUi.getState().set({ view: it.view, focusVisualId: null })}
              style={{
                height: 44,
                border: 'none',
                background: active ? '#ffffff' : 'transparent',
                borderLeft: active ? '3px solid var(--ab-accent)' : '3px solid transparent',
                color: active ? 'var(--ab-accent-strong)' : 'var(--ab-text-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {it.icon}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
