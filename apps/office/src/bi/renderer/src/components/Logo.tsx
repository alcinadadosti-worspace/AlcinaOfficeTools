// Logotipo do AlcinaBi (desenho próprio).
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Analytics">
      <defs>
        <linearGradient id="ab-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0a8fa3" />
          <stop offset="1" stopColor="#25c2b4" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#0b3f45" />
      <rect x="6.5" y="17" width="5" height="9" rx="1.6" fill="url(#ab-g)" />
      <rect x="13.5" y="11" width="5" height="15" rx="1.6" fill="url(#ab-g)" />
      <rect x="20.5" y="6" width="5" height="20" rx="1.6" fill="#f5b544" />
    </svg>
  )
}
