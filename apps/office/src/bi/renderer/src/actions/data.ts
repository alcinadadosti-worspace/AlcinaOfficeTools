// Obtenção e carga de dados (consultas -> tabelas do modelo).
import type { QueryDef, SourceDef, StepDef } from '@engine/query/types'
import type { TableDef } from '@engine/model/types'
import { engine } from '../engine/client'
import { getDoc, updateDoc } from '../state/doc'
import { useUi } from '../state/ui'
import { uid } from '../report/defaults'
import { autoDetectRelationships, enqueue, newColumnDef, syncModelNow, uniqueName } from './model'

export interface NewQuery {
  name: string
  source: SourceDef
  steps: StepDef[]
}

function baseName(path: string): string {
  const f = path.split(/[\\/]/).pop() ?? path
  return f.replace(/\.[^.]+$/, '')
}

export function nameForSource(source: SourceDef): string {
  switch (source.kind) {
    case 'csv':
    case 'json':
    case 'parquet':
      return baseName(source.path)
    case 'excel':
      return source.sheet
    case 'folder':
      return baseName(source.path)
    case 'web': {
      try {
        const u = new URL(source.url)
        return baseName(u.pathname) || u.hostname
      } catch {
        return 'Web'
      }
    }
    case 'enterData':
      return 'Tabela'
    case 'database':
      return source.connection.database
    default:
      return 'Consulta'
  }
}

/** Adiciona consultas e carrega (ou abre o editor de consultas). */
export async function addQueries(items: NewQuery[], mode: 'load' | 'transform'): Promise<void> {
  const doc = getDoc()
  const taken = [...doc.queries.map((q) => q.name), ...doc.model.tables.map((t) => t.name)]
  const created: QueryDef[] = []
  for (const it of items) {
    const name = uniqueName(it.name.trim() || 'Consulta', taken)
    taken.push(name)
    created.push({ id: uid('q'), name, source: it.source, steps: it.steps, load: true })
  }
  updateDoc(created.length === 1 ? `Nova consulta ${created[0].name}` : 'Novas consultas', (d) => {
    d.queries.push(...created)
  })
  if (mode === 'transform') {
    useUi.getState().set({ queryEditor: { open: true, queryId: created[0].id, stepIndex: created[0].steps.length - 1 } })
    return
  }
  await applyQueries(created.map((q) => q.id))
}

/** Executa consultas e atualiza as tabelas do modelo ("Fechar e Aplicar"). */
export async function applyQueries(ids: string[] | 'all', opts: { detectRelationships?: boolean } = {}): Promise<boolean> {
  const ui = useUi.getState()
  ui.set({ loading: { message: 'Carregando dados...', detail: 'Avaliando consultas' } })
  try {
    const queries = getDoc().queries
    const results = await enqueue(() => engine.refresh(queries, ids))
    const before = new Set(getDoc().model.tables.map((t) => t.queryId).filter(Boolean))
    let createdTables = 0
    updateDoc(
      'Carregar dados',
      (d) => {
        // Remove tabelas de consultas excluídas ou com carga desabilitada.
        const loadable = new Set(d.queries.filter((q) => q.load).map((q) => q.id))
        d.model.tables = d.model.tables.filter((t) => !t.queryId || loadable.has(t.queryId))
        for (const r of results) {
          if (r.error) continue
          const q = d.queries.find((x) => x.id === r.queryId)
          if (!q) continue
          let t = d.model.tables.find((x) => x.queryId === r.queryId) as TableDef | undefined
          if (!t) {
            const name = uniqueName(
              q.name,
              d.model.tables.map((x) => x.name)
            )
            t = { name, queryId: q.id, columns: [], measures: [], hierarchies: [] }
            d.model.tables.push(t)
            createdTables++
          }
          const old = t.columns
          const next = r.columns.map((c) => {
            const prev = old.find((x) => !x.expression && (x.sourceColumn ?? x.name) === c.name)
            if (prev) {
              const typeChanged = prev.dataType !== c.type
              return {
                ...prev,
                dataType: c.type,
                formatString: typeChanged ? newColumnDef(prev.name, c.type).formatString : prev.formatString,
                summarizeBy: typeChanged ? newColumnDef(prev.name, c.type).summarizeBy : prev.summarizeBy
              }
            }
            return newColumnDef(c.name, c.type)
          })
          const calc = old.filter((x) => x.expression)
          t.columns = [...next, ...calc]
        }
        // Relações para colunas que não existem mais
        d.model.relationships = d.model.relationships.filter((rel) => {
          const ft = d.model.tables.find((x) => x.name === rel.fromTable)
          const tt = d.model.tables.find((x) => x.name === rel.toTable)
          return !!ft?.columns.some((c) => c.name === rel.fromColumn) && !!tt?.columns.some((c) => c.name === rel.toColumn)
        })
      },
      { history: true }
    )
    const errors = results.filter((r) => r.error)
    const isNew = results.some((r) => !r.error && !before.has(r.queryId))
    if ((opts.detectRelationships ?? true) && (isNew || createdTables > 0)) {
      ui.set({ loading: { message: 'Carregando dados...', detail: 'Detectando relações' } })
      await autoDetectRelationships()
    }
    ui.set({ loading: { message: 'Carregando dados...', detail: 'Calculando o modelo' } })
    await syncModelNow()
    if (errors.length) {
      ui.openDialog({
        kind: 'error',
        title: 'Alguns dados não puderam ser carregados',
        message: errors.map((e) => `• ${e.name}: ${e.error}`).join('\n')
      })
      return false
    }
    const rows = results.reduce((s, r) => s + r.rowCount, 0)
    ui.toast({ intent: 'success', title: 'Dados carregados', body: `${results.length} tabela(s), ${rows.toLocaleString('pt-BR')} linha(s).` })
    return true
  } catch (e) {
    ui.openDialog({ kind: 'error', title: 'Erro ao carregar dados', message: e instanceof Error ? e.message : String(e) })
    return false
  } finally {
    useUi.getState().set({ loading: null })
  }
}

export function refreshAll(): Promise<boolean> {
  return applyQueries('all', { detectRelationships: false })
}
