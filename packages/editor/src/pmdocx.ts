// Converte o documento do editor (ProseMirror) para blocos (.docx).
import type { Node as PMNode } from 'prosemirror-model'
import type { DocBlock, DocRun } from './docmodel'

function inlineRuns(node: PMNode): DocRun[] {
  const runs: DocRun[] = []
  node.forEach((child) => {
    if (child.isText) {
      const names = child.marks.map((m) => m.type.name)
      runs.push({ text: child.text ?? '', bold: names.includes('strong'), italic: names.includes('em'), underline: names.includes('underline') })
    }
  })
  return runs
}

export function docToBlocks(doc: PMNode): DocBlock[] {
  const out: DocBlock[] = []
  const walk = (node: PMNode, list?: { ordered: boolean; level: number }): void => {
    node.forEach((child) => {
      const name = child.type.name
      if (name === 'paragraph') {
        if (list) out.push({ type: 'listItem', ordered: list.ordered, level: list.level, align: child.attrs.align ?? undefined, runs: inlineRuns(child) })
        else out.push({ type: 'paragraph', align: child.attrs.align ?? undefined, runs: inlineRuns(child) })
      } else if (name === 'heading') {
        out.push({ type: 'heading', level: child.attrs.level, align: child.attrs.align ?? undefined, runs: inlineRuns(child) })
      } else if (name === 'horizontal_rule') {
        out.push({ type: 'hr' })
      } else if (name === 'blockquote') {
        walk(child, list)
      } else if (name === 'bullet_list') {
        walk(child, { ordered: false, level: (list?.level ?? -1) + 1 })
      } else if (name === 'ordered_list') {
        walk(child, { ordered: true, level: (list?.level ?? -1) + 1 })
      } else if (name === 'list_item') {
        walk(child, list)
      }
    })
  }
  walk(doc)
  return out
}
