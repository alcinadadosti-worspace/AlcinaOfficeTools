// Sobreposições globais: carregamento, notificações e barra de status.
import { Spinner, Toast, ToastBody, ToastTitle, Toaster, useToastController, useId } from '@fluentui/react-components'
import { useEffect } from 'react'
import { useUi } from '../state/ui'
import { useDoc } from '../state/doc'

export function LoadingOverlay() {
  const loading = useUi((s) => s.loading)
  if (!loading) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(255,255,255,0.55)', display: 'grid', placeItems: 'center' }} className="ab-fade-in">
      <div style={{ background: '#ffffff', borderRadius: 10, padding: '22px 28px', boxShadow: 'var(--ab-shadow-lg)', minWidth: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <Spinner />
        <div style={{ fontWeight: 600 }}>{loading.message}</div>
        {loading.detail && <div style={{ fontSize: 12, color: 'var(--ab-text-2)', maxWidth: 420, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading.detail}</div>}
      </div>
    </div>
  )
}

export function Toasts() {
  const toasterId = useId('toaster')
  const { dispatchToast } = useToastController(toasterId)
  const toasts = useUi((s) => s.toasts)
  useEffect(() => {
    const last = toasts[toasts.length - 1]
    if (!last) return
    dispatchToast(
      <Toast>
        <ToastTitle>{last.title}</ToastTitle>
        {last.body && <ToastBody>{last.body}</ToastBody>}
      </Toast>,
      { intent: last.intent, timeout: last.intent === 'error' ? 8000 : 3500, toastId: String(last.id) }
    )
    useUi.getState().dismissToast(last.id)
  }, [toasts, dispatchToast])
  return <Toaster toasterId={toasterId} position="bottom-end" />
}

export function StatusBar() {
  const view = useUi((s) => s.view)
  const info = useUi((s) => s.modelInfo)
  const busy = useUi((s) => s.engineBusy)
  const dataView = useUi((s) => s.dataView)
  const tables = useDoc((s) => s.doc.model.tables.length)
  const t = info?.tables.find((x) => x.name === dataView.table)
  let text = ''
  if (view === 'table' && t) text = `TABELA: ${t.name} (${t.rowCount.toLocaleString('pt-BR')} linhas)`
  else if (info) text = `${tables} tabela(s) · ${info.tables.reduce((s, x) => s + x.rowCount, 0).toLocaleString('pt-BR')} linhas no modelo`
  return (
    <div style={{ height: 24, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', fontSize: 11, color: 'var(--ab-text-2)', background: 'var(--ab-app-bg)', borderTop: '1px solid var(--ab-border)' }}>
      <span>{text}</span>
      <div style={{ flex: 1 }} />
      {busy && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Spinner size="extra-tiny" /> Processando...
        </span>
      )}
      {info && info.errors.length > 0 && <span style={{ color: 'var(--ab-danger)' }}>{info.errors.length} erro(s) no modelo</span>}
    </div>
  )
}
