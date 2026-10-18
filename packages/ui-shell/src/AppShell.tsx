// Moldura de aplicativo: cabeçalho da marca + faixa de opções + banner + conteúdo.
import type { ReactNode } from 'react'
import type { UpdateStatus } from '@alcina/updater'
import { BrandHeader } from './BrandHeader'
import { Ribbon, type RibbonTab } from './Ribbon'
import { UpdateBanner } from './UpdateBanner'

export function AppShell({
  appName,
  headerRight,
  ribbon,
  update,
  children
}: {
  appName: string
  headerRight?: ReactNode
  ribbon?: RibbonTab[]
  update?: { status: UpdateStatus | null; onInstall: () => void }
  children: ReactNode
}): ReactNode {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <BrandHeader appName={appName} right={headerRight} />
      {ribbon && ribbon.length > 0 ? <Ribbon tabs={ribbon} /> : null}
      {update ? <UpdateBanner status={update.status} onInstall={update.onInstall} /> : null}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>
  )
}
