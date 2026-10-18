// Formato intermediário de documento (blocos), usado para gerar .docx e afins.

export interface DocRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

export type DocBlock =
  | { type: 'heading'; level: number; align?: string; runs: DocRun[] }
  | { type: 'paragraph'; align?: string; runs: DocRun[] }
  | { type: 'listItem'; ordered: boolean; level: number; align?: string; runs: DocRun[] }
  | { type: 'hr' }
