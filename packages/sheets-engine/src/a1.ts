// Conversão de referências no estilo A1 (coluna/linha).

export function colToLetter(col: number): string {
  let s = ''
  let n = col + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function letterToCol(s: string): number {
  let n = 0
  for (const ch of s.toUpperCase()) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) break
    n = n * 26 + (code - 64)
  }
  return n - 1
}

export interface RefAddr {
  row: number
  col: number
  absRow: boolean
  absCol: boolean
}

export function parseA1(ref: string): RefAddr | null {
  const m = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(ref.trim())
  if (!m) return null
  return { col: letterToCol(m[2]), row: parseInt(m[4], 10) - 1, absCol: m[1] === '$', absRow: m[3] === '$' }
}

/** Extremo de intervalo: célula ("A1"), coluna inteira ("A") ou linha inteira ("5"). */
export function parseEndpoint(ref: string): { row: number | null; col: number | null } | null {
  const m = /^(\$?)([A-Za-z]*)(\$?)(\d*)$/.exec(ref.trim())
  if (!m) return null
  const hasCol = m[2].length > 0
  const hasRow = m[4].length > 0
  if (!hasCol && !hasRow) return null
  return { col: hasCol ? letterToCol(m[2]) : null, row: hasRow ? parseInt(m[4], 10) - 1 : null }
}

export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

export function parseKey(key: string): { row: number; col: number } {
  const i = key.indexOf(',')
  return { row: Number(key.slice(0, i)), col: Number(key.slice(i + 1)) }
}
