// Comandos e atalhos do editor.
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark, setBlockType, wrapIn, chainCommands, exitCode } from 'prosemirror-commands'
import { undo, redo } from 'prosemirror-history'
import { splitListItem, liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list'
import type { Command, Plugin } from 'prosemirror-state'
import { schema } from './schema'

const li = schema.nodes.list_item

const insertHr: Command = (state, dispatch) => {
  if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create()).scrollIntoView())
  return true
}

export function setAlign(align: string): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection
    let tr = state.tr
    let applied = false
    state.doc.nodesBetween(from, to, (node, pos) => {
      const attrs = node.type.spec.attrs
      if (attrs && 'align' in attrs) {
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, align })
        applied = true
      }
    })
    if (applied && dispatch) dispatch(tr)
    return applied
  }
}

export const cmd = {
  bold: toggleMark(schema.marks.strong),
  italic: toggleMark(schema.marks.em),
  underline: toggleMark(schema.marks.underline),
  paragraph: setBlockType(schema.nodes.paragraph),
  h1: setBlockType(schema.nodes.heading, { level: 1 }),
  h2: setBlockType(schema.nodes.heading, { level: 2 }),
  h3: setBlockType(schema.nodes.heading, { level: 3 }),
  bullet: wrapInList(schema.nodes.bullet_list),
  ordered: wrapInList(schema.nodes.ordered_list),
  quote: wrapIn(schema.nodes.blockquote),
  hr: insertHr,
  undo,
  redo,
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
    Enter: splitListItem(li),
    Tab: sinkListItem(li),
    'Shift-Tab': liftListItem(li),
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => {
      if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
      return true
    })
  })
}

export function baseKeymapPlugin(): Plugin {
  return keymap(baseKeymap)
}
