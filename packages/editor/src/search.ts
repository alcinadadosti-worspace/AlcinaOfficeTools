// Localizar e substituir: plugin que calcula correspondências e as realça por decoração.
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'

export interface Match {
  from: number
  to: number
}

export interface SearchState {
  query: string
  caseSensitive: boolean
  matches: Match[]
  index: number
}

export const searchKey = new PluginKey<SearchState>('aoSearch')

function computeMatches(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLowerCase()
  const out: Match[] = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const hay = caseSensitive ? node.text : node.text.toLowerCase()
      let i = 0
      while ((i = hay.indexOf(needle, i)) >= 0) {
        out.push({ from: pos + i, to: pos + i + query.length })
        i += query.length || 1
      }
    }
    return true
  })
  return out
}

const clamp = (i: number, n: number): number => (n ? Math.min(Math.max(i, 0), n - 1) : -1)

export function searchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchKey,
    state: {
      init: () => ({ query: '', caseSensitive: false, matches: [], index: -1 }),
      apply(tr, prev) {
        const meta = tr.getMeta(searchKey) as { type: string; query?: string; caseSensitive?: boolean; index?: number } | undefined
        if (meta) {
          if (meta.type === 'set') {
            const matches = computeMatches(tr.doc, meta.query ?? '', !!meta.caseSensitive)
            return { query: meta.query ?? '', caseSensitive: !!meta.caseSensitive, matches, index: clamp(meta.index ?? 0, matches.length) }
          }
          if (meta.type === 'clear') return { query: '', caseSensitive: prev.caseSensitive, matches: [], index: -1 }
          if (meta.type === 'next') {
            const n = prev.matches.length
            return n ? { ...prev, index: (prev.index + 1 + n) % n } : prev
          }
          if (meta.type === 'prev') {
            const n = prev.matches.length
            return n ? { ...prev, index: (prev.index - 1 + n) % n } : prev
          }
          if (meta.type === 'setIndex') return { ...prev, index: clamp(meta.index ?? 0, prev.matches.length) }
        }
        if (tr.docChanged && prev.query) {
          const matches = computeMatches(tr.doc, prev.query, prev.caseSensitive)
          return { ...prev, matches, index: clamp(prev.index, matches.length) }
        }
        return prev
      }
    },
    props: {
      decorations(state: EditorState) {
        const s = searchKey.getState(state)
        if (!s || !s.matches.length) return null
        return DecorationSet.create(
          state.doc,
          s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.index ? 'ao-search-hit ao-search-hit-current' : 'ao-search-hit' }))
        )
      }
    }
  })
}
