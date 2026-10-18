// Tipos fundamentais do motor de planilha.

export type CellError = '#DIV/0!' | '#VALOR!' | '#NOME?' | '#REF!' | '#CIRC!' | '#N/D' | '#NÚM!'

/** Valor calculado de uma célula. null = vazio; objeto = erro. */
export type CellValue = number | string | boolean | null | { error: CellError }

export function isError(v: CellValue): v is { error: CellError } {
  return typeof v === 'object' && v !== null
}

export function err(e: CellError): { error: CellError } {
  return { error: e }
}
