/** AutoNews brand mark — keyword feed / signal monogram */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={className ? `brand-mark ${className}` : 'brand-mark'} aria-hidden>
      <svg className="brand-mark-svg" viewBox="0 0 40 40" width="40" height="40" fill="none">
        {/* Abstract A: peak + crossbar (Auto) */}
        <path
          d="M9.5 29.5 20 9.5 30.5 29.5"
          stroke="currentColor"
          strokeWidth="3.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14.2 21.6h11.6"
          stroke="currentColor"
          strokeWidth="3.1"
          strokeLinecap="round"
        />
        {/* Feed ticks: keyword / headline rhythm */}
        <path
          d="M22.8 13.2h7.2M24.6 17.4h5.4M26.4 21.6h3.6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.88"
        />
      </svg>
    </span>
  )
}
