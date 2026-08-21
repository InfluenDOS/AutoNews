import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article } from '../types'

type StarredRow = {
  article_id: string
  articles: Article | Article[] | null
}

export function StarsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [articles, setArticles] = useState<Article[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [starringId, setStarringId] = useState<string | null>(null)

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
    if (!user || starringId) return
    setStarringId(articleId)
    const { error: err } = await supabase
      .from('stars')
      .delete()
      .eq('user_id', user.id)
      .eq('article_id', articleId)
    if (err) {
      setError(err.message)
      showToast('取消收藏失败', 'error')
    } else {
      setArticles((prev) => prev.filter((a) => a.id !== articleId))
      showToast('已取消收藏', 'ok')
    }
    setStarringId(null)
  }

  if (!user) {
    return (
      <section className="panel">
        <h1>收藏夹</h1>
        <p className="muted">
          请先 <Link to="/auth">登录</Link> 查看已收藏的新闻。
        </p>
      </section>
    )
  }

  return (
    <section className="feed">
      <div className="feed-header">
        <div>
          <h1>收藏夹</h1>
          <p className="muted">您收藏的报道都在这里，便于回看与分享。</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">加载中…</p>
      ) : articles.length === 0 ? (
        <div className="empty">
          <p>还没有收藏。</p>
          <p className="muted">
            打开 <Link to="/">要闻</Link>，点击 ★ 即可加入收藏。
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              starred
              canStar
              starBusy={starringId === article.id}
              onToggleStar={() => void unstar(article.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
