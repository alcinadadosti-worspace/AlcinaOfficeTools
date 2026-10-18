// Acesso tipado, no renderer, à ponte de atualização exposta pelo preload.
import type { UpdateStatus } from './ipc'

export interface UpdaterBridge {
  onStatus(cb: (s: UpdateStatus) => void): () => void
  check(): Promise<void>
  install(): Promise<void>
}

export function getUpdater(): UpdaterBridge | null {
  const w = window as unknown as { alcinaUpdater?: UpdaterBridge }
  return w.alcinaUpdater ?? null
}
