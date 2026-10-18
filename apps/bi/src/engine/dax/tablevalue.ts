// Valores de tabela produzidos por expressões DAX.
import type { DataType, Scalar } from '../data/types'
import type { ColRT, TableRT } from '../model/runtime'

export interface TVCol {
  name: string
  /** Coluna do modelo de onde os valores vêm (linhagem), se houver. */
  lineage: ColRT | null
  type: DataType
}

export abstract class TableValue {
  abstract readonly cols: TVCol[]
  abstract readonly rowCount: number
  abstract get(row: number, col: number): Scalar
  /** Subconjunto de linhas (mesmo tipo de tabela). */
  abstract pick(rows: ArrayLike<number>): TableValue

  /** Tabela base do modelo (para RELATED e transição de contexto). */
  baseTable(): TableRT | null {
    return null
  }
  /** Linha da tabela base correspondente (-1 = linha em branco). */
  baseRow(_row: number): number {
    return -1
  }

  colByLineage(c: ColRT): number {
    for (let i = 0; i < this.cols.length; i++) if (this.cols[i].lineage === c) return i
    return -1
  }

  colByName(name: string): number {
    const low = name.toLowerCase()
    for (let i = 0; i < this.cols.length; i++) if (this.cols[i].name.toLowerCase() === low) return i
    return -1
  }

  /** Coluna por nome qualificado: para tabelas base aceita também nome simples. */
  rowValues(row: number): Scalar[] {
    const out: Scalar[] = new Array(this.cols.length)
    for (let c = 0; c < this.cols.length; c++) out[c] = this.get(row, c)
    return out
  }
}

/** Linhas de uma tabela do modelo (índice -1 = linha em branco virtual). */
export class BaseTV extends TableValue {
  readonly cols: TVCol[]

  constructor(
    readonly table: TableRT,
    readonly rows: Int32Array
  ) {
    super()
    this.cols = table.columns.map((c) => ({ name: c.name, lineage: c, type: c.type }))
  }

  get rowCount(): number {
    return this.rows.length
  }

  get(row: number, col: number): Scalar {
    const r = this.rows[row]
    if (r < 0) return null
    return this.table.columns[col].data.get(r)
  }

  pick(rows: ArrayLike<number>): BaseTV {
    const out = new Int32Array(rows.length)
    for (let i = 0; i < rows.length; i++) out[i] = this.rows[rows[i]]
    return new BaseTV(this.table, out)
  }

  baseTable(): TableRT {
    return this.table
  }

  baseRow(row: number): number {
    return this.rows[row]
  }

  colByLineage(c: ColRT): number {
    if (c.table !== this.table) return -1
    return this.table.columns.indexOf(c)
  }
}

/** Tabela materializada (armazenamento por coluna). */
export class MatTV extends TableValue {
  constructor(
    readonly cols: TVCol[],
    /** data[col][row] */
    readonly data: Scalar[][],
    rowCount?: number
  ) {
    super()
    this._rowCount = rowCount ?? (data.length ? data[0].length : 0)
  }
  private readonly _rowCount: number

  get rowCount(): number {
    return this._rowCount
  }

  get(row: number, col: number): Scalar {
    return this.data[col][row] ?? null
  }

  pick(rows: ArrayLike<number>): MatTV {
    const data = this.data.map((colData) => {
      const out: Scalar[] = new Array(rows.length)
      for (let i = 0; i < rows.length; i++) out[i] = colData[rows[i]] ?? null
      return out
    })
    return new MatTV(this.cols, data, rows.length)
  }

  static fromRows(cols: TVCol[], rows: Scalar[][]): MatTV {
    const data = cols.map((_, c) => rows.map((r) => r[c] ?? null))
    return new MatTV(cols, data, rows.length)
  }

  static empty(cols: TVCol[]): MatTV {
    return new MatTV(
      cols,
      cols.map(() => []),
      0
    )
  }
}

/** Tabela estendida (ADDCOLUMNS): mantém a linha base para RELATED/transição. */
export class ExtTV extends TableValue {
  readonly cols: TVCol[]

  constructor(
    readonly base: TableValue,
    readonly extraCols: TVCol[],
    /** extra[col][row] */
    readonly extra: Scalar[][]
  ) {
    super()
    this.cols = [...base.cols, ...extraCols]
  }

  get rowCount(): number {
    return this.base.rowCount
  }

  get(row: number, col: number): Scalar {
    const nb = this.base.cols.length
    if (col < nb) return this.base.get(row, col)
    return this.extra[col - nb][row] ?? null
  }

  pick(rows: ArrayLike<number>): ExtTV {
    const extra = this.extra.map((colData) => {
      const out: Scalar[] = new Array(rows.length)
      for (let i = 0; i < rows.length; i++) out[i] = colData[rows[i]] ?? null
      return out
    })
    return new ExtTV(this.base.pick(rows), this.extraCols, extra)
  }

  baseTable(): TableRT | null {
    return this.base.baseTable()
  }

  baseRow(row: number): number {
    return this.base.baseRow(row)
  }

  colByLineage(c: ColRT): number {
    const i = this.base.colByLineage(c)
    if (i >= 0) return i
    for (let k = 0; k < this.extraCols.length; k++) if (this.extraCols[k].lineage === c) return this.base.cols.length + k
    return -1
  }
}

/** Converte qualquer tabela em materializada (cópia dos valores). */
export function materialize(tv: TableValue): MatTV {
  if (tv instanceof MatTV) return tv
  const data = tv.cols.map((_, c) => {
    const out: Scalar[] = new Array(tv.rowCount)
    for (let r = 0; r < tv.rowCount; r++) out[r] = tv.get(r, c)
    return out
  })
  return new MatTV(tv.cols, data, tv.rowCount)
}
