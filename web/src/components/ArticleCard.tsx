import { memo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clockTime, shortStamp } from '../lib/dates'
import type { Article } from '../types'

type Props = {
  article: Article
  starred: boolean
  matchedKeywords?: string[]
  altSources?: { source: string; url: string }[]
  onToggleStar?: (articleId: string) => void
  canStar: boolean
  /** `time` inside a day-grouped timeline, `date` in lists that are not grouped by day. */
  stamp?: 'time' | 'date'
}

/** One news item in the dispatch timeline. */
export const ArticleCard = memo(function ArticleCard({
  article,
  starred,
  matchedKeywords,
  altSources,
  onToggleStar,
  canStar,
  stamp = 'date',
}: Props) {
  const navigate = useNavigate()
  const [altsOpen, setAltsOpen] = useState(false)
  const title = (article.title_zh || '').trim() || article.title
  const summary = (article.summary_zh || '').trim() || article.summary
  const translated = Boolean((article.title_zh || '').trim())
  const alts = altSources ?? []
  const when = article.published_at ?? article.created_at
  const stampText = stamp === 'time' ? clockTime(when) : shortStamp(when)

  return (
    <article className={`dispatch${stamp === 'date' ? ' is-dated' : ''}`}>
      <time className="dispatch-stamp" dateTime={when ?? undefined}>
        {stampText}
      </time>

      <div className="dispatch-body">
        <p className="dispatch-meta" data-stamp={stampText}>
          <span className="dispatch-source">{article.source}</span>
          {alts.length > 0 && (
            <button
              type="button"
              className="dispatch-alts"
              aria-expanded={altsOpen}
              onClick={() => setAltsOpen((v) => !v)}
            >
              另有 {alts.length} 家报道
            </button>
          )}
          {!translated && <span className="dispatch-pending">待译</span>}
          <button
            type="button"
            className={`star${starred ? ' is-on' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              if (!canStar || !onToggleStar) {
                navigate('/auth')
                return
              }
              onToggleStar(article.id)
            }}
            aria-pressed={canStar ? starred : undefined}
            aria-label={!canStar ? '登录后收藏' : starred ? '取消收藏' : '加入收藏'}
            title={!canStar ? '登录后即可收藏' : starred ? '取消收藏' : '加入收藏'}
          >
            {starred ? '★' : '☆'}
          </button>
        </p>

        <h3 className="dispatch-title">
          <Link to={`/article/${article.id}`}>{title}</Link>
        </h3>

        {summary && <p className="dispatch-summary">{summary}</p>}

        {altsOpen && alts.length > 0 && (
          <ul className="dispatch-alt-list">
            {alts.map((alt) => (
              <li key={alt.url}>
                <a href={alt.url} target="_blank" rel="noreferrer">
                  {alt.source} ↗
                </a>
              </li>
            ))}
          </ul>
        )}

        {matchedKeywords && matchedKeywords.length > 0 && (
          <ul className="dispatch-tags" aria-label="匹配的关键词">
            {matchedKeywords.slice(0, 3).map((k) => (
              <li key={k}>#{k}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
})
