import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article } from '../types'

type StarredRow = {
  article_id: string
  articles: Article | Article[] | null
}

export function StarsPage() {
  const { user } = useAuth()
  const [articles, setArticles] = useState<Article[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('stars')
      .select('article_id, articles(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (err) {
      setError(err.message)
      setArticles([])
    } else {
      const rows = (data as StarredRow[]) ?? []
      const list: Article[] = []
      for (const row of rows) {
        const a = Array.isArray(row.articles) ? row.articles[0] : row.articles
        if (a) list.push(a)
      }
      setArticles(list)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  async function unstar(articleId: string) {
    if (!user) return
    const { error: err } = await supabase
      .from('stars')
      .delete()
      .eq('user_id', user.id)
      .eq('article_id', articleId)
    if (err) setError(err.message)
    else setArticles((prev) => prev.filter((a) => a.id !== articleId))
  }

  if (!user) {
    return (
      <div className="auth-wrap">
        <section className="panel auth-card">
          <h1 className="page-title">收藏夹</h1>
          <p className="page-sub">
            请先 <Link className="auth-switch" to="/auth">登录</Link> 查看已收藏的新闻。
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <section className="panel auth-card auth-card-wide">
        <h1 className="page-title">收藏夹</h1>
        <p className="page-sub">
          {loading ? '加载中…' : `已收藏 ${articles.length} 条 · 点 ★ 可取消收藏`}
        </p>

        {error && <p className="error">{error}</p>}
        {loading ? (
          <p className="muted">加载中…</p>
        ) : articles.length === 0 ? (
          <div className="empty">
            <p>还没有收藏。</p>
            <p className="muted">
              打开 <Link to="/">新闻</Link>，点击 ★ 即可加入收藏夹。
            </p>
          </div>
        ) : (
          <div className="story-list">
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                starred
                canStar
                onToggleStar={() => void unstar(article.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
