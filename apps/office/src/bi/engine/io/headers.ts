// Detecção automática de cabeçalhos e tipos (etapas automáticas após a fonte).
import type { DataTable } from '../data/table'
import { DateVal, type Scalar } from '../data/types'
import { CULTURE_PT_BR, type CultureOptions, inferColumnType, parseDateTime, parseNumber } from '../data/convert'
import { applyStep } from '../query/steps'
import { defaultStepName, newId } from '../query/names'
import type { StepDef, StepOp } from '../query/types'

type ValueKind = 'empty' | 'number' | 'date' | 'bool' | 'text'

function kindOf(v: Scalar): ValueKind {
  if (v === null) return 'empty'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'bool'
  if (v instanceof DateVal) return 'date'
  const s = v.trim()
  if (!s) return 'empty'
  if (/^(true|false|verdadeiro|falso)$/i.test(s)) return 'bool'
  if (parseNumber(s, ',') !== undefined || parseNumber(s, '.') !== undefined) return 'number'
  if (parseDateTime(s, true)) return 'date'
  return 'text'
}

/** Heurística: a primeira linha parece conter nomes de colunas? */
export function looksLikeHeaderRow(table: DataTable): boolean {
  if (table.rowCount === 0 || table.columnCount === 0) return false
  const first = table.columns.map((c) => (c.hasError(0) ? null : c.get(0)))
  // Todos os valores devem ser textos não vazios e curtos.
  for (const v of first) {
    if (typeof v !== 'string' || !v.trim() || v.length > 200) return false
  }
  const firstKinds = first.map(kindOf)
  if (firstKinds.every((k) => k !== 'text')) return false
  if (table.rowCount === 1) return true
  const sample = Math.min(table.rowCount, 200)
  let strong = false
  let headerValueRepeats = false
  table.columns.forEach((c, i) => {
    let numOrDate = 0
    let filled = 0
    const header = first[i] as string
    for (let r = 1; r < sample; r++) {
      if (c.hasError(r)) continue
      const v = c.get(r)
      const k = kindOf(v)
      if (k === 'empty') continue
      filled++
      if (k === 'number' || k === 'date' || k === 'bool') numOrDate++
      if (typeof v === 'string' && v === header) headerValueRepeats = true
    }
    // Cabeçalho texto sobre dados numéricos/datas é evidência forte.
    if (firstKinds[i] === 'text' && filled > 0 && numOrDate / filled >= 0.8) strong = true
  })
  if (strong) return true
  // Tudo texto: cabeçalho se os nomes forem únicos e não se repetirem nos dados.
  const unique = new Set(first.map((v) => (v as string).trim().toLowerCase())).size === first.length
  return unique && !headerValueRepeats
}

function step(op: StepOp): StepDef {
  return { id: newId('st'), name: defaultStepName(op), op }
}

export interface AutoStepOptions {
  /** Permite promover a primeira linha a cabeçalho (padrão true). */
  allowPromote?: boolean
}

/**
 * Etapas automáticas aplicadas após a fonte, como no Power BI:
 * "Cabeçalhos Promovidos" (quando aplicável) e "Tipo Alterado".
 */
export function autoSteps(table: DataTable, culture: CultureOptions = CULTURE_PT_BR, options: AutoStepOptions = {}): StepDef[] {
  const steps: StepDef[] = []
  let t = table
  if (options.allowPromote !== false && looksLikeHeaderRow(t)) {
    const s = step({ op: 'promoteHeaders' })
    steps.push(s)
    t = applyStep(t, s.op)
  }
  if (t.columnCount === 0) return steps
  const guesses = t.columns.map((c) => ({ col: c, guess: inferColumnType(c, culture) }))
  // Uma única cultura para a etapa: maioria entre as colunas com evidência.
  let comma = 0
  let dot = 0
  let dayFirst = 0
  let monthFirst = 0
  for (const { guess } of guesses) {
    if (guess.type === 'number' || guess.type === 'int' || guess.type === 'currency') {
      if (guess.decimalSep !== culture.decimalSep) {
        if (guess.decimalSep === ',') comma++
        else dot++
      }
    }
    if (guess.type === 'date' || guess.type === 'datetime') {
      if (guess.dayFirst !== culture.dayFirst) {
        if (guess.dayFirst) dayFirst++
        else monthFirst++
      }
    }
  }
  const stepCulture: CultureOptions = {
    decimalSep: comma > dot ? ',' : dot > comma ? '.' : culture.decimalSep,
    dayFirst: dayFirst > monthFirst ? true : monthFirst > dayFirst ? false : culture.dayFirst
  }
  const columns = guesses.map(({ col, guess }) => ({ column: col.name, type: guess.type }))
  steps.push(step({ op: 'changeTypes', columns, culture: stepCulture }))
  return steps
}
