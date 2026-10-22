// Serialização binária de tabelas (para salvar os dados no arquivo .alcbi).
import { Column, type ColumnData } from './data/column'
import { DataTable } from './data/table'
import type { DataType } from './data/types'
import { fromJsonScalar, toJsonScalar, type JsonScalar } from './query/types'

const MAGIC = 0x31544241 // "ABT1"

interface ColHeader {
  name: string
  type: DataType
  kind: ColumnData['kind']
  bytes: number
  dictBytes?: number
  errors?: boolean
  errorMessage?: string | null
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function serializeTable(t: DataTable): Uint8Array {
  const parts: Uint8Array[] = []
  const headers: ColHeader[] = []
  for (const c of t.columns) {
    const d = c.data
    let h: ColHeader
    switch (d.kind) {
      case 'num': {
        const b = new Uint8Array(d.values.buffer.slice(d.values.byteOffset, d.values.byteOffset + d.values.byteLength))
        parts.push(b)
        h = { name: c.name, type: c.type, kind: 'num', bytes: b.length }
        break
      }
      case 'bool': {
        const b = new Uint8Array(d.values)
        parts.push(b)
        h = { name: c.name, type: c.type, kind: 'bool', bytes: b.length }
        break
      }
      case 'text': {
        const compact = c.compact().data as Extract<ColumnData, { kind: 'text' }>
        const codes = new Uint8Array(compact.codes.buffer.slice(compact.codes.byteOffset, compact.codes.byteOffset + compact.codes.byteLength))
        const dict = enc.encode(JSON.stringify(compact.dict))
        parts.push(codes, dict)
        h = { name: c.name, type: c.type, kind: 'text', bytes: codes.length, dictBytes: dict.length }
        break
      }
      case 'any': {
        const b = enc.encode(JSON.stringify(d.values.map(toJsonScalar)))
        parts.push(b)
        h = { name: c.name, type: c.type, kind: 'any', bytes: b.length }
        break
      }
    }
    if (c.errors) {
      parts.push(new Uint8Array(c.errors))
      h.errors = true
      h.errorMessage = c.errorMessage
    }
    headers.push(h)
  }
  const header = enc.encode(JSON.stringify({ rowCount: t.rowCount, columns: headers }))
  let total = 8 + header.length
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, MAGIC, true)
  view.setUint32(4, header.length, true)
  out.set(header, 8)
  let off = 8 + header.length
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

export function deserializeTable(bytes: Uint8Array): DataTable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Formato de dados inválido.')
  const hlen = view.getUint32(4, true)
  const header = JSON.parse(dec.decode(bytes.subarray(8, 8 + hlen))) as { rowCount: number; columns: ColHeader[] }
  let off = 8 + hlen
  const take = (n: number): Uint8Array => {
    const b = bytes.slice(off, off + n)
    off += n
    return b
  }
  const cols: Column[] = []
  for (const h of header.columns) {
    let data: ColumnData
    switch (h.kind) {
      case 'num':
        data = { kind: 'num', values: new Float64Array(take(h.bytes).buffer) }
        break
      case 'bool':
        data = { kind: 'bool', values: take(h.bytes) }
        break
      case 'text': {
        const codes = new Int32Array(take(h.bytes).buffer)
        const dict = JSON.parse(dec.decode(take(h.dictBytes ?? 0))) as string[]
        data = { kind: 'text', codes, dict }
        break
      }
      default: {
        const vals = JSON.parse(dec.decode(take(h.bytes))) as JsonScalar[]
        data = { kind: 'any', values: vals.map(fromJsonScalar) }
      }
    }
    const errors = h.errors ? take(header.rowCount) : null
    cols.push(new Column(h.name, h.type, data, errors, h.errorMessage ?? null))
  }
  return new DataTable(cols, header.rowCount)
}
