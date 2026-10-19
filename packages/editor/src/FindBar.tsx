// Barra interativa de Localizar e substituir, compartilhada por Docs e Notes.
import { useEffect, useRef, useState, type ReactNode, type MutableRefObject } from 'react'
import type { EditorApi } from './Editor'

export function FindBar({ apiRef, onClose }: { apiRef: MutableRefObject<EditorApi | null>; onClose: () => void }): ReactNode {
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [info, setInfo] = useState<{ count: number; index: number }>({ count: 0, index: 0 })
  const [flash, setFlash] = useState<string | null>(null)
  const findInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    findInput.current?.focus()
    return () => apiRef.current?.clearSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runSearch = (q: string, mc: boolean): void => {
    setFind(q)
    setFlash(null)
    setInfo(apiRef.current?.search(q, mc) ?? { count: 0, index: 0 })
  }
  const next = (): void => setInfo(apiRef.current?.findNext() ?? info)
  const prev = (): void => setInfo(apiRef.current?.findPrev() ?? info)
  const doReplace = (): void => {
    if (!find || !info.count) return
    setInfo(apiRef.current?.replaceCurrent(replace) ?? info)
  }
  const doReplaceAll = (): void => {
    if (!find) return
    const n = apiRef.current?.replaceAll(find, replace, matchCase) ?? 0
    setInfo({ count: 0, index: 0 })
    setFlash(`${n} substituição(ões).`)
  }

  const counter = flash ?? (find ? (info.count ? `${info.index} de ${info.count}` : 'Nenhum resultado') : '')
  const btn: React.CSSProperties = { border: '1px solid var(--ao-border)', background: 'var(--ao-surface)', color: 'var(--ao-text)', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }
  const inp: React.CSSProperties = { border: '1px solid var(--ao-border)', borderRadius: 4, padding: '4px 7px', fontSize: 13, background: 'var(--ao-bg)', color: 'var(--ao-text)', width: 180 }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose() }
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 12px', borderBottom: '1px solid var(--ao-border)', background: 'var(--ao-surface)', flex: 'none' }}
    >
      <button onClick={() => setShowReplace((v) => !v)} title={showReplace ? 'Ocultar substituição' : 'Mostrar substituição'} style={{ ...btn, width: 24, padding: 0 }}>
        {showReplace ? '▾' : '▸'}
      </button>
      <input
        ref={findInput}
        placeholder="Localizar"
        value={find}
        onChange={(e) => runSearch(e.target.value, matchCase)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) prev(); else next() } }}
        style={inp}
      />
      <button onClick={prev} disabled={!info.count} title="Anterior (Shift+Enter)" style={btn}>↑</button>
      <button onClick={next} disabled={!info.count} title="Próxima (Enter)" style={btn}>↓</button>
      <span style={{ fontSize: 12, color: 'var(--ao-text-2)', minWidth: 78 }}>{counter}</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ao-text-2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={matchCase} onChange={(e) => { setMatchCase(e.target.checked); if (find) runSearch(find, e.target.checked) }} />
        Maiúsc./minúsc.
      </label>
      {showReplace && (
        <>
          <input placeholder="Substituir por" value={replace} onChange={(e) => setReplace(e.target.value)} style={inp} />
          <button onClick={doReplace} disabled={!info.count} style={btn}>Substituir</button>
          <button onClick={doReplaceAll} disabled={!find} style={btn}>Tudo</button>
        </>
      )}
      <div style={{ flex: 1 }} />
      <button onClick={onClose} title="Fechar (Esc)" style={{ ...btn, border: 'none', background: 'transparent', fontSize: 16, color: 'var(--ao-text-2)' }}>×</button>
    </div>
  )
}
