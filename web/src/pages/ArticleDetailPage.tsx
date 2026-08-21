import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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

export function ArticleDetailPage() {
  const { id } = useParams()
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

  if (loading) {
    return (
      <section className="panel article-detail">
        <p className="muted">加载中…</p>
      </section>
    )
  }

  if (!article) {
    return (
      <section className="panel article-detail">
        <p className="error">{error || '未找到这篇新闻。'}</p>
        <Link to="/" className="btn btn-sm">
          返回列表
        </Link>
      </section>
    )
  }

  const title = (article.title_zh || '').trim() || article.title
  const body = (article.summary_zh || '').trim() || article.summary || '暂无中文正文，请稍后再看或查看原文。'
  const translated = Boolean((article.title_zh || '').trim())

  return (
    <section className="panel article-detail">
      <div className="detail-top">
        <Link to="/" className="linkish">
          ← 返回列表
        </Link>
        {user && (
          <button
            type="button"
            className={`star-btn wide ${starred ? 'on' : ''}`}
            onClick={() => void toggleStar()}
            aria-label={starred ? '取消收藏' : '加入收藏'}
          >
            {starred ? '★ 已收藏' : '☆ 收藏'}
          </button>
        )}
      </div>

      <div className="card-meta detail-meta">
        <span className="source">{article.source}</span>
        <time dateTime={article.published_at ?? undefined}>{formatDate(article.published_at)}</time>
      </div>

      <h1 className="detail-title">{title}</h1>

      {!translated && <p className="card-hint">中文译文生成中，下方可能仍显示原文摘要。</p>}

      <div className="detail-body">
        {body.split(/\n+/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="detail-footer">
        <p className="muted">本页为 AI 根据媒体摘要改写的中文阅读版，非原文全文转载。</p>
        <a
          className="btn"
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          查看原文链接
        </a>
      </div>
    </section>
  )
}
