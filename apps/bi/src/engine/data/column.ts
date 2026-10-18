// Armazenamento colunar: números em Float64Array, textos com dicionário.
import { type DataType, DateVal, type Scalar, isDateType, isNumStorageType } from './types'

export interface NumData {
  kind: 'num'
  values: Float64Array
}
export interface BoolData {
  kind: 'bool'
  values: Uint8Array
}
export interface TextData {
  kind: 'text'
  codes: Int32Array
  dict: string[]
}
export interface AnyData {
  kind: 'any'
  values: Scalar[]
}
export type ColumnData = NumData | BoolData | TextData | AnyData

export const BOOL_BLANK = 2

export function storageKindFor(type: DataType): ColumnData['kind'] {
  if (isNumStorageType(type)) return 'num'
  if (type === 'bool') return 'bool'
  if (type === 'text') return 'text'
  return 'any'
}

export class Column {
  constructor(
    readonly name: string,
    readonly type: DataType,
    readonly data: ColumnData,
    /** 1 = célula com erro (apenas no editor de consultas). */
    readonly errors: Uint8Array | null = null,
    readonly errorMessage: string | null = null
  ) {}

  get length(): number {
    const d = this.data
    switch (d.kind) {
      case 'num':
        return d.values.length
      case 'bool':
        return d.values.length
      case 'text':
        return d.codes.length
      case 'any':
        return d.values.length
    }
  }

  get(i: number): Scalar {
    const d = this.data
    switch (d.kind) {
      case 'num': {
        const v = d.values[i]
        if (v !== v) return null
        return isDateType(this.type) ? new DateVal(v, this.type as 'date' | 'datetime' | 'time') : v
      }
      case 'bool': {
        const v = d.values[i]
        return v === BOOL_BLANK ? null : v === 1
      }
      case 'text': {
        const c = d.codes[i]
        return c < 0 ? null : d.dict[c]
      }
      case 'any':
        return d.values[i] ?? null
    }
  }

  /** Valor numérico bruto (NaN para vazio); datas em ms. */
  num(i: number): number {
    const d = this.data
    if (d.kind === 'num') return d.values[i]
    const v = this.get(i)
    if (v === null) return NaN
    if (typeof v === 'number') return v
    if (typeof v === 'boolean') return v ? 1 : 0
    if (v instanceof DateVal) return v.ms
    return NaN
  }

  isBlank(i: number): boolean {
    const d = this.data
    switch (d.kind) {
      case 'num':
        return d.values[i] !== d.values[i]
      case 'bool':
        return d.values[i] === BOOL_BLANK
      case 'text':
        return d.codes[i] < 0
      case 'any':
        return d.values[i] === null || d.values[i] === undefined
    }
  }

  hasError(i: number): boolean {
    return this.errors !== null && this.errors[i] === 1
  }

  errorCount(): number {
    if (!this.errors) return 0
    let n = 0
    for (let i = 0; i < this.errors.length; i++) n += this.errors[i]
    return n
  }

  rename(name: string): Column {
    return new Column(name, this.type, this.data, this.errors, this.errorMessage)
  }

  withType(type: DataType): Column {
    return new Column(this.name, type, this.data, this.errors, this.errorMessage)
  }

  withoutErrors(): Column {
    return new Column(this.name, this.type, this.data, null, null)
  }

  /** Seleciona linhas pelos índices; índice -1 produz vazio. */
  take(rows: ArrayLike<number>): Column {
    const n = rows.length
    const d = this.data
    let errors: Uint8Array | null = null
    if (this.errors) {
      errors = new Uint8Array(n)
      for (let i = 0; i < n; i++) {
        const r = rows[i]
        errors[i] = r >= 0 ? this.errors[r] : 0
      }
    }
    switch (d.kind) {
      case 'num': {
        const out = new Float64Array(n)
        for (let i = 0; i < n; i++) {
          const r = rows[i]
          out[i] = r >= 0 ? d.values[r] : NaN
        }
        return new Column(this.name, this.type, { kind: 'num', values: out }, errors, this.errorMessage)
      }
      case 'bool': {
        const out = new Uint8Array(n)
        for (let i = 0; i < n; i++) {
          const r = rows[i]
          out[i] = r >= 0 ? d.values[r] : BOOL_BLANK
        }
        return new Column(this.name, this.type, { kind: 'bool', values: out }, errors, this.errorMessage)
      }
      case 'text': {
        const out = new Int32Array(n)
        for (let i = 0; i < n; i++) {
          const r = rows[i]
          out[i] = r >= 0 ? d.codes[r] : -1
        }
        return new Column(this.name, this.type, { kind: 'text', codes: out, dict: d.dict }, errors, this.errorMessage)
      }
      case 'any': {
        const out: Scalar[] = new Array(n)
        for (let i = 0; i < n; i++) {
          const r = rows[i]
          out[i] = r >= 0 ? (d.values[r] ?? null) : null
        }
        return new Column(this.name, this.type, { kind: 'any', values: out }, errors, this.errorMessage)
      }
    }
  }

  slice(start: number, end: number): Column {
    const n = Math.max(0, Math.min(end, this.length) - start)
    const idx = new Int32Array(n)
    for (let i = 0; i < n; i++) idx[i] = start + i
    return this.take(idx)
  }

  /** Todos os valores como escalares. */
  toArray(): Scalar[] {
    const out: Scalar[] = new Array(this.length)
    for (let i = 0; i < out.length; i++) out[i] = this.get(i)
    return out
  }

  /** Remove entradas não usadas do dicionário (texto). */
  compact(): Column {
    const d = this.data
    if (d.kind !== 'text') return this
    const used = new Int32Array(d.dict.length).fill(-1)
    const dict: string[] = []
    const codes = new Int32Array(d.codes.length)
    for (let i = 0; i < codes.length; i++) {
      const c = d.codes[i]
      if (c < 0) {
        codes[i] = -1
        continue
      }
      let nc = used[c]
      if (nc < 0) {
        nc = dict.length
        dict.push(d.dict[c])
        used[c] = nc
      }
      codes[i] = nc
    }
    return new Column(this.name, this.type, { kind: 'text', codes, dict }, this.errors, this.errorMessage)
  }

  static fromScalars(name: string, type: DataType, values: ArrayLike<Scalar>): Column {
    const b = new ColumnBuilder(type, values.length)
    for (let i = 0; i < values.length; i++) b.push(values[i])
    return b.build(name)
  }

  static blank(name: string, type: DataType, length: number): Column {
    const b = new ColumnBuilder(type, length)
    for (let i = 0; i < length; i++) b.push(null)
    return b.build(name)
  }

  static constant(name: string, type: DataType, value: Scalar, length: number): Column {
    const b = new ColumnBuilder(type, length)
    for (let i = 0; i < length; i++) b.push(value)
    return b.build(name)
  }
}

/** Construtor incremental de colunas. */
export class ColumnBuilder {
  private kind: ColumnData['kind']
  private nums: Float64Array
  private bools: Uint8Array
  private codes: Int32Array
  private dict: string[] = []
  private dictMap = new Map<string, number>()
  private anys: Scalar[] = []
  private errs: Uint8Array | null = null
  private errMsg: string | null = null
  private n = 0

  constructor(
    readonly type: DataType,
    capacity = 64
  ) {
    this.kind = storageKindFor(type)
    const cap = Math.max(16, capacity)
    this.nums = this.kind === 'num' ? new Float64Array(cap) : new Float64Array(0)
    this.bools = this.kind === 'bool' ? new Uint8Array(cap) : new Uint8Array(0)
    this.codes = this.kind === 'text' ? new Int32Array(cap) : new Int32Array(0)
  }

  get length(): number {
    return this.n
  }

  private grow(): void {
    const cap = Math.max(16, this.n * 2)
    if (this.kind === 'num') {
      const a = new Float64Array(cap)
      a.set(this.nums)
      this.nums = a
    } else if (this.kind === 'bool') {
      const a = new Uint8Array(cap)
      a.set(this.bools)
      this.bools = a
    } else if (this.kind === 'text') {
      const a = new Int32Array(cap)
      a.set(this.codes)
      this.codes = a
    }
    if (this.errs) {
      const e = new Uint8Array(cap)
      e.set(this.errs)
      this.errs = e
    }
  }

  private capacity(): number {
    switch (this.kind) {
      case 'num':
        return this.nums.length
      case 'bool':
        return this.bools.length
      case 'text':
        return this.codes.length
      default:
        return Number.MAX_SAFE_INTEGER
    }
  }

  push(v: Scalar): void {
    if (this.n >= this.capacity()) this.grow()
    const i = this.n++
    switch (this.kind) {
      case 'num': {
        let x: number
        if (v === null || v === undefined) x = NaN
        else if (typeof v === 'number') x = v
        else if (v instanceof DateVal) x = v.ms
        else if (typeof v === 'boolean') x = v ? 1 : 0
        else x = NaN
        this.nums[i] = x
        break
      }
      case 'bool': {
        this.bools[i] = v === null || v === undefined ? BOOL_BLANK : v ? 1 : 0
        break
      }
      case 'text': {
        if (v === null || v === undefined) {
          this.codes[i] = -1
        } else {
          const s = typeof v === 'string' ? v : v instanceof DateVal ? v.toString() : String(v)
          let c = this.dictMap.get(s)
          if (c === undefined) {
            c = this.dict.length
            this.dict.push(s)
            this.dictMap.set(s, c)
          }
          this.codes[i] = c
        }
        break
      }
      case 'any':
        this.anys.push(v === undefined ? null : v)
        break
    }
  }

  /** Acrescenta um número bruto (NaN = vazio) para colunas numéricas/data. */
  pushNum(x: number): void {
    if (this.kind !== 'num') {
      this.push(x !== x ? null : x)
      return
    }
    if (this.n >= this.nums.length) this.grow()
    this.nums[this.n++] = x
  }

  pushError(message?: string): void {
    this.push(null)
    if (!this.errs) this.errs = new Uint8Array(Math.max(16, this.capacity() === Number.MAX_SAFE_INTEGER ? this.n * 2 : this.capacity()))
    if (this.errs.length < this.n) {
      const e = new Uint8Array(this.n * 2)
      e.set(this.errs)
      this.errs = e
    }
    this.errs[this.n - 1] = 1
    if (message && !this.errMsg) this.errMsg = message
  }

  build(name: string): Column {
    const n = this.n
    let data: ColumnData
    switch (this.kind) {
      case 'num':
        data = { kind: 'num', values: this.nums.length === n ? this.nums : this.nums.slice(0, n) }
        break
      case 'bool':
        data = { kind: 'bool', values: this.bools.length === n ? this.bools : this.bools.slice(0, n) }
        break
      case 'text':
        data = { kind: 'text', codes: this.codes.length === n ? this.codes : this.codes.slice(0, n), dict: this.dict }
        break
      default:
        data = { kind: 'any', values: this.anys }
    }
    let errs: Uint8Array | null = null
    if (this.errs) {
      if (this.errs.length === n) errs = this.errs
      else {
        errs = new Uint8Array(n)
        errs.set(this.errs.subarray(0, Math.min(n, this.errs.length)))
      }
    }
    return new Column(name, this.type, data, errs, this.errMsg)
  }
}
