// Constrói a opção do ECharts a partir de um gráfico e do intervalo de dados.
import type { SheetEngine } from '@alcina/sheets-engine'
import type { EChartsCoreOption } from 'echarts/core'
import type { ChartObj } from './model'

const PALETTE = ['#0f7a34', '#c79a2a', '#1a5fb4', '#b64a38', '#6d3fb0', '#0a7d86', '#5c6e62', '#9a6d0c']

function text(v: unknown): string {
  if (v === null || v === undefined || typeof v === 'object') return ''
  return String(v)
}
function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null
}

export function buildOption(chart: ChartObj, engine: SheetEngine): EChartsCoreOption {
  const r1 = Math.min(chart.r1, chart.r2)
  const r2 = Math.max(chart.r1, chart.r2)
  const c1 = Math.min(chart.c1, chart.c2)
  const c2 = Math.max(chart.c1, chart.c2)
  const single = c1 === c2

  // Linha de cabeçalho: há texto nas colunas de série da primeira linha?
  let header = false
  for (let c = single ? c1 : c1 + 1; c <= c2; c++) {
    const v = engine.getValue(r1, c)
    if (typeof v === 'string' && v !== '') {
      header = true
      break
    }
  }
  const dataR1 = header ? r1 + 1 : r1

  const categories: string[] = []
  for (let r = dataR1; r <= r2; r++) categories.push(single ? String(r - dataR1 + 1) : text(engine.getValue(r, c1)))

  const seriesCols: number[] = []
  for (let c = single ? c1 : c1 + 1; c <= c2; c++) seriesCols.push(c)
  const series = seriesCols.map((c, i) => {
    const name = header ? text(engine.getValue(r1, c)) : single ? 'Série 1' : `Série ${i + 1}`
    const data: (number | null)[] = []
    for (let r = dataR1; r <= r2; r++) data.push(num(engine.getValue(r, c)))
    return { name, data }
  })

  const title = chart.title ? { text: chart.title, left: 'center' as const, textStyle: { fontSize: 13 } } : undefined

  if (chart.type === 'pie') {
    const s = series[0] ?? { name: '', data: [] as (number | null)[] }
    return {
      color: PALETTE,
      title,
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll' },
      series: [{ type: 'pie', radius: ['35%', '65%'], data: categories.map((cat, i) => ({ name: cat, value: s.data[i] ?? 0 })) }]
    }
  }

  const horiz = chart.type === 'bar'
  const cat = { type: 'category' as const, data: categories }
  const val = { type: 'value' as const }
  return {
    color: PALETTE,
    title,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 52, right: 16, top: title ? 32 : 16, bottom: 44 },
    xAxis: horiz ? val : cat,
    yAxis: horiz ? cat : val,
    series: series.map((s) => ({ name: s.name, type: chart.type === 'line' ? 'line' : 'bar', smooth: chart.type === 'line', data: s.data }))
  }
}
