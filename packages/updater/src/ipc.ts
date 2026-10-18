// Contrato de atualização automática compartilhado entre processo principal e renderer.

export const UPDATER_CHANNELS = {
  status: 'alcina-updater:status',
  check: 'alcina-updater:check',
  install: 'alcina-updater:install'
} as const

export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  message?: string
}
