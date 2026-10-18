// Mapa coroplético do Brasil por UF (malha do IBGE).
import { useMemo } from 'react'
import type { VQResult } from '@engine/vq/types'
import type { BuiltQuery } from './query'
import type { ReportTheme, VisualDef } from '../report/types'
import { EChart, echarts } from './charts/EChart'
import type { PointInfo } from './charts/options'
import brGeo from './geo/br-uf.json'
import { fmt } from './registry'
import { formatKey, formatValue, keyString } from '../util/fmt'
import { fromJsonScalar } from '@engine/query/types'

interface GeoFeature {
  properties: { name: string; uf: string; code: number }
}

let registered = false
function ensureMap(): void {
  if (registered) return
  echarts.registerMap('BR', brGeo as unknown as Parameters<typeof echarts.registerMap>[1])
  registered = true
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const LOOKUP = (() => {
  const m = new Map<string, string>()
  for (const f of (brGeo as unknown as { features: GeoFeature[] }).features) {
    const p = f.properties
    m.set(norm(p.uf), p.name)
    m.set(norm(p.name), p.name)
    m.set(String(p.code), p.name)
  }
  return m
})()

export function MapVisual({ v, r, built, onSelect }: { v: VisualDef; r: VQResult; built: BuiltQuery; theme: ReportTheme; onSelect: (p: PointInfo | null, ctrl: boolean) => void }) {
  ensureMap()
  const nG = built.groups.length
  const field = built.groups[0]?.field
  const vcol = r.columns[nG]
  const option = useMemo(() => {
    const data: { name: string; value: number | null; key: unknown }[] = []
    let min = Infinity
    let max = -Infinity
    for (const row of r.rows) {
      const raw = row[0]
      const name = raw === null ? null : LOOKUP.get(norm(String(fromJsonScalar(raw))))
      if (!name) continue
      const val = nG < row.length ? Number(fromJsonScalar(row[nG])) : null
      if (val !== null && Number.isFinite(val)) {
        min = Math.min(min, val)
        max = Math.max(max, val)
      }
      data.push({ name, value: val, key: raw })
    }
    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (o: { name: string; value: number }) => `<b>${o.name}</b><br/>${vcol?.name ?? ''}: ${Number.isFinite(o.value) ? formatValue(o.value, vcol?.format) : '—'}`
      },
      visualMap: {
        min: Number.isFinite(min) ? min : 0,
        max: Number.isFinite(max) ? max : 1,
        left: 8,
        bottom: 8,
        itemWidth: 10,
        itemHeight: 90,
        calculable: false,
        inRange: { color: [fmt<string>(v, 'map', 'minColor'), fmt<string>(v, 'map', 'maxColor')] },
        textStyle: { color: '#605e5c', fontSize: 10 },
        formatter: (x: number) => formatValue(x, vcol?.format, undefined, { units: 'auto' })
      },
      series: [
        {
          type: 'map',
          map: 'BR',
          roam: false,
          layoutCenter: ['50%', '50%'],
          layoutSize: '95%',
          itemStyle: { borderColor: '#ffffff', borderWidth: 0.8, areaColor: '#f3f2f1' },
          emphasis: { label: { show: true }, itemStyle: { areaColor: '#ffd28a' } },
          label: { show: fmt<boolean>(v, 'map', 'labels'), fontSize: 9, color: '#252423' },
          select: { disabled: true },
          data
        }
      ]
    }
  }, [r, nG, vcol, v])
  return (
    <EChart
      option={option}
      onClick={(e, ev) => {
        const row = r.rows.find((x) => x[0] !== null && LOOKUP.get(norm(String(fromJsonScalar(x[0])))) === e.name)
        if (!row || !field) return
        onSelect({ filters: [{ kind: 'in', field, values: [row[0]] }], key: keyString(row[0]), label: formatKey(row[0], field) }, !!(ev?.ctrlKey || ev?.metaKey))
      }}
      onBlankClick={() => onSelect(null, false)}
    />
  )
}
