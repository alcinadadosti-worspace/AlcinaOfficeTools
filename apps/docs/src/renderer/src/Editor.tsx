// Componente React que hospeda o editor ProseMirror e expõe uma API imperativa.
import { useEffect, useRef, type ReactNode, type MutableRefObject } from 'react'
import { EditorState, type Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { DOMParser as PMDOMParser, DOMSerializer, type MarkType } from 'prosemirror-model'
import { history, undoDepth, redoDepth } from 'prosemirror-history'
import { schema } from './schema'
import { editorKeymap, baseKeymapPlugin } from './commands'
import { docToBlocks } from './pmdocx'
import type { DocBlock } from '../../shared/docmodel'

export interface Snapshot {
  strong: boolean
  em: boolean
  underline: boolean
  heading: number
  align: string | null
  canUndo: boolean
  canRedo: boolean
}

export interface EditorApi {
  exec(command: Command): void
  getJSON(): unknown
  setJSON(json: unknown): void
  setHTML(html: string): void
  getBlocks(): DocBlock[]
  getPrintHtml(): string
  focus(): void
}

const PRINT_CSS =
  "body{font-family:'Segoe UI',system-ui,sans-serif;color:#222;margin:0}.page{max-width:720px;margin:0 auto;padding:48px;font-size:15px;line-height:1.6}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.2em}blockquote{border-left:3px solid #ccc;margin:.5em 0;padding-left:16px;color:#555}ul,ol{padding-left:28px}hr{border:none;border-top:1px solid #ccc}"

function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
  return state.doc.rangeHasMark(from, to, type)
}

function snapshotOf(state: EditorState): Snapshot {
  const { $from } = state.selection
  const parent = $from.parent
  return {
    strong: markActive(state, schema.marks.strong),
    em: markActive(state, schema.marks.em),
    underline: markActive(state, schema.marks.underline),
    heading: parent.type.name === 'heading' ? (parent.attrs.level as number) : 0,
    align: (parent.attrs.align as string | null) ?? null,
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0
  }
}

export function Editor({ apiRef, onState }: { apiRef: MutableRefObject<EditorApi | null>; onState: (s: Snapshot) => void }): ReactNode {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const doc = schema.node('doc', null, [schema.node('paragraph')])
    const view = new EditorView(host.current!, {
      state: EditorState.create({ doc, plugins: [history(), editorKeymap(), baseKeymapPlugin()] }),
      dispatchTransaction(tr) {
        const next = view.state.apply(tr)
        view.updateState(next)
        onState(snapshotOf(next))
      }
    })
    const serializer = DOMSerializer.fromSchema(schema)
    const load = (node: ReturnType<typeof schema.node>): void => {
      view.updateState(EditorState.create({ doc: node, plugins: view.state.plugins }))
      onState(snapshotOf(view.state))
    }
    apiRef.current = {
      exec(command) {
        command(view.state, view.dispatch, view)
        view.focus()
      },
      getJSON: () => view.state.doc.toJSON(),
      setJSON: (json) => load(schema.nodeFromJSON(json)),
      setHTML: (html) => {
        const dom = new window.DOMParser().parseFromString(html, 'text/html')
        load(PMDOMParser.fromSchema(schema).parse(dom.body))
      },
      getBlocks: () => docToBlocks(view.state.doc),
      getPrintHtml: () => {
        const frag = serializer.serializeFragment(view.state.doc.content)
        const div = document.createElement('div')
        div.appendChild(frag)
        return `<!doctype html><html><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body><div class="page">${div.innerHTML}</div></body></html>`
      },
      focus: () => view.focus()
    }
    onState(snapshotOf(view.state))
    return () => {
      view.destroy()
      apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div ref={host} className="ao-doc-host" />
}
