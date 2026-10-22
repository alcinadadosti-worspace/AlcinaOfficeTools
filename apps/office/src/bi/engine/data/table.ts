import { Column } from './column'
import type { Scalar } from './types'

/** Tabela colunar imutável. */
export class DataTable {
  readonly rowCount: number
  private readonly byName: Map<string, number>
  private readonly byLower: Map<string, number>

  constructor(
    readonly columns: Column[],
    rowCount?: number
  ) {
    this.rowCount = rowCount ?? (columns.length ? columns[0].length : 0)
    for (const c of columns) {
      if (c.length !== this.rowCount) {
        throw new Error(`Coluna "${c.name}" tem ${c.length} linhas; esperado ${this.rowCount}.`)
      }
    }
    this.byName = new Map()
    this.byLower = new Map()
    columns.forEach((c, i) => {
      if (!this.byName.has(c.name)) this.byName.set(c.name, i)
      const low = c.name.toLowerCase()
      if (!this.byLower.has(low)) this.byLower.set(low, i)
    })
  }

  static empty(): DataTable {
    return new DataTable([], 0)
  }

  get columnCount(): number {
    return this.columns.length
  }

  columnNames(): string[] {
    return this.columns.map((c) => c.name)
  }

  indexOf(name: string): number {
    const i = this.byName.get(name)
    if (i !== undefined) return i
    return this.byLower.get(name.toLowerCase()) ?? -1
  }

  has(name: string): boolean {
    return this.indexOf(name) >= 0
  }

  column(name: string): Column | undefined {
    const i = this.indexOf(name)
    return i >= 0 ? this.columns[i] : undefined
  }

  requireColumn(name: string): Column {
    const c = this.column(name)
    if (!c) throw new Error(`A coluna "${name}" não foi encontrada.`)
    return c
  }

  take(rows: ArrayLike<number>): DataTable {
    return new DataTable(
      this.columns.map((c) => c.take(rows)),
      rows.length
    )
  }

  slice(start: number, end: number): DataTable {
    const s = Math.max(0, start)
    const e = Math.min(this.rowCount, end)
    const n = Math.max(0, e - s)
    const idx = new Int32Array(n)
    for (let i = 0; i < n; i++) idx[i] = s + i
    return this.take(idx)
  }

  withColumns(columns: Column[]): DataTable {
    return new DataTable(columns, columns.length ? undefined : this.rowCount)
  }

  addColumn(col: Column, at?: number): DataTable {
    const cols = [...this.columns]
    if (at === undefined || at >= cols.length) cols.push(col)
    else cols.splice(Math.max(0, at), 0, col)
    return new DataTable(cols, this.rowCount)
  }

  replaceColumn(name: string, col: Column): DataTable {
    const i = this.indexOf(name)
    if (i < 0) return this.addColumn(col)
    const cols = [...this.columns]
    cols[i] = col
    return new DataTable(cols, this.rowCount)
  }

  row(i: number): Scalar[] {
    return this.columns.map((c) => c.get(i))
  }

  rows(limit = Infinity): Scalar[][] {
    const n = Math.min(this.rowCount, limit)
    const out: Scalar[][] = new Array(n)
    for (let i = 0; i < n; i++) out[i] = this.row(i)
    return out
  }

  /** Cria um nome de coluna único a partir de um nome base. */
  uniqueName(base: string): string {
    if (!this.has(base)) return base
    let i = 1
    while (this.has(`${base}.${i}`)) i++
    return `${base}.${i}`
  }
}
