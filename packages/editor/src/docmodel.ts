// Formato intermediário de documento (blocos), usado para gerar .docx e afins.

export interface DocRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** Quebra de linha dentro do parágrafo (Shift+Enter). */
  break?: boolean
  /** Imagem embutida (data: URI ou URL). */
  image?: { src: string }
}

/** Célula de tabela: contém blocos (normalmente parágrafos). */
export interface DocTableCell {
  blocks: DocBlock[]
}

export type DocBlock =
  | { type: 'heading'; level: number; align?: string; runs: DocRun[] }
  | { type: 'paragraph'; align?: string; runs: DocRun[] }
  | { type: 'listItem'; ordered: boolean; level: number; align?: string; runs: DocRun[]; numId?: number }
  | { type: 'table'; rows: DocTableCell[][] }
  | { type: 'hr' }
