// Tabela dinâmica: agrupa um intervalo por campo de linha (e opcionalmente coluna) e agrega um valor.
import { type SheetEngine, type CellValue, displayValue } from '@alcina/sheets-engine'

export type Agg = 'sum' | 'count' | 'avg' | 'max' | 'min'

export const AGG_LABEL: Record<Agg, string> = {
  sum: 'Soma',
  count: 'Contagem',
  avg: 'Média',
  max: 'Máximo',
  min: 'Mínimo'
}

export interface PivotCfg {
  /** Índices de coluna (absolutos na planilha). colField = null => sem eixo de colunas. */
  rowField: number
  colField: number | null
  valField: number
  agg: Agg
}

interface Bucket {
  nums: number[]
  cnt: number
}

/** Rótulo de chave: vazio vira "(vazio)". */
function keyOf(v: CellValue): string {
  if (v === null || v === '' || (typeof v === 'object' && v !== null)) return ''
  return displayValue(v)
}

/** Ordena chaves: numéricas por valor, demais por localidade pt-BR; vazio por último. */
function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === b) return 0
    if (a === '') return 1
    if (b === '') return -1
    const na = Number(a.replace(',', '.'))
    const nb = Number(b.replace(',', '.'))
    const aNum = a !== '' && isFinite(na)
    const bNum = b !== '' && isFinite(nb)
    if (aNum && bNum) return na - nb
    if (aNum) return -1
    if (bNum) return 1
    return a.localeCompare(b, 'pt-BR')
  })
}

function fmt(n: number): string {
  const r = Math.round(n * 1e10) / 1e10
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',')
}

/** Aplica a agregação sobre uma lista de buckets reunidos (totais recomputam dos dados brutos). */
function aggregate(buckets: Bucket[], agg: Agg): string {
  const nums: number[] = []
  let cnt = 0
  for (const b of buckets) {
    cnt += b.cnt
    for (const n of b.nums) nums.push(n)
  }
  if (agg === 'count') return cnt ? String(cnt) : ''
  if (!nums.length) return ''
  if (agg === 'sum') return fmt(nums.reduce((a, b) => a + b, 0))
  if (agg === 'avg') return fmt(nums.reduce((a, b) => a + b, 0) / nums.length)
  if (agg === 'max') return fmt(Math.max(...nums))
  return fmt(Math.min(...nums))
}

export interface PivotResult {
  grid: string[][]
  /** nº de colunas de valor (sem contar a 1ª coluna de rótulos e sem o total). */
  colKeys: string[]
  rowKeys: string[]
}

/**
 * Monta a tabela dinâmica. A primeira linha do intervalo (r1) é o cabeçalho (nomes dos campos).
 * Layout: cabeçalho + uma linha por chave de linha + "Total Geral"; coluna de rótulos + chaves de coluna + total.
 */
export function buildPivot(engine: SheetEngine, r1: number, r2: number, headers: string[], cfg: PivotCfg): PivotResult {
  const { rowField, colField, valField, agg } = cfg
  const buckets = new Map<string, Bucket>()
  const rowSet = new Set<string>()
  const colSet = new Set<string>()
  const get = (rk: string, ck: string): Bucket => {
    const k = `${rk}\u0000${ck}`
    let b = buckets.get(k)
    if (!b) { b = { nums: [], cnt: 0 }; buckets.set(k, b) }
    return b
  }
  for (let r = r1 + 1; r <= r2; r++) {
    const rk = keyOf(engine.getValue(r, rowField))
    const ck = colField !== null ? keyOf(engine.getValue(r, colField)) : ''
    rowSet.add(rk)
    colSet.add(ck)
    const b = get(rk, ck)
    const cell = engine.getValue(r, valField)
    if (cell !== null && cell !== '' && !(typeof cell === 'object')) b.cnt++
    if (typeof cell === 'number') b.nums.push(cell)
  }
  const rowKeys = sortKeys([...rowSet])
  const colKeys = colField !== null ? sortKeys([...colSet]) : ['']
  const bucketsFor = (rks: string[], cks: string[]): Bucket[] => {
    const out: Bucket[] = []
    for (const rk of rks) for (const ck of cks) { const b = buckets.get(`${rk}\u0000${ck}`); if (b) out.push(b) }
    return out
  }

  const label = (k: string): string => (k === '' ? '(vazio)' : k)
  const aggName = AGG_LABEL[agg]
  const valName = headers[valField] || `Coluna ${valField + 1}`
  const grid: string[][] = []

  // Cabeçalho
  const head = [headers[rowField] || 'Linhas']
  if (colField !== null) { for (const ck of colKeys) head.push(label(ck)); head.push('Total Geral') }
  else head.push(`${aggName} de ${valName}`)
  grid.push(head)

  // Linhas
  for (const rk of rowKeys) {
    const row = [label(rk)]
    if (colField !== null) {
      for (const ck of colKeys) row.push(aggregate(bucketsFor([rk], [ck]), agg))
      row.push(aggregate(bucketsFor([rk], colKeys), agg))
    } else {
      row.push(aggregate(bucketsFor([rk], colKeys), agg))
    }
    grid.push(row)
  }

  // Total geral
  const tot = ['Total Geral']
  if (colField !== null) {
    for (const ck of colKeys) tot.push(aggregate(bucketsFor(rowKeys, [ck]), agg))
    tot.push(aggregate(bucketsFor(rowKeys, colKeys), agg))
  } else {
    tot.push(aggregate(bucketsFor(rowKeys, colKeys), agg))
  }
  grid.push(tot)

  return { grid, colKeys: colField !== null ? colKeys : [''], rowKeys }
}
