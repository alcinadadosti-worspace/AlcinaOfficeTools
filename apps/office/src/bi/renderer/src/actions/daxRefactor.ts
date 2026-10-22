// Atualiza referências em expressões DAX ao renomear tabelas, colunas e medidas.
import { tokenize } from '@engine/dax/parser'

function quoteTable(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`
}

function bracket(name: string): string {
  return `[${name.replace(/]/g, ']]')}]`
}

interface Edit {
  start: number
  end: number
  text: string
}

function applyEdits(src: string, edits: Edit[]): string {
  let out = src
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}

function safeTokens(expr: string) {
  try {
    return tokenize(expr)
  } catch {
    return null
  }
}

export function renameTableInDax(expr: string, oldName: string, newName: string): string {
  const toks = safeTokens(expr)
  if (!toks) return expr
  const low = oldName.toLowerCase()
  const edits: Edit[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if ((t.t === 'qtable' || t.t === 'ident') && t.v.toLowerCase() === low) {
      // identificador seguido de "(" é função, não tabela
      const next = toks[i + 1]
      if (t.t === 'ident' && next && next.t === 'op' && next.v === '(') continue
      edits.push({ start: t.start, end: t.end, text: quoteTable(newName) })
    }
  }
  return applyEdits(expr, edits)
}

/** Renomeia Tabela[Coluna] (e [Coluna] quando `table` é a tabela da expressão). */
export function renameColumnInDax(expr: string, table: string, oldName: string, newName: string, isOwnTable = false): string {
  const toks = safeTokens(expr)
  if (!toks) return expr
  const tlow = table.toLowerCase()
  const clow = oldName.toLowerCase()
  const edits: Edit[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.t !== 'bracket' || t.v.toLowerCase() !== clow) continue
    const prev = toks[i - 1]
    const qualified = prev && (prev.t === 'qtable' || prev.t === 'ident') && prev.end === t.start
    if (qualified ? prev.v.toLowerCase() === tlow : isOwnTable) edits.push({ start: t.start, end: t.end, text: bracket(newName) })
  }
  return applyEdits(expr, edits)
}

/** Renomeia referências a uma medida ([Medida] ou Tabela[Medida]). */
export function renameMeasureInDax(expr: string, oldName: string, newName: string): string {
  const toks = safeTokens(expr)
  if (!toks) return expr
  const low = oldName.toLowerCase()
  const edits: Edit[] = []
  for (const t of toks) if (t.t === 'bracket' && t.v.toLowerCase() === low) edits.push({ start: t.start, end: t.end, text: bracket(newName) })
  return applyEdits(expr, edits)
}
