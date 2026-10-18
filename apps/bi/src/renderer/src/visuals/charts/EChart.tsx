// Componente React para gráficos ECharts (com redimensionamento automático).
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart, TreemapChart, FunnelChart, GaugeChart, MapChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  GeoComponent,
  AriaComponent
} from 'echarts/components'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'
import type { EChartsCoreOption, ECElementEvent } from 'echarts/core'
import langPtBr from 'echarts/lib/i18n/langPT-br.js'

echarts.registerLocale('PT-br', langPtBr as Parameters<typeof echarts.registerLocale>[1])

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  TreemapChart,
  FunnelChart,
  GaugeChart,
  MapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  GeoComponent,
  AriaComponent,
  CanvasRenderer,
  SVGRenderer
])

export { echarts }

export interface EChartProps {
  option: EChartsCoreOption
  onClick?: (e: ECElementEvent, native: MouseEvent) => void
  onContextMenu?: (e: ECElementEvent | null, native: MouseEvent) => void
  onBlankClick?: (native: MouseEvent) => void
  renderer?: 'canvas' | 'svg'
}

export function EChart({ option, onClick, onContextMenu, onBlankClick, renderer = 'canvas' }: EChartProps) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const handlers = useRef({ onClick, onContextMenu, onBlankClick })
  handlers.current = { onClick, onContextMenu, onBlankClick }

  useEffect(() => {
    const node = el.current!
    const c = echarts.init(node, undefined, { renderer, locale: 'PT-br' })
    chart.current = c
    let clickedItem = false
    c.on('click', (e) => {
      clickedItem = true
      handlers.current.onClick?.(e as ECElementEvent, (e as ECElementEvent).event?.event as MouseEvent)
    })
    c.on('contextmenu', (e) => {
      const ev = (e as ECElementEvent).event?.event as MouseEvent
      ev?.preventDefault()
      handlers.current.onContextMenu?.(e as ECElementEvent, ev)
    })
    c.getZr().on('click', (e) => {
      if (!e.target && !clickedItem) handlers.current.onBlankClick?.(e.event as unknown as MouseEvent)
      clickedItem = false
    })
    c.getZr().on('contextmenu', (e) => {
      if (!e.target) {
        const ev = e.event as unknown as MouseEvent
        ev.preventDefault()
        handlers.current.onContextMenu?.(null, ev)
      }
    })
    const ro = new ResizeObserver(() => c.resize({ animation: { duration: 0 } }))
    ro.observe(node)
    return () => {
      ro.disconnect()
      c.dispose()
      chart.current = null
    }
  }, [renderer])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true })
  }, [option])

  return <div ref={el} style={{ width: '100%', height: '100%' }} />
}
