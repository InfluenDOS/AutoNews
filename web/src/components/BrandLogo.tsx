/** AutoNews brand mark — the gilded editorial feather used in the 即墨 design. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={className ? `brand-mark ${className}` : 'brand-mark'} aria-hidden>
      <svg className="brand-mark-svg" viewBox="0 0 40 40" width="40" height="40" fill="none">
        <path
          d="M8.2 31.8c2.4-9.5 8-17.2 20.9-22.9-2.3 8.8-7.9 16.8-18.8 20.3"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.3 32.1c5.4-6.8 10.4-11.7 17.8-18.8M13.2 26.1l-.3-6.3M17.1 22.1l.2-6.2M20.8 18.5l.8-5.1M14 25.2l6.4.2M17.7 21.2l6.4-.5M21.3 17.6l5.3-1.2"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.2 29.4c2.4-7.7 7.4-14 15.6-18.4-1.9 6.8-6.4 13.2-15.6 18.4Z"
          fill="currentColor"
          fillOpacity="0.13"
        />
      </svg>
    </span>
  )
}
