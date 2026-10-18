// Ícones originais da suíte Alcina (desenho próprio, geométrico — nada copiado).
// Cada glifo usa currentColor para o traço principal e dourado para o detalhe.
import type { JSX } from 'react'

const GOLD = '#c79a2a'

interface IconProps {
  size?: number
  title?: string
}

function frame(size: number, title: string | undefined, children: JSX.Element): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" role={title ? 'img' : 'presentation'} aria-label={title} aria-hidden={title ? undefined : true}>
      {children}
    </svg>
  )
}

/** Marca da suíte: quadrado verde, "A" em chevron branco e ponto dourado. */
export function AlcinaLogo({ size = 40, title }: IconProps): JSX.Element {
  return frame(
    size,
    title,
    <g>
      <rect x="3" y="3" width="38" height="38" rx="10" fill="#0f7a34" />
      <path d="M13 31 L22 11 L31 31" fill="none" stroke="#ffffff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="24" r="2.8" fill={GOLD} />
    </g>
  )
}

export function SheetsGlyph({ size = 28, title }: IconProps): JSX.Element {
  return frame(
    size,
    title,
    <g fill="none" stroke="currentColor" strokeWidth={2.4}>
      <rect x="5" y="7" width="34" height="30" rx="4" />
      <line x1="5" y1="17" x2="39" y2="17" />
      <line x1="17" y1="17" x2="17" y2="37" />
      <line x1="28" y1="17" x2="28" y2="37" />
      <rect x="28" y="17" width="11" height="7" fill={GOLD} stroke="none" />
    </g>
  )
}

export function DocsGlyph({ size = 28, title }: IconProps): JSX.Element {
  return frame(
    size,
    title,
    <g fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <rect x="9" y="4" width="26" height="36" rx="4" />
      <line x1="15" y1="13" x2="29" y2="13" />
      <line x1="15" y1="20" x2="29" y2="20" />
      <line x1="15" y1="27" x2="24" y2="27" stroke={GOLD} />
    </g>
  )
}

export function PointGlyph({ size = 28, title }: IconProps): JSX.Element {
  return frame(
    size,
    title,
    <g fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <rect x="6" y="8" width="32" height="22" rx="4" />
      <path d="M19 15 L27 19 L19 23 Z" fill={GOLD} stroke="none" />
      <line x1="16" y1="36" x2="28" y2="36" />
      <line x1="22" y1="30" x2="22" y2="36" />
    </g>
  )
}

export function NotesGlyph({ size = 28, title }: IconProps): JSX.Element {
  return frame(
    size,
    title,
    <g fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="5" width="26" height="34" rx="4" />
      <line x1="9" y1="5" x2="9" y2="39" stroke={GOLD} strokeWidth={3.4} />
      <path d="M16 22 L20 26 L29 16" />
    </g>
  )
}

export function BiGlyph({ size = 28, title }: IconProps): JSX.Element {
  return frame(
    size,
    title,
    <g stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <line x1="7" y1="37" x2="39" y2="37" />
      <rect x="11" y="24" width="6" height="11" fill="none" />
      <rect x="21" y="16" width="6" height="19" fill="none" />
      <rect x="31" y="10" width="6" height="25" fill={GOLD} stroke="none" />
    </g>
  )
}
