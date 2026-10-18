import { describe, expect, it } from 'vitest'
import { parseCsvText } from '@engine/io/csv'
import { autoSteps } from '@engine/io/headers'
import { applyStep } from '@engine/query/steps'
import { profileColumn } from '@engine/query/profile'

// Verificação de desempenho em volume moderado (limites folgados para CI).
describe('desempenho', () => {
  it('processa 500 mil linhas em tempo razoável', () => {
    const n = 500_000
    const lines = ['Pedido;Cliente;Região;Valor;Data']
    for (let i = 0; i < n; i++) {
      const m = (i % 12) + 1
      lines.push(`${i};Cliente ${i % 5000};R${i % 7};${((i % 1000) * 1.25).toFixed(2).replace('.', ',')};${String((i % 28) + 1).padStart(2, '0')}/${String(m).padStart(2, '0')}/2024`)
    }
    const text = lines.join('\n')
    const times: Record<string, number> = {}
    const time = <T>(label: string, f: () => T): T => {
      const t0 = performance.now()
      const r = f()
      times[label] = Math.round(performance.now() - t0)
      return r
    }
    const raw = time('csv', () => parseCsvText(text))
    const steps = time('autoSteps', () => autoSteps(raw))
    let t = raw
    time('aplicarAuto', () => {
      for (const s of steps) t = applyStep(t, s.op)
    })
    expect(t.column('Valor')!.type).toBe('number')
    expect(t.column('Data')!.type).toBe('date')
    const g = time('groupBy', () =>
      applyStep(t, { op: 'groupBy', keys: ['Região'], aggregations: [{ name: 'Total', fn: 'sum', column: 'Valor' }, { name: 'N', fn: 'count' }] })
    )
    expect(g.rowCount).toBe(7)
    time('sort', () => applyStep(t, { op: 'sort', keys: [{ column: 'Cliente', desc: false }, { column: 'Valor', desc: true }] }))
    time('filter', () => applyStep(t, { op: 'filterRows', condition: { kind: 'compare', column: 'Valor', operator: 'gt', value: 500 } }))
    time('addColumn', () => applyStep(t, { op: 'addColumn', name: 'Dobro', expression: '[Valor] * 2' }))
    time('profile', () => t.columns.map((c) => profileColumn(c)))
    console.log('tempos (ms):', JSON.stringify(times))
    const total = Object.values(times).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThan(30_000)
  }, 60_000)
})
