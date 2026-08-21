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
  const title = (article.title_zh || '').trim() || article.title
  const summary = (article.summary_zh || '').trim() || article.summary
  const translated = Boolean((article.title_zh || '').trim())

  return (
    <article className="card">
      <div className="card-meta">
        <span className="source">{article.source}</span>
        <time dateTime={article.published_at ?? undefined}>{formatDate(article.published_at)}</time>
      </div>
      <h2 className="card-title">
        <a href={article.url} target="_blank" rel="noopener noreferrer">
          {title}
        </a>
      </h2>
      {summary && <p className="card-summary">{summary}</p>}
      {!translated && (
        <p className="card-hint">原文展示中 · 等待 AI 翻译为中文</p>
      )}
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
        {canStar && onToggleStar && (
          <button
            type="button"
            className={`star-btn ${starred ? 'on' : ''}`}
            onClick={onToggleStar}
            aria-label={starred ? '取消收藏' : '加入收藏'}
            title={starred ? '从收藏夹移除' : '加入收藏夹'}
          >
            {starred ? '★' : '☆'}
          </button>
        )}
      </div>
    </article>
  )
}
