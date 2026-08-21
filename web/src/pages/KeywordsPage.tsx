import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article } from '../types'
import { KeywordFeedPage } from './KeywordFeedPage'

const PREVIEW_COUNT = 8
const FETCH_POOL = 100

/** Keep guest preview on movie / cinema topics. */
const MOVIE_TERMS = [
  '电影',
  '影片',
  '影院',
  '影节',
  '导演',
  '演员',
  '好莱坞',
  '院线',
  '首映',
  '影视',
  '奥斯卡',
  'film',
  'filmski',
  'movie',
  'cinema',
  'bioskop',
  'hollywood',
  'oscar',
  'netflix',
  'kino',
  'glumac',
  'reziser',
  'box office',
  'trailer',
  'variety',
  'festival',
  'premiere',
  'actor',
  'actress',
  'director',
]

const MOVIE_SOURCE_HINTS = ['variety']

function isMovieRelated(article: Article): boolean {
  const source = (article.source || '').toLowerCase()
  if (MOVIE_SOURCE_HINTS.some((hint) => source.includes(hint))) return true

  const blob = [
    article.title_zh,
    article.summary_zh,
    article.title,
    article.summary,
    article.raw_text_normalized,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()

  return MOVIE_TERMS.some((term) => blob.includes(term.toLowerCase()))
}

function shufflePick<T>(items: T[], count: number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]!
    copy[i] = copy[j]!
    copy[j] = tmp
  }
  return copy.slice(0, count)
}

function GuestKeywordsPreview() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isSupabaseConfigured) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)

      const movieOr = [
        'title_zh.ilike.%电影%',
        'title_zh.ilike.%影片%',
        'title_zh.ilike.%影院%',
        'title_zh.ilike.%影节%',
        'title_zh.ilike.%导演%',
        'summary_zh.ilike.%电影%',
        'title.ilike.%film%',
        'title.ilike.%movie%',
        'title.ilike.%cinema%',
        'raw_text_normalized.ilike.%film%',
        'raw_text_normalized.ilike.%movie%',
        'raw_text_normalized.ilike.%bioskop%',
        'source.ilike.%variety%',
        'source.ilike.%kultura%',
        'source.ilike.%zabava%',
      ].join(',')

      const movieQuery = await supabase
        .from('articles')
        .select('*')
        .or(movieOr)
        .order('published_at', { ascending: false })
        .limit(FETCH_POOL)

      let pool = (movieQuery.data as Article[]) ?? []
      if (movieQuery.error || pool.length < PREVIEW_COUNT) {
        const recent = await supabase
          .from('articles')
          .select('*')
          .order('published_at', { ascending: false })
          .limit(FETCH_POOL)
        if (recent.error && pool.length === 0) {
          if (!cancelled) {
            setError(recent.error.message || movieQuery.error?.message || '加载失败')
            setArticles([])
            setLoading(false)
          }
          return
        }
        const merged = new Map<string, Article>()
        for (const a of pool) merged.set(a.id, a)
        for (const a of (recent.data as Article[]) ?? []) {
          if (isMovieRelated(a)) merged.set(a.id, a)
        }
        pool = [...merged.values()]
      } else {
        pool = pool.filter(isMovieRelated)
      }

      if (cancelled) return
      if (movieQuery.error && pool.length === 0) {
        setError(movieQuery.error.message)
        setArticles([])
      } else {
        setArticles(shufflePick(pool, PREVIEW_COUNT))
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="keywords-guest">
      <section className="panel auth-card">
        <h1 className="page-title">关键词</h1>
        <p className="page-sub">
          请先 <Link className="auth-switch" to="/auth">登录</Link> 后再管理关键词。
        </p>
      </section>

      <section className="panel glass-panel keywords-guest-feed">
        <div className="panel-head keywords-guest-head">
          <div>
            <h2>随便看看 · 电影</h2>
            <p className="panel-sub">登录后可按自己的关键词订阅。</p>
          </div>
        </div>

        {loading ? (
          <p className="muted">加载中…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : articles.length === 0 ? (
          <p className="muted">暂时还没有电影相关预览，稍等爬虫更新后再来看看。</p>
        ) : (
          <div className="story-list">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} starred={false} canStar={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function KeywordsPage() {
  const { user } = useAuth()
  if (!user) return <GuestKeywordsPreview />
  return <KeywordFeedPage all />
}

