import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { FeedPager } from '../components/FeedPager'
import { useAuth } from '../context/AuthContext'
import { usePageParam } from '../hooks/usePageParam'
import { reuseArticleList } from '../lib/listSnapshot'
import { loadGroupedStories } from '../lib/storyGroups'
import type { StoryGroup } from '../lib/storyDedup'
import { ARTICLE_LIST_COLUMNS, isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Article } from '../types'

const PAGE_SIZE = 20

type StarredRow = {
  article_id: string
  articles: Article | Article[] | null
}

function preferStarredArticle(group: StoryGroup, starredIds: Set<string>): StoryGroup {
  if (starredIds.has(group.article.id)) return group
  const members = [group.article, ...group.alts]
  const article = members.find((item) => starredIds.has(item.id))
  if (!article) return group
  return { article, alts: members.filter((item) => item.id !== article.id) }
}

export function StarsPage() {
  const { user } = useAuth()
  const [page, setPage] = usePageParam()
  const [articles, setArticles] = useState<Article[]>([])
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadGenRef = useRef(0)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setArticles([])
      setStoryGroups([])
      setLoading(false)
      return
    }
    const gen = ++loadGenRef.current
    setLoading(true)
    setError(null)
    const from = (page - 1) * PAGE_SIZE
    const { data, error: err, count } = await supabase
      .from('stars')
      .select(`article_id, articles(${ARTICLE_LIST_COLUMNS})`, { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (gen !== loadGenRef.current) return

    if (err) {
      setError(err.message)
      setArticles([])
      setStoryGroups([])
      setTotal(0)
    } else {
      const rows = (data as StarredRow[]) ?? []
      const list: Article[] = []
      for (const row of rows) {
        const a = Array.isArray(row.articles) ? row.articles[0] : row.articles
        if (a) list.push(a)
      }
      const nextTotal = count ?? list.length
      setTotal(nextTotal)
      if (list.length === 0 && page > 1) {
        setPage(page - 1)
        return
      }
      const listedIds = new Set(list.map((article) => article.id))
      const grouped = await loadGroupedStories(list)
      if (gen !== loadGenRef.current) return
      setArticles((prev) => reuseArticleList(prev, list))
      setStoryGroups(grouped.map((group) => preferStarredArticle(group, listedIds)))
    }
    setLoading(false)
  }, [user, page, setPage])

  useEffect(() => {
    void load()
  }, [load])

  const unstar = useCallback(
    async (articleId: string) => {
      if (!user) return
      const { error: err } = await supabase
        .from('stars')
        .delete()
        .eq('user_id', user.id)
        .eq('article_id', articleId)
      if (err) {
        setError(err.message)
        return
      }
      await load()
    },
    [user, load],
  )

  if (!user) {
    return (
      <div className="auth-wrap">
        <section className="panel auth-card">
          <h1 className="page-title">收藏夹</h1>
          <p className="page-sub">
            请先 <Link className="auth-switch" to="/auth">登录</Link> 查看已收藏的新闻。
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <section className="panel auth-card auth-card-wide">
        <h1 className="page-title">收藏夹</h1>
        <p className="page-sub">
          {loading
            ? '加载中…'
            : totalPages > 1
              ? `已收藏 ${total} 条 · 第 ${page} / ${totalPages} 页 · 点 ★ 可取消收藏`
              : `已收藏 ${total} 条 · 点 ★ 可取消收藏`}
        </p>

        {error && <p className="error">{error}</p>}
        {loading ? (
          <p className="muted">加载中…</p>
        ) : articles.length === 0 ? (
          <div className="empty">
            <p>还没有收藏。</p>
            <p className="muted">
              打开 <Link to="/">新闻</Link>，点击 ★ 即可加入收藏夹。
            </p>
          </div>
        ) : (
          <>
            <div className="story-list">
              {storyGroups.map(({ article, alts }) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  altSources={alts.map((alt) => ({ source: alt.source, url: alt.url }))}
                  starred
                  canStar
                  onToggleStar={unstar}
                />
              ))}
            </div>
            <FeedPager page={page} totalPages={totalPages} disabled={loading} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  )
}
