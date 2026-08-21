import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useKeywordWorkspace } from '../context/KeywordWorkspace'
import { useToast } from '../context/ToastContext'
import { requestCrawl } from '../lib/crawl'
import { articleMatchesKeywords, keywordMatchTerms } from '../lib/normalize'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article } from '../types'

const REFRESH_MS = 60_000

export function HomePage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { selected, keywords, refreshKeywords } = useKeywordWorkspace()
  const [articles, setArticles] = useState<Article[]>([])
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
      const { data: articleRows, error: articleErr } = await supabase
        .from('articles')
        .select('*')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(300)

      if (articleErr) {
        setError(articleErr.message)
        setLoading(false)
        return
      }
      setArticles((articleRows as Article[]) ?? [])

      if (user) {
        const { data: stars } = await supabase
          .from('stars')
          .select('article_id')
          .eq('user_id', user.id)
        setStarredIds(new Set((stars ?? []).map((s: { article_id: string }) => s.article_id)))
        await refreshKeywords({ quiet: true })
      } else {
        setStarredIds(new Set())
      }
      setLoading(false)
    },
    [user, refreshKeywords],
  )

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load({ quiet: true }), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load])

  const phrases = useMemo(
    () => (selected ? keywordMatchTerms(selected) : []),
    [selected],
  )

  const pendingSelected = Boolean(selected && !(selected.search_terms || []).length)

  const visible = useMemo(() => {
    if (!user) return articles
    if (!selected) return []
    if (phrases.length === 0) return []
    return articles.filter((a) => articleMatchesKeywords(a, phrases))
  }, [articles, phrases, user, selected])

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

  const title = selected?.phrase || (user ? '选择关键词' : '今天的新闻')
  const subtitle = !user
    ? '登录后可在左侧添加关键词，并按关键词浏览匹配新闻。'
    : !selected
      ? keywords.length === 0
        ? '点击左侧「+」添加第一个关键词。'
        : '在左侧选择一个关键词查看对应新闻。'
      : pendingSelected
        ? '该关键词正在 AI 提炼检索词，完成后会出现匹配新闻。'
        : selected.ai_note || '已按当前关键词筛选，点标题可阅读中文详情。'

  return (
    <section className="feed">
      <div className="feed-header">
        <div>
          <p className="eyebrow">{user ? 'Keyword feed' : 'Welcome'}</p>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
          {selected && (selected.search_terms || []).length > 0 && (
            <p className="kw-terms feed-terms">
              检索词：{(selected.search_terms || []).join(' · ')}
            </p>
          )}
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
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {info && <p className="ok">{info}</p>}
      {user && pendingSelected && (
        <div className="ai-processing-banner" role="status">
          <Spinner size="md" />
          <div>
            <strong>AI 正在处理「{selected?.phrase}」</strong>
            <p>约 1～3 分钟 · 左侧该关键词旁有转圈提示</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="muted">正在加载新闻…</p>
      ) : !user ? (
        <div className="card-grid">
          {articles.slice(0, 12).map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              starred={false}
              canStar={false}
            />
          ))}
          {articles.length === 0 && (
            <div className="empty">
              <p>暂无公开新闻。</p>
              <p className="muted">
                <Link to="/auth">登录</Link> 后添加关键词开始订阅。
              </p>
            </div>
          )}
        </div>
      ) : !selected ? (
        <div className="empty">
          <p>还没有选中的关键词。</p>
          <p className="muted">用左侧「+」新建一个关注点即可。</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          {pendingSelected ? (
            <>
              <p>关键词还在准备中。</p>
              <p className="muted">提炼完成后，匹配新闻会出现在这里。</p>
            </>
          ) : (
            <>
              <p>暂时没有匹配的新闻。</p>
              <p className="muted">
                当前巴尔干主流媒体 RSS 里还没有足够贴近「{selected.phrase}」的报道。
                可换更宽/更具体的关键词，或稍后再点「手动抓取」。
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
              canStar
              starBusy={starringId === article.id}
              onToggleStar={() => void toggleStar(article.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
