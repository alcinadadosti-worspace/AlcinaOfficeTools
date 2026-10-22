// Busca os dados de um visual no motor (com cache e descarte de respostas antigas).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { VQResult } from '@engine/vq/types'
import { engine } from '../engine/client'
import { enqueue } from '../actions/model'
import { useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import type { PageDef, VisualDef } from '../report/types'
import { buildQuery, type BuiltQuery } from './query'

export interface VisualData {
  status: 'empty' | 'loading' | 'ready' | 'error'
  result: VQResult | null
  built: BuiltQuery | null
  error?: string
}

const cache = new Map<string, VQResult>()
const MAX_CACHE = 300

function remember(key: string, r: VQResult): void {
  cache.set(key, r)
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string)
}

export function useVisualData(v: VisualDef, page: PageDef): VisualData {
  const report = useDoc((s) => s.doc.report)
  const selection = useUi((s) => s.selection[page.id] ?? null)
  const modelVersion = useUi((s) => s.modelVersion)
  const hasModel = useUi((s) => !!s.modelInfo)

  const built = useMemo(() => {
    try {
      return buildQuery(v, { report, page, selection })
    } catch {
      return null
    }
  }, [v, report, page, selection])

  const key = built ? `${modelVersion}|${JSON.stringify(built.query)}` : ''
  const [state, setState] = useState<VisualData>(() => ({
    status: built ? 'loading' : 'empty',
    result: key ? (cache.get(key) ?? null) : null,
    built
  }))
  const reqRef = useRef(0)

  useEffect(() => {
    if (!built || !hasModel) {
      setState({ status: 'empty', result: null, built })
      return
    }
    const cached = cache.get(key)
    if (cached) {
      setState({ status: 'ready', result: cached, built })
      return
    }
    const id = ++reqRef.current
    setState((s) => ({ status: 'loading', result: s.result, built }))
    const t = setTimeout(() => {
      enqueue(() => engine.executeVisual(built.query))
        .then((r) => {
          remember(key, r)
          if (reqRef.current === id) setState({ status: 'ready', result: r, built })
        })
        .catch((e: unknown) => {
          if (reqRef.current === id) setState({ status: 'error', result: null, built, error: e instanceof Error ? e.message : String(e) })
        })
    }, 30)
    return () => clearTimeout(t)
  }, [key, built, hasModel])

  return state
}

export function clearVisualCache(): void {
  cache.clear()
}
