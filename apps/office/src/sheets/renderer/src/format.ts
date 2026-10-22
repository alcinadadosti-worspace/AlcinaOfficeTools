// Formatação de exibição de uma célula conforme o estilo (formato de número).
import { displayValue, isError, type CellValue } from '@alcina/sheets-engine'
import type { CellStyle } from './model'

export function formatCell(v: CellValue, style?: CellStyle): string {
  if (v === null) return ''
  if (isError(v)) return displayValue(v)
  const fmt = style?.fmt
  if (typeof v === 'number' && fmt && fmt !== 'general') {
    const d = style?.decimals
    try {
      if (fmt === 'percent') return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 2 }).format(v)
      if (fmt === 'currency') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2 }).format(v)
      if (fmt === 'thousands') return new Intl.NumberFormat('pt-BR', { useGrouping: true, minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 2 }).format(v)
      if (fmt === 'number') return new Intl.NumberFormat('pt-BR', { useGrouping: false, minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2 }).format(v)
      if (fmt === 'accounting') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2 }).format(v)
      if (fmt === 'scientific') return v.toExponential(d ?? 2).replace('.', ',').replace('e', 'E')
    } catch {
      /* formato inválido: cai no padrão */
    }
  }
  return displayValue(v)
}
