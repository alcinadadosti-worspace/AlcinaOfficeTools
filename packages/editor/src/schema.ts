// Esquema do editor: base + listas + marcas de formatação + alinhamento/recuo.
import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import { schema as basic } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { tableNodes } from 'prosemirror-tables'

function blockStyle(attrs: { align?: string | null; indent?: number; lineHeight?: string | null }): string {
  const parts: string[] = []
  if (attrs.align) parts.push(`text-align:${attrs.align}`)
  if (attrs.indent) parts.push(`margin-left:${attrs.indent * 24}px`)
  if (attrs.lineHeight) parts.push(`line-height:${attrs.lineHeight}`)
  return parts.join(';')
}

const paragraph: NodeSpec = {
  content: 'inline*',
  group: 'block',
  attrs: { align: { default: null }, indent: { default: 0 }, lineHeight: { default: null } },
  parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ align: (dom as HTMLElement).style.textAlign || null }) }],
  toDOM: (node) => {
    const s = blockStyle(node.attrs)
    return ['p', s ? { style: s } : {}, 0]
  }
}

const heading: NodeSpec = {
  content: 'inline*',
  group: 'block',
  defining: true,
  attrs: { level: { default: 1 }, align: { default: null }, indent: { default: 0 }, lineHeight: { default: null } },
  parseDOM: [1, 2, 3].map((level) => ({ tag: `h${level}`, getAttrs: (dom: HTMLElement) => ({ level, align: dom.style.textAlign || null }) })),
  toDOM: (node) => {
    const s = blockStyle(node.attrs)
    return [`h${node.attrs.level}`, s ? { style: s } : {}, 0]
  }
}

let nodes = basic.spec.nodes.update('paragraph', paragraph).update('heading', heading)
nodes = addListNodes(nodes, 'paragraph block*', 'block')
nodes = nodes.append(tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} }))

const underline: MarkSpec = { parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }], toDOM: () => ['u', 0] }
const strike: MarkSpec = { parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }], toDOM: () => ['s', 0] }
const sub: MarkSpec = { parseDOM: [{ tag: 'sub' }], toDOM: () => ['sub', 0] }
const sup: MarkSpec = { parseDOM: [{ tag: 'sup' }], toDOM: () => ['sup', 0] }
const color: MarkSpec = {
  attrs: { color: {} },
  parseDOM: [{ style: 'color', getAttrs: (v) => ({ color: v as string }) }],
  toDOM: (m) => ['span', { style: `color:${m.attrs.color}` }, 0]
}
const highlight: MarkSpec = {
  attrs: { color: {} },
  parseDOM: [{ style: 'background-color', getAttrs: (v) => ({ color: v as string }) }],
  toDOM: (m) => ['span', { style: `background-color:${m.attrs.color}` }, 0]
}
const fontSize: MarkSpec = {
  attrs: { size: {} },
  parseDOM: [{ style: 'font-size', getAttrs: (v) => ({ size: v as string }) }],
  toDOM: (m) => ['span', { style: `font-size:${m.attrs.size}` }, 0]
}
const fontFamily: MarkSpec = {
  attrs: { family: {} },
  parseDOM: [{ style: 'font-family', getAttrs: (v) => ({ family: v as string }) }],
  toDOM: (m) => ['span', { style: `font-family:${m.attrs.family}` }, 0]
}

const marks = basic.spec.marks
  .addToEnd('underline', underline)
  .addToEnd('strike', strike)
  .addToEnd('sub', sub)
  .addToEnd('sup', sup)
  .addToEnd('color', color)
  .addToEnd('highlight', highlight)
  .addToEnd('fontSize', fontSize)
  .addToEnd('fontFamily', fontFamily)

export const schema = new Schema({ nodes, marks })
