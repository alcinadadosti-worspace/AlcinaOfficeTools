// Motor de planilha Alcina (próprio, MIT): modelo de células, fórmulas e recálculo.
export { SheetEngine, type CellEntry } from './evaluate'
export { type CellValue, type CellError, isError } from './types'
export { displayValue } from './runtime'
export { colToLetter, letterToCol, parseA1, cellKey } from './a1'
export { FUNCTION_NAMES } from './functions'
