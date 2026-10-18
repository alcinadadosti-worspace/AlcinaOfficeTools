// Operações do modelo e sincronização com o motor.
import type { Draft } from 'immer'
import type { FieldRef } from '@engine/vq/types'
import type { ColumnDef, MeasureDef, RelationshipDef, TableDef } from '@engine/model/types'
import type { DataType } from '@engine/data/types'
import { defaultFormatFor } from '@engine/data/format'
import { engine } from '../engine/client'
import { getDoc, updateDoc, useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import type { DocState, FilterDef, ReportDef } from '../report/types'
import { renameColumnInDax, renameMeasureInDax, renameTableInDax } from './daxRefactor'
import { uid } from '../report/defaults'

// ---------------------------------------------------------------------------
// Fila de operações do motor (evita condições de corrida)
// ---------------------------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve()

export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn)
  chain = p.catch(() => undefined)
  return p
}

let syncTimer: ReturnType<typeof setTimeout> | null = null

export function syncModelNow(): Promise<void> {
  return enqueue(async () => {
    const model = getDoc().model
    try {
      const info = await engine.syncModel(model)
      useUi.getState().set({ modelInfo: info, modelVersion: useUi.getState().modelVersion + 1 })
      // Aplica tipos inferidos de colunas calculadas (sem histórico).
      const fixes: { table: string; column: string; type: DataType }[] = []
      for (const t of info.tables) {
        const td = model.tables.find((x) => x.name === t.name)
        if (!td) continue
        for (const c of t.columns) {
          const cd = td.columns.find((x) => x.name === c.name)
          if (cd && cd.expression && cd.dataType !== c.type) fixes.push({ table: t.name, column: c.name, type: c.type })
        }
        // Tabelas calculadas: colunas vêm do resultado.
        if (td.expression) {
          const names = t.columns.map((c) => c.name).join('|')
          if (names !== td.columns.map((c) => c.name).join('|') || t.columns.some((c, i) => td.columns[i]?.dataType !== c.type)) {
            updateDoc(
              'Colunas da tabela calculada',
              (d) => {
                const tt = d.model.tables.find((x) => x.name === t.name)
                if (!tt) return
                tt.columns = t.columns.map((c) => {
                  const old = tt.columns.find((x) => x.name === c.name)
                  return old ? { ...old, dataType: c.type } : newColumnDef(c.name, c.type)
                })
              },
              { history: false }
            )
          }
        }
      }
      if (fixes.length) {
        updateDoc(
          'Tipos de colunas calculadas',
          (d) => {
            for (const f of fixes) {
              const c = d.model.tables.find((t) => t.name === f.table)?.columns.find((x) => x.name === f.column)
              if (c) {
                c.dataType = f.type
                if (!c.formatString) c.formatString = defaultFormatFor(f.type)
                if (f.type === 'int' || f.type === 'number' || f.type === 'currency') {
                  if (c.summarizeBy === 'none') c.summarizeBy = 'sum'
                }
              }
            }
          },
          { history: false }
        )
      }
    } catch (e) {
      useUi.getState().toast({ intent: 'error', title: 'Erro ao atualizar o modelo', body: e instanceof Error ? e.message : String(e) })
    }
  })
}

export function scheduleModelSync(delay = 120): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void syncModelNow()
  }, delay)
}

export function startModelSync(): () => void {
  return useDoc.subscribe((s, prev) => {
    if (s.doc.model !== prev.doc.model) scheduleModelSync()
  })
}

// ---------------------------------------------------------------------------
// Utilidades de definição
// ---------------------------------------------------------------------------

export function isNumericType(t: DataType): boolean {
  return t === 'int' || t === 'number' || t === 'currency'
}

export function newColumnDef(name: string, type: DataType): ColumnDef {
  return {
    name,
    dataType: type,
    summarizeBy: isNumericType(type) && !/(^id$|id$|^cod|codigo|código|key$|chave|^ano$|^year$|cep|telefone)/i.test(name) ? 'sum' : 'none',
    formatString: defaultFormatFor(type)
  }
}

export function findTable(d: DocState | Draft<DocState>, name: string): TableDef | undefined {
  return d.model.tables.find((t) => t.name.toLowerCase() === name.toLowerCase()) as TableDef | undefined
}

export function uniqueName(base: string, existing: string[]): string {
  const low = new Set(existing.map((x) => x.toLowerCase()))
  if (!low.has(base.toLowerCase())) return base
  let i = 2
  while (low.has(`${base} ${i}`.toLowerCase())) i++
  return `${base} ${i}`
}

export function allMeasureNames(d: DocState): string[] {
  return d.model.tables.flatMap((t) => t.measures.map((m) => m.name))
}

/** Percorre todas as referências de campo do relatório. */
export function mapFieldRefs(report: Draft<ReportDef>, fn: (f: Draft<FieldRef>) => void): void {
  const filters = (fs: Draft<FilterDef>[]) => {
    for (const f of fs) {
      fn(f.field)
      if (f.by) fn(f.by)
    }
  }
  filters(report.filters)
  for (const p of report.pages) {
    filters(p.filters)
    for (const v of p.visuals) {
      for (const role of Object.values(v.fields)) for (const f of role) fn(f)
      filters(v.filters)
      for (const dp of v.drillPath ?? []) fn(dp.field)
    }
  }
}

function forEachExpression(d: Draft<DocState>, fn: (expr: string, table: string) => string): void {
  for (const t of d.model.tables) {
    if (t.expression) t.expression = fn(t.expression, t.name)
    for (const c of t.columns) if (c.expression) c.expression = fn(c.expression, t.name)
    for (const m of t.measures) m.expression = fn(m.expression, t.name)
  }
}

// ---------------------------------------------------------------------------
// Medidas, colunas e tabelas
// ---------------------------------------------------------------------------

export function addMeasure(table: string, m: MeasureDef): void {
  updateDoc(`Nova medida ${m.name}`, (d) => {
    const t = findTable(d, table)
    if (t) t.measures.push(m)
  })
}

export function updateMeasure(table: string, oldName: string, patch: Partial<MeasureDef>): void {
  updateDoc(`Editar medida ${oldName}`, (d) => {
    const t = findTable(d, table)
    const m = t?.measures.find((x) => x.name === oldName)
    if (!m) return
    Object.assign(m, patch)
    if (patch.name && patch.name !== oldName) {
      const nn = patch.name
      forEachExpression(d, (e) => renameMeasureInDax(e, oldName, nn))
      mapFieldRefs(d.report, (f) => {
        if (f.measure && f.measure.toLowerCase() === oldName.toLowerCase()) f.measure = nn
      })
    }
  })
}

export function deleteMeasure(table: string, name: string): void {
  updateDoc(`Excluir medida ${name}`, (d) => {
    const t = findTable(d, table)
    if (!t) return
    t.measures = t.measures.filter((m) => m.name !== name)
    removeFieldUses(d, (f) => !!f.measure && f.measure.toLowerCase() === name.toLowerCase())
  })
}

/** Move uma medida para outra tabela. */
export function moveMeasure(fromTable: string, name: string, toTable: string): void {
  updateDoc(`Mover medida ${name}`, (d) => {
    const a = findTable(d, fromTable)
    const b = findTable(d, toTable)
    const m = a?.measures.find((x) => x.name === name)
    if (!a || !b || !m) return
    a.measures = a.measures.filter((x) => x !== m)
    b.measures.push(m)
    mapFieldRefs(d.report, (f) => {
      if (f.measure === name) f.table = b.name
    })
  })
}

export function addCalculatedColumn(table: string, name: string, expression: string): void {
  updateDoc(`Nova coluna ${name}`, (d) => {
    const t = findTable(d, table)
    if (t) t.columns.push({ name, dataType: 'any', summarizeBy: 'none', expression })
  })
}

export function addCalculatedTable(name: string, expression: string): void {
  updateDoc(`Nova tabela ${name}`, (d) => {
    d.model.tables.push({ name, expression, columns: [], measures: [], hierarchies: [] })
  })
}

export function setColumnProps(table: string, column: string, patch: Partial<ColumnDef>): void {
  updateDoc(`Propriedades de ${column}`, (d) => {
    const c = findTable(d, table)?.columns.find((x) => x.name === column)
    if (c) Object.assign(c, patch)
  })
}

export function setTableProps(table: string, patch: Partial<TableDef>): void {
  updateDoc(`Propriedades de ${table}`, (d) => {
    const t = findTable(d, table)
    if (t) Object.assign(t, patch)
  })
}

export function renameColumn(table: string, oldName: string, newName: string): void {
  if (!newName.trim() || oldName === newName) return
  updateDoc(`Renomear coluna ${oldName}`, (d) => {
    const t = findTable(d, table)
    const c = t?.columns.find((x) => x.name === oldName)
    if (!t || !c) return
    if (!c.expression && !c.sourceColumn) c.sourceColumn = oldName
    c.name = newName
    for (const x of t.columns) if (x.sortByColumn === oldName) x.sortByColumn = newName
    if (t.dateColumn === oldName) t.dateColumn = newName
    for (const h of t.hierarchies) for (const l of h.levels) if (l.column === oldName) l.column = newName
    forEachExpression(d, (e, owner) => renameColumnInDax(e, t.name, oldName, newName, owner === t.name))
    for (const r of d.model.relationships) {
      if (r.fromTable === t.name && r.fromColumn === oldName) r.fromColumn = newName
      if (r.toTable === t.name && r.toColumn === oldName) r.toColumn = newName
    }
    mapFieldRefs(d.report, (f) => {
      if (f.table.toLowerCase() === t.name.toLowerCase() && f.column === oldName) f.column = newName
    })
  })
}

export function renameTable(oldName: string, newName: string): void {
  if (!newName.trim() || oldName === newName) return
  updateDoc(`Renomear tabela ${oldName}`, (d) => {
    const t = findTable(d, oldName)
    if (!t) return
    t.name = newName
    if (t.queryId) {
      const q = d.queries.find((x) => x.id === t.queryId)
      if (q) q.name = newName
    }
    forEachExpression(d, (e) => renameTableInDax(e, oldName, newName))
    for (const r of d.model.relationships) {
      if (r.fromTable === oldName) r.fromTable = newName
      if (r.toTable === oldName) r.toTable = newName
    }
    mapFieldRefs(d.report, (f) => {
      if (f.table.toLowerCase() === oldName.toLowerCase()) f.table = newName
    })
    if (d.report.modelLayout[oldName]) {
      d.report.modelLayout[newName] = d.report.modelLayout[oldName]
      delete d.report.modelLayout[oldName]
    }
  })
}

/** Remove usos de campos que satisfazem o predicado (visuais e filtros). */
export function removeFieldUses(d: Draft<DocState>, pred: (f: FieldRef) => boolean): void {
  const r = d.report
  r.filters = r.filters.filter((f) => !pred(f.field))
  for (const p of r.pages) {
    p.filters = p.filters.filter((f) => !pred(f.field))
    for (const v of p.visuals) {
      for (const k of Object.keys(v.fields)) v.fields[k] = v.fields[k].filter((f) => !pred(f))
      v.filters = v.filters.filter((f) => !pred(f.field))
    }
  }
}

export function deleteColumn(table: string, column: string): void {
  updateDoc(`Excluir coluna ${column}`, (d) => {
    const t = findTable(d, table)
    const c = t?.columns.find((x) => x.name === column)
    if (!t || !c) return
    t.columns = t.columns.filter((x) => x !== c)
    d.model.relationships = d.model.relationships.filter(
      (r) => !((r.fromTable === t.name && r.fromColumn === column) || (r.toTable === t.name && r.toColumn === column))
    )
    removeFieldUses(d, (f) => f.table.toLowerCase() === t.name.toLowerCase() && f.column === column)
    // Coluna de origem: remove também na consulta (como uma etapa).
    if (!c.expression && t.queryId) {
      const q = d.queries.find((x) => x.id === t.queryId)
      if (q) q.steps.push({ id: uid('st'), name: 'Colunas Removidas', op: { op: 'removeColumns', columns: [c.sourceColumn ?? c.name] } })
    }
  })
}

export function deleteTable(name: string): void {
  updateDoc(`Excluir tabela ${name}`, (d) => {
    const t = findTable(d, name)
    if (!t) return
    d.model.tables = d.model.tables.filter((x) => x !== t)
    d.model.relationships = d.model.relationships.filter((r) => r.fromTable !== t.name && r.toTable !== t.name)
    if (t.queryId) d.queries = d.queries.filter((q) => q.id !== t.queryId)
    removeFieldUses(d, (f) => f.table.toLowerCase() === t.name.toLowerCase())
    delete d.report.modelLayout[t.name]
  })
}

// ---------------------------------------------------------------------------
// Relações
// ---------------------------------------------------------------------------

export function upsertRelationship(r: RelationshipDef): void {
  updateDoc('Relação', (d) => {
    const i = d.model.relationships.findIndex((x) => x.id === r.id)
    // Apenas uma relação ativa entre o mesmo par de tabelas.
    if (r.active) {
      for (const x of d.model.relationships) {
        if (x.id === r.id) continue
        const same = (x.fromTable === r.fromTable && x.toTable === r.toTable) || (x.fromTable === r.toTable && x.toTable === r.fromTable)
        if (same && x.active) x.active = false
      }
    }
    if (i >= 0) d.model.relationships[i] = r
    else d.model.relationships.push(r)
  })
}

export function deleteRelationship(id: string): void {
  updateDoc('Excluir relação', (d) => {
    d.model.relationships = d.model.relationships.filter((r) => r.id !== id)
  })
}

export async function autoDetectRelationships(): Promise<number> {
  const model = getDoc().model
  const found = await enqueue(() => engine.suggestRelationships(model))
  if (found.length) {
    updateDoc('Relações detectadas', (d) => {
      for (const r of found) d.model.relationships.push(r)
    })
  }
  return found.length
}
