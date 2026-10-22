// Barra de fórmulas para medidas, colunas e tabelas calculadas.
import { useState } from 'react'
import { Checkmark20Regular, Dismiss20Regular } from '@fluentui/react-icons'
import { useUi } from '../state/ui'
import { DaxEditor } from '../components/DaxEditor'
import { IconButton } from '../components/ui'
import { engine } from '../engine/client'
import { addCalculatedColumn, addCalculatedTable, addMeasure, enqueue, renameColumn, renameTable, setColumnProps, setTableProps, updateMeasure } from '../actions/model'
import { getDoc } from '../state/doc'
import { parseDax } from '@engine/dax/parser'

function splitFormula(text: string): { name: string; expr: string } | null {
  const i = text.indexOf('=')
  if (i < 0) return null
  const name = text
    .slice(0, i)
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/^'|'$/g, '')
  const expr = text.slice(i + 1).trim()
  if (!name) return null
  return { name, expr }
}

export function FormulaBar() {
  const formula = useUi((s) => s.formula)
  const [busy, setBusy] = useState(false)
  if (!formula) return null
  const set = (patch: Partial<NonNullable<typeof formula>>) => useUi.getState().set({ formula: { ...formula, ...patch } })
  const cancel = () => useUi.getState().set({ formula: null })
  const commit = async () => {
    const parts = splitFormula(formula.text)
    if (!parts) {
      set({ error: 'Use o formato: Nome = expressão' })
      return
    }
    if (!parts.expr) {
      set({ error: 'A expressão está vazia.' })
      return
    }
    try {
      parseDax(parts.expr)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      return
    }
    const doc = getDoc()
    const { name, expr } = parts
    // Nomes duplicados
    if (formula.kind === 'measure') {
      const clash = doc.model.tables.some((t) => t.measures.some((m) => m.name.toLowerCase() === name.toLowerCase() && m.name !== formula.original))
      const colClash = doc.model.tables.find((t) => t.name === formula.table)?.columns.some((c) => c.name.toLowerCase() === name.toLowerCase())
      if (clash || colClash) {
        set({ error: `Já existe um campo chamado "${name}".` })
        return
      }
    }
    setBusy(true)
    try {
      if (formula.kind === 'measure') {
        if (formula.original) updateMeasure(formula.table, formula.original, { name, expression: expr })
        else addMeasure(formula.table, { name, expression: expr })
      } else if (formula.kind === 'column') {
        if (formula.original) {
          setColumnProps(formula.table, formula.original, { expression: expr })
          if (name !== formula.original) renameColumn(formula.table, formula.original, name)
        } else addCalculatedColumn(formula.table, name, expr)
      } else {
        if (formula.original) {
          setTableProps(formula.original, { expression: expr })
          if (name !== formula.original) renameTable(formula.original, name)
        } else addCalculatedTable(name, expr)
      }
      // Verificação semântica (não bloqueia).
      const check = await enqueue(() => engine.checkDax(expr, formula.kind, formula.table || undefined))
      if (!check.ok) {
        useUi.getState().set({ formula: { ...formula, original: name, text: `${name} = ${expr}`, error: check.error } })
        return
      }
      useUi.getState().set({ formula: null, fieldSelection: formula.kind === 'measure' ? { table: formula.table, measure: name } : useUi.getState().fieldSelection })
    } finally {
      setBusy(false)
    }
  }
  const label = formula.kind === 'measure' ? 'Medida' : formula.kind === 'column' ? 'Coluna calculada' : 'Tabela calculada'
  return (
    <div style={{ background: '#ffffff', borderBottom: '1px solid var(--ab-border)', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, padding: '4px 8px' }}>
        <div style={{ display: 'flex', gap: 2, paddingTop: 2 }}>
          <IconButton icon={<Dismiss20Regular />} title="Cancelar (Esc)" onClick={cancel} />
          <IconButton icon={<Checkmark20Regular />} title="Confirmar (Enter)" onClick={() => void commit()} disabled={busy} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--ab-text-3)', paddingTop: 9, width: 96, flex: 'none' }}>
          {label}
          {formula.table && formula.kind !== 'table' ? <div style={{ fontSize: 10 }}>{formula.table}</div> : null}
        </div>
        <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--ab-border-strong)', borderRadius: 4, overflow: 'hidden' }}>
          <DaxEditor value={formula.text} onChange={(v) => set({ text: v, error: undefined })} onSubmit={() => void commit()} onCancel={cancel} autoFocus maxHeight={180} />
        </div>
      </div>
      {formula.error && (
        <div className="ab-selectable" style={{ padding: '0 12px 6px 140px', color: 'var(--ab-danger)', fontSize: 12 }}>
          {formula.error}
        </div>
      )}
    </div>
  )
}
