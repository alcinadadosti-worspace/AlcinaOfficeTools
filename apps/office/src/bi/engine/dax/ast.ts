// Árvore sintática das expressões DAX.

export interface Pos {
  start: number
  end: number
}

export type Node =
  | { k: 'num'; v: number; pos: Pos }
  | { k: 'str'; v: string; pos: Pos }
  | { k: 'bool'; v: boolean; pos: Pos }
  /** Referência de coluna/medida: Tabela[Coluna], [Coluna] ou Tabela[Coluna].[Nível] */
  | { k: 'ref'; table: string | null; name: string; level?: string; pos: Pos }
  /** Referência de tabela (nome sem colchetes ou entre aspas simples). */
  | { k: 'table'; name: string; pos: Pos }
  /** Referência a variável (VAR). */
  | { k: 'varref'; name: string; pos: Pos }
  | { k: 'call'; name: string; args: Node[]; pos: Pos }
  | { k: 'unary'; op: '-' | '+' | 'NOT'; e: Node; pos: Pos }
  | { k: 'bin'; op: BinOp; l: Node; r: Node; pos: Pos }
  | { k: 'in'; l: Node; r: Node; pos: Pos }
  | { k: 'var'; defs: { name: string; e: Node }[]; ret: Node; pos: Pos }
  /** Construtor de tabela: {1, 2} ou {(1, "a"), (2, "b")} */
  | { k: 'tablector'; rows: Node[][]; pos: Pos }
  /** Palavras-chave usadas como argumentos (ASC, DESC, SKIP, DENSE...). */
  | { k: 'kw'; v: string; pos: Pos }

export type BinOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '==' | '<>' | '<' | '>' | '<=' | '>=' | '&&' | '||'

/** Consulta DAX: DEFINE ... EVALUATE ... ORDER BY ... */
export interface DaxQuery {
  defines: { kind: 'measure' | 'var' | 'column' | 'table'; table?: string; name: string; e: Node }[]
  evaluates: { e: Node; orderBy: { e: Node; desc: boolean }[] }[]
}

export function nodePos(n: Node): Pos {
  return n.pos
}
