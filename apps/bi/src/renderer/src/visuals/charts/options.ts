// Construção das opções do ECharts para cada tipo de gráfico.
import type { EChartsCoreOption } from 'echarts/core'
import type { JsonScalar } from '@engine/query/types'
import type { FieldRef, VQFilter, VQResult } from '@engine/vq/types'
import type { DisplayUnits } from '@engine/data/format'
import { sortCompare } from '@engine/dax/values'
import { fromJsonScalar } from '@engine/query/types'
import type { BuiltQuery } from '../query'
import type { ReportTheme, VisualDef } from '../../report/types'
import { fmt } from '../registry'
import { formatAxis, formatKey, formatValue, keyString, parseDecimals, hexToRgba, readableText } from '../../util/fmt'

// Tinta e linhas recessivas (tokens de texto, nunca a cor da série).
const INK = '#252423'
const INK_2 = '#605e5c'
const MUTED = '#8a8886'
const GRID = '#ebe9e6'
const AXIS = '#c8c6c4'

export interface PointInfo {
  filters: VQFilter[]
  key: string
  label: string
}

export interface ChartBuild {
  option: EChartsCoreOption
  point: (seriesIndex: number, dataIndex: number, name?: string) => PointInfo | null
}

export interface ChartInput {
  v: VisualDef
  r: VQResult
  built: BuiltQuery
  theme: ReportTheme
  selected: Set<string> | null
}

interface Pivot {
  catField: FieldRef | null
  seriesField: FieldRef | null
  categories: { key: JsonScalar; label: string; ks: string }[]
  series: { key: JsonScalar; label: string; ks: string }[]
  /** por campo de valor: [série][categoria] */
  values: (number | null)[][][]
  highlights: (number | null)[][][] | null
  /** valores brutos (para dicas de ferramenta) por linha */
  rowIndex: Map<string, number>
}

function num(v: JsonScalar): number | null {
  if (v === null || v === undefined) return null
  const s = fromJsonScalar(v)
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  if (typeof s === 'boolean') return s ? 1 : 0
  return null
}

function pivot(r: VQResult, b: BuiltQuery, valueRole: string[] = ['values']): Pivot {
  const nG = b.groups.length
  const ci = b.groups.findIndex((g) => g.role === 'category' || g.role === 'location' || g.role === 'trend')
  const si = b.groups.findIndex((g) => g.role === 'series')
  const catField = ci >= 0 ? b.groups[ci].field : null
  const seriesField = si >= 0 ? b.groups[si].field : null
  const cats = new Map<string, { key: JsonScalar; label: string; ks: string }>()
  const sers = new Map<string, { key: JsonScalar; label: string; ks: string }>()
  for (const row of r.rows) {
    const ck = ci >= 0 ? row[ci] : null
    const cks = ci >= 0 ? keyString(ck) : '__all'
    if (!cats.has(cks)) cats.set(cks, { key: ck, label: ci >= 0 ? formatKey(ck, catField!, r.columns[ci].format, r.columns[ci].type) : '', ks: cks })
    if (si >= 0) {
      const sk = row[si]
      const sks = keyString(sk)
      if (!sers.has(sks)) sers.set(sks, { key: sk, label: formatKey(sk, seriesField!, r.columns[si].format, r.columns[si].type), ks: sks })
    }
  }
  const categories = [...cats.values()]
  const series = si >= 0 ? [...sers.values()].sort((a, c) => sortCompare(fromJsonScalar(a.key), fromJsonScalar(c.key))) : []
  const valueIdx = b.values.map((x, i) => ({ x, i })).filter((o) => valueRole.includes(o.x.role))
  const catPos = new Map(categories.map((c, i) => [c.ks, i]))
  const serPos = new Map(series.map((s, i) => [s.ks, i]))
  const nS = Math.max(1, series.length)
  const mk = () => valueIdx.map(() => Array.from({ length: nS }, () => new Array<number | null>(categories.length).fill(null)))
  const values = mk()
  const highlights = r.highlights ? mk() : null
  const rowIndex = new Map<string, number>()
  r.rows.forEach((row, ri) => {
    const cpos = catPos.get(ci >= 0 ? keyString(row[ci]) : '__all')!
    const spos = si >= 0 ? serPos.get(keyString(row[si]))! : 0
    rowIndex.set(`${cpos}|${spos}`, ri)
    valueIdx.forEach((o, k) => {
      values[k][spos][cpos] = num(row[nG + o.i])
      if (highlights) highlights[k][spos][cpos] = num(r.highlights![ri][o.i])
    })
  })
  return { catField, seriesField, categories, series, values, highlights, rowIndex }
}

function palette(theme: ReportTheme, v: VisualDef): string[] {
  const def = fmt<string>(v, 'colors', 'default')
  const base = theme.dataColors.length ? theme.dataColors : ['#0a8fa3']
  return def ? [def, ...base.slice(1)] : base
}

function colorOverride(v: VisualDef, ks: string): string | undefined {
  const map = v.format.colorMap as Record<string, string> | undefined
  return map?.[ks]
}

function unitsOf(v: VisualDef, group: string): DisplayUnits {
  return (fmt<string>(v, group, 'units') || 'auto') as DisplayUnits
}

function legendOption(v: VisualDef, show: boolean, data?: string[]): Record<string, unknown> {
  const pos = fmt<string>(v, 'legend', 'position')
  const on = show && fmt<boolean>(v, 'legend', 'show') !== false
  const size = fmt<number>(v, 'legend', 'fontSize')
  const base: Record<string, unknown> = {
    show: on,
    type: 'scroll',
    icon: 'circle',
    itemWidth: 9,
    itemHeight: 9,
    itemGap: 14,
    textStyle: { color: INK_2, fontSize: size },
    pageIconSize: 10,
    data
  }
  if (pos === 'bottom') Object.assign(base, { bottom: 0, left: 'center' })
  else if (pos === 'left') Object.assign(base, { left: 0, top: 'middle', orient: 'vertical' })
  else if (pos === 'right') Object.assign(base, { right: 0, top: 'middle', orient: 'vertical' })
  else Object.assign(base, { top: 0, left: 0 })
  return base
}

function gridFor(v: VisualDef, legendOn: boolean, extraBottom = 0): Record<string, unknown> {
  const pos = fmt<string>(v, 'legend', 'position')
  return {
    left: 8,
    right: 16,
    top: legendOn && pos === 'top' ? 30 : 12,
    bottom: (legendOn && pos === 'bottom' ? 30 : 6) + extraBottom,
    containLabel: true
  }
}

function axisLabelStyle(v: VisualDef, group: string) {
  return { color: fmt<string>(v, group, 'color') || MUTED, fontSize: fmt<number>(v, group, 'fontSize') }
}

function tooltipBase(): Record<string, unknown> {
  return {
    confine: true,
    backgroundColor: '#ffffff',
    borderColor: '#e1dfdd',
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: INK, fontSize: 12 },
    extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.12); border-radius: 6px;'
  }
}

function dot(color: string): string {
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>`
}

function tooltipRows(rows: { color?: string; name: string; value: string }[], header?: string): string {
  const h = header ? `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(header)}</div>` : ''
  return (
    h +
    rows
      .map(
        (x) =>
          `<div style="display:flex;justify-content:space-between;gap:16px;line-height:20px"><span>${x.color ? dot(x.color) : ''}${escapeHtml(x.name)}</span><span style="font-weight:600;font-variant-numeric:tabular-nums">${escapeHtml(x.value)}</span></div>`
      )
      .join('')
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function catFilter(field: FieldRef | null, key: JsonScalar): VQFilter[] {
  return field ? [{ kind: 'in', field, values: [key] }] : []
}

// ---------------------------------------------------------------------------
// Cartesianos: colunas, barras, linhas, áreas e combinações
// ---------------------------------------------------------------------------

type Cartesian = 'column' | 'bar' | 'line' | 'area'

export function cartesianOption(input: ChartInput): ChartBuild {
  const { v, r, built, theme, selected } = input
  const t = v.type
  const horizontal = t === 'bar' || t === 'stackedBar' || t === 'percentBar'
  const stacked = ['stackedColumn', 'stackedBar', 'percentColumn', 'percentBar', 'stackedArea', 'lineStackedColumn'].includes(t)
  const percent = t === 'percentColumn' || t === 'percentBar'
  const kindOf = (role: string): Cartesian =>
    role === 'lineValues' ? 'line' : t === 'line' ? 'line' : t === 'area' || t === 'stackedArea' ? 'area' : horizontal ? 'bar' : 'column'
  const roles = ['values', 'lineValues']
  const p = pivot(r, built, roles)
  const valueFields = built.values.filter((x) => roles.includes(x.role))
  const nG = built.groups.length
  const colors = palette(theme, v)
  const units = unitsOf(v, 'yAxis')
  const labelsOn = fmt<boolean>(v, 'labels', 'show')
  const labelUnits = unitsOf(v, 'labels')
  const labelDec = parseDecimals(fmt(v, 'labels', 'decimals'))
  const radius = fmt<number>(v, 'bars', 'radius')
  const maxWidth = fmt<number>(v, 'bars', 'maxWidth')
  const gap = `${fmt<number>(v, 'bars', 'gap')}%`
  const lineWidth = fmt<number>(v, 'lines', 'width')
  const smooth = fmt<boolean>(v, 'lines', 'smooth')
  const markers = fmt<boolean>(v, 'lines', 'markers')
  const areaFill = fmt<boolean>(v, 'lines', 'area')
  const secondary = fmt<boolean>(v, 'combo', 'secondary') && t.startsWith('line') && valueFields.some((x) => x.role === 'lineValues')
  const surface = v.format.background?.color as string | undefined ?? theme.visualBackground ?? '#ffffff'

  const seriesDefs: { name: string; values: (number | null)[]; hl: (number | null)[] | null; color: string; kind: Cartesian; vi: number; si: number; ks: string; format?: string; yIndex: number }[] = []
  valueFields.forEach((vf, k) => {
    const col = r.columns[nG + built.values.indexOf(vf)]
    if (p.series.length && vf.role === 'values') {
      p.series.forEach((s, si) => {
        seriesDefs.push({
          name: s.label,
          values: p.values[k][si],
          hl: p.highlights?.[k][si] ?? null,
          color: colorOverride(v, s.ks) ?? colors[si % colors.length],
          kind: kindOf(vf.role),
          vi: k,
          si,
          ks: s.ks,
          format: col?.format,
          yIndex: 0
        })
      })
    } else {
      const ks = `v:${col?.name ?? k}`
      seriesDefs.push({
        name: col?.name ?? '',
        values: p.values[k][0],
        hl: p.highlights?.[k][0] ?? null,
        color: colorOverride(v, ks) ?? colors[seriesDefs.length % colors.length],
        kind: kindOf(vf.role),
        vi: k,
        si: -1,
        ks,
        format: col?.format,
        yIndex: secondary && vf.role === 'lineValues' ? 1 : 0
      })
    }
  })

  // Percentuais (100% empilhado)
  if (percent) {
    const totals = p.categories.map((_, c) => seriesDefs.reduce((s, d) => s + Math.abs(d.values[c] ?? 0), 0))
    for (const d of seriesDefs) {
      d.values = d.values.map((x, c) => (x === null || !totals[c] ? null : x / totals[c]))
      if (d.hl) d.hl = d.hl.map((x, c) => (x === null || !totals[c] ? null : x / totals[c]))
    }
  }
  const valueFormat = percent ? '0%' : seriesDefs[0]?.format
  const colorByCategory = seriesDefs.length === 1 && fmt<boolean>(v, 'colors', 'showAll')

  const catLabels = p.categories.map((c) => c.label)
  const series: Record<string, unknown>[] = []
  const meta: { def: (typeof seriesDefs)[number]; part: 'main' | 'rest' }[] = []
  for (const d of seriesDefs) {
    const isBar = d.kind === 'column' || d.kind === 'bar'
    const stackKey = stacked ? (isBar ? 'bars' : d.kind === 'area' ? 'area' : undefined) : undefined
    const selDim = (ci: number) => {
      if (!selected || selected.size === 0) return 1
      const k = p.categories[ci].ks + (d.si >= 0 ? '|' + d.ks : '')
      return selected.has(k) || selected.has(p.categories[ci].ks) ? 1 : 0.35
    }
    const br = horizontal ? [0, radius, radius, 0] : [radius, radius, 0, 0]
    const brNeg = horizontal ? [radius, 0, 0, radius] : [0, 0, radius, radius]
    const itemFor = (x: number | null, ci: number, color: string, opacity = 1) => ({
      value: x,
      itemStyle: {
        color: colorByCategory ? (colorOverride(v, p.categories[ci].ks) ?? colors[ci % colors.length]) : color,
        opacity: opacity * selDim(ci),
        borderRadius: stacked ? 0 : x !== null && x < 0 ? brNeg : br
      }
    })
    const label = {
      show: !!labelsOn,
      position: isBar ? (fmt<string>(v, 'labels', 'position') === 'inside' || stacked ? 'inside' : horizontal ? 'right' : 'top') : 'top',
      color: fmt<string>(v, 'labels', 'color') || (stacked && isBar ? undefined : INK_2),
      fontSize: fmt<number>(v, 'labels', 'fontSize'),
      formatter: (o: { value: number | null }) => (o.value === null ? '' : percent ? formatValue(o.value, '0%') : formatAxis(o.value, d.format, labelUnits === 'auto' ? units : labelUnits)) + (labelDec !== undefined ? '' : '')
    }
    if (isBar) {
      if (d.hl) {
        // Realce: parte destacada sólida + restante esmaecido, empilhados.
        const stack = stacked ? 'bars' : `hl${series.length}`
        series.push({
          type: 'bar',
          name: d.name,
          stack,
          barMaxWidth: maxWidth,
          barCategoryGap: gap,
          data: d.hl.map((x, ci) => itemFor(x, ci, d.color)),
          label: { ...label, show: false },
          yAxisIndex: horizontal ? undefined : d.yIndex,
          xAxisIndex: horizontal ? d.yIndex : undefined,
          emphasis: { focus: 'none' }
        })
        meta.push({ def: d, part: 'main' })
        series.push({
          type: 'bar',
          name: d.name,
          stack,
          barMaxWidth: maxWidth,
          barCategoryGap: gap,
          data: d.values.map((x, ci) => itemFor(x === null ? null : x - (d.hl![ci] ?? 0), ci, d.color, 0.35)),
          label,
          yAxisIndex: horizontal ? undefined : d.yIndex,
          xAxisIndex: horizontal ? d.yIndex : undefined
        })
        meta.push({ def: d, part: 'rest' })
      } else {
        series.push({
          type: 'bar',
          name: d.name,
          stack: stackKey,
          barMaxWidth: maxWidth,
          barCategoryGap: gap,
          data: d.values.map((x, ci) => itemFor(x, ci, d.color)),
          label,
          itemStyle: stacked ? { borderColor: surface, borderWidth: 1 } : undefined,
          yAxisIndex: horizontal ? undefined : d.yIndex,
          xAxisIndex: horizontal ? d.yIndex : undefined
        })
        meta.push({ def: d, part: 'main' })
      }
    } else {
      const few = p.categories.length <= 1
      series.push({
        type: 'line',
        name: d.name,
        stack: stackKey,
        data: d.values,
        smooth: smooth ? 0.35 : false,
        showSymbol: markers || few,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: lineWidth, cap: 'round', join: 'round', color: d.color },
        itemStyle: { color: d.color, borderColor: surface, borderWidth: 2 },
        areaStyle: d.kind === 'area' || areaFill ? { color: d.color, opacity: stacked ? 0.55 : 0.12 } : undefined,
        label: { ...label, position: 'top' },
        connectNulls: false,
        yAxisIndex: d.yIndex,
        emphasis: { focus: 'series' }
      })
      meta.push({ def: d, part: 'main' })
    }
  }

  const legendOn = seriesDefs.length >= 2 && fmt<boolean>(v, 'legend', 'show') !== false
  const legendData = [...new Set(seriesDefs.map((d) => d.name))]
  const xShow = fmt<boolean>(v, 'xAxis', 'show') !== false
  const yShow = fmt<boolean>(v, 'yAxis', 'show') !== false
  const rotate = fmt<number>(v, 'xAxis', 'rotate')
  const catTitle = p.catField ? (r.columns[built.groups.findIndex((g) => g.role === 'category')]?.name ?? '') : ''
  const valTitle = valueFields.length === 1 || p.series.length ? (r.columns[nG]?.name ?? '') : ''
  const yMin = fmt<string>(v, 'yAxis', 'min')
  const yMax = fmt<string>(v, 'yAxis', 'max')
  const catAxis: Record<string, unknown> = {
    type: 'category',
    data: catLabels,
    show: xShow,
    name: fmt<boolean>(v, 'xAxis', 'title') && catTitle ? catTitle : undefined,
    nameLocation: 'middle',
    nameGap: horizontal ? 50 : 26,
    nameTextStyle: { color: INK_2, fontSize: 11 },
    axisLine: { lineStyle: { color: AXIS } },
    axisTick: { show: false },
    axisLabel: {
      ...axisLabelStyle(v, 'xAxis'),
      rotate,
      hideOverlap: true,
      width: horizontal ? 120 : undefined,
      overflow: 'truncate'
    },
    inverse: horizontal
  }
  const mkValueAxis = (index: number): Record<string, unknown> => ({
    type: fmt<boolean>(v, 'yAxis', 'log') ? 'log' : 'value',
    show: yShow,
    position: index === 1 ? (horizontal ? 'top' : 'right') : undefined,
    name: index === 0 && fmt<boolean>(v, 'yAxis', 'title') && valTitle ? valTitle : undefined,
    nameLocation: 'middle',
    nameGap: horizontal ? 26 : 46,
    nameTextStyle: { color: INK_2, fontSize: 11 },
    min: yMin !== '' && !percent ? Number(yMin) : percent ? 0 : undefined,
    max: yMax !== '' && !percent ? Number(yMax) : percent ? 1 : undefined,
    splitLine: { show: index === 0 && fmt<boolean>(v, 'yAxis', 'gridlines') !== false, lineStyle: { color: GRID, type: 'solid', width: 1 } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { ...axisLabelStyle(v, 'yAxis'), formatter: (x: number) => (percent ? formatValue(x, '0%') : formatAxis(x, valueFormat, units)) }
  })
  const valueAxes = secondary ? [mkValueAxis(0), mkValueAxis(1)] : [mkValueAxis(0)]
  const zoomOn = fmt<boolean>(v, 'zoom', 'show')
  const tooltipValues = built.values.map((x, i) => ({ x, i })).filter((o) => o.x.role === 'tooltips')

  const option: EChartsCoreOption = {
    animationDuration: 300,
    textStyle: { fontFamily: 'Segoe UI, system-ui, sans-serif' },
    grid: gridFor(v, legendOn, zoomOn ? 28 : 0),
    legend: legendOption(v, legendOn, legendData),
    tooltip: {
      ...tooltipBase(),
      trigger: 'axis',
      axisPointer: { type: seriesDefs.some((d) => d.kind === 'line' || d.kind === 'area') ? 'line' : 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.04)' }, lineStyle: { color: AXIS } },
      formatter: (params: { dataIndex: number }[]) => {
        const ci = params[0]?.dataIndex ?? 0
        const rows = seriesDefs
          .filter((d) => d.values[ci] !== null)
          .map((d) => ({ color: d.color, name: d.name, value: percent ? formatValue(d.values[ci], '0.0%') : formatValue(d.values[ci], d.format) }))
        if (seriesDefs.some((d) => d.hl)) {
          for (const d of seriesDefs) if (d.hl && d.hl[ci] !== null) rows.push({ color: undefined as unknown as string, name: `${d.name} (destacado)`, value: formatValue(d.hl[ci], d.format) })
        }
        for (const tv of tooltipValues) {
          const ri = p.rowIndex.get(`${ci}|0`)
          if (ri === undefined) continue
          rows.push({ color: undefined as unknown as string, name: r.columns[nG + tv.i].name, value: formatValue(r.rows[ri][nG + tv.i], r.columns[nG + tv.i].format) })
        }
        return tooltipRows(rows, p.catField ? p.categories[ci]?.label : undefined)
      }
    },
    xAxis: horizontal ? valueAxes : catAxis,
    yAxis: horizontal ? catAxis : valueAxes,
    dataZoom: zoomOn ? [{ type: 'slider', height: 16, bottom: 4, [horizontal ? 'yAxisIndex' : 'xAxisIndex']: 0, brushSelect: false }] : [],
    series
  }

  return {
    option,
    point: (seriesIndex, dataIndex) => {
      const m = meta[seriesIndex]
      const c = p.categories[dataIndex]
      if (!m || !c) return null
      const filters: VQFilter[] = catFilter(p.catField, c.key)
      let key = c.ks
      let label = c.label
      if (m.def.si >= 0 && p.seriesField) {
        const s = p.series[m.def.si]
        filters.push({ kind: 'in', field: p.seriesField, values: [s.key] })
        key += '|' + s.ks
        label += ' · ' + s.label
      }
      if (!filters.length) return null
      return { filters: [{ kind: 'tuple', fields: filters.map((f) => (f as { field: FieldRef }).field), tuples: [filters.map((f) => (f as { values: JsonScalar[] }).values[0])] }], key, label }
    }
  }
}

// ---------------------------------------------------------------------------
// Pizza, rosca, treemap e funil
// ---------------------------------------------------------------------------

export function pieLikeOption(input: ChartInput): ChartBuild {
  const { v, r, built, theme, selected } = input
  const p = pivot(r, built)
  const colors = palette(theme, v)
  const nG = built.groups.length
  const vcol = r.columns[nG]
  const values = p.values[0]?.[0] ?? []
  const hl = p.highlights?.[0]?.[0] ?? null
  const total = values.reduce<number>((s, x) => s + (x ?? 0), 0)
  const items = p.categories.map((c, i) => {
    const color = colorOverride(v, c.ks) ?? colors[i % colors.length]
    const dim = (selected && selected.size && !selected.has(c.ks)) || (hl && (hl[i] ?? 0) === 0) ? 0.35 : 1
    return { name: c.label, value: values[i], itemStyle: { color, opacity: dim }, ks: c.ks }
  })
  const content = fmt<string>(v, 'slices', 'content')
  const labelFmt = (o: { name: string; value: number; percent?: number }) => {
    const pct = formatValue(total ? o.value / total : 0, '0.0%')
    const val = formatAxis(o.value, vcol?.format)
    switch (content) {
      case 'category':
        return o.name
      case 'value':
        return val
      case 'categoryPercent':
        return `${o.name}\n${pct}`
      case 'categoryValue':
        return `${o.name}\n${val}`
      default:
        return pct
    }
  }
  const tooltip = {
    ...tooltipBase(),
    trigger: 'item',
    formatter: (o: { name: string; value: number; color: string; dataIndex: number }) => {
      const rows = [
        { color: o.color, name: vcol?.name ?? '', value: formatValue(o.value, vcol?.format) },
        { name: '% do total', value: formatValue(total ? o.value / total : 0, '0.0%') }
      ]
      if (hl && hl[o.dataIndex] !== null) rows.push({ name: 'Destacado', value: formatValue(hl[o.dataIndex], vcol?.format) })
      return tooltipRows(rows as { color?: string; name: string; value: string }[], o.name)
    }
  }
  let series: Record<string, unknown>
  const showLabels = v.type === 'pie' || v.type === 'donut' ? fmt<boolean>(v, 'slices', 'show') !== false : fmt<boolean>(v, 'labels', 'show') !== false
  if (v.type === 'pie' || v.type === 'donut') {
    const inner = v.type === 'donut' ? fmt<number>(v, 'slices', 'innerRadius') : 0
    series = {
      type: 'pie',
      radius: [`${inner}%`, '72%'],
      center: ['50%', '54%'],
      data: items.filter((x) => x.value !== null),
      itemStyle: { borderColor: v.format.background?.color ?? '#ffffff', borderWidth: 2 },
      label: { show: showLabels, formatter: labelFmt, color: INK_2, fontSize: fmt<number>(v, 'slices', 'fontSize') },
      labelLine: { lineStyle: { color: AXIS } },
      avoidLabelOverlap: true,
      emphasis: { scale: false }
    }
  } else if (v.type === 'treemap') {
    series = {
      type: 'treemap',
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      width: '100%',
      height: '100%',
      top: 0,
      left: 0,
      data: items.filter((x) => x.value !== null && (x.value as number) > 0),
      itemStyle: { borderColor: '#ffffff', borderWidth: 2, gapWidth: 2 },
      label: {
        show: showLabels,
        formatter: (o: { name: string; value: number }) => `${o.name}\n${formatAxis(o.value, vcol?.format)}`,
        color: '#ffffff',
        fontSize: 12,
        overflow: 'truncate'
      },
      levels: [{ itemStyle: { borderWidth: 0, gapWidth: 2 } }]
    }
  } else {
    // funil
    const first = values.find((x) => x !== null) ?? 0
    series = {
      type: 'funnel',
      left: '8%',
      right: '8%',
      top: 8,
      bottom: 8,
      sort: 'descending',
      gap: 2,
      minSize: '8%',
      data: items.filter((x) => x.value !== null),
      label: {
        show: showLabels,
        position: 'inside',
        formatter: (o: { name: string; value: number }) => `${o.name}  ${formatAxis(o.value, vcol?.format)}${first ? ` (${formatValue(o.value / first, '0%')})` : ''}`,
        color: '#ffffff',
        fontSize: fmt<number>(v, 'labels', 'fontSize') || 11
      }
    }
  }
  const legendOn = v.type === 'pie' || v.type === 'donut'
  return {
    option: {
      animationDuration: 300,
      textStyle: { fontFamily: 'Segoe UI, system-ui, sans-serif' },
      legend: legendOn ? legendOption(v, items.length >= 2, items.map((x) => x.name)) : undefined,
      tooltip,
      series: [series]
    },
    point: (_si, dataIndex, name) => {
      const list = v.type === 'treemap' ? items.filter((x) => x.value !== null && (x.value as number) > 0) : items.filter((x) => x.value !== null)
      const it = name !== undefined ? items.find((x) => x.name === name) : list[dataIndex]
      if (!it) return null
      const c = p.categories.find((x) => x.ks === it.ks)!
      return { filters: catFilter(p.catField, c.key), key: c.ks, label: c.label }
    }
  }
}

// ---------------------------------------------------------------------------
// Cascata
// ---------------------------------------------------------------------------

export function waterfallOption(input: ChartInput): ChartBuild {
  const { v, r, built } = input
  const p = pivot(r, built)
  const vals = p.values[0]?.[0] ?? []
  const vcol = r.columns[built.groups.length]
  const inc = fmt<string>(v, 'sentiment', 'increase')
  const dec = fmt<string>(v, 'sentiment', 'decrease')
  const tot = fmt<string>(v, 'sentiment', 'total')
  const base: (number | null)[] = []
  const up: (number | null)[] = []
  const down: (number | null)[] = []
  let acc = 0
  for (const x of vals) {
    const d = x ?? 0
    if (d >= 0) {
      base.push(acc)
      up.push(d)
      down.push(null)
    } else {
      base.push(acc + d)
      up.push(null)
      down.push(-d)
    }
    acc += d
  }
  const labels = [...p.categories.map((c) => c.label), 'Total']
  base.push(0)
  up.push(null)
  down.push(null)
  const totalData = [...vals.map(() => null), acc]
  const lbl = { show: fmt<boolean>(v, 'labels', 'show') !== false, position: 'top', color: INK_2, fontSize: 10, formatter: (o: { value: number | null }) => (o.value ? formatAxis(o.value, vcol?.format) : '') }
  return {
    option: {
      animationDuration: 300,
      grid: { left: 8, right: 16, top: 16, bottom: 6, containLabel: true },
      tooltip: {
        ...tooltipBase(),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.04)' } },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex
          const val = i < vals.length ? vals[i] : acc
          return tooltipRows([{ name: vcol?.name ?? '', value: formatValue(val, vcol?.format) }], labels[i])
        }
      },
      xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: AXIS } }, axisLabel: { color: MUTED, hideOverlap: true } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: GRID } }, axisLabel: { color: MUTED, formatter: (x: number) => formatAxis(x, vcol?.format) } },
      series: [
        { type: 'bar', stack: 'w', data: base, itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, tooltip: { show: false }, barMaxWidth: 40 },
        { type: 'bar', stack: 'w', data: up, itemStyle: { color: inc, borderRadius: [3, 3, 0, 0] }, label: lbl, barMaxWidth: 40 },
        { type: 'bar', stack: 'w', data: down, itemStyle: { color: dec, borderRadius: [3, 3, 0, 0] }, label: lbl, barMaxWidth: 40 },
        { type: 'bar', stack: 'w', data: totalData, itemStyle: { color: tot, borderRadius: [3, 3, 0, 0] }, label: lbl, barMaxWidth: 40 }
      ]
    },
    point: (_s, dataIndex) => {
      const c = p.categories[dataIndex]
      if (!c) return null
      return { filters: catFilter(p.catField, c.key), key: c.ks, label: c.label }
    }
  }
}

// ---------------------------------------------------------------------------
// Dispersão
// ---------------------------------------------------------------------------

export function scatterOption(input: ChartInput): ChartBuild {
  const { v, r, built, theme, selected } = input
  const nG = built.groups.length
  const gi = built.groups.findIndex((g) => g.role === 'details')
  const si = built.groups.findIndex((g) => g.role === 'series')
  const xi = built.values.findIndex((x) => x.role === 'x')
  const yi = built.values.findIndex((x) => x.role === 'y')
  const zi = built.values.findIndex((x) => x.role === 'size')
  const colors = palette(theme, v)
  const groups = new Map<string, { label: string; points: { value: (number | null)[]; row: number }[]; key: JsonScalar }>()
  let maxSize = 0
  r.rows.forEach((row, ri) => {
    const sk = si >= 0 ? row[si] : null
    const ks = si >= 0 ? keyString(sk) : '__all'
    if (!groups.has(ks)) groups.set(ks, { label: si >= 0 ? formatKey(sk, built.groups[si].field) : (r.columns[nG + (yi >= 0 ? yi : 0)]?.name ?? ''), points: [], key: sk })
    const x = xi >= 0 ? num(row[nG + xi]) : null
    const y = yi >= 0 ? num(row[nG + yi]) : null
    const z = zi >= 0 ? num(row[nG + zi]) : null
    if (z !== null) maxSize = Math.max(maxSize, Math.abs(z))
    groups.get(ks)!.points.push({ value: [x, y, z], row: ri })
  })
  const xcol = xi >= 0 ? r.columns[nG + xi] : undefined
  const ycol = yi >= 0 ? r.columns[nG + yi] : undefined
  const glist = [...groups.values()]
  const series = glist.map((g, k) => ({
    type: 'scatter',
    name: g.label,
    data: g.points.map((pt) => ({
      value: pt.value,
      itemStyle: { opacity: selected && selected.size && gi >= 0 && !selected.has(keyString(r.rows[pt.row][gi])) ? 0.25 : 0.85 }
    })),
    symbolSize: (val: (number | null)[]) => (zi >= 0 && maxSize ? 8 + 30 * Math.sqrt(Math.abs(val[2] ?? 0) / maxSize) : 10),
    itemStyle: { color: colors[k % colors.length], borderColor: '#ffffff', borderWidth: 1 }
  }))
  return {
    option: {
      animationDuration: 300,
      grid: gridFor(v, glist.length >= 2),
      legend: legendOption(v, glist.length >= 2, glist.map((g) => g.label)),
      tooltip: {
        ...tooltipBase(),
        trigger: 'item',
        formatter: (o: { seriesIndex: number; dataIndex: number; color: string }) => {
          const pt = glist[o.seriesIndex].points[o.dataIndex]
          const row = r.rows[pt.row]
          const header = gi >= 0 ? formatKey(row[gi], built.groups[gi].field) : ''
          const rows = built.values.map((_bv, i) => ({ name: r.columns[nG + i].name, value: formatValue(row[nG + i], r.columns[nG + i].format), color: undefined as unknown as string }))
          return tooltipRows(rows, header)
        }
      },
      xAxis: {
        type: 'value',
        name: xcol?.name,
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: INK_2 },
        splitLine: { lineStyle: { color: GRID } },
        axisLine: { lineStyle: { color: AXIS } },
        axisLabel: { color: MUTED, formatter: (x: number) => formatAxis(x, xcol?.format) },
        scale: true
      },
      yAxis: {
        type: 'value',
        name: ycol?.name,
        nameLocation: 'middle',
        nameGap: 46,
        nameTextStyle: { color: INK_2 },
        splitLine: { lineStyle: { color: GRID } },
        axisLabel: { color: MUTED, formatter: (x: number) => formatAxis(x, ycol?.format) },
        scale: true
      },
      series
    },
    point: (seriesIndex, dataIndex) => {
      const pt = glist[seriesIndex]?.points[dataIndex]
      if (!pt || gi < 0) return null
      const key = r.rows[pt.row][gi]
      return { filters: catFilter(built.groups[gi].field, key), key: keyString(key), label: formatKey(key, built.groups[gi].field) }
    }
  }
}

// ---------------------------------------------------------------------------
// Medidor
// ---------------------------------------------------------------------------

export function gaugeOption(input: ChartInput): ChartBuild {
  const { v, r, built, theme } = input
  const row = r.rows[0] ?? []
  const get = (role: string) => {
    const i = built.values.findIndex((x) => x.role === role)
    return i >= 0 ? num(row[built.groups.length + i]) : null
  }
  const value = get('value') ?? 0
  const vcol = r.columns[built.groups.length]
  const fmin = fmt<string>(v, 'gauge', 'min')
  const fmax = fmt<string>(v, 'gauge', 'max')
  const ftarget = fmt<string>(v, 'gauge', 'target')
  const min = get('min') ?? (fmin !== '' ? Number(fmin) : 0)
  let max = get('max') ?? (fmax !== '' ? Number(fmax) : NaN)
  if (!Number.isFinite(max)) max = value <= 0 ? 1 : value * 2
  const target = get('target') ?? (ftarget !== '' ? Number(ftarget) : null)
  const fill = fmt<string>(v, 'gauge', 'fill') || theme.dataColors[0]
  const size = fmt<number>(v, 'callout', 'fontSize')
  const series: Record<string, unknown>[] = [
    {
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min,
      max,
      center: ['50%', '72%'],
      radius: '100%',
      progress: { show: true, width: 22, itemStyle: { color: fill } },
      axisLine: { lineStyle: { width: 22, color: [[1, '#edebe9']] } },
      pointer: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: true, distance: -40, color: MUTED, fontSize: 10, formatter: (x: number) => (x === min || x === max ? formatAxis(x, vcol?.format) : '') },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '-12%'],
        fontSize: Math.min(size, 40),
        fontWeight: 600,
        color: INK,
        formatter: (x: number) => formatAxis(x, vcol?.format, unitsOf(v, 'callout'))
      },
      data: [{ value }]
    }
  ]
  if (target !== null && Number.isFinite(target)) {
    series.push({
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min,
      max,
      center: ['50%', '72%'],
      radius: '100%',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: true, icon: 'rect', width: 3, length: 30, offsetCenter: [0, '-88%'], itemStyle: { color: INK } },
      detail: { show: false },
      data: [{ value: target }]
    })
  }
  return {
    option: {
      tooltip: { ...tooltipBase(), formatter: () => tooltipRows([{ name: vcol?.name ?? 'Valor', value: formatValue(value, vcol?.format) }, ...(target !== null ? [{ name: 'Destino', value: formatValue(target, vcol?.format) }] : [])]) },
      series
    },
    point: () => null
  }
}

export function buildChart(input: ChartInput): ChartBuild {
  switch (input.v.type) {
    case 'pie':
    case 'donut':
    case 'treemap':
    case 'funnel':
      return pieLikeOption(input)
    case 'waterfall':
      return waterfallOption(input)
    case 'scatter':
      return scatterOption(input)
    case 'gauge':
      return gaugeOption(input)
    default:
      return cartesianOption(input)
  }
}

export { hexToRgba, readableText }
