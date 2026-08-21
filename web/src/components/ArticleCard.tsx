import { Link, useNavigate } from 'react-router-dom'
import type { Article } from '../types'

function formatDate(value: string | null) {
  if (!value) return '时间未知'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

type Props = {
  article: Article
  starred: boolean
  matchedKeywords?: string[]
  onToggleStar?: () => void
  canStar: boolean
}

export function ArticleCard({ article, starred, matchedKeywords, onToggleStar, canStar }: Props) {
  const navigate = useNavigate()
  const title = (article.title_zh || '').trim() || article.title
  const summary = (article.summary_zh || '').trim() || article.summary
  const preview = summary.length > 110 ? `${summary.slice(0, 110).trim()}…` : summary
  const translated = Boolean((article.title_zh || '').trim())

  return (
    <article className="story">
      <div className="story-meta">
        <span className="source">{article.source}</span>
        <time dateTime={article.published_at ?? undefined}>{formatDate(article.published_at)}</time>
      </div>

      <h2 className="story-title">
        <Link to={`/article/${article.id}`}>{title}</Link>
      </h2>

      {preview && <p className="story-summary">{preview}</p>}
      {!translated && <p className="card-hint">等待中文改写</p>}

      <div className="story-actions">
        {matchedKeywords && matchedKeywords.length > 0 && (
          <div className="tags">
            {matchedKeywords.slice(0, 3).map((k) => (
              <span key={k} className="tag">
                {k}
              </span>
            ))}
          </div>
        )}
        <div className="story-actions-right">
          <Link className="text-link" to={`/article/${article.id}`}>
            阅读
          </Link>
          <button
            type="button"
            className={`star-btn ${starred ? 'on' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              if (!canStar || !onToggleStar) {
                navigate('/auth')
                return
              }
              onToggleStar()
            }}
            aria-label={!canStar ? '登录后收藏' : starred ? '取消收藏' : '加入收藏'}
            title={!canStar ? '登录后即可收藏' : starred ? '取消收藏' : '加入收藏'}
          >
            {starred ? '★' : '☆'}
          </button>
        </div>
      </div>
    </article>
  )
}
