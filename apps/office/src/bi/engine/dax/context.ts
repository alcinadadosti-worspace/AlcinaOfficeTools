// Contexto de avaliação: filtro, linhas (iteração) e variáveis.
import type { Scalar } from '../data/types'
import type { FilterContext } from './filter'
import type { TableValue } from './tablevalue'

export interface Frame {
  tv: TableValue
  row: number
}

export type VarValue = Scalar | TableValue

export class VarScope {
  constructor(
    readonly name: string,
    readonly value: VarValue,
    readonly parent: VarScope | null
  ) {}

  lookup(name: string): VarScope | null {
    let s: VarScope | null = this
    while (s) {
      if (s.name === name) return s
      s = s.parent
    }
    return null
  }
}

export class Ctx {
  constructor(
    readonly fc: FilterContext,
    readonly frames: readonly Frame[] = [],
    readonly vars: VarScope | null = null,
    /** frames[0..transitioned) já foram convertidos em filtros. */
    readonly transitioned = 0
  ) {}

  withFc(fc: FilterContext, transitioned = this.frames.length): Ctx {
    return new Ctx(fc, this.frames, this.vars, transitioned)
  }

  /** Novo contexto com uma linha de iteração (o objeto Frame pode ser alterado pelo iterador). */
  withFrame(frame: Frame): Ctx {
    return new Ctx(this.fc, [...this.frames, frame], this.vars, this.transitioned)
  }

  withVar(name: string, value: VarValue): Ctx {
    return new Ctx(this.fc, this.frames, new VarScope(name, value, this.vars), this.transitioned)
  }

  get hasPendingRows(): boolean {
    return this.frames.length > this.transitioned
  }
}
