// Componente de gráfico ECharts (tree-shaken) com redimensionamento automático.
import { useEffect, useRef, type ReactNode } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

export function ChartView({ option }: { option: EChartsCoreOption }): ReactNode {
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
    inst.current?.setOption(option, true)
  }, [option])
  return <div ref={host} style={{ width: '100%', height: '100%' }} />
}
