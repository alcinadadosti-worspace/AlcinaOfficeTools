// Operações estruturais: inserir/excluir linhas e colunas, ordenar e localizar/substituir.
// Observação: referências em fórmulas não são reajustadas automaticamente nesta versão.
import { type SheetEngine, type CellEntry, type CellValue, displayValue } from '@alcina/sheets-engine'
import { type CellStyle } from './model'

export interface SheetData {
  entries: CellEntry[]
  styles: Record<string, CellStyle>
}

type MapFn = (row: number, col: number) => { r: number; c: number } | null

export function remap(engine: SheetEngine, styles: Record<string, CellStyle>, map: MapFn): SheetData {
  const entries: CellEntry[] = []
  for (const e of engine.entries()) {
    const m = map(e.row, e.col)
    if (m && m.r >= 0 && m.c >= 0) entries.push({ row: m.r, col: m.c, raw: e.raw })
  }
  const outStyles: Record<string, CellStyle> = {}
  for (const [k, st] of Object.entries(styles)) {
    const i = k.indexOf(',')
    const r = Number(k.slice(0, i))
    const c = Number(k.slice(i + 1))
    const m = map(r, c)
    if (m && m.r >= 0 && m.c >= 0) outStyles[`${m.r},${m.c}`] = st
  }
  return { entries, styles: outStyles }
}

export function insertRow(engine: SheetEngine, styles: Record<string, CellStyle>, at: number): SheetData {
  return remap(engine, styles, (r, c) => ({ r: r >= at ? r + 1 : r, c }))
}
export function deleteRow(engine: SheetEngine, styles: Record<string, CellStyle>, at: number): SheetData {
  return remap(engine, styles, (r, c) => (r === at ? null : { r: r > at ? r - 1 : r, c }))
}
export function insertCol(engine: SheetEngine, styles: Record<string, CellStyle>, at: number): SheetData {
  return remap(engine, styles, (r, c) => ({ r, c: c >= at ? c + 1 : c }))
}
export function deleteCol(engine: SheetEngine, styles: Record<string, CellStyle>, at: number): SheetData {
  return remap(engine, styles, (r, c) => (c === at ? null : { r, c: c > at ? c - 1 : c }))
}

function cmpVals(a: CellValue, b: CellValue): number {
  const an = typeof a === 'number'
  const bn = typeof b === 'number'
  if (an && bn) return (a as number) - (b as number)
  if (an) return -1
  if (bn) return 1
  const ae = a === null || (typeof a === 'object' && a !== null)
  const be = b === null || (typeof b === 'object' && b !== null)
  if (ae && be) return 0
  if (ae) return 1
  if (be) return -1
  return displayValue(a).localeCompare(displayValue(b), 'pt-BR')
}

/** Ordena as linhas do intervalo (nas colunas selecionadas) pela coluna-chave. */
export function sortBlock(engine: SheetEngine, styles: Record<string, CellStyle>, r1: number, r2: number, c1: number, c2: number, keyCol: number, desc: boolean): SheetData {
  const rows: number[] = []
  for (let r = r1; r <= r2; r++) rows.push(r)
  const order = [...rows].sort((a, b) => cmpVals(engine.getValue(a, keyCol), engine.getValue(b, keyCol)) * (desc ? -1 : 1))
  const newRow = new Map<number, number>()
  order.forEach((oldR, i) => newRow.set(oldR, r1 + i))
  return remap(engine, styles, (r, c) => {
    if (r >= r1 && r <= r2 && c >= c1 && c <= c2) return { r: newRow.get(r) ?? r, c }
    return { r, c }
  })
}

/** Substitui texto em todas as células; devolve quantas foram alteradas. */
export function findReplaceAll(engine: SheetEngine, find: string, replace: string, matchCase: boolean): number {
  if (!find) return 0
  let count = 0
  const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(esc, matchCase ? 'g' : 'gi')
  for (const e of engine.entries()) {
    if ((matchCase ? e.raw.includes(find) : e.raw.toLowerCase().includes(find.toLowerCase()))) {
      const next = e.raw.replace(re, replace)
      if (next !== e.raw) {
        engine.setCell(e.row, e.col, next)
        count++
      }
    }
  }
  return count
}
