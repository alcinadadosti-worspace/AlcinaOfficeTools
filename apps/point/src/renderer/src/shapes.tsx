// Desenho de formas (SVG) reutilizado pela visualização e pelo canvas de edição.
import type { ReactNode } from 'react'
import type { SlideElement } from '../../shared/deck'

export function ShapeSvg({ el }: { el: SlideElement }): ReactNode {
  const w = Math.max(1, el.w)
  const h = Math.max(1, el.h)
  const fill = el.fill || '#0f7a34'
  const stroke = el.stroke || 'none'
  const sw = el.strokeWidth || 0
  const p = sw / 2
  const lineColor = el.stroke || el.fill || '#0f7a34'
  let shape: ReactNode = null
  if (el.type === 'rect') shape = <rect x={p} y={p} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} fill={fill} stroke={stroke} strokeWidth={sw} />
  else if (el.type === 'rounded') shape = <rect x={p} y={p} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={Math.min(w, h) * 0.12} fill={fill} stroke={stroke} strokeWidth={sw} />
  else if (el.type === 'ellipse') shape = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - p)} ry={Math.max(0, h / 2 - p)} fill={fill} stroke={stroke} strokeWidth={sw} />
  else if (el.type === 'triangle') shape = <polygon points={`${w / 2},${p} ${w - p},${h - p} ${p},${h - p}`} fill={fill} stroke={stroke} strokeWidth={sw} />
  else if (el.type === 'line') shape = <line x1={p} y1={h - p} x2={w - p} y2={p} stroke={lineColor} strokeWidth={sw || 3} strokeLinecap="round" />
  else if (el.type === 'arrow')
    shape = (
      <g stroke={lineColor} strokeWidth={sw || 3} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1={p + 2} y1={h / 2} x2={w - p - 10} y2={h / 2} />
        <polyline points={`${w - p - 16},${h / 2 - 9} ${w - p - 2},${h / 2} ${w - p - 16},${h / 2 + 9}`} />
      </g>
    )
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {shape}
    </svg>
  )
}
