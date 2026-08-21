import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article } from '../types'

function formatDate(value: string | null) {
  if (!value) return '时间未知'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function readingMinutes(text: string) {
  const chars = text.replace(/\s/g, '').length
  return Math.max(1, Math.ceil(chars / 400))
}

export function ArticleDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [article, setArticle] = useState<Article | null>(null)
  const [starred, setStarred] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [starBusy, setStarBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id || !isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.from('articles').select('*').eq('id', id).maybeSingle()
    if (err) {
      setError(err.message)
      setArticle(null)
      setLoading(false)
      return
    }
    setArticle((data as Article) ?? null)

    if (user && data) {
      const { data: star } = await supabase
        .from('stars')
        .select('id')
        .eq('user_id', user.id)
        .eq('article_id', id)
        .maybeSingle()
      setStarred(Boolean(star))
    } else {
      setStarred(false)
    }
    setLoading(false)
  }, [id, user])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleStar() {
    if (!user || !article || starBusy) return
    setStarBusy(true)
    if (starred) {
      const { error: err } = await supabase
        .from('stars')
        .delete()
        .eq('user_id', user.id)
        .eq('article_id', article.id)
      if (err) {
        setError(err.message)
        showToast('取消收藏失败', 'error')
      } else {
        setStarred(false)
        showToast('已取消收藏', 'ok')
      }
    } else {
      const { error: err } = await supabase.from('stars').insert({
        user_id: user.id,
        article_id: article.id,
      })
      if (err) {
        setError(err.message)
        showToast('收藏失败', 'error')
      } else {
        setStarred(true)
        showToast('已加入收藏', 'ok')
      }
    }
    setStarBusy(false)
  }

  const title = useMemo(
    () => ((article?.title_zh || '').trim() || article?.title || ''),
    [article],
  )
  const lead = useMemo(() => (article?.lead_zh || '').trim(), [article])
  const bodyText = useMemo(() => {
    const body = (article?.body_zh || '').trim()
    if (body) return body
    return (article?.summary_zh || '').trim() || (article?.summary || '').trim()
  }, [article])
  const paragraphs = useMemo(
    () => bodyText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean),
    [bodyText],
  )

  if (loading) {
    return (
      <article className="reader">
        <p className="muted">正在打开报道…</p>
      </article>
    )
  }

  if (!article) {
    return (
      <article className="reader">
        <p className="error">{error || '未找到这篇新闻。'}</p>
        <Link to="/" className="btn btn-sm">
          返回列表
        </Link>
      </article>
    )
  }

  const translated = Boolean((article.title_zh || '').trim())

  return (
    <article className="reader">
      <header className="reader-header">
        <div className="reader-nav">
          <Link to="/" className="linkish">
            ← 返回列表
          </Link>
          {user && (
            <button
              type="button"
              className={`star-btn wide ${starred ? 'on' : ''}`}
              disabled={starBusy}
              onClick={() => void toggleStar()}
            >
              {starBusy ? '处理中…' : starred ? '★ 已收藏' : '☆ 收藏'}
            </button>
          )}
        </div>

        <div className="reader-kicker">
          <span className="source">{article.source}</span>
          <span className="dot">·</span>
          <time dateTime={article.published_at ?? undefined}>{formatDate(article.published_at)}</time>
          <span className="dot">·</span>
          <span>约 {readingMinutes(lead + bodyText)} 分钟阅读</span>
        </div>

        <h1 className="reader-title">{title}</h1>

        {lead ? <p className="reader-lead">{lead}</p> : null}

        {!translated && (
          <p className="card-hint">中文译本尚未就绪，正文可能仍接近原文摘要。</p>
        )}
      </header>

      <div className="reader-body">
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {article.title && article.title !== title && (
        <p className="reader-original-title">原标题：{article.title}</p>
      )}

      {error && <p className="error">{error}</p>}

      <footer className="reader-footer">
        <div className="origin-card">
          <h2>原文出处</h2>
          <p>
            本页为根据公开 RSS 标题与摘要改写的中文阅读版，便于家人快速了解，并非媒体全文转载。
            完整报道与图片请打开原站。
          </p>
          <a className="btn" href={article.url} target="_blank" rel="noopener noreferrer">
            打开原文 · {article.source}
          </a>
        </div>
      </footer>
    </article>
  )
}
