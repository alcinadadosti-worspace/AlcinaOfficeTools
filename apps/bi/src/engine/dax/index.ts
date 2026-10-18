// Ponto de entrada do motor DAX (registra todas as funções).
import './functions/aggregate'
import './functions/filter'
import './functions/scalar'
import './functions/datetime'
import './functions/table'

export { Evaluator } from './evaluator'
export { Ctx } from './context'
export { FilterContext, ValuesFilter, RowsFilter, type Filter } from './filter'
export { parseDax, parseDaxQuery, tokenize, DaxError } from './parser'
export { FUNCS, type FnDef } from './registry'
export { installCalcHooks, inferValuesType, columnFromValues } from './calc'
export { TableValue, BaseTV, MatTV, ExtTV, materialize } from './tablevalue'
