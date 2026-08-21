import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { useAuth } from '../context/AuthContext'
import { articleMatchesKeywords, keywordMatchTerms } from '../lib/normalize'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article, Keyword } from '../types'

const REFRESH_MS = 60_000

export function HomePage() {
  const { user } = useAuth()
  const [articles, setArticles] = useState<Article[]>([])
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setError(null)
    const articlesQuery = supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(200)

    const { data: articleRows, error: articleErr } = await articlesQuery
    if (articleErr) {
      setError(articleErr.message)
      setLoading(false)
      return
    }
    setArticles((articleRows as Article[]) ?? [])

    if (user) {
      const [{ data: kw }, { data: stars }] = await Promise.all([
        supabase.from('keywords').select('*').eq('user_id', user.id),
        supabase.from('stars').select('article_id').eq('user_id', user.id),
      ])
      setKeywords((kw as Keyword[]) ?? [])
      setStarredIds(new Set((stars ?? []).map((s: { article_id: string }) => s.article_id)))
    } else {
      setKeywords([])
      setStarredIds(new Set())
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load])

  const phrases = useMemo(
    () => keywords.flatMap((k) => keywordMatchTerms(k)),
    [keywords],
  )

  // Only show articles matching the logged-in user's keywords.
  // Guests see the keyword-matched pool (already filtered at crawl time).
  const visible = useMemo(() => {
    if (!user) return articles
    if (phrases.length === 0) return []
    return articles.filter((a) => articleMatchesKeywords(a, phrases))
  }, [articles, phrases, user])

  async function toggleStar(articleId: string) {
    if (!user) return
    const starred = starredIds.has(articleId)
    if (starred) {
      const { error: err } = await supabase
        .from('stars')
        .delete()
        .eq('user_id', user.id)
        .eq('article_id', articleId)
      if (err) {
        setError(err.message)
        return
      }
      setStarredIds((prev) => {
        const next = new Set(prev)
        next.delete(articleId)
        return next
      })
    } else {
      const { error: err } = await supabase.from('stars').insert({
        user_id: user.id,
        article_id: articleId,
      })
      if (err) {
        setError(err.message)
        return
      }
      setStarredIds((prev) => new Set(prev).add(articleId))
    }
  }

  function matchedFor(article: Article): string[] {
    if (keywords.length === 0) return []
    return keywords
      .filter((kw) => articleMatchesKeywords(article, keywordMatchTerms(kw)))
      .map((kw) => kw.phrase)
  }

  return (
    <section className="feed">
      <div className="feed-header">
        <div>
          <h1>关键词新闻</h1>
          <p className="muted">
            {user
              ? phrases.length > 0
                ? '只显示与你的关键词匹配的新闻（爬虫也不会入库无关内容）。'
                : '请先添加中文关键词；没有关键词时不会抓取新闻。'
              : '登录并添加关键词后，将只抓取并展示相关新闻。'}
          </p>
        </div>
        <div className="feed-controls">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load()}>
            刷新
          </button>
          {user && (
            <Link className="btn btn-sm" to="/keywords">
              管理关键词
            </Link>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">正在加载新闻…</p>
      ) : visible.length === 0 ? (
        <div className="empty">
          {user && phrases.length === 0 ? (
            <>
              <p>还没有关键词。</p>
              <p className="muted">
                去 <Link to="/keywords">关键词</Link> 用中文描述你想关注的内容。
              </p>
            </>
          ) : (
            <>
              <p>暂时没有匹配的新闻。</p>
              <p className="muted">
                当前 RSS 中没有命中你关键词的报道。系统只会入库相关新闻；可稍后再刷新，或换一个更宽的关键词。
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="card-grid">
          {visible.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              starred={starredIds.has(article.id)}
              matchedKeywords={user ? matchedFor(article) : undefined}
              canStar={Boolean(user)}
              onToggleStar={() => void toggleStar(article.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
