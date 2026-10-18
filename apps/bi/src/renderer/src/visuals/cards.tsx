// Cartão, cartão de várias linhas e KPI.
import { useMemo } from 'react'
import type { VQResult } from '@engine/vq/types'
import { fromJsonScalar } from '@engine/query/types'
import type { DisplayUnits } from '@engine/data/format'
import type { BuiltQuery } from './query'
import type { ReportTheme, VisualDef } from '../report/types'
import { fmt } from './registry'
import { formatKey, formatValue, parseDecimals } from '../util/fmt'
import { EChart } from './charts/EChart'

function cardValue(r: VQResult, i: number, units: DisplayUnits, decimals: number | undefined): string {
  const col = r.columns[i]
  const raw = r.rows[0]?.[i] ?? null
  if (raw === null) return '(Em branco)'
  const s = fromJsonScalar(raw)
  if (typeof s !== 'number') return formatValue(raw, col.format, col.type)
  return formatValue(raw, col.format, col.type, { units: units === 'none' ? undefined : units, decimals })
}

export function CardVisual({ v, r }: { v: VisualDef; r: VQResult }) {
  const size = fmt<number>(v, 'callout', 'fontSize')
  const color = fmt<string>(v, 'callout', 'color') || '#252423'
  const units = fmt<string>(v, 'callout', 'units') as DisplayUnits
  const decimals = parseDecimals(fmt(v, 'callout', 'decimals'))
  const align = fmt<string>(v, 'callout', 'align')
  const showCat = fmt<boolean>(v, 'category', 'show') !== false
  const text = cardValue(r, 0, units, decimals)
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: '4px 12px',
        overflow: 'hidden'
      }}
    >
      <div style={{ fontSize: size, fontWeight: 600, color, lineHeight: 1.15, whiteSpace: 'nowrap' }} title={text}>
        {text}
      </div>
      {showCat && (
        <div style={{ fontSize: fmt<number>(v, 'category', 'fontSize'), color: fmt<string>(v, 'category', 'color') || '#605e5c', marginTop: 4 }}>{r.columns[0]?.name}</div>
      )}
    </div>
  )
}

export function MultiCardVisual({ v, r }: { v: VisualDef; r: VQResult }) {
  const size = fmt<number>(v, 'callout', 'fontSize')
  const units = fmt<string>(v, 'callout', 'units') as DisplayUnits
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '6px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, alignContent: 'start' }}>
      {r.columns.map((c, i) => (
        <div key={i} style={{ borderLeft: '3px solid #0a8fa3', paddingLeft: 10 }}>
          <div style={{ fontSize: size, fontWeight: 600, color: fmt<string>(v, 'callout', 'color') || '#252423', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cardValue(r, i, units, undefined)}
          </div>
          <div style={{ fontSize: fmt<number>(v, 'category', 'fontSize'), color: fmt<string>(v, 'category', 'color') || '#605e5c' }}>{c.name}</div>
        </div>
      ))}
    </div>
  )
}

export function KpiVisual({ v, r, built, theme }: { v: VisualDef; r: VQResult; built: BuiltQuery; theme: ReportTheme }) {
  const nG = built.groups.length
  const vi = built.values.findIndex((x) => x.role === 'value')
  const ti = built.values.findIndex((x) => x.role === 'target')
  const total = r.sets.find((s) => s.indexes.length === 0)?.rows[0]
  const rows = r.rows
  // Valor atual = último ponto da tendência (ou total quando não há eixo).
  const last = nG && rows.length ? rows[rows.length - 1] : null
  const valueRaw = last ? last[nG + vi] : (total?.values[vi] ?? rows[0]?.[vi] ?? null)
  const targetRaw = ti >= 0 ? (last ? last[nG + ti] : (total?.values[ti] ?? null)) : null
  const col = r.columns[nG + vi]
  const val = valueRaw === null ? null : Number(fromJsonScalar(valueRaw))
  const tgt = targetRaw === null ? null : Number(fromJsonScalar(targetRaw))
  const highGood = fmt<string>(v, 'kpi', 'direction') !== 'low'
  const good = val !== null && tgt !== null ? (highGood ? val >= tgt : val <= tgt) : null
  const color = good === null ? '#252423' : good ? fmt<string>(v, 'kpi', 'goodColor') : fmt<string>(v, 'kpi', 'badColor')
  const units = fmt<string>(v, 'kpi', 'units') as DisplayUnits
  const diff = val !== null && tgt ? (val - tgt) / Math.abs(tgt) : null
  const trend = useMemo(() => {
    if (!nG || !fmt<boolean>(v, 'kpi', 'showTrend')) return null
    const data = rows.map((rw) => {
      const x = rw[nG + vi]
      return x === null ? null : Number(fromJsonScalar(x))
    })
    const labels = rows.map((rw) => formatKey(rw[0], built.groups[0].field))
    return {
      grid: { left: 0, right: 0, top: 4, bottom: 0 },
      xAxis: { type: 'category', show: false, data: labels, boundaryGap: false },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: { trigger: 'axis', confine: true, valueFormatter: (x: number) => formatValue(x, col?.format) },
      series: [
        {
          type: 'line',
          data,
          showSymbol: false,
          lineStyle: { width: 2, color: good === null ? theme.dataColors[0] : color },
          areaStyle: { color: good === null ? theme.dataColors[0] : color, opacity: 0.12 },
          smooth: 0.3
        }
      ]
    }
  }, [rows, nG, vi, built, good, color, theme, v, col])
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '4px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: fmt<number>(v, 'kpi', 'fontSize'), fontWeight: 600, color: '#252423' }}>
          {val === null ? '(Em branco)' : formatValue(valueRaw, col?.format, col?.type, { units: units === 'none' ? undefined : units })}
        </span>
        {good !== null && (
          <span style={{ color, fontWeight: 600, fontSize: 14 }}>
            {good ? '▲' : '▼'} {diff !== null ? formatValue(diff, '+0.0%;-0.0%') : ''}
          </span>
        )}
      </div>
      {tgt !== null && (
        <div style={{ color: '#605e5c', fontSize: 12 }}>
          Destino: {formatValue(targetRaw, col?.format, col?.type, { units: units === 'none' ? undefined : units })}
        </div>
      )}
      {trend && (
        <div style={{ flex: 1, minHeight: 30 }}>
          <EChart option={trend} />
        </div>
      )}
    </div>
  )
}
