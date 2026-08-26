import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { useAuth } from '../context/AuthContext'
import { useJobs } from '../context/JobsContext'
import { keywordAiReady, useKeywords } from '../context/KeywordsContext'
import { articleMatchesKeyword } from '../lib/normalize'
import { ARTICLE_LIST_COLUMNS, isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article, Keyword } from '../types'

const REFRESH_MS = 60_000
/** First paint / each "load more" batch — keep payloads small. */
const PAGE_SIZE = 40
/** When filtering hits client-side, scan this many hit pages per request. */
const MAX_SCAN_PAGES = 6

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

type HitRow = {
  article_id: string
  created_at?: string
  articles?: Article | Article[] | null
}

type RelRow = {
  article_id: string
  relevant: boolean
  created_at?: string
  articles?: Article | Article[] | null
}

function unwrapArticle(raw: Article | Article[] | null | undefined): Article | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

async function fetchRelevanceMap(
  kidList: string[],
  aidList: string[],
): Promise<Map<string, boolean>> {
  const relMap = new Map<string, boolean>()
  if (!kidList.length || !aidList.length) return relMap

  const chunkSize = 200
  const chunks: string[][] = []
  for (let i = 0; i < aidList.length; i += chunkSize) {
    chunks.push(aidList.slice(i, i + chunkSize))
  }

  const results = await Promise.all(
    chunks.map((aidChunk) =>
      supabase
        .from('article_keyword_relevance')
        .select('keyword_id, article_id, relevant')
        .in('keyword_id', kidList)
        .in('article_id', aidChunk),
    ),
  )

  for (const { data: relRows } of results) {
    for (const r of relRows ?? []) {
      const row = r as { keyword_id: string; article_id: string; relevant: boolean }
      relMap.set(`${row.keyword_id}:${row.article_id}`, Boolean(row.relevant))
    }
  }
  return relMap
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

type BatchResult = {
  list: Article[]
  matchedAt: Map<string, number>
  relMap: Map<string, boolean>
  exhausted: boolean
  nextOffset: number
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
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const offsetRef = useRef(0)
  const silentSizeRef = useRef(PAGE_SIZE)
  const loadGenRef = useRef(0)

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

  /**
   * Single-keyword feed: page directly from cached relevance positives.
   * All-keywords feed: page user hits, then apply per-keyword verdicts/rules.
   */
  const fetchBatch = useCallback(
    async (opts: {
      reset: boolean
      targetVisible: number
      ready: Keyword[]
      singleKeyword: Keyword | null
    }): Promise<BatchResult> => {
      const empty: BatchResult = {
        list: [],
        matchedAt: new Map(),
        relMap: new Map(),
        exhausted: true,
        nextOffset: 0,
      }
      if (!user || !isSupabaseConfigured || opts.ready.length === 0) return empty

      const matchedAt = new Map<string, number>()
      const relMap = new Map<string, boolean>()
      const list: Article[] = []
      const seen = new Set<string>()
      let offset = opts.reset ? 0 : offsetRef.current
      let exhausted = false

      // Fast path: one keyword → relevance table (already filtered server-side).
      if (opts.singleKeyword) {
        const kid = opts.singleKeyword.id
        const { data, error: relErr } = await supabase
          .from('article_keyword_relevance')
          .select(`article_id, relevant, created_at, articles(${ARTICLE_LIST_COLUMNS})`)
          .eq('keyword_id', kid)
          .eq('relevant', true)
          .order('created_at', { ascending: false })
          .range(offset, offset + opts.targetVisible - 1)

        if (relErr) throw new Error(relErr.message)

        const rows = (data as RelRow[]) ?? []
        if (rows.length < opts.targetVisible) exhausted = true
        offset += rows.length

        for (const row of rows) {
          const a = unwrapArticle(row.articles)
          if (!a || seen.has(a.id)) continue
          seen.add(a.id)
          list.push(a)
          relMap.set(`${kid}:${a.id}`, true)
          const t = Date.parse(row.created_at || '') || 0
          if (t > 0) matchedAt.set(a.id, t)
        }

        // First page only: pick up rule-only hits that never got a relevance row
        // (AI budget exhausted / AI off). Skip on "load more" to keep paging cheap.
        if (opts.reset && list.length < opts.targetVisible) {
          const { data: hitRows } = await supabase
            .from('article_hits')
            .select(`article_id, created_at, articles(${ARTICLE_LIST_COLUMNS})`)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)

          const pageArticles: Article[] = []
          const hitTimes = new Map<string, number>()
          for (const hit of (hitRows as HitRow[]) ?? []) {
            const a = unwrapArticle(hit.articles)
            if (!a || seen.has(a.id)) continue
            pageArticles.push(a)
            const t = Date.parse(hit.created_at || '') || 0
            if (t > 0) hitTimes.set(a.id, t)
          }

          if (pageArticles.length) {
            const pageRel = await fetchRelevanceMap(
              [kid],
              pageArticles.map((a) => a.id),
            )
            for (const [k, v] of pageRel) relMap.set(k, v)

            for (const a of pageArticles) {
              // Already decided irrelevant — stay hidden.
              if (relMap.get(`${kid}:${a.id}`) === false) continue
              if (!articleMatchesKeyword(a, opts.singleKeyword, relMap)) continue
              seen.add(a.id)
              list.push(a)
              const t = hitTimes.get(a.id) || 0
              if (t > 0) matchedAt.set(a.id, t)
            }
          }
        }

        list.sort((a, b) => {
          const ta = a.published_at ? Date.parse(a.published_at) : 0
          const tb = b.published_at ? Date.parse(b.published_at) : 0
          return tb - ta
        })
        return { list, matchedAt, relMap, exhausted, nextOffset: offset }
      }

      // All-keywords: scan hit pages until the visible list fills.
      const kids = opts.ready.map((k) => k.id).filter(Boolean)
      let pages = 0
      while (list.length < opts.targetVisible && pages < MAX_SCAN_PAGES) {
        const { data: hitRows, error: hitErr } = await supabase
          .from('article_hits')
          .select(`article_id, created_at, articles(${ARTICLE_LIST_COLUMNS})`)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)

        if (hitErr) throw new Error(hitErr.message)

        const rows = (hitRows as HitRow[]) ?? []
        if (rows.length < PAGE_SIZE) exhausted = true
        offset += rows.length
        pages += 1

        const pageArticles: Article[] = []
        for (const hit of rows) {
          const a = unwrapArticle(hit.articles)
          if (!a || seen.has(a.id)) continue
          seen.add(a.id)
          pageArticles.push(a)
          const t = Date.parse(hit.created_at || '') || 0
          if (t > 0) matchedAt.set(a.id, t)
        }

        if (pageArticles.length === 0) {
          if (exhausted) break
          continue
        }

        const pageRel = await fetchRelevanceMap(
          kids,
          pageArticles.map((a) => a.id),
        )
        for (const [k, v] of pageRel) relMap.set(k, v)

        for (const a of pageArticles) {
          if (opts.ready.some((k) => articleMatchesKeyword(a, k, relMap))) {
            list.push(a)
          }
        }

        if (exhausted) break
      }

      list.sort((a, b) => {
        const ta = a.published_at ? Date.parse(a.published_at) : 0
        const tb = b.published_at ? Date.parse(b.published_at) : 0
        return tb - ta
      })
      return { list, matchedAt, relMap, exhausted, nextOffset: offset }
    },
    [user],
  )

  const load = useCallback(
    async (mode: 'reset' | 'more' | 'silent') => {
      if (!isSupabaseConfigured || !user) {
        setArticles([])
        setStarredIds(new Set())
        setRelevance(new Map())
        setHitMatchedAt(new Map())
        setHasMore(false)
        setLoading(false)
        return
      }

      const gen = ++loadGenRef.current
      if (mode === 'more') setLoadingMore(true)
      else if (mode === 'reset') setLoading(true)
      setError(null)

      const ready = readyKeywords
      const single = all ? null : keyword && keywordAiReady(keyword) ? keyword : null
      const target =
        mode === 'silent' ? Math.max(PAGE_SIZE, silentSizeRef.current) : PAGE_SIZE

      try {
        const starsPromise = supabase.from('stars').select('article_id').eq('user_id', user.id)
        const batch = await fetchBatch({
          reset: mode !== 'more',
          targetVisible: target,
          ready,
          singleKeyword: single,
        })

        if (gen !== loadGenRef.current) return

        const { data: stars } = await starsPromise
        if (gen !== loadGenRef.current) return

        offsetRef.current = batch.nextOffset
        setStarredIds(new Set((stars ?? []).map((s: { article_id: string }) => s.article_id)))
        setHasMore(!batch.exhausted)

        if (mode === 'more') {
          setArticles((prev) => {
            const ids = new Set(prev.map((a) => a.id))
            const merged = [...prev]
            for (const a of batch.list) {
              if (!ids.has(a.id)) merged.push(a)
            }
            silentSizeRef.current = merged.length
            return merged
          })
          setHitMatchedAt((prev) => {
            const next = new Map(prev)
            for (const [k, v] of batch.matchedAt) next.set(k, v)
            return next
          })
          setRelevance((prev) => {
            const next = new Map(prev)
            for (const [k, v] of batch.relMap) next.set(k, v)
            return next
          })
        } else {
          setArticles(batch.list)
          setHitMatchedAt(batch.matchedAt)
          setRelevance(batch.relMap)
          silentSizeRef.current = batch.list.length
        }
      } catch (e) {
        if (gen !== loadGenRef.current) return
        setError(e instanceof Error ? e.message : String(e))
        if (mode === 'reset') {
          setArticles([])
          setHasMore(false)
        }
      } finally {
        if (gen === loadGenRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [user, readyKeywords, all, keyword, fetchBatch],
  )

  const readyKey = readyKeywords.map((k) => k.id).join(',')

  useEffect(() => {
    offsetRef.current = 0
    silentSizeRef.current = PAGE_SIZE
    void load('reset')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on feed identity
  }, [user?.id, readyKey, all, keywordId])

  useEffect(() => {
    const id = window.setInterval(() => void load('silent'), REFRESH_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, readyKey])

  useEffect(() => {
    if (!aiPending && !hasActive) return
    const id = window.setInterval(() => {
      void refresh({ quiet: true })
      void load('silent')
    }, 8_000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPending, hasActive, refresh, readyKey])

  const matchedKeywordsById = useMemo(() => {
    const map = new Map<string, string[]>()
    if (readyKeywords.length === 0) return map
    for (const a of articles) {
      const phrases = readyKeywords
        .filter((k) => articleMatchesKeyword(a, k, relevance))
        .map((k) => k.phrase)
      if (phrases.length) map.set(a.id, phrases)
    }
    return map
  }, [articles, readyKeywords, relevance])

  const lastUpdatedLabel = useMemo(() => {
    let latest = 0
    for (const job of jobs) {
      if (job.step !== 'crawl' && job.step !== 'translate') continue
      if (job.status !== 'done') continue
      const t = Date.parse(job.updated_at || job.created_at) || 0
      if (t > latest) latest = t
    }
    for (const a of articles) {
      const t = hitMatchedAt.get(a.id) || 0
      if (t > latest) latest = t
    }
    if (latest > 0) return formatUpdatedAt(latest)
    return null
  }, [jobs, articles, hitMatchedAt])

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
  const keywordsBooting = kwLoading && keywords.length === 0

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{all ? 'All Keywords' : 'Keyword Feed'}</p>
          <h1>{title}</h1>
          <p className="hero-lead">{keywordsBooting ? '加载关键词中…' : lead}</p>
          <p className="hero-updated">
            {loading || keywordsBooting
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
            {loading || keywordsBooting
              ? '加载中'
              : aiPending && !showFeed
                ? '处理中'
                : hasMore
                  ? `已显示 ${articles.length} 条`
                  : `${articles.length} 条`}
          </span>
        </div>

        {error && <p className="error">{error}</p>}

        {aiPending && (
          <AiProgressPanel pending={pendingKeywords} readyCount={readyKeywords.length} />
        )}

        {loading || keywordsBooting ? (
          !aiPending && <p className="muted">正在加载新闻…</p>
        ) : showFeed ? (
          articles.length === 0 ? (
            <div className="empty">
              <p>暂时没有匹配的新闻。</p>
              <p className="muted">
                {all
                  ? '当前订阅源里还没有足够贴近你关键词的报道，稍后再看。'
                  : `当前订阅源里还没有足够贴近「${keyword?.phrase}」的报道，稍后再看。`}
              </p>
            </div>
          ) : (
            <>
              <div className="story-list">
                {articles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    starred={starredIds.has(article.id)}
                    matchedKeywords={matchedKeywordsById.get(article.id)}
                    canStar
                    onToggleStar={() => void toggleStar(article.id)}
                  />
                ))}
              </div>
              {hasMore && (
                <div className="feed-more">
                  <button
                    type="button"
                    className="btn-ghost feed-more-btn"
                    disabled={loadingMore}
                    onClick={() => void load('more')}
                  >
                    {loadingMore ? '加载中…' : '加载更多'}
                  </button>
                </div>
              )}
            </>
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
