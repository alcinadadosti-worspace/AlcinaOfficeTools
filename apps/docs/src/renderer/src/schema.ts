// Esquema do editor: base + listas + sublinhado + alinhamento de parágrafo/título.
import { Schema, type NodeSpec } from 'prosemirror-model'
import { schema as basic } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'

const paragraph: NodeSpec = {
  content: 'inline*',
  group: 'block',
  attrs: { align: { default: null } },
  parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ align: (dom as HTMLElement).style.textAlign || null }) }],
  toDOM: (node) => ['p', node.attrs.align ? { style: `text-align:${node.attrs.align}` } : {}, 0]
}

const heading: NodeSpec = {
  content: 'inline*',
  group: 'block',
  defining: true,
  attrs: { level: { default: 1 }, align: { default: null } },
  parseDOM: [1, 2, 3].map((level) => ({
    tag: `h${level}`,
    getAttrs: (dom: HTMLElement) => ({ level, align: dom.style.textAlign || null })
  })),
  toDOM: (node) => [`h${node.attrs.level}`, node.attrs.align ? { style: `text-align:${node.attrs.align}` } : {}, 0]
}

let nodes = basic.spec.nodes.update('paragraph', paragraph).update('heading', heading)
nodes = addListNodes(nodes, 'paragraph block*', 'block')

const marks = basic.spec.marks.addToEnd('underline', {
  parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
  toDOM: () => ['u', 0]
})

export const schema = new Schema({ nodes, marks })
