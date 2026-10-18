// Leitura de documentos JSON como tabela.
import { ColumnBuilder } from '../data/column'
import { DataTable } from '../data/table'
import type { Scalar } from '../data/types'
import { decodeText } from './csv'
import { jsToScalar } from './values'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Procura (em largura) a primeira lista de registros dentro de um objeto. */
function findRecordArray(root: Record<string, unknown>): unknown[] | null {
  const queue: unknown[] = [root]
  let guard = 0
  while (queue.length && guard++ < 10_000) {
    const cur = queue.shift()
    if (!isRecord(cur)) continue
    for (const v of Object.values(cur)) {
      if (Array.isArray(v) && v.length > 0 && v.some(isRecord)) return v
    }
    for (const v of Object.values(cur)) if (isRecord(v)) queue.push(v)
  }
  return null
}

function flatten(rec: Record<string, unknown>, prefix: string, out: Map<string, Scalar>): void {
  for (const [k, v] of Object.entries(rec)) {
    const name = prefix ? `${prefix}.${k}` : k
    if (isRecord(v)) {
      if (Object.keys(v).length === 0) out.set(name, null)
      else flatten(v, name, out)
    } else if (Array.isArray(v)) {
      out.set(name, JSON.stringify(v))
    } else {
      out.set(name, jsToScalar(v))
    }
  }
}

/** Converte um valor JSON (lista de registros, objeto ou valor) em tabela. */
export function jsonToTable(value: unknown): DataTable {
  let rows: unknown[]
  if (Array.isArray(value)) rows = value
  else if (isRecord(value)) rows = findRecordArray(value) ?? [value]
  else rows = [value]

  const hasRecords = rows.some(isRecord)
  if (!hasRecords) {
    // Lista de valores simples: uma única coluna.
    const b = new ColumnBuilder('any', rows.length)
    for (const v of rows) b.push(Array.isArray(v) ? JSON.stringify(v) : jsToScalar(v))
    return new DataTable([b.build('Column1')], rows.length)
  }

  const names: string[] = []
  const index = new Map<string, number>()
  const flatRows: Map<string, Scalar>[] = []
  for (const r of rows) {
    const m = new Map<string, Scalar>()
    if (isRecord(r)) flatten(r, '', m)
    else m.set('Value', Array.isArray(r) ? JSON.stringify(r) : jsToScalar(r))
    for (const k of m.keys()) {
      if (!index.has(k)) {
        index.set(k, names.length)
        names.push(k)
      }
    }
    flatRows.push(m)
  }
  const cols = names.map((name) => {
    const b = new ColumnBuilder('any', flatRows.length)
    for (const m of flatRows) b.push(m.has(name) ? (m.get(name) ?? null) : null)
    return b.build(name)
  })
  return new DataTable(cols, flatRows.length)
}

/** Lê bytes de um arquivo JSON (aceita também JSON Lines). */
export function parseJsonTable(bytes: Uint8Array): DataTable {
  const text = decodeText(bytes, 'auto').trim()
  if (!text) return new DataTable([], 0)
  try {
    return jsonToTable(JSON.parse(text))
  } catch (err) {
    // JSON Lines: um registro por linha.
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length > 1) {
      try {
        return jsonToTable(lines.map((l) => JSON.parse(l)))
      } catch {
        /* cai no erro original */
      }
    }
    throw new Error(`JSON inválido: ${(err as Error).message}`)
  }
}
