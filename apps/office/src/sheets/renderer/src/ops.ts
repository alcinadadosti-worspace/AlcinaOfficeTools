// Operações estruturais: inserir/excluir linhas e colunas, ordenar e localizar/substituir.
// Observação: referências em fórmulas não são reajustadas automaticamente nesta versão.
import { type SheetEngine, type CellEntry, type CellValue, displayValue, colToLetter, letterToCol } from '@alcina/sheets-engine'
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

// --- Alça de preenchimento (fill handle): séries e deslocamento de fórmulas ---

const A1RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/
const IDENT = /[A-Za-z0-9_$.À-ÿ]/

/** Desloca uma referência A1 por (dr, dc), respeitando os $ absolutos. */
export function shiftRef(ref: string, dr: number, dc: number): string {
  const m = A1RE.exec(ref)
  if (!m) return ref
  const col = letterToCol(m[2]) + (m[1] === '$' ? 0 : dc)
  const row = parseInt(m[4], 10) - 1 + (m[3] === '$' ? 0 : dr)
  if (col < 0 || row < 0) return '#REF!'
  return `${m[1]}${colToLetter(col)}${m[3]}${row + 1}`
}

/** Desloca todas as referências relativas de uma fórmula; preserva textos entre aspas e nomes de função. */
export function shiftFormula(raw: string, dr: number, dc: number): string {
  if (!raw.startsWith('=')) return raw
  let out = ''
  let i = 0
  const n = raw.length
  while (i < n) {
    const c = raw[i]
    if (c === '"') {
      out += c
      i++
      while (i < n) {
        out += raw[i]
        if (raw[i] === '"') {
          if (raw[i + 1] === '"') { out += raw[i + 1]; i += 2; continue }
          i++
          break
        }
        i++
      }
      continue
    }
    if (IDENT.test(c)) {
      let j = i
      let s = ''
      while (j < n && IDENT.test(raw[j])) s += raw[j++]
      let k = j
      while (k < n && (raw[k] === ' ' || raw[k] === '\t')) k++
      out += raw[k] === '(' ? s : shiftRef(s, dr, dc) // seguido de "(" => nome de função
      i = j
      continue
    }
    out += c
    i++
  }
  return out
}

export interface Block {
  r1: number
  c1: number
  r2: number
  c2: number
}

/** Determina o eixo, a extensão (g) e o sentido do preenchimento ao arrastar até (tr, tc). */
export function fillPlan(b: Block, tr: number, tc: number): { axis: 'row' | 'col'; g: number; back: boolean } | null {
  const belowG = Math.max(0, tr - b.r2)
  const aboveG = Math.max(0, b.r1 - tr)
  const rightG = Math.max(0, tc - b.c2)
  const leftG = Math.max(0, b.c1 - tc)
  const vert = Math.max(belowG, aboveG)
  const horz = Math.max(rightG, leftG)
  if (vert === 0 && horz === 0) return null
  if (vert >= horz) return { axis: 'row', g: vert, back: aboveG > belowG }
  return { axis: 'col', g: horz, back: leftG > rightG }
}

const MONTHS_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DAYS_ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DAYS_FEIRA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const LISTS = [MONTHS_ABBR, MONTHS_FULL, DAYS_ABBR, DAYS_FULL, DAYS_FEIRA]

type CaseStyle = 'upper' | 'lower' | 'title'

function asNum(s: string): number | null {
  const t = s.trim()
  if (t === '' || !/^-?\d+(?:[.,]\d+)?$/.test(t)) return null
  return Number(t.replace(',', '.'))
}
function fmtNum(n: number): string {
  const r = Math.round(n * 1e10) / 1e10
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',')
}
function listInfo(s: string): { list: string[]; idx: number } | null {
  const t = s.trim().toLowerCase()
  for (const list of LISTS) {
    const idx = list.findIndex((x) => x.toLowerCase() === t)
    if (idx >= 0) return { list, idx }
  }
  return null
}
function caseOf(s: string): CaseStyle {
  const t = s.trim()
  if (t && t === t.toUpperCase() && t !== t.toLowerCase()) return 'upper'
  if (t[0] === t[0]?.toUpperCase() && t.slice(1) === t.slice(1).toLowerCase()) return 'title'
  return 'lower'
}
function applyCase(canon: string, cs: CaseStyle): string {
  return cs === 'upper' ? canon.toUpperCase() : cs === 'lower' ? canon.toLowerCase() : canon
}
function splitTail(s: string): { prefix: string; num: number; pad: number; zero: boolean } | null {
  const m = /^(.*?)(\d+)$/.exec(s)
  if (!m) return null
  return { prefix: m[1], num: parseInt(m[2], 10), pad: m[2].length, zero: m[2].length > 1 && m[2][0] === '0' }
}

/**
 * Projeta uma série a partir das células de origem (`seed`, em ordem no eixo) para as
 * posições pedidas (deslocamentos inteiros a partir do início da origem). Detecta, nesta ordem:
 * fórmulas (desloca referências), números (progressão aritmética), listas conhecidas
 * (meses/dias), texto com número no fim, e por fim cópia/repetição cíclica.
 */
export function fillSeries(seed: string[], positions: number[], axis: 'row' | 'col'): string[] {
  const L = seed.length
  if (L === 0) return positions.map(() => '')
  const repeat = (p: number): string => seed[((p % L) + L) % L]

  // Fórmulas: desloca referências relativas pelo deslocamento do eixo.
  if (seed.every((s) => s.startsWith('='))) {
    return positions.map((p) => {
      const b = ((p % L) + L) % L
      const steps = p - b
      return shiftFormula(seed[b], axis === 'row' ? steps : 0, axis === 'col' ? steps : 0)
    })
  }

  // Números: progressão aritmética (passo = diferença média); um só valor => cópia.
  const nums = seed.map(asNum)
  if (nums.every((x) => x !== null)) {
    const v = nums as number[]
    const step = L >= 2 ? (v[L - 1] - v[0]) / (L - 1) : 0
    return positions.map((p) => fmtNum(v[0] + step * p))
  }

  // Listas conhecidas (meses, dias da semana), todas da mesma lista.
  const infos = seed.map(listInfo)
  if (infos.every((x) => x) && infos.every((x) => x!.list === infos[0]!.list)) {
    const list = infos[0]!.list
    const len = list.length
    const i0 = infos[0]!.idx
    const step = L >= 2 ? Math.round((infos[L - 1]!.idx - i0) / (L - 1)) || 1 : 1
    const cs = caseOf(seed[L - 1])
    return positions.map((p) => applyCase(list[(((i0 + step * p) % len) + len) % len], cs))
  }

  // Texto com número no fim e mesmo prefixo: "Item 1" => "Item 2"...
  const tails = seed.map(splitTail)
  if (tails.every((t) => t) && tails.every((t) => t!.prefix === tails[0]!.prefix)) {
    const prefix = tails[0]!.prefix
    const n0 = tails[0]!.num
    const stepN = L >= 2 ? (tails[L - 1]!.num - n0) / (L - 1) : 1
    const { pad, zero } = tails[0]!
    return positions.map((p) => {
      const n = Math.round(n0 + stepN * p)
      const body = String(Math.abs(n))
      return `${prefix}${n < 0 ? '-' : ''}${zero ? body.padStart(pad, '0') : body}`
    })
  }

  // Padrão: repetição cíclica da origem.
  return positions.map((p) => repeat(p))
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
