// NodeView do item de tarefa: renderiza uma caixa de seleção que alterna o atributo `checked`.
import type { EditorView, NodeView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'

export class TaskItemView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private box: HTMLInputElement
  private node: PMNode

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node
    const li = document.createElement('li')
    li.className = 'ao-task-item'
    li.setAttribute('data-checked', String(!!node.attrs.checked))

    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'ao-task-box'
    box.checked = !!node.attrs.checked
    box.contentEditable = 'false'
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('change', () => {
      const pos = getPos()
      if (typeof pos === 'number') view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, checked: box.checked }))
    })

    const body = document.createElement('div')
    body.className = 'ao-task-body'

    li.appendChild(box)
    li.appendChild(body)
    this.dom = li
    this.contentDOM = body
    this.box = box
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'task_item') return false
    this.node = node
    this.box.checked = !!node.attrs.checked
    this.dom.setAttribute('data-checked', String(!!node.attrs.checked))
    return true
  }

  stopEvent(e: Event): boolean {
    return e.target === this.box
  }
}
