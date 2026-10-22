// Cliente do Worker do motor: chamadas tipadas e atendimento de pedidos de E/S.
import EngineWorker from '@engine/worker?worker'
import type { EngineApi, EngineMethod, FromWorker, ToWorker } from '@engine/protocol'
import type { DbSourceConnection } from '@engine/query/types'

export class EngineError extends Error {
  constructor(
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'EngineError'
  }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; method: string }

/** Senhas de bancos de dados informadas na sessão (não são salvas no arquivo). */
const dbPasswords = new Map<string, string>()

export function dbKey(c: Pick<DbSourceConnection, 'kind' | 'host' | 'database' | 'user'>): string {
  return `${c.kind}|${c.host}|${c.database}|${c.user}`.toLowerCase()
}

export function setDbPassword(c: DbSourceConnection, password: string): void {
  dbPasswords.set(dbKey(c), password)
}

class EngineClient {
  private worker: Worker
  private pending = new Map<number, Pending>()
  private seq = 1
  private busy = 0
  private listeners = new Set<(busy: boolean) => void>()

  constructor() {
    this.worker = new EngineWorker()
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => void this.onMessage(e.data)
    this.worker.onerror = (e) => console.error('Erro no motor:', e.message)
  }

  onBusyChange(cb: (busy: boolean) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private setBusy(delta: number): void {
    const was = this.busy > 0
    this.busy += delta
    const is = this.busy > 0
    if (was !== is) this.listeners.forEach((l) => l(is))
  }

  call<M extends EngineMethod>(method: M, ...args: Parameters<EngineApi[M]>): ReturnType<EngineApi[M]> {
    const id = this.seq++
    this.setBusy(1)
    const p = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
      const msg: ToWorker = { type: 'req', id, method, args }
      this.worker.postMessage(msg)
    })
    return p as ReturnType<EngineApi[M]>
  }

  private async onMessage(msg: FromWorker): Promise<void> {
    if (msg.type === 'ready') return
    if (msg.type === 'res') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      this.setBusy(-1)
      if (msg.ok) p.resolve(msg.result)
      else p.reject(new EngineError(msg.error?.message ?? 'Erro desconhecido', msg.error?.extra ?? {}))
      return
    }
    if (msg.type === 'hostreq') {
      const reply = (ok: boolean, result?: unknown, error?: string) => {
        const out: ToWorker = { type: 'hostres', id: msg.id, ok, result, error }
        const transfer = result instanceof Uint8Array && result.byteOffset === 0 ? [result.buffer as ArrayBuffer] : []
        this.worker.postMessage(out, transfer)
      }
      try {
        const api = window.alcina
        let result: unknown
        switch (msg.method) {
          case 'readFile':
            result = await api.fs.read(msg.args[0] as string)
            break
          case 'statFile':
            result = await api.fs.stat(msg.args[0] as string)
            break
          case 'listDir':
            result = await api.fs.listDir(msg.args[0] as string)
            break
          case 'fetchUrl': {
            const r = await api.net.fetch(msg.args[0] as string)
            if (r.status >= 400) throw new Error(`A requisição retornou o status ${r.status}.`)
            result = r
            break
          }
          case 'dbQuery': {
            const conn = msg.args[0] as DbSourceConnection
            const password = conn.password ?? dbPasswords.get(dbKey(conn)) ?? ''
            result = await api.db.query({ ...conn, password }, msg.args[1] as string)
            break
          }
          default:
            throw new Error(`Pedido desconhecido: ${String(msg.method)}`)
        }
        reply(true, result)
      } catch (err) {
        reply(false, undefined, err instanceof Error ? err.message : String(err))
      }
    }
  }
}

const client = new EngineClient()

/** API do motor com métodos tipados (cada chamada vira uma mensagem ao Worker). */
export const engine: EngineApi = new Proxy({} as EngineApi, {
  get(_t, prop: string) {
    return (...args: unknown[]) => (client.call as (m: string, ...a: unknown[]) => Promise<unknown>)(prop, ...args)
  }
})

export const engineEvents = {
  onBusyChange: (cb: (busy: boolean) => void) => client.onBusyChange(cb)
}
