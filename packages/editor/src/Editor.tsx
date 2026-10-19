// Componente React que hospeda o editor ProseMirror e expõe uma API imperativa.
import { useEffect, useRef, type ReactNode, type MutableRefObject } from 'react'
import { EditorState, TextSelection, type Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { DOMParser as PMDOMParser, DOMSerializer, type MarkType } from 'prosemirror-model'
import { history, undoDepth, redoDepth } from 'prosemirror-history'
import { columnResizing, tableEditing } from 'prosemirror-tables'
import { schema } from './schema'
import { editorKeymap, baseKeymapPlugin } from './commands'
import { searchPlugin, searchKey } from './search'
import { TaskItemView } from './taskview'
import { docToBlocks } from './pmdocx'
import type { DocBlock } from './docmodel'

export interface SearchInfo {
  count: number
  index: number
}

export interface Snapshot {
  strong: boolean
  em: boolean
  underline: boolean
  strike: boolean
  sub: boolean
  sup: boolean
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
  replaceAll(find: string, replace: string, matchCase: boolean): number
  /** Localiza e realça; posiciona na 1ª ocorrência. Retorna total e posição atual (1-based). */
  search(query: string, caseSensitive: boolean): SearchInfo
  findNext(): SearchInfo
  findPrev(): SearchInfo
  /** Substitui a ocorrência atual e avança. */
  replaceCurrent(replaceWith: string): SearchInfo
  clearSearch(): void
  stats(): { words: number; chars: number; charsNoSpaces: number }
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
    strike: markActive(state, schema.marks.strike),
    sub: markActive(state, schema.marks.sub),
    sup: markActive(state, schema.marks.sup),
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
      state: EditorState.create({ doc, plugins: [columnResizing(), tableEditing(), history(), searchPlugin(), editorKeymap(), baseKeymapPlugin()] }),
      nodeViews: {
        task_item: (node, view, getPos) => new TaskItemView(node, view, getPos as () => number | undefined)
      },
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
    const searchInfo = (): SearchInfo => {
      const s = searchKey.getState(view.state)
      return { count: s?.matches.length ?? 0, index: s && s.index >= 0 ? s.index + 1 : 0 }
    }
    // Seleciona e rola até a ocorrência atual sem roubar o foco do campo de busca.
    const selectCurrent = (): void => {
      const s = searchKey.getState(view.state)
      if (!s || s.index < 0) return
      const m = s.matches[s.index]
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)).scrollIntoView())
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
      replaceAll: (find, replaceWith, matchCase) => {
        if (!find) return 0
        const matches: { from: number; to: number }[] = []
        view.state.doc.descendants((node, pos) => {
          if (node.isText && node.text) {
            const hay = matchCase ? node.text : node.text.toLowerCase()
            const needle = matchCase ? find : find.toLowerCase()
            let i = 0
            while ((i = hay.indexOf(needle, i)) >= 0) {
              matches.push({ from: pos + i, to: pos + i + find.length })
              i += find.length || 1
            }
          }
        })
        if (!matches.length) return 0
        const tr = view.state.tr
        for (let m = matches.length - 1; m >= 0; m--) tr.insertText(replaceWith, matches[m].from, matches[m].to)
        view.dispatch(tr)
        view.dispatch(view.state.tr.setMeta(searchKey, { type: 'clear' }))
        onState(snapshotOf(view.state))
        return matches.length
      },
      search: (query, caseSensitive) => {
        view.dispatch(view.state.tr.setMeta(searchKey, { type: 'set', query, caseSensitive, index: 0 }))
        selectCurrent()
        return searchInfo()
      },
      findNext: () => {
        view.dispatch(view.state.tr.setMeta(searchKey, { type: 'next' }))
        selectCurrent()
        return searchInfo()
      },
      findPrev: () => {
        view.dispatch(view.state.tr.setMeta(searchKey, { type: 'prev' }))
        selectCurrent()
        return searchInfo()
      },
      replaceCurrent: (replaceWith) => {
        const s = searchKey.getState(view.state)
        if (!s || s.index < 0) return searchInfo()
        const m = s.matches[s.index]
        const after = m.from + replaceWith.length
        view.dispatch(view.state.tr.insertText(replaceWith, m.from, m.to))
        const s2 = searchKey.getState(view.state)
        if (s2 && s2.matches.length) {
          let ni = s2.matches.findIndex((x) => x.from >= after)
          if (ni < 0) ni = 0
          view.dispatch(view.state.tr.setMeta(searchKey, { type: 'setIndex', index: ni }))
          selectCurrent()
        }
        return searchInfo()
      },
      clearSearch: () => {
        view.dispatch(view.state.tr.setMeta(searchKey, { type: 'clear' }))
      },
      stats: () => {
        const text = view.state.doc.textBetween(0, view.state.doc.content.size, ' ', ' ')
        const words = (text.match(/\S+/g) || []).length
        return { words, chars: text.length, charsNoSpaces: text.replace(/\s/g, '').length }
      },
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
