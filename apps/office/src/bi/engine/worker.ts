// Worker do motor AlcinaBi: executa consultas, modelo e DAX fora da interface.
import { EngineService } from './service'
import { collectTransfer, type FromWorker, type HostMethod, type ToWorker } from './protocol'
import type { SourceHost } from './query/types'

interface Scope {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
}

const scope = self as unknown as Scope
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let seq = 1

function hostCall<T>(method: HostMethod, args: unknown[]): Promise<T> {
  const id = seq++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    scope.postMessage({ type: 'hostreq', id, method, args })
  })
}

const host: SourceHost = {
  readFile: (path) => hostCall('readFile', [path]),
  statFile: (path) => hostCall('statFile', [path]),
  listDir: (path) => hostCall('listDir', [path]),
  fetchUrl: (url) => hostCall('fetchUrl', [url]),
  dbQuery: (conn, sql) => hostCall('dbQuery', [conn, sql])
}

const service = new EngineService(host)

scope.onmessage = async (e) => {
  const msg = e.data
  if (msg.type === 'hostres') {
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error ?? 'Erro desconhecido'))
    return
  }
  if (msg.type === 'req') {
    try {
      const fn = (service as unknown as Record<string, (...a: unknown[]) => unknown>)[msg.method]
      if (typeof fn !== 'function') throw new Error(`Método desconhecido: ${msg.method}`)
      const result = await fn.apply(service, msg.args)
      scope.postMessage({ type: 'res', id: msg.id, ok: true, result }, collectTransfer(result))
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const extra: Record<string, unknown> = {}
      for (const k of ['queryId', 'stepId', 'stepName', 'pos']) {
        const v = (error as unknown as Record<string, unknown>)[k]
        if (v !== undefined) extra[k] = v
      }
      scope.postMessage({ type: 'res', id: msg.id, ok: false, error: { message: error.message, name: error.name, extra } })
    }
  }
}

scope.postMessage({ type: 'ready' })
