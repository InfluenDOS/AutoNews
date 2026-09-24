/** AutoNews mark: a cinnabar seal stamped with 讯 (dispatch). */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={className ? `seal ${className}` : 'seal'} aria-hidden>
      讯
    </span>
  )
}
