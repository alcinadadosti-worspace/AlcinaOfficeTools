// Ícones dos tipos de visual (desenho próprio, 20x20).
import type { JSX } from 'react'
import type { VisualType } from '../report/types'

const S = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const F = { fill: 'currentColor' }

function glyph(type: VisualType): JSX.Element {
  switch (type) {
    case 'column':
      return (
        <>
          <rect x="3" y="9" width="3" height="8" {...F} />
          <rect x="8.5" y="4" width="3" height="13" {...F} opacity={0.6} />
          <rect x="14" y="7" width="3" height="10" {...F} />
        </>
      )
    case 'stackedColumn':
      return (
        <>
          <rect x="3" y="10" width="4" height="7" {...F} />
          <rect x="3" y="6" width="4" height="3.4" {...F} opacity={0.45} />
          <rect x="12" y="7" width="4" height="10" {...F} />
          <rect x="12" y="3" width="4" height="3.4" {...F} opacity={0.45} />
        </>
      )
    case 'percentColumn':
      return (
        <>
          <rect x="3" y="3" width="4" height="6" {...F} opacity={0.45} />
          <rect x="3" y="9.6" width="4" height="7.4" {...F} />
          <rect x="12" y="3" width="4" height="9" {...F} opacity={0.45} />
          <rect x="12" y="12.6" width="4" height="4.4" {...F} />
        </>
      )
    case 'bar':
      return (
        <>
          <rect x="3" y="3" width="8" height="3" {...F} />
          <rect x="3" y="8.5" width="13" height="3" {...F} opacity={0.6} />
          <rect x="3" y="14" width="10" height="3" {...F} />
        </>
      )
    case 'stackedBar':
      return (
        <>
          <rect x="3" y="4" width="7" height="4" {...F} />
          <rect x="10.6" y="4" width="4" height="4" {...F} opacity={0.45} />
          <rect x="3" y="12" width="9" height="4" {...F} />
          <rect x="12.6" y="12" width="4.4" height="4" {...F} opacity={0.45} />
        </>
      )
    case 'percentBar':
      return (
        <>
          <rect x="3" y="4" width="8" height="4" {...F} />
          <rect x="11.6" y="4" width="5.4" height="4" {...F} opacity={0.45} />
          <rect x="3" y="12" width="5" height="4" {...F} />
          <rect x="8.6" y="12" width="8.4" height="4" {...F} opacity={0.45} />
        </>
      )
    case 'line':
      return (
        <>
          <path d="M3 15 L7.5 9 L11 12 L17 4" {...S} strokeWidth={1.8} />
          <path d="M3 17.5 H17.5" {...S} strokeWidth={1} opacity={0.5} />
        </>
      )
    case 'area':
      return (
        <>
          <path d="M3 15 L7.5 9 L11 12 L17 5 V17 H3 Z" {...F} opacity={0.35} />
          <path d="M3 15 L7.5 9 L11 12 L17 5" {...S} strokeWidth={1.6} />
        </>
      )
    case 'stackedArea':
      return (
        <>
          <path d="M3 12 L8 8 L12 10 L17 5 V17 H3 Z" {...F} opacity={0.3} />
          <path d="M3 15 L8 12 L12 14 L17 11 V17 H3 Z" {...F} opacity={0.7} />
        </>
      )
    case 'lineColumn':
    case 'lineStackedColumn':
      return (
        <>
          <rect x="3" y="10" width="3" height="7" {...F} opacity={0.5} />
          <rect x="8.5" y="7" width="3" height="10" {...F} opacity={0.5} />
          <rect x="14" y="11" width="3" height="6" {...F} opacity={0.5} />
          <path d="M3 8 L10 4 L17 7" {...S} strokeWidth={1.7} />
        </>
      )
    case 'ribbon':
      return (
        <>
          <rect x="3" y="5" width="3" height="10" {...F} />
          <rect x="14" y="3" width="3" height="12" {...F} />
          <path d="M6 5 L14 3 V9 L6 11 Z" {...F} opacity={0.3} />
        </>
      )
    case 'waterfall':
      return (
        <>
          <rect x="2.5" y="10" width="3" height="7" {...F} />
          <rect x="6.5" y="6" width="3" height="4" {...F} opacity={0.55} />
          <rect x="10.5" y="6" width="3" height="5" {...F} opacity={0.3} />
          <rect x="14.5" y="11" width="3" height="6" {...F} />
        </>
      )
    case 'funnel':
      return (
        <>
          <rect x="2.5" y="3" width="15" height="3" rx="1" {...F} />
          <rect x="4.5" y="8.5" width="11" height="3" rx="1" {...F} opacity={0.7} />
          <rect x="7" y="14" width="6" height="3" rx="1" {...F} opacity={0.45} />
        </>
      )
    case 'scatter':
      return (
        <>
          <circle cx="6" cy="13" r="1.8" {...F} />
          <circle cx="10" cy="8" r="1.8" {...F} opacity={0.6} />
          <circle cx="14.5" cy="11" r="1.8" {...F} />
          <circle cx="13" cy="4.5" r="1.8" {...F} opacity={0.6} />
          <path d="M3 3 V17 H17.5" {...S} strokeWidth={1} opacity={0.6} />
        </>
      )
    case 'pie':
      return (
        <>
          <path d="M10 10 L10 2.5 A7.5 7.5 0 1 1 3.2 13.2 Z" {...F} />
          <path d="M10 10 L3.2 13.2 A7.5 7.5 0 0 1 10 2.5 Z" {...F} opacity={0.45} />
        </>
      )
    case 'donut':
      return (
        <>
          <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth={3.2} fill="none" opacity={0.45} />
          <path d="M10 4 A6 6 0 0 1 15.2 13" stroke="currentColor" strokeWidth={3.2} fill="none" />
        </>
      )
    case 'treemap':
      return (
        <>
          <rect x="2.5" y="2.5" width="8" height="15" {...F} />
          <rect x="11.5" y="2.5" width="6" height="8" {...F} opacity={0.6} />
          <rect x="11.5" y="11.5" width="6" height="6" {...F} opacity={0.35} />
        </>
      )
    case 'gauge':
      return (
        <>
          <path d="M3 14 A7 7 0 0 1 17 14" stroke="currentColor" strokeWidth={2.6} fill="none" opacity={0.35} />
          <path d="M3 14 A7 7 0 0 1 12 7.4" stroke="currentColor" strokeWidth={2.6} fill="none" />
          <path d="M10 14 L13.5 9" {...S} />
        </>
      )
    case 'card':
      return (
        <>
          <rect x="2.5" y="4" width="15" height="12" rx="2" {...S} />
          <path d="M6 9.5 H14" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
          <path d="M7.5 13 H12.5" {...S} opacity={0.6} />
        </>
      )
    case 'multiCard':
      return (
        <>
          <rect x="2.5" y="2.5" width="15" height="6.5" rx="1.5" {...S} />
          <rect x="2.5" y="11" width="15" height="6.5" rx="1.5" {...S} />
          <path d="M5 5.8 H11 M5 14.3 H11" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
        </>
      )
    case 'kpi':
      return (
        <>
          <path d="M3 15 L7 11 L10 13 L17 6" {...S} opacity={0.5} />
          <path d="M13 6 H17 V10" {...S} />
          <path d="M3 4.5 H9" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        </>
      )
    case 'table':
      return (
        <>
          <rect x="2.5" y="3" width="15" height="14" rx="1.5" {...S} />
          <path d="M2.5 7 H17.5 M2.5 11 H17.5 M2.5 14 H17.5 M8 7 V17" {...S} strokeWidth={1} />
        </>
      )
    case 'matrix':
      return (
        <>
          <rect x="2.5" y="3" width="15" height="14" rx="1.5" {...S} />
          <path d="M2.5 7 H17.5 M7 3 V17 M12 3 V17 M2.5 11.5 H17.5" {...S} strokeWidth={1} />
          <rect x="2.5" y="3" width="4.5" height="4" {...F} opacity={0.4} />
        </>
      )
    case 'slicer':
      return (
        <>
          <path d="M3 4 H17 L12 10 V16 L8 14 V10 Z" {...S} />
        </>
      )
    case 'map':
      return (
        <>
          <path d="M2.5 5 L7 3 L13 5 L17.5 3 V15 L13 17 L7 15 L2.5 17 Z" {...S} />
          <path d="M7 3 V15 M13 5 V17" {...S} strokeWidth={1} />
        </>
      )
    case 'text':
      return (
        <>
          <path d="M4 5 H16 M10 5 V16" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </>
      )
    case 'shape':
      return (
        <>
          <rect x="2.5" y="8" width="8" height="8" rx="1" {...S} />
          <circle cx="13" cy="7" r="4.5" {...S} />
        </>
      )
    case 'image':
      return (
        <>
          <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" {...S} />
          <circle cx="7" cy="8" r="1.5" {...F} />
          <path d="M3 15 L8 11 L11 13.5 L14 10.5 L17.5 14" {...S} />
        </>
      )
    case 'button':
      return (
        <>
          <rect x="2.5" y="6" width="15" height="8" rx="3" {...S} />
          <path d="M7 10 H13" {...S} />
        </>
      )
  }
}

export function VisualIcon({ type, size = 20 }: { type: VisualType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {glyph(type)}
    </svg>
  )
}
