import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { Spinner } from '../components/Spinner'
import { VisualStage } from '../components/VisualStage'
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
    showToast('列表已更新', 'ok')
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
    setInfo('已开始更新，约一至三分钟后可刷新查看最新内容。')
    showToast('更新任务已启动', 'ok')
    window.setTimeout(() => void load({ quiet: true }), 45_000)
    window.setTimeout(() => void load({ quiet: true }), 90_000)
    window.setTimeout(() => {
      void load({ quiet: true })
      setCrawling(false)
      showToast('更新流程已结束，可再次刷新确认', 'info')
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
        showToast('已移出收藏', 'ok')
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

  const title = selected?.phrase || (user ? '选择专题' : '巴尔干时讯')
  const subtitle = !user
    ? '以关键词订阅巴尔干半岛主流媒体，阅读中文精编，收藏重要报道。'
    : !selected
      ? keywords.length === 0
        ? '点击左侧「+」创建首个专题，开始持续追踪。'
        : '请在左侧选择一个专题，查看对应要闻。'
      : pendingSelected
        ? '正在解析检索词，完成后将展示匹配报道。'
        : selected.ai_note || '以下为当前专题匹配的最新报道，点击标题阅读中文详情。'

  return (
    <section className="feed">
      <VisualStage src="./images/balkan-coast.jpg" variant="hero" />

      <div className="feed-header">
        <div>
          <p className="eyebrow">{user ? '专题要闻' : '今日速览'}</p>
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
              {crawling ? '更新中…' : '立即更新'}
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
            <strong>正在解析「{selected?.phrase}」</strong>
            <p>通常需要一至三分钟，侧栏专题旁会显示进度提示</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="muted">正在加载要闻…</p>
      ) : !user ? (
        <>
          <div className="card-grid">
            {articles.slice(0, 12).map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                starred={false}
                canStar={false}
              />
            ))}
          </div>
          {articles.length === 0 && (
            <div className="empty empty-scenic">
              <VisualStage src="./images/mountain-mist.jpg" variant="empty" />
              <div className="empty-copy">
                <p>暂无公开要闻</p>
                <p className="muted">
                  <Link to="/auth">登录</Link> 后创建专题，即可开始订阅。
                </p>
              </div>
            </div>
          )}
        </>
      ) : !selected ? (
        <div className="empty empty-scenic">
          <VisualStage src="./images/old-town.jpg" variant="empty" />
          <div className="empty-copy">
            <p>尚未选择专题</p>
            <p className="muted">使用左侧「+」创建关注主题，即可在此阅读对应新闻。</p>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty empty-scenic">
          <VisualStage src="./images/reading-desk.jpg" variant="empty" />
          <div className="empty-copy">
            {pendingSelected ? (
              <>
                <p>专题准备中</p>
                <p className="muted">检索词解析完成后，匹配报道将显示于此。</p>
              </>
            ) : (
              <>
                <p>暂无匹配报道</p>
                <p className="muted">
                  当前巴尔干主流媒体尚未出现足够贴近「{selected.phrase}」的内容。
                  可调整专题表述，或稍后再点「立即更新」。
                </p>
              </>
            )}
          </div>
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
