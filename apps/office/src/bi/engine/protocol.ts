// Protocolo de mensagens entre a interface e o Worker do motor.
import type { EngineService } from './service'
import type { SourceHost } from './query/types'

export type EngineMethod = {
  [K in keyof EngineService]: EngineService[K] extends (...args: never[]) => unknown ? K : never
}[keyof EngineService]

export type EngineApi = {
  [K in EngineMethod]: EngineService[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never
}

export type HostMethod = keyof SourceHost

export type ToWorker =
  | { type: 'req'; id: number; method: EngineMethod; args: unknown[] }
  | { type: 'hostres'; id: number; ok: boolean; result?: unknown; error?: string }

export type FromWorker =
  | { type: 'res'; id: number; ok: boolean; result?: unknown; error?: { message: string; name: string; extra?: Record<string, unknown> } }
  | { type: 'hostreq'; id: number; method: HostMethod; args: unknown[] }
  | { type: 'ready' }

/** Coleta ArrayBuffers transferíveis de um resultado (evita cópias grandes). */
export function collectTransfer(value: unknown, out: Transferable[] = [], depth = 0): Transferable[] {
  if (depth > 4 || value === null || typeof value !== 'object') return out
  if (value instanceof Uint8Array) {
    if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength && value.buffer instanceof ArrayBuffer) out.push(value.buffer)
    return out
  }
  if (Array.isArray(value)) {
    if (value.length > 64) return out
    for (const v of value) collectTransfer(v, out, depth + 1)
    return out
  }
  for (const v of Object.values(value as Record<string, unknown>)) collectTransfer(v, out, depth + 1)
  return out
}
