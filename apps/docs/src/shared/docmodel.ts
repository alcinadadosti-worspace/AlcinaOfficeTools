// Formato intermediário de documento, trocado entre renderer e processo principal
// para gerar .docx (o renderer tem o conteúdo; o processo principal tem a lib docx).

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
