// Banner de atualização: aparece quando há uma nova versão do aplicativo.
import type { ReactNode } from 'react'
import type { UpdateStatus } from '@alcina/updater'

export function UpdateBanner({ status, onInstall }: { status: UpdateStatus | null; onInstall: () => void }): ReactNode {
  if (!status || status.state === 'idle' || status.state === 'none' || status.state === 'checking') return null
  const error = status.state === 'error'
  let text = ''
  if (status.state === 'available') text = `Atualização ${status.version ?? ''} disponível — baixando…`
  else if (status.state === 'downloading') text = `Baixando atualização… ${status.percent ?? 0}%`
  else if (status.state === 'ready') text = `Atualização ${status.version ?? ''} pronta para instalar.`
  else text = status.message ?? 'Não foi possível atualizar.'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 14px',
        background: error ? 'var(--ao-gold)' : 'var(--ao-green)',
        color: '#ffffff',
        fontSize: 13,
        flex: 'none'
      }}
    >
      <span style={{ flex: 1 }}>{text}</span>
      {status.state === 'ready' && (
        <button
          onClick={onInstall}
          style={{ border: '1px solid rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}
        >
          Reiniciar e instalar
        </button>
      )}
    </div>
  )
}
