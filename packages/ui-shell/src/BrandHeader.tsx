// Cabeçalho da marca usado por todos os apps da suíte.
import type { ReactNode } from 'react'
import { AlcinaLogo } from '@alcina/brand'

export function BrandHeader({ appName, right }: { appName: string; right?: ReactNode }): ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 'var(--ao-header-h)',
        padding: '0 14px',
        background: 'var(--ao-green-strong)',
        color: '#ffffff',
        flex: 'none'
      }}
    >
      <AlcinaLogo size={26} />
      <span style={{ fontWeight: 700, fontSize: 15 }}>Alcina Office</span>
      <span style={{ opacity: 0.55 }}>›</span>
      <span style={{ fontSize: 14, opacity: 0.95 }}>{appName}</span>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  )
}
