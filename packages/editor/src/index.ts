// Editor de texto rico compartilhado da suíte Alcina (ProseMirror).
export { Editor, type EditorApi, type Snapshot } from './Editor'
export { cmd, editorKeymap, baseKeymapPlugin, setAlign, setIndent, setLineHeight, setColor, setHighlight, setFontSize, setFontFamily, clearFormat, changeCase } from './commands'
export { docToBlocks } from './pmdocx'
export { schema } from './schema'
export type { DocBlock, DocRun } from './docmodel'
