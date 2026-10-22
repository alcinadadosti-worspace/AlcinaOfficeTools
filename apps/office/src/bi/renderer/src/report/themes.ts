// Temas de relatório. As paletas categóricas foram validadas para daltonismo
// (diferença perceptual entre vizinhos ≥ 8 em OKLab) para fundos claros/escuros.
import type { ReportTheme } from './types'

export const THEMES: ReportTheme[] = [
  {
    name: 'AlcinaBi',
    dataColors: ['#0a8fa3', '#eb6834', '#2a78d6', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    background: '#ffffff',
    foreground: '#252423',
    tableAccent: '#0a8fa3',
    good: '#0ca30c',
    neutral: '#eda100',
    bad: '#d03b3b'
  },
  {
    name: 'Clássico',
    dataColors: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    background: '#ffffff',
    foreground: '#252423',
    tableAccent: '#2a78d6',
    good: '#0ca30c',
    neutral: '#eda100',
    bad: '#d03b3b'
  },
  {
    name: 'Noite',
    dataColors: ['#14a0b3', '#d95926', '#3987e5', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    background: '#1f1f1e',
    foreground: '#f0efec',
    tableAccent: '#14a0b3',
    good: '#0ca30c',
    neutral: '#c98500',
    bad: '#e66767',
    visualBackground: '#262625',
    pageBackground: '#1a1a19',
    dark: true
  }
]

export const DEFAULT_THEME = THEMES[0]

/**
 * Importa um tema no formato JSON usado por ferramentas de BI
 * (name, dataColors, background, foreground, tableAccent...).
 */
export function parseThemeJson(text: string): ReportTheme {
  const j = JSON.parse(text) as Record<string, unknown>
  const colors = Array.isArray(j.dataColors) ? (j.dataColors as unknown[]).filter((c): c is string => typeof c === 'string') : []
  if (!colors.length) throw new Error('O tema não contém "dataColors".')
  const str = (k: string, d: string) => (typeof j[k] === 'string' ? (j[k] as string) : d)
  return {
    name: str('name', 'Tema personalizado'),
    dataColors: colors.slice(0, 16),
    background: str('background', '#ffffff'),
    foreground: str('foreground', '#252423'),
    tableAccent: str('tableAccent', colors[0]),
    good: str('good', '#0ca30c'),
    neutral: str('neutral', '#eda100'),
    bad: str('bad', '#d03b3b'),
    visualBackground: typeof j.visualBackground === 'string' ? (j.visualBackground as string) : undefined,
    pageBackground: typeof j.pageBackground === 'string' ? (j.pageBackground as string) : undefined
  }
}

export function themeToJson(t: ReportTheme): string {
  return JSON.stringify(
    {
      name: t.name,
      dataColors: t.dataColors,
      background: t.background,
      foreground: t.foreground,
      tableAccent: t.tableAccent,
      good: t.good,
      neutral: t.neutral,
      bad: t.bad
    },
    null,
    2
  )
}
