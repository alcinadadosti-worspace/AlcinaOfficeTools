// Detecção automática de relações entre tabelas (como ao carregar dados).
import type { DataTable } from '../data/table'
import type { Column } from '../data/column'
import { normKey, type NormKey } from './runtime'
import type { ModelDef, RelationshipDef } from './types'

function keySet(col: Column): { set: Set<NormKey>; blanks: number; unique: boolean } {
  const set = new Set<NormKey>()
  let blanks = 0
  for (let i = 0; i < col.length; i++) {
    const v = col.get(i)
    if (v === null) {
      blanks++
      continue
    }
    set.add(normKey(v))
  }
  return { set, blanks, unique: set.size === col.length - blanks && blanks === 0 }
}

function compatible(a: Column, b: Column): boolean {
  const num = (t: string) => t === 'int' || t === 'number' || t === 'currency'
  if (a.type === b.type) return true
  if (num(a.type) && num(b.type)) return true
  if ((a.type === 'date' || a.type === 'datetime') && (b.type === 'date' || b.type === 'datetime')) return true
  return false
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')

function sameName(a: string, b: string, tableB: string): boolean {
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  // "ProdutoID" ↔ "ID" da tabela Produto
  const tb = norm(tableB)
  return (nb === 'id' || nb === 'codigo' || nb === 'cod' || nb === 'key' || nb === 'chave') && (na === tb + nb || na === nb + tb || na === 'id' + tb || na === tb + 'id')
}

/**
 * Sugere relações: colunas com nomes equivalentes, tipos compatíveis, lado "um"
 * com valores únicos e ao menos 80% dos valores do lado "muitos" contidos nele.
 */
export function detectRelationships(model: ModelDef, data: Map<string, DataTable>): RelationshipDef[] {
  const out: RelationshipDef[] = []
  const existing = new Set(model.relationships.map((r) => [r.fromTable, r.toTable].sort().join('|').toLowerCase()))
  const tables = model.tables.filter((t) => data.has(t.name))
  const cache = new Map<string, ReturnType<typeof keySet>>()
  const ks = (t: string, c: Column) => {
    const k = `${t}|${c.name}`
    let v = cache.get(k)
    if (!v) {
      v = keySet(c)
      cache.set(k, v)
    }
    return v
  }
  // União-busca para não criar caminhos ambíguos.
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    while (parent.get(x) && parent.get(x) !== x) x = parent.get(x)!
    return x
  }
  const union = (a: string, b: string) => parent.set(find(a), find(b))
  for (const t of tables) parent.set(t.name, t.name)
  for (const r of model.relationships) if (r.active) union(r.fromTable, r.toTable)

  for (const a of tables) {
    for (const b of tables) {
      if (a === b) continue
      const pair = [a.name, b.name].sort().join('|').toLowerCase()
      if (existing.has(pair)) continue
      const da = data.get(a.name)!
      const db = data.get(b.name)!
      let found: RelationshipDef | null = null
      for (const ca of da.columns) {
        for (const cb of db.columns) {
          if (!sameName(ca.name, cb.name, b.name)) continue
          if (!compatible(ca, cb)) continue
          if (ca.type === 'bool' || ca.type === 'number') continue
          const kb = ks(b.name, cb)
          if (!kb.unique || kb.set.size === 0) continue
          const ka = ks(a.name, ca)
          if (ka.set.size === 0) continue
          let contained = 0
          for (const k of ka.set) if (kb.set.has(k)) contained++
          if (contained / ka.set.size < 0.8) continue
          const oneToOne = ka.unique && da.rowCount === ka.set.size
          // Em 1:1, evita duplicar (cria apenas em uma direção).
          if (oneToOne && a.name > b.name) continue
          found = {
            id: `rel_${a.name}_${ca.name}_${b.name}_${cb.name}`.replace(/\s+/g, '_'),
            fromTable: a.name,
            fromColumn: ca.name,
            toTable: b.name,
            toColumn: cb.name,
            cardinality: oneToOne ? 'oneToOne' : 'manyToOne',
            crossFilter: oneToOne ? 'both' : 'single',
            active: true
          }
          break
        }
        if (found) break
      }
      if (!found) continue
      if (find(a.name) === find(b.name)) found.active = false
      else union(a.name, b.name)
      existing.add(pair)
      out.push(found)
    }
  }
  return out
}
