// Formatação de valores na interface.
import { fromJsonScalar, type JsonScalar } from '@engine/query/types'
import { formatCompact, formatScalar, type DisplayUnits } from '@engine/data/format'
import { MONTH_NAMES_PT } from '@engine/data/dates'
import type { DataType } from '@engine/data/types'
import type { FieldRef } from '@engine/vq/types'
import { AGGREGATION_LABEL } from '@engine/vq/types'
import { DATE_LEVEL_LABEL } from '@engine/model/types'

export const BLANK_LABEL = '(Em branco)'

/** Formata um valor de chave/categoria (respeita níveis de data). */
export function formatKey(v: JsonScalar, field?: FieldRef, format?: string, type?: DataType): string {
  if (v === null || v === undefined) return BLANK_LABEL
  if (field?.level) {
    const n = Number(v)
    switch (field.level) {
      case 'year':
        return String(n)
      case 'quarter':
        return `Trim ${n}`
      case 'month':
        return MONTH_NAMES_PT[n - 1] ?? String(n)
      case 'day':
        return String(n)
    }
  }
  const s = fromJsonScalar(v)
  if (typeof s === 'number' && (type === 'int' || type === undefined) && !format && Number.isInteger(s) && Math.abs(s) >= 1000 && Math.abs(s) < 3000 && /ano|year/i.test(field?.column ?? '')) {
    return String(s)
  }
  if (s === '') return '(Vazio)'
  return formatScalar(s, format, type)
}

/** Formata um valor numérico/medida. */
export function formatValue(v: JsonScalar, format?: string, type?: DataType, opts: { units?: DisplayUnits; decimals?: number } = {}): string {
  if (v === null || v === undefined) return ''
  const s = fromJsonScalar(v)
  if (typeof s === 'number' && opts.units && opts.units !== 'none') {
    return formatCompact(s, { units: opts.units, decimals: opts.decimals, fmt: format })
  }
  if (typeof s === 'number' && opts.decimals !== undefined && !format) {
    return formatScalar(s, '#,0' + (opts.decimals > 0 ? '.' + '0'.repeat(opts.decimals) : ''), type)
  }
  if (typeof s === 'number' && !format) {
    if (Number.isInteger(s)) return formatScalar(s, '#,0')
    return formatScalar(s, Math.abs(s) < 1 ? '#,0.####' : '#,0.##')
  }
  return formatScalar(s, format, type)
}

/** Formato compacto para eixos e rótulos. */
export function formatAxis(v: number, format?: string, units: DisplayUnits = 'auto', reference?: number): string {
  if (format && /%/.test(format.replace(/"[^"]*"/g, ''))) return formatCompact(v, { fmt: format, decimals: Math.abs(v) < 0.1 && v !== 0 ? 1 : 0 })
  return formatCompact(v, { units, fmt: format, reference })
}

export function fieldLabel(f: FieldRef): string {
  if (f.measure) return f.measure
  const base = f.level ? DATE_LEVEL_LABEL[f.level] : (f.column ?? '')
  if (f.aggregation && f.aggregation !== 'none') return `${AGGREGATION_LABEL[f.aggregation]} de ${f.column}`
  return base
}

export function parseDecimals(v: unknown): number | undefined {
  if (v === '' || v === undefined || v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : undefined
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Interpola entre duas cores hex. */
export function mixColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16)
  const pb = parseInt(b.replace('#', ''), 16)
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t)
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t)
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t)
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)
}

/** Cor de texto legível sobre um fundo. */
export function readableText(bg: string): string {
  const p = parseInt(bg.replace('#', '').slice(0, 6), 16)
  const r = (p >> 16) & 255
  const g = (p >> 8) & 255
  const b = p & 255
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return l > 0.6 ? '#252423' : '#ffffff'
}

export function keyString(v: JsonScalar): string {
  if (v === null || v === undefined) return '\u0000null'
  if (typeof v === 'object') return `d${v.date}`
  return typeof v + ':' + String(v).toLowerCase()
}
