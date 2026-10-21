// Converte o documento do editor (ProseMirror) para blocos (.docx).
import type { Node as PMNode } from 'prosemirror-model'
import type { DocBlock, DocRun, DocTableCell } from './docmodel'

function inlineRuns(node: PMNode): DocRun[] {
  const runs: DocRun[] = []
  node.forEach((child) => {
    const name = child.type.name
    if (child.isText) {
      const names = child.marks.map((m) => m.type.name)
      runs.push({ text: child.text ?? '', bold: names.includes('strong'), italic: names.includes('em'), underline: names.includes('underline') })
    } else if (name === 'hard_break') {
      runs.push({ text: '', break: true })
    } else if (name === 'image') {
      const src = child.attrs.src as string
      if (src) runs.push({ text: '', image: { src } })
    }
  })
  return runs
}

export function docToBlocks(doc: PMNode): DocBlock[] {
  const out: DocBlock[] = []
  let orderedSeq = -1
  const walk = (node: PMNode, target: DocBlock[], list?: { ordered: boolean; level: number; numId?: number }): void => {
    node.forEach((child) => {
      const name = child.type.name
      if (name === 'paragraph') {
        if (list) target.push({ type: 'listItem', ordered: list.ordered, level: list.level, numId: list.numId, align: child.attrs.align ?? undefined, runs: inlineRuns(child) })
        else target.push({ type: 'paragraph', align: child.attrs.align ?? undefined, runs: inlineRuns(child) })
      } else if (name === 'heading') {
        target.push({ type: 'heading', level: child.attrs.level, align: child.attrs.align ?? undefined, runs: inlineRuns(child) })
      } else if (name === 'horizontal_rule') {
        target.push({ type: 'hr' })
      } else if (name === 'blockquote') {
        walk(child, target, list)
      } else if (name === 'bullet_list') {
        walk(child, target, { ordered: false, level: (list?.level ?? -1) + 1, numId: undefined })
      } else if (name === 'ordered_list') {
        const numId = list?.numId ?? ++orderedSeq
        walk(child, target, { ordered: true, level: (list?.level ?? -1) + 1, numId })
      } else if (name === 'list_item') {
        walk(child, target, list)
      } else if (name === 'task_list') {
        walk(child, target, list)
      } else if (name === 'task_item') {
        const checked = !!child.attrs.checked
        child.forEach((inner) => {
          if (inner.type.name === 'paragraph') {
            target.push({ type: 'paragraph', align: inner.attrs.align ?? undefined, runs: [{ text: checked ? '☒ ' : '☐ ' }, ...inlineRuns(inner)] })
          } else {
            walk(inner, target, list)
          }
        })
      } else if (name === 'table') {
        const rows: DocTableCell[][] = []
        child.forEach((rowNode) => {
          if (rowNode.type.name !== 'table_row') return
          const cells: DocTableCell[] = []
          rowNode.forEach((cellNode) => {
            const cellBlocks: DocBlock[] = []
            walk(cellNode, cellBlocks)
            cells.push({ blocks: cellBlocks })
          })
          rows.push(cells)
        })
        if (rows.length) target.push({ type: 'table', rows })
      }
    })
  }
  walk(doc, out)
  return out
}
