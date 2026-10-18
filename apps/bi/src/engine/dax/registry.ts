// Registro das funções DAX.
import type { Scalar } from '../data/types'
import type { Node } from './ast'
import type { Ctx } from './context'
import type { Evaluator } from './evaluator'
import type { TableValue } from './tablevalue'

export type FnKind = 'scalar' | 'table'

export type FnCategory =
  | 'Agregação'
  | 'Filtro'
  | 'Lógica'
  | 'Matemática'
  | 'Texto'
  | 'Data e hora'
  | 'Inteligência de tempo'
  | 'Tabela'
  | 'Informação'
  | 'Estatística'
  | 'Relação'

export interface FnDef {
  name: string
  kind: FnKind
  min: number
  max: number
  category: FnCategory
  /** Assinatura exibida no editor, ex.: SUM(<coluna>) */
  sig: string
  desc: string
  impl: (ev: Evaluator, args: Node[], ctx: Ctx, call: Node) => Scalar | TableValue
}

export const FUNCS = new Map<string, FnDef>()

export function register(defs: FnDef[]): void {
  for (const d of defs) FUNCS.set(d.name, d)
}

/** Atalho para declarar funções. */
export function fn(
  name: string,
  kind: FnKind,
  category: FnCategory,
  min: number,
  max: number,
  sig: string,
  desc: string,
  impl: FnDef['impl']
): FnDef {
  return { name, kind, category, min, max, sig, desc, impl }
}
