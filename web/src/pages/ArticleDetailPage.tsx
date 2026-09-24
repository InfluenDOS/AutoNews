import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fullStamp } from '../lib/dates'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article } from '../types'

// The reader never shows `body` (source text) or `raw_text_normalized`; skip them.
const READER_COLUMNS =
  'id, source, title, summary, title_zh, summary_zh, lead_zh, body_zh, url, published_at, created_at'

function readingMinutes(text: string) {
  const chars = text.replace(/\s/g, '').length
  return Math.max(1, Math.ceil(chars / 400))
}

export function ArticleDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [article, setArticle] = useState<Article | null>(null)
  const [starred, setStarred] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id || !isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.from('articles').select(READER_COLUMNS).eq('id', id).maybeSingle()
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
    if (!user || !article) return
    if (starred) {
      const { error: err } = await supabase
        .from('stars')
        .delete()
        .eq('user_id', user.id)
        .eq('article_id', article.id)
      if (err) setError(err.message)
      else setStarred(false)
    } else {
      const { error: err } = await supabase.from('stars').insert({
        user_id: user.id,
        article_id: article.id,
      })
      if (err) setError(err.message)
      else setStarred(true)
    }
  }

  function goBack() {
    // HashRouter keeps an index in history.state; go back only within the app.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/')
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
        <p className="loading-line">正在打开报道…</p>
      </article>
    )
  }

  if (!article) {
    return (
      <article className="reader">
        <p className="notice notice-error">{error || '未找到这篇新闻。'}</p>
        <Link to="/" className="btn btn-outline">
          返回首页
        </Link>
      </article>
    )
  }

  const translated = Boolean((article.title_zh || '').trim())
  const when = article.published_at ?? article.created_at

  return (
    <article className="reader">
      <nav className="reader-nav">
        <button type="button" className="back-link" onClick={goBack}>
          ← 返回
        </button>
        <button
          type="button"
          className={`star star-labeled${starred ? ' is-on' : ''}`}
          aria-pressed={user ? starred : undefined}
          onClick={() => {
            if (!user) {
              navigate('/auth')
              return
            }
            void toggleStar()
          }}
          title={user ? undefined : '登录后即可收藏'}
        >
          {starred ? '★ 已收藏' : '☆ 收藏'}
        </button>
      </nav>

      <header className="reader-head">
        <p className="kicker">
          <span className="reader-source">{article.source}</span>
          <span aria-hidden> · </span>
          <time dateTime={when ?? undefined}>{fullStamp(when)}</time>
          <span aria-hidden> · </span>
          <span>约 {readingMinutes(lead + bodyText)} 分钟</span>
        </p>
        <h1 className="reader-title">{title}</h1>
        {lead ? <p className="reader-lead">{lead}</p> : null}
        {!translated && (
          <p className="notice">中文改写尚未完成，正文可能仍接近原文摘要。</p>
        )}
      </header>

      <div className="reader-body">
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {article.title && article.title !== title && (
        <p className="reader-original">
          <span className="kicker">原标题</span>
          {article.title}
        </p>
      )}

      {error && <p className="notice notice-error">{error}</p>}

      <footer className="reader-origin">
        <p>
          本页是根据原报道改写的中文阅读版，并非全文转载。完整报道与图片请看原站。
        </p>
        <a className="btn btn-solid" href={article.url} target="_blank" rel="noopener noreferrer">
          阅读原文 · {article.source} ↗
        </a>
      </footer>
    </article>
  )
}
