import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { useAuth } from '../context/AuthContext'
import { useJobs } from '../context/JobsContext'
import { keywordAiReady, useKeywords } from '../context/KeywordsContext'
import { articleMatchesKeyword } from '../lib/normalize'
import { ARTICLE_LIST_COLUMNS, isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article, Keyword } from '../types'

const REFRESH_MS = 60_000

function formatUpdatedAt(value: string | number | Date | null | undefined) {
  if (!value) return null
  try {
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return null
  }
}

type Props = {
  /** Show news for every keyword (parent「关键词」tab). */
  all?: boolean
}

function AiProgressPanel({
  pending,
  readyCount,
}: {
  pending: Keyword[]
  readyCount: number
}) {
  const names = pending.map((k) => k.phrase).join('、')
  return (
    <div className="ai-progress">
      <div className="ai-progress-bar" aria-hidden>
        <span className="ai-progress-bar-fill" />
      </div>
      <h3 className="ai-progress-title">AI 处理中</h3>
      <ol className="ai-progress-steps">
        <li className="is-done">已保存关键词{names ? `：${names}` : ''}</li>
        <li className="is-active">正在扩展检索词（通常约 3～5 秒）…</li>
        <li className={readyCount > 0 ? 'is-done' : ''}>
          {readyCount > 0
            ? `已有 ${readyCount} 个词就绪，抓取约 1～3 分钟后出新闻`
            : '扩展完成后会自动抓取匹配新闻'}
        </li>
      </ol>
      <p className="muted ai-progress-hint">
        「扩展」很快；之后的「抓取」是后台 Actions，整点任务不受影响。
      </p>
    </div>
  )
}

export function KeywordFeedPage({ all = false }: Props) {
  const { keywordId } = useParams()
  const { user } = useAuth()
  const { keywords, loading: kwLoading, refresh } = useKeywords()
  const { jobs, hasActive } = useJobs()
  const [articles, setArticles] = useState<Article[]>([])
  const [hitMatchedAt, setHitMatchedAt] = useState<Map<string, number>>(new Map())
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())
  const [relevance, setRelevance] = useState<Map<string, boolean>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const keyword = useMemo(
    () => (all ? null : keywords.find((k) => k.id === keywordId) ?? null),
    [all, keywords, keywordId],
  )

  const pendingKeywords = useMemo(() => {
    if (all) return keywords.filter((k) => !keywordAiReady(k))
    return keyword && !keywordAiReady(keyword) ? [keyword] : []
  }, [all, keywords, keyword])

  const readyKeywords = useMemo(() => {
    if (all) return keywords.filter(keywordAiReady)
    return keyword && keywordAiReady(keyword) ? [keyword] : []
  }, [all, keywords, keyword])

  const aiPending = pendingKeywords.length > 0
  const showFeed = readyKeywords.length > 0

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setArticles([])
      setStarredIds(new Set())
      setRelevance(new Map())
      setHitMatchedAt(new Map())
      setLoading(false)
      return
    }
    setError(null)

    const [{ data: stars }, { data: hitRows, error: hitErr }] = await Promise.all([
      supabase.from('stars').select('article_id').eq('user_id', user.id),
      supabase
        .from('article_hits')
        .select(`article_id, created_at, articles(${ARTICLE_LIST_COLUMNS})`)
        .eq('user_id', user.id),
    ])

    if (hitErr) {
      setError(hitErr.message)
      setLoading(false)
      return
    }

    const list: Article[] = []
    const matchedAt = new Map<string, number>()
    for (const row of hitRows ?? []) {
      const hit = row as {
        article_id: string
        created_at?: string
        articles?: Article | Article[] | null
      }
      const raw = hit.articles
      const a = Array.isArray(raw) ? raw[0] : raw
      if (!a) continue
      list.push(a)
      const t = Date.parse(hit.created_at || '') || 0
      if (t > 0) matchedAt.set(a.id, t)
    }
    list.sort((a, b) => {
      const ta = a.published_at ? Date.parse(a.published_at) : 0
      const tb = b.published_at ? Date.parse(b.published_at) : 0
      return tb - ta
    })
    const sliced = list.slice(0, 200)

    const kidList = keywords.map((k) => k.id).filter(Boolean)
    const aidList = sliced.map((a) => a.id).filter(Boolean)
    const relMap = new Map<string, boolean>()
    if (kidList.length && aidList.length) {
      const { data: relRows } = await supabase
        .from('article_keyword_relevance')
        .select('keyword_id, article_id, relevant')
        .in('keyword_id', kidList)
        .in('article_id', aidList)
      for (const r of relRows ?? []) {
        const row = r as { keyword_id: string; article_id: string; relevant: boolean }
        relMap.set(`${row.keyword_id}:${row.article_id}`, Boolean(row.relevant))
      }
    }

    setArticles(sliced)
    setHitMatchedAt(matchedAt)
    setRelevance(relMap)
    setStarredIds(new Set((stars ?? []).map((s: { article_id: string }) => s.article_id)))
    setLoading(false)
  }, [user, keywords])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load])

  // Faster refresh while expand/crawl/translate is running
  useEffect(() => {
    if (!aiPending && !hasActive) return
    const id = window.setInterval(() => {
      void refresh()
      void load()
    }, 8_000)
    return () => window.clearInterval(id)
  }, [aiPending, hasActive, refresh, load])

  const visible = useMemo(() => {
    if (readyKeywords.length === 0) return []
    return articles.filter((a) =>
      readyKeywords.some((k) => articleMatchesKeyword(a, k, relevance)),
    )
  }, [articles, readyKeywords, relevance])

  const matchedFor = useCallback(
    (article: Article) =>
      readyKeywords
        .filter((k) => articleMatchesKeyword(article, k, relevance))
        .map((k) => k.phrase),
    [readyKeywords, relevance],
  )

  const lastUpdatedLabel = useMemo(() => {
    let latest = 0
    // Crawl/translate job completion = when pipeline produced results
    for (const job of jobs) {
      if (job.step !== 'crawl' && job.step !== 'translate') continue
      if (job.status !== 'done') continue
      const t = Date.parse(job.updated_at || job.created_at) || 0
      if (t > latest) latest = t
    }
    // When this feed's hits were written by the crawler
    for (const a of visible) {
      const t = hitMatchedAt.get(a.id) || 0
      if (t > latest) latest = t
    }
    if (latest > 0) return formatUpdatedAt(latest)
    return null
  }, [jobs, visible, hitMatchedAt])

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

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  if (!all && !kwLoading && keywordId && !keyword) {
    return <Navigate to="/keywords" replace />
  }

  const title = all ? '全部关键词' : keyword?.phrase || '关键词新闻'
  const lead = all
    ? '汇总你所有关键词匹配到的报道。点标题阅读中文短讯，底部可打开原文。'
    : '仅显示与该关键词匹配的报道。点标题阅读中文短讯，底部可打开原文。'

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{all ? 'All Keywords' : 'Keyword Feed'}</p>
          <h1>{title}</h1>
          <p className="hero-lead">{kwLoading ? '加载关键词中…' : lead}</p>
          <p className="hero-updated">
            {loading || kwLoading
              ? '更新时间加载中…'
              : lastUpdatedLabel
                ? `上次抓取结果 ${lastUpdatedLabel}`
                : '暂无抓取结果'}
          </p>
        </div>
        <div className="hero-window" aria-hidden="true" />
      </section>

      <section className="glass-panel feed">
        <div className="panel-head">
          <h2>{aiPending && !showFeed ? 'AI 进程' : '匹配结果'}</h2>
          <span className="muted">
            {loading || kwLoading
              ? '加载中'
              : aiPending && !showFeed
                ? '处理中'
                : `${visible.length} 条`}
          </span>
        </div>

        {error && <p className="error">{error}</p>}

        {aiPending && (
          <AiProgressPanel pending={pendingKeywords} readyCount={readyKeywords.length} />
        )}

        {loading || kwLoading ? (
          !aiPending && <p className="muted">正在加载新闻…</p>
        ) : showFeed ? (
          visible.length === 0 ? (
            <div className="empty">
              <p>暂时没有匹配的新闻。</p>
              <p className="muted">
                {all
                  ? '当前订阅源里还没有足够贴近你关键词的报道，稍后再看。'
                  : `当前订阅源里还没有足够贴近「${keyword?.phrase}」的报道，稍后再看。`}
              </p>
            </div>
          ) : (
            <div className="story-list">
              {visible.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  starred={starredIds.has(article.id)}
                  matchedKeywords={matchedFor(article)}
                  canStar
                  onToggleStar={() => void toggleStar(article.id)}
                />
              ))}
            </div>
          )
        ) : !aiPending ? (
          <div className="empty">
            <p>{all ? '还没有关键词。' : '关键词不存在。'}</p>
            <p className="muted">
              {all ? '在左侧点「添加关键词」，在侧栏直接输入即可。' : '请从左侧重新选择。'}
            </p>
          </div>
        ) : null}
      </section>
    </>
  )
}
