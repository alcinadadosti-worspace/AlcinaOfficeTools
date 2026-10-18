// Tokens de cor da marca Alcina: verde (principal), dourado (detalhe), branco (base).

export const palette = {
  green: '#0f7a34',
  greenStrong: '#0a5a26',
  greenSoft: '#eef7f0',
  gold: '#c79a2a',
  goldText: '#9a6d0c',
  ink: '#16211a',
  muted: '#5c6e62',
  border: '#d7e1d6',
  surface: '#f4f7f3',
  white: '#ffffff'
} as const

export const paletteDark = {
  green: '#49b97c',
  greenStrong: '#74d39e',
  greenSoft: '#13251a',
  gold: '#dab55a',
  goldText: '#dab55a',
  ink: '#e8efe9',
  muted: '#9db0a2',
  border: '#27352c',
  surface: '#141f18',
  white: '#0d1511'
} as const

/** Cores por aplicativo (para ícones e destaques na central). */
export const appColors = {
  sheets: '#0f7a34',
  docs: '#1a5fb4',
  point: '#c25a1b',
  notes: '#6d3fb0',
  bi: '#0a7d86'
} as const

export type AppKey = keyof typeof appColors
