import { Link } from 'react-router-dom'
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
  starBusy?: boolean
}

export function ArticleCard({
  article,
  starred,
  matchedKeywords,
  onToggleStar,
  canStar,
  starBusy = false,
}: Props) {
  const title = (article.title_zh || '').trim() || article.title
  const summary = (article.summary_zh || '').trim() || article.summary
  const preview =
    summary.length > 140 ? `${summary.slice(0, 140).trim()}…` : summary
  const translated = Boolean((article.title_zh || '').trim())

  return (
    <article className="card">
      <div className="card-meta">
        <span className="source">{article.source}</span>
        <time dateTime={article.published_at ?? undefined}>{formatDate(article.published_at)}</time>
      </div>
      <h2 className="card-title">
        <Link to={`/article/${article.id}`}>{title}</Link>
      </h2>
      {preview && <p className="card-summary">{preview}</p>}
      {!translated && <p className="card-hint">中文译本生成中</p>}
      <div className="card-actions">
        {matchedKeywords && matchedKeywords.length > 0 && (
          <div className="tags">
            {matchedKeywords.map((k) => (
              <span key={k} className="tag">
                {k}
              </span>
            ))}
          </div>
        )}
        <div className="card-actions-right">
          <Link className="linkish" to={`/article/${article.id}`}>
            阅读全文
          </Link>
          {canStar && onToggleStar && (
            <button
              type="button"
              className={`star-btn ${starred ? 'on' : ''}`}
              disabled={starBusy}
              onClick={(e) => {
                e.preventDefault()
                onToggleStar()
              }}
              aria-label={starred ? '取消收藏' : '加入收藏'}
              title={starred ? '从收藏夹移除' : '加入收藏夹'}
            >
              {starBusy ? '…' : starred ? '★' : '☆'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
