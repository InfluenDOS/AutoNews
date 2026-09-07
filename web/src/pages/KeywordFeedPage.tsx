import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { FeedPager } from '../components/FeedPager'
import { useAuth } from '../context/AuthContext'
import { useJobs, useJobsRefresh, useJobsStatus } from '../context/JobsContext'
import { keywordAiReady, useKeywords } from '../context/KeywordsContext'
import { useSources } from '../context/SourcesContext'
import { formatCountdown, useCrawlTrigger } from '../hooks/useCrawlTrigger'
import { usePageParam } from '../hooks/usePageParam'
import { reuseArticleList, sameStringSet } from '../lib/listSnapshot'
import { articleMatchesKeyword } from '../lib/normalize'
import { isNewsSource } from '../lib/sources'
import { loadGroupedStories } from '../lib/storyGroups'
import type { StoryGroup } from '../lib/storyDedup'
import { ARTICLE_LIST_COLUMNS, isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article, Keyword } from '../types'

const REFRESH_MS = 60_000
const PAGE_SIZE = 20
/** Hit pages to scan while filling one visible page (all-keywords). */
const MAX_SCAN_PAGES = 80

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

/** Exact relevant-row count for one keyword, or distinct article ids across many. */
async function countRelevantArticles(keywordIds: string[]): Promise<number> {
  const kids = keywordIds.filter(Boolean)
  if (kids.length === 0) return 0

  if (kids.length === 1) {
    const { count, error } = await supabase
      .from('article_keyword_relevance')
      .select('article_id', { count: 'exact', head: true })
      .eq('keyword_id', kids[0])
      .eq('relevant', true)
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  const seen = new Set<string>()
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from('article_keyword_relevance')
      .select('article_id')
      .in('keyword_id', kids)
      .eq('relevant', true)
      .range(offset, offset + 999)
    if (error) throw new Error(error.message)
    const rows = (data as { article_id: string }[]) ?? []
    for (const row of rows) seen.add(row.article_id)
    if (rows.length < 1000) break
    offset += 1000
    if (offset >= 20_000) break
  }
  return seen.size
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

function LastUpdatedLine({ loading, latestHit }: { loading: boolean; latestHit: number }) {
  const { jobs } = useJobs()
  const label = useMemo(() => {
    let latest = latestHit
    for (const job of jobs) {
      if (job.step !== 'crawl' && job.step !== 'translate') continue
      if (job.status !== 'done') continue
      const t = Date.parse(job.updated_at || job.created_at) || 0
      if (t > latest) latest = t
    }
    return latest > 0 ? formatUpdatedAt(latest) : null
  }, [jobs, latestHit])

  return (
    <p className="hero-updated">
      {loading ? '更新时间加载中…' : label ? `上次抓取结果 ${label}` : '暂无抓取结果'}
    </p>
  )
}

function HeroCrawl({
  keywordId,
  onTriggered,
}: {
  keywordId?: string | null
  onTriggered: () => void
}) {
  const crawl = useCrawlTrigger()
  return (
    <div className="hero-cta">
      {crawl.cooling && (
        <span className="hero-cooldown" aria-live="polite">
          {formatCountdown(crawl.remaining)}
        </span>
      )}
      <button
        type="button"
        className="btn btn-solid btn-crawl"
        disabled={crawl.busy || crawl.cooling}
        onClick={() => {
          void crawl.trigger(keywordId).then((result) => {
            if (result.triggered) onTriggered()
          })
        }}
      >
        {crawl.busy ? '触发中…' : '手动抓取'}
      </button>
      {crawl.error && <p className="hero-crawl-error">{crawl.error}</p>}
    </div>
  )
}

type BatchResult = {
  list: Article[]
  matchedAt: Map<string, number>
  relMap: Map<string, boolean>
  exhausted: boolean
  totalPages: number | null
}

export function KeywordFeedPage({ all = false }: Props) {
  const { keywordId } = useParams()
  const { user } = useAuth()
  const { keywords, loading: kwLoading, refresh } = useKeywords()
  const { extraNewsNames } = useSources()
  const { hasActive } = useJobsStatus()
  const refreshJobs = useJobsRefresh()
  const [page, setPage] = usePageParam()
  const [articles, setArticles] = useState<Article[]>([])
  const [hitMatchedAt, setHitMatchedAt] = useState<Map<string, number>>(new Map())
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())
  const [relevance, setRelevance] = useState<Map<string, boolean>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [totalPages, setTotalPages] = useState(1)
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([])
  const loadGenRef = useRef(0)
  const feedKeyRef = useRef('')
  const matchCountRef = useRef<{ key: string; count: number } | null>(null)

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
  const readyKey = readyKeywords.map((k) => k.id).join(',')
  const feedKey = `${user?.id ?? ''}:${readyKey}:${all}:${keywordId ?? ''}`

  useEffect(() => {
    if (feedKeyRef.current && feedKeyRef.current !== feedKey) {
      matchCountRef.current = null
      if (page !== 1) setPage(1)
    }
    feedKeyRef.current = feedKey
  }, [feedKey, page, setPage])

  const fetchBatch = useCallback(
    async (opts: {
      page: number
      ready: Keyword[]
      singleKeyword: Keyword | null
    }): Promise<BatchResult> => {
      const empty: BatchResult = {
        list: [],
        matchedAt: new Map(),
        relMap: new Map(),
        exhausted: true,
        totalPages: 1,
      }
      if (!user || !isSupabaseConfigured || opts.ready.length === 0) return empty

      const matchedAt = new Map<string, number>()
      const relMap = new Map<string, boolean>()
      const list: Article[] = []
      const seen = new Set<string>()
      const pageIndex = Math.max(1, opts.page)
      const offset = (pageIndex - 1) * PAGE_SIZE

      if (opts.singleKeyword) {
        const kid = opts.singleKeyword.id
        const relRes = await supabase
          .from('article_keyword_relevance')
          .select(`article_id, relevant, created_at, articles(${ARTICLE_LIST_COLUMNS})`)
          .eq('keyword_id', kid)
          .eq('relevant', true)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)

        if (relRes.error) throw new Error(relRes.error.message)
        const rows = (relRes.data as RelRow[]) ?? []
        const exhausted = rows.length < PAGE_SIZE

        for (const row of rows) {
          const a = unwrapArticle(row.articles)
          if (!a || seen.has(a.id) || !isNewsSource(a.source, extraNewsNames)) continue
          seen.add(a.id)
          list.push(a)
          relMap.set(`${kid}:${a.id}`, true)
          const t = Date.parse(row.created_at || '') || 0
          if (t > 0) matchedAt.set(a.id, t)
        }

        if (pageIndex === 1 && list.length < PAGE_SIZE) {
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
            if (!a || seen.has(a.id) || !isNewsSource(a.source, extraNewsNames)) continue
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
              if (list.length >= PAGE_SIZE) break
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
        return {
          list,
          matchedAt,
          relMap,
          exhausted,
          totalPages: null,
        }
      }

      const kids = opts.ready.map((k) => k.id).filter(Boolean)
      const skip = offset
      const need = skip + PAGE_SIZE
      const collected: Article[] = []
      let hitOffset = 0
      let exhausted = false
      let pages = 0
      const maxScan = Math.min(MAX_SCAN_PAGES, Math.max(12, Math.ceil(need / 3) + 8))

      while (collected.length < need && pages < maxScan) {
        const { data: hitRows, error: hitErr } = await supabase
          .from('article_hits')
          .select(`article_id, created_at, articles(${ARTICLE_LIST_COLUMNS})`)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(hitOffset, hitOffset + PAGE_SIZE - 1)

        if (hitErr) throw new Error(hitErr.message)

        const rows = (hitRows as HitRow[]) ?? []
        if (rows.length < PAGE_SIZE) exhausted = true
        hitOffset += rows.length
        pages += 1

        const pageArticles: Article[] = []
        for (const hit of rows) {
          const a = unwrapArticle(hit.articles)
          if (!a || seen.has(a.id) || !isNewsSource(a.source, extraNewsNames)) continue
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
            collected.push(a)
          }
        }

        if (exhausted) break
      }

      const pageList = collected.slice(skip, skip + PAGE_SIZE)
      pageList.sort((a, b) => {
        const ta = a.published_at ? Date.parse(a.published_at) : 0
        const tb = b.published_at ? Date.parse(b.published_at) : 0
        return tb - ta
      })
      const hasMore = collected.length > skip + pageList.length || (!exhausted && pageList.length === PAGE_SIZE)
      return {
        list: pageList,
        matchedAt,
        relMap,
        exhausted: !hasMore,
        totalPages: null,
      }
    },
    [user, extraNewsNames],
  )

  const load = useCallback(
    async (mode: 'reset' | 'silent') => {
      if (!isSupabaseConfigured || !user) {
        setArticles([])
        setStoryGroups([])
        setStarredIds(new Set())
        setRelevance(new Map())
        setHitMatchedAt(new Map())
        setTotalPages(1)
        setLoading(false)
        return
      }

      const gen = ++loadGenRef.current
      if (mode === 'reset') setLoading(true)
      setError(null)

      const ready = readyKeywords
      const single = all ? null : keyword && keywordAiReady(keyword) ? keyword : null
      const countKey = feedKey
      const cachedCount =
        matchCountRef.current?.key === countKey ? matchCountRef.current.count : null

      try {
        const starsPromise = supabase.from('stars').select('article_id').eq('user_id', user.id)
        const countPromise =
          cachedCount != null && mode !== 'silent'
            ? Promise.resolve(cachedCount)
            : countRelevantArticles(
                single ? [single.id] : ready.map((k) => k.id).filter(Boolean),
              )
        const [batch, matchCount] = await Promise.all([
          fetchBatch({
            page,
            ready,
            singleKeyword: single,
          }),
          countPromise,
        ])

        if (gen !== loadGenRef.current) return

        const { data: stars } = await starsPromise
        if (gen !== loadGenRef.current) return

        const nextStars = new Set((stars ?? []).map((s: { article_id: string }) => s.article_id))
        setStarredIds((prev) => (sameStringSet(prev, nextStars) ? prev : nextStars))
        matchCountRef.current = { key: countKey, count: matchCount }
        const pagesFromCount = Math.max(1, Math.ceil(matchCount / PAGE_SIZE))
        setTotalPages(batch.totalPages ?? pagesFromCount)

        if (batch.list.length === 0 && page > 1) {
          setPage(page - 1)
          return
        }

        setArticles((prev) => reuseArticleList(prev, batch.list))
        setHitMatchedAt(batch.matchedAt)
        setRelevance(batch.relMap)
        const grouped = await loadGroupedStories(batch.list)
        if (gen !== loadGenRef.current) return
        setStoryGroups(grouped)
      } catch (e) {
        if (gen !== loadGenRef.current) return
        setError(e instanceof Error ? e.message : String(e))
        if (mode === 'reset') {
          setArticles([])
          setStoryGroups([])
          setTotalPages(1)
        }
      } finally {
        if (gen === loadGenRef.current) setLoading(false)
      }
    },
    [user, readyKeywords, all, keyword, fetchBatch, page, setPage, feedKey],
  )

  useEffect(() => {
    void load('reset')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on feed identity / page
  }, [user?.id, readyKey, all, keywordId, page])

  useEffect(() => {
    const id = window.setInterval(() => void load('silent'), REFRESH_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, readyKey, page])

  useEffect(() => {
    if (!aiPending && !hasActive) return
    const id = window.setInterval(() => {
      void refresh({ quiet: true })
      void load('silent')
    }, 8_000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPending, hasActive, refresh, readyKey, page])

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

  const latestHit = useMemo(() => {
    let latest = 0
    for (const a of articles) {
      const t = hitMatchedAt.get(a.id) || 0
      if (t > latest) latest = t
    }
    return latest
  }, [articles, hitMatchedAt])

  const starredIdsRef = useRef(starredIds)
  starredIdsRef.current = starredIds

  const toggleStar = useCallback(
    async (articleId: string) => {
      if (!user) return
      const starred = starredIdsRef.current.has(articleId)
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
    },
    [user],
  )

  const onCrawlTriggered = useCallback(() => {
    void refreshJobs()
  }, [refreshJobs])

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
          <div className="hero-footer">
            <LastUpdatedLine loading={loading || keywordsBooting} latestHit={latestHit} />
            <HeroCrawl keywordId={all ? null : keyword?.id} onTriggered={onCrawlTriggered} />
          </div>
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
                : totalPages > 1
                  ? `第 ${page} / ${totalPages} 页`
                  : `${storyGroups.length} 条`}
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
                {storyGroups.map(({ article, alts }) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    starred={starredIds.has(article.id)}
                    matchedKeywords={matchedKeywordsById.get(article.id)}
                    altSources={alts.map((a) => ({ source: a.source, url: a.url }))}
                    canStar
                    onToggleStar={toggleStar}
                  />
                ))}
              </div>
              <FeedPager page={page} totalPages={totalPages} disabled={loading} onChange={setPage} />
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
