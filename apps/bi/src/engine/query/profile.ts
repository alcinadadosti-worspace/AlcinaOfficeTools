// Perfil de colunas e formatação da visualização prévia do editor de consultas.
import type { Column } from '../data/column'
import type { DataTable } from '../data/table'
import { DateVal, type Scalar } from '../data/types'
import { formatGeneral, formatScalar, type Locale } from '../data/format'
import { compareScalars, hashKey } from '../data/ops'
import { type ColumnProfile, toJsonScalar } from './types'

export type PreviewCell = string | null | { error: string }

/** Texto exibido para um valor na visualização prévia. */
export function formatPreviewValue(v: Scalar, locale: Locale = 'pt-BR'): string | null {
  if (v === null) return null
  if (typeof v === 'number') return formatGeneral(v, locale)
  if (v instanceof DateVal) return formatScalar(v, undefined, undefined, locale)
  return formatScalar(v, undefined, undefined, locale)
}

export function formatPreviewCell(col: Column, row: number, locale: Locale = 'pt-BR'): PreviewCell {
  if (col.hasError(row)) return { error: col.errorMessage ?? 'Erro' }
  return formatPreviewValue(col.get(row), locale)
}

export function previewRows(table: DataTable, maxRows = 1000, locale: Locale = 'pt-BR'): PreviewCell[][] {
  const n = Math.min(table.rowCount, maxRows)
  const out: PreviewCell[][] = new Array(n)
  for (let r = 0; r < n; r++) {
    const row: PreviewCell[] = new Array(table.columnCount)
    for (let c = 0; c < table.columnCount; c++) row[c] = formatPreviewCell(table.columns[c], r, locale)
    out[r] = row
  }
  return out
}

/** Estatísticas de qualidade, distribuição e valores mais frequentes da coluna. */
export function profileColumn(col: Column, maxTop = 20, locale: Locale = 'pt-BR'): ColumnProfile {
  const n = col.length
  let errors = 0
  let empty = 0
  const entries: { value: Scalar; count: number }[] = []
  const d = col.data
  if (d.kind === 'text') {
    const counts = new Int32Array(d.dict.length)
    for (let r = 0; r < n; r++) {
      if (col.hasError(r)) {
        errors++
        continue
      }
      const c = d.codes[r]
      if (c < 0) {
        empty++
        continue
      }
      counts[c]++
    }
    // Entradas de dicionário duplicadas (raras) são somadas pelo texto.
    const byText = new Map<string, number>()
    for (let i = 0; i < counts.length; i++) {
      if (!counts[i]) continue
      const s = d.dict[i]
      byText.set(s, (byText.get(s) ?? 0) + counts[i])
    }
    for (const [value, count] of byText) {
      if (value === '') empty += count
      else entries.push({ value, count })
    }
  } else if (d.kind === 'num') {
    // Caminho rápido: contagem por valor numérico bruto (datas em ms).
    const counts = new Map<number, number>()
    const vals = d.values
    for (let r = 0; r < n; r++) {
      if (col.hasError(r)) {
        errors++
        continue
      }
      const x = vals[r]
      if (x !== x) {
        empty++
        continue
      }
      counts.set(x, (counts.get(x) ?? 0) + 1)
    }
    const kind = col.type === 'date' || col.type === 'datetime' || col.type === 'time' ? col.type : null
    for (const [x, count] of counts) entries.push({ value: kind ? new DateVal(x, kind) : x, count })
  } else {
    const map = new Map<unknown, { value: Scalar; count: number }>()
    for (let r = 0; r < n; r++) {
      if (col.hasError(r)) {
        errors++
        continue
      }
      const v = col.get(r)
      if (v === null || v === '') {
        empty++
        continue
      }
      const k = hashKey(v)
      const e = map.get(k)
      if (e) e.count++
      else map.set(k, { value: v, count: 1 })
    }
    for (const e of map.values()) entries.push(e)
  }
  let min: Scalar = null
  let max: Scalar = null
  let unique = 0
  for (const e of entries) {
    if (e.count === 1) unique++
    if (min === null || compareScalars(e.value, min) < 0) min = e.value
    if (max === null || compareScalars(e.value, max) > 0) max = e.value
  }
  const top = [...entries]
    .sort((a, b) => b.count - a.count || compareScalars(a.value, b.value))
    .slice(0, maxTop)
    .map((e) => ({ value: formatPreviewValue(e.value, locale) ?? '', count: e.count }))
  return {
    name: col.name,
    type: col.type,
    count: n,
    valid: n - errors - empty,
    errors,
    empty,
    distinct: entries.length,
    unique,
    min: toJsonScalar(min),
    max: toJsonScalar(max),
    top,
    firstError: errors ? (col.errorMessage ?? 'Erro') : undefined
  }
}
