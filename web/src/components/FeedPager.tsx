function pageWindow(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const marks = new Set([1, total, current, current - 1, current + 1])
  const nums = [...marks].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  for (const n of nums) {
    const prev = out[out.length - 1]
    if (typeof prev === 'number' && n - prev > 1) out.push('gap')
    out.push(n)
  }
  return out
}

type Props = {
  page: number
  totalPages: number
  disabled?: boolean
  onChange: (page: number) => void
}

export function FeedPager({ page, totalPages, disabled, onChange }: Props) {
  if (totalPages <= 1) return null
  const total = Math.max(1, totalPages)
  const current = Math.min(Math.max(1, page), total)

  return (
    <nav className="feed-pager" aria-label="分页">
      <button
        type="button"
        className="btn-ghost feed-pager-btn"
        disabled={disabled || current <= 1}
        onClick={() => onChange(current - 1)}
      >
        上一页
      </button>
      <ol className="feed-pager-pages">
        {pageWindow(current, total).map((item, i) =>
          item === 'gap' ? (
            <li key={`gap-${i}`} className="feed-pager-gap" aria-hidden>
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={`feed-pager-num${item === current ? ' is-current' : ''}`}
                disabled={disabled || item === current}
                aria-current={item === current ? 'page' : undefined}
                onClick={() => onChange(item)}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ol>
      <button
        type="button"
        className="btn-ghost feed-pager-btn"
        disabled={disabled || current >= total}
        onClick={() => onChange(current + 1)}
      >
        下一页
      </button>
    </nav>
  )
}
