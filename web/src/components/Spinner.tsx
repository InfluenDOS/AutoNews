type SpinnerProps = {
  size?: 'sm' | 'md'
  label?: string
  className?: string
}

export function Spinner({ size = 'md', label, className = '' }: SpinnerProps) {
  return (
    <span className={`spinner-wrap ${className}`.trim()} role="status" aria-live="polite">
      <span className={`spinner spinner-${size}`} aria-hidden="true" />
      {label ? <span className="spinner-label">{label}</span> : null}
    </span>
  )
}
