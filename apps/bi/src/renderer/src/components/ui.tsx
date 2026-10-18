// Componentes básicos reutilizados na interface.
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { Tooltip } from '@fluentui/react-components'

export function PaneHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 8px 0 12px', gap: 4, borderBottom: '1px solid var(--ab-border)', flex: 'none' }}>
      <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{title}</div>
      {children}
    </div>
  )
}

export function IconButton({
  icon,
  title,
  onClick,
  disabled,
  active,
  size = 28,
  style
}: {
  icon: ReactElement
  title: string
  onClick?: (e: React.MouseEvent) => void
  disabled?: boolean
  active?: boolean
  size?: number
  style?: CSSProperties
}) {
  return (
    <Tooltip content={title} relationship="label" withArrow>
      <button
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className="ab-iconbtn"
        style={{
          width: size,
          height: size,
          border: 'none',
          borderRadius: 4,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? 'var(--ab-selected)' : 'transparent',
          color: disabled ? 'var(--ab-text-3)' : active ? 'var(--ab-accent-strong)' : 'var(--ab-text)',
          cursor: disabled ? 'default' : 'pointer',
          flex: 'none',
          ...style
        }}
      >
        {icon}
      </button>
    </Tooltip>
  )
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: 'var(--ab-text-2)', marginBottom: 6 }}>
        <div style={{ flex: 1 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: 16, color: 'var(--ab-text-3)', fontSize: 12, textAlign: 'center' }}>{children}</div>
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span style={{ border: '1px solid var(--ab-border-strong)', borderBottomWidth: 2, borderRadius: 4, padding: '0 5px', fontSize: 11, fontFamily: 'Segoe UI, sans-serif', background: '#faf9f8' }}>
      {children}
    </span>
  )
}
