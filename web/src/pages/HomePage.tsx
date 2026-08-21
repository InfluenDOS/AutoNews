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
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [crawling, setCrawling] = useState(false)

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

  const visible = useMemo(() => {
    if (!user) return articles
    if (phrases.length === 0) return []
    return articles.filter((a) => articleMatchesKeywords(a, phrases))
  }, [articles, phrases, user])

  async function triggerCrawl() {
    if (!user) return
    setCrawling(true)
    setError(null)
    setInfo(null)
    const { data, error: err } = await supabase.rpc('enqueue_crawl')
    if (err) {
      setError(err.message)
      setCrawling(false)
      return
    }
    const msg =
      (data as { message?: string } | null)?.message ||
      '已触发抓取，请约 1～3 分钟后点刷新'
    setInfo(msg)
    // Auto-refresh a few times while Actions runs
    window.setTimeout(() => void load(), 45_000)
    window.setTimeout(() => void load(), 90_000)
    window.setTimeout(() => {
      void load()
      setCrawling(false)
    }, 150_000)
  }

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
                ? '情报筛选中：只显示命中你关键词的报道。'
                : '先部署关键词，系统才会开始采集。'
              : '登录后配置关键词，开始追踪塞尔维亚相关情报。'}
          </p>
        </div>
        <div className="feed-controls">
          {user && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={crawling}
              onClick={() => void triggerCrawl()}
            >
              {crawling ? '抓取中…' : '手动抓取'}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load()}>
            刷新
          </button>
          {user && (
            <Link className="btn btn-sm btn-ghost" to="/keywords">
              管理关键词
            </Link>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {info && <p className="ok">{info}</p>}
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
                当前 RSS 中没有命中你关键词的报道。可点「手动抓取」立刻跑一轮，或换更宽的关键词。
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
