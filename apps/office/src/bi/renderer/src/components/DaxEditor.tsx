// Editor de fórmulas DAX (CodeMirror) com realce de sintaxe e preenchimento automático.
import { useEffect, useRef } from 'react'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection, highlightActiveLine, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language'
import { autocompletion, closeBrackets, type CompletionContext, type CompletionResult, completionKeymap } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'
import { getDoc } from '../state/doc'
import type { FunctionInfo } from '@engine/service'

const KEYWORDS = new Set(['VAR', 'RETURN', 'TRUE', 'FALSE', 'IN', 'NOT', 'DEFINE', 'EVALUATE', 'MEASURE', 'ORDER', 'BY', 'ASC', 'DESC', 'COLUMN', 'TABLE'])

const daxLanguage = StreamLanguage.define<{ inComment: boolean }>({
  startState: () => ({ inComment: false }),
  token(stream, state) {
    if (state.inComment) {
      if (stream.match(/.*?\*\//)) state.inComment = false
      else stream.skipToEnd()
      return 'comment'
    }
    if (stream.eatSpace()) return null
    if (stream.match('//') || stream.match('--')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match('/*')) {
      state.inComment = true
      return 'comment'
    }
    if (stream.match(/^"(?:[^"]|"")*"?/)) return 'string'
    if (stream.match(/^'(?:[^']|'')*'?/)) return 'typeName'
    if (stream.match(/^\[(?:[^\]]|\]\])*\]?/)) return 'propertyName'
    if (stream.match(/^\d+([.,]\d+)?([eE][+-]?\d+)?/)) return 'number'
    if (stream.match(/^[A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*/)) {
      const w = stream.current().toUpperCase()
      if (KEYWORDS.has(w)) return 'keyword'
      if (stream.peek() === '(') return 'function'
      return 'typeName'
    }
    if (stream.match(/^(<=|>=|<>|==|&&|\|\||[-+*/^&=<>])/)) return 'operator'
    stream.next()
    return null
  },
  languageData: { commentTokens: { line: '//' } }
})

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: '#0f7e89', fontWeight: '600' },
  { tag: t.function(t.variableName), color: '#7a3e9d', fontWeight: '600' },
  { tag: t.string, color: '#a31515' },
  { tag: t.number, color: '#098658' },
  { tag: t.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: t.propertyName, color: '#1f5f99' },
  { tag: t.typeName, color: '#b35c00' },
  { tag: t.operator, color: '#605e5c' }
])

let functions: FunctionInfo[] = []
export function setDaxFunctions(list: FunctionInfo[]): void {
  functions = list
}

function quoteTable(n: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`
}

function daxCompletions(ctx: CompletionContext): CompletionResult | null {
  const model = getDoc().model
  // Coluna de uma tabela: Tabela[...
  const qualified = ctx.matchBefore(/(?:'[^']*'|[A-Za-z_][\w.]*)\[[^\]]*$/)
  if (qualified) {
    const m = /^(?:'([^']*)'|([A-Za-z_][\w.]*))\[/.exec(qualified.text)!
    const tname = (m[1] ?? m[2]).toLowerCase()
    const table = model.tables.find((x) => x.name.toLowerCase() === tname)
    const from = qualified.from + qualified.text.indexOf('[')
    if (!table) return null
    return {
      from,
      options: [
        ...table.columns.map((c) => ({ label: `[${c.name}]`, type: 'property', detail: 'coluna' })),
        ...table.measures.map((x) => ({ label: `[${x.name}]`, type: 'variable', detail: 'medida' }))
      ],
      validFor: /^\[[^\]]*$/
    }
  }
  const bracket = ctx.matchBefore(/\[[^\]]*$/)
  if (bracket) {
    const opts = [
      ...model.tables.flatMap((tb) => tb.measures.map((x) => ({ label: `[${x.name}]`, type: 'variable', detail: `medida (${tb.name})` }))),
      ...model.tables.flatMap((tb) => tb.columns.map((c) => ({ label: `[${c.name}]`, type: 'property', detail: `coluna (${tb.name})` })))
    ]
    return { from: bracket.from, options: opts, validFor: /^\[[^\]]*$/ }
  }
  const word = ctx.matchBefore(/'?[A-Za-z_À-ɏ][\w.À-ɏ ]*$/)
  if (!word || (word.from === word.to && !ctx.explicit)) return null
  if (word.text.startsWith("'") || /\s/.test(word.text)) {
    return {
      from: word.from,
      options: model.tables.map((tb) => ({ label: quoteTable(tb.name), type: 'class', detail: 'tabela' }))
    }
  }
  return {
    from: word.from,
    options: [
      ...functions.map((f) => ({ label: f.name, type: 'function', detail: f.sig, info: f.desc, apply: `${f.name}(` })),
      ...model.tables.flatMap((tb) => [
        { label: quoteTable(tb.name), type: 'class', detail: 'tabela' },
        ...tb.columns.map((c) => ({ label: `${quoteTable(tb.name)}[${c.name}]`, type: 'property', detail: 'coluna' }))
      ]),
      ...['VAR', 'RETURN', 'TRUE()', 'FALSE()', 'BLANK()'].map((k) => ({ label: k, type: 'keyword' }))
    ],
    validFor: /^[\w.À-ɏ]*$/
  }
}

export interface DaxEditorProps {
  value: string
  onChange?: (v: string) => void
  onSubmit?: () => void
  onCancel?: () => void
  placeholder?: string
  autoFocus?: boolean
  minHeight?: number
  maxHeight?: number
  lineNumbers?: boolean
}

export function DaxEditor({ value, onChange, onSubmit, onCancel, placeholder, autoFocus, minHeight = 28, maxHeight = 200, lineNumbers: showLines }: DaxEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const cbs = useRef({ onChange, onSubmit, onCancel })
  cbs.current = { onChange, onSubmit, onCancel }

  useEffect(() => {
    const keys = Prec.highest(
      keymap.of([
        {
          key: 'Enter',
          run: () => {
            if (cbs.current.onSubmit) {
              cbs.current.onSubmit()
              return true
            }
            return false
          }
        },
        { key: 'Shift-Enter', run: (v) => (v.dispatch(v.state.replaceSelection('\n')), true) },
        {
          key: 'Escape',
          run: () => {
            cbs.current.onCancel?.()
            return !!cbs.current.onCancel
          }
        }
      ])
    )
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...(onSubmit ? [keys] : []),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        ...(showLines ? [lineNumbers()] : []),
        daxLanguage,
        syntaxHighlighting(highlight),
        autocompletion({ override: [daxCompletions], activateOnTyping: true, maxRenderedOptions: 80 }),
        keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        cmPlaceholder(placeholder ?? ''),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbs.current.onChange?.(u.state.doc.toString())
        }),
        EditorView.theme({
          '&': { minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px`, background: '#ffffff' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { padding: '5px 0' },
          '.cm-activeLine': { background: 'rgba(15,126,137,0.05)' },
          '.cm-tooltip-autocomplete': { fontSize: '12px' }
        })
      ]
    })
    const v = new EditorView({ state, parent: host.current! })
    view.current = v
    if (autoFocus) {
      v.focus()
      v.dispatch({ selection: { anchor: v.state.doc.length } })
    }
    return () => v.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza mudanças externas
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  return <div ref={host} className="ab-selectable" style={{ flex: 1, minWidth: 0 }} />
}
