// Gráfico ECharts (tree-shaken) para slides, com redimensionamento automático.
import { useEffect, useRef, type ReactNode } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import type { ChartData } from '../../shared/deck'

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const PALETTE = ['#0f7a34', '#c79a2a', '#1a5fb4', '#b64a38', '#6d3fb0', '#0a7d86', '#5c6e62', '#9a6d0c']

export function chartOption(c: ChartData): EChartsCoreOption {
  if (c.type === 'pie') {
    const s = c.series[0] ?? { name: '', data: [] }
    return { color: PALETTE, tooltip: { trigger: 'item' }, legend: { bottom: 0, type: 'scroll' }, series: [{ type: 'pie', radius: ['35%', '65%'], data: c.categories.map((cat, i) => ({ name: cat, value: s.data[i] ?? 0 })) }] }
  }
  const horiz = c.type === 'bar'
  const cat = { type: 'category' as const, data: c.categories }
  const val = { type: 'value' as const }
  return {
    color: PALETTE,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 48, right: 16, top: 16, bottom: 40 },
    xAxis: horiz ? val : cat,
    yAxis: horiz ? cat : val,
    series: c.series.map((s) => ({ name: s.name, type: c.type === 'line' ? 'line' : 'bar', smooth: c.type === 'line', data: s.data }))
  }
}

export function ChartView({ data }: { data: ChartData }): ReactNode {
  const host = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)
  useEffect(() => {
    inst.current = echarts.init(host.current!)
    const ro = new ResizeObserver(() => inst.current?.resize())
    ro.observe(host.current!)
    return () => {
      ro.disconnect()
      inst.current?.dispose()
      inst.current = null
    }
  }, [])
  useEffect(() => {
    inst.current?.setOption(chartOption(data), true)
  }, [data])
  return <div ref={host} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
}
