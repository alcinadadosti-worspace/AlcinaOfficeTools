// Comandos e atalhos do editor.
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark, setBlockType, wrapIn, chainCommands, exitCode } from 'prosemirror-commands'
import { undo, redo } from 'prosemirror-history'
import { splitListItem, liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list'
import { addRowAfter, addColumnAfter, deleteRow, deleteColumn, deleteTable, mergeCells, splitCell, goToNextCell } from 'prosemirror-tables'
import type { Command, Plugin } from 'prosemirror-state'
import type { Mark, MarkType, Node as ProseMirrorNode } from 'prosemirror-model'
import { schema } from './schema'

const li = schema.nodes.list_item

const insertHr: Command = (state, dispatch) => {
  if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create()).scrollIntoView())
  return true
}

/** Insere uma imagem (data URL) na posição do cursor. */
export const insertImage = (src: string, alt = ''): Command => (state, dispatch) => {
  if (!src) return false
  const node = schema.nodes.image.create({ src, alt })
  if (dispatch) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
  return true
}

/** Insere uma tabela rows x cols (primeira linha como cabeçalho). */
export const insertTable = (rows = 3, cols = 3): Command => (state, dispatch) => {
  const { table: tbl, table_row, table_cell, table_header } = schema.nodes
  const cell = (header: boolean): ProseMirrorNode => (header ? table_header : table_cell).createAndFill()!
  const row = (header: boolean): ProseMirrorNode => table_row.create(null, Array.from({ length: cols }, () => cell(header)))
  const body: ProseMirrorNode[] = [row(true)]
  for (let i = 1; i < rows; i++) body.push(row(false))
  if (dispatch) dispatch(state.tr.replaceSelectionWith(tbl.create(null, body)).scrollIntoView())
  return true
}

/** Operações de tabela (prosemirror-tables). */
export const table = { addRowAfter, addColumnAfter, deleteRow, deleteColumn, deleteTable, mergeCells, splitCell }

/** Define (ou remove) uma marca com atributos sobre a seleção. */
function applyMark(type: MarkType, attrs: Record<string, unknown> | null): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (empty) {
      if (dispatch) dispatch(attrs ? state.tr.addStoredMark(type.create(attrs)) : state.tr.removeStoredMark(type))
      return true
    }
    if (dispatch) {
      const tr = state.tr.removeMark(from, to, type)
      if (attrs) tr.addMark(from, to, type.create(attrs))
      dispatch(tr)
    }
    return true
  }
}

function nodeAttr(attr: 'align' | 'indent' | 'lineHeight', value: unknown, relative = false): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection
    let tr = state.tr
    let applied = false
    state.doc.nodesBetween(from, to, (node, pos) => {
      const attrs = node.type.spec.attrs
      if (attrs && attr in attrs) {
        const cur = node.attrs[attr]
        const next = relative ? Math.max(0, (typeof cur === 'number' ? cur : 0) + (value as number)) : value
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attr]: next })
        applied = true
      }
    })
    if (applied && dispatch) dispatch(tr)
    return applied
  }
}

export const setAlign = (align: string): Command => nodeAttr('align', align)
export const setIndent = (delta: number): Command => nodeAttr('indent', delta, true)
export const setLineHeight = (v: string | null): Command => nodeAttr('lineHeight', v)
export const setColor = (c: string): Command => applyMark(schema.marks.color, c ? { color: c } : null)
export const setHighlight = (c: string): Command => applyMark(schema.marks.highlight, c ? { color: c } : null)
export const setFontSize = (px: number): Command => applyMark(schema.marks.fontSize, { size: `${px}px` })
export const setFontFamily = (f: string): Command => applyMark(schema.marks.fontFamily, f ? { family: f } : null)

export const clearFormat: Command = (state, dispatch) => {
  const { from, to } = state.selection
  if (dispatch) {
    let tr = state.tr
    for (const name in schema.marks) tr = tr.removeMark(from, to, schema.marks[name])
    dispatch(tr)
  }
  return true
}

export function changeCase(mode: 'upper' | 'lower' | 'title'): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (empty) return false
    if (!dispatch) return true
    // Transformação com estado (título): o limite de palavra é rastreado entre nós e reinicia a cada bloco/quebra.
    const isWord = (ch: string): boolean => /[0-9A-Za-zÀ-ÿ]/.test(ch)
    let prevWord = false
    const transform = (s: string): string => {
      if (mode === 'upper') return s.toUpperCase()
      if (mode === 'lower') return s.toLowerCase()
      let out = ''
      for (const ch of s) { const w = isWord(ch); out += w && !prevWord ? ch.toUpperCase() : ch; prevWord = w }
      return out
    }
    // Substitui o texto de cada nó em seu lugar: mantém limites de bloco e as marcas de cada trecho.
    const repls: { from: number; to: number; text: string; marks: readonly Mark[] }[] = []
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) { prevWord = false; return true }
      if (!node.text) return false
      const start = Math.max(from, pos)
      const end = Math.min(to, pos + node.nodeSize)
      if (start >= end) return false
      repls.push({ from: start, to: end, text: transform(node.text.slice(start - pos, end - pos)), marks: node.marks })
      return false
    })
    const tr = state.tr
    for (let i = repls.length - 1; i >= 0; i--) {
      const r = repls[i]
      tr.replaceWith(r.from, r.to, schema.text(r.text, r.marks))
    }
    dispatch(tr.scrollIntoView())
    return true
  }
}

export const cmd = {
  bold: toggleMark(schema.marks.strong),
  italic: toggleMark(schema.marks.em),
  underline: toggleMark(schema.marks.underline),
  strike: toggleMark(schema.marks.strike),
  sub: toggleMark(schema.marks.sub),
  sup: toggleMark(schema.marks.sup),
  paragraph: setBlockType(schema.nodes.paragraph),
  h1: setBlockType(schema.nodes.heading, { level: 1 }),
  h2: setBlockType(schema.nodes.heading, { level: 2 }),
  h3: setBlockType(schema.nodes.heading, { level: 3 }),
  bullet: wrapInList(schema.nodes.bullet_list),
  ordered: wrapInList(schema.nodes.ordered_list),
  taskList: wrapInList(schema.nodes.task_list),
  quote: wrapIn(schema.nodes.blockquote),
  hr: insertHr,
  undo,
  redo,
  clearFormat,
  indentMore: setIndent(1),
  indentLess: setIndent(-1),
  alignLeft: setAlign('left'),
  alignCenter: setAlign('center'),
  alignRight: setAlign('right'),
  alignJustify: setAlign('justify')
}

export function editorKeymap(): Plugin {
  return keymap({
    'Mod-b': toggleMark(schema.marks.strong),
    'Mod-i': toggleMark(schema.marks.em),
    'Mod-u': toggleMark(schema.marks.underline),
    'Mod-z': undo,
    'Mod-y': redo,
    'Mod-Shift-z': redo,
    Enter: chainCommands(splitListItem(li), splitListItem(schema.nodes.task_item)),
    Tab: chainCommands(goToNextCell(1), sinkListItem(li)),
    'Shift-Tab': chainCommands(goToNextCell(-1), liftListItem(li)),
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => {
      if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
      return true
    })
  })
}

export function baseKeymapPlugin(): Plugin {
  return keymap(baseKeymap)
}
