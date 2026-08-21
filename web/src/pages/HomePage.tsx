import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { requestCrawl } from '../lib/crawl'
import { articleMatchesKeywords, keywordMatchTerms } from '../lib/normalize'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article, Keyword } from '../types'

const REFRESH_MS = 60_000

export function HomePage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [articles, setArticles] = useState<Article[]>([])
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [starringId, setStarringId] = useState<string | null>(null)

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!isSupabaseConfigured) {
        setLoading(false)
        return
      }
      if (!opts?.quiet) setError(null)
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
    },
    [user],
  )

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load({ quiet: true }), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load])

  const phrases = useMemo(
    () => keywords.flatMap((k) => keywordMatchTerms(k)),
    [keywords],
  )

  const pendingKeywords = useMemo(
    () => keywords.filter((k) => !(k.search_terms || []).length).length,
    [keywords],
  )

  const visible = useMemo(() => {
    if (!user) return articles
    if (phrases.length === 0) return []
    return articles.filter((a) => articleMatchesKeywords(a, phrases))
  }, [articles, phrases, user])

  async function onRefresh() {
    if (refreshing) return
    setRefreshing(true)
    await load()
    showToast('已刷新', 'ok')
    setRefreshing(false)
  }

  async function triggerCrawl() {
    if (!user || crawling) return
    setCrawling(true)
    setError(null)
    setInfo(null)
    const result = await requestCrawl()
    if (!result.ok) {
      setError(result.message)
      showToast(result.message, 'error')
      setCrawling(false)
      return
    }
    setInfo('已触发抓取，约 1～3 分钟后会自动刷新；也可点「刷新」')
    showToast('已开始抓取', 'ok')
    window.setTimeout(() => void load({ quiet: true }), 45_000)
    window.setTimeout(() => void load({ quiet: true }), 90_000)
    window.setTimeout(() => {
      void load({ quiet: true })
      setCrawling(false)
      showToast('抓取流程应已结束，可再点刷新', 'info')
    }, 150_000)
  }

  async function toggleStar(articleId: string) {
    if (!user || starringId) return
    setStarringId(articleId)
    const starred = starredIds.has(articleId)
    if (starred) {
      const { error: err } = await supabase
        .from('stars')
        .delete()
        .eq('user_id', user.id)
        .eq('article_id', articleId)
      if (err) {
        setError(err.message)
        showToast('取消收藏失败', 'error')
      } else {
        setStarredIds((prev) => {
          const next = new Set(prev)
          next.delete(articleId)
          return next
        })
        showToast('已取消收藏', 'ok')
      }
    } else {
      const { error: err } = await supabase.from('stars').insert({
        user_id: user.id,
        article_id: articleId,
      })
      if (err) {
        setError(err.message)
        showToast('收藏失败', 'error')
      } else {
        setStarredIds((prev) => new Set(prev).add(articleId))
        showToast('已加入收藏', 'ok')
      }
    }
    setStarringId(null)
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
          <h1>今天的新闻</h1>
          <p className="muted">
            {user
              ? phrases.length > 0
                ? '已按你的关键词筛选，点标题可阅读中文详情。'
                : pendingKeywords > 0
                  ? `有 ${pendingKeywords} 个关键词还在 AI 提炼中，完成后才会出现匹配新闻。`
                  : '先去添加关键词，我们才会开始帮你找新闻。'
              : '登录后就能订阅关键词，并把喜欢的新闻收进收藏夹。'}
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
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={refreshing || loading}
            onClick={() => void onRefresh()}
          >
            {refreshing ? '刷新中…' : '刷新'}
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
              <p>{pendingKeywords > 0 ? '关键词还在准备中。' : '还没有关键词。'}</p>
              <p className="muted">
                去 <Link to="/keywords">关键词</Link>
                {pendingKeywords > 0
                  ? ' 查看 AI 进度；提炼完成后回这里刷新即可。'
                  : ' 用中文描述你想关注的内容。'}
              </p>
            </>
          ) : (
            <>
              <p>暂时没有匹配的新闻。</p>
              <p className="muted">
                这说明当前塞尔维亚主流媒体 RSS 里，还没有足够贴近你关键词的报道。
                系统不会再展示无关新闻。可换更宽/更具体的关键词，或稍后再点「手动抓取」。
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
              starBusy={starringId === article.id}
              onToggleStar={() => void toggleStar(article.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
