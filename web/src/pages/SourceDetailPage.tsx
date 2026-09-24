import { Navigate, useParams } from 'react-router-dom'
import { PageHead } from '../components/PageHead'
import { useAuth } from '../context/AuthContext'
import { useSources, type SourceListItem } from '../context/SourcesContext'
import type { SourceFeed } from '../types'

function kindLabel(kind: SourceListItem['kind']) {
  if (kind === 'preset') return '内置预设'
  if (kind === 'rss') return '指定 RSS'
  return '模糊定义'
}

function statusLabel(item: SourceListItem) {
  if (item.status === 'pending') return '正在解析可用网址…'
  if (item.status === 'error') return item.errorText || '解析失败'
  return `${item.feeds.length} 个订阅地址`
}

function FeedList({ feeds }: { feeds: SourceFeed[] }) {
  if (feeds.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">还没有可用的抓取网址</p>
        <p>解析完成后会显示具体的 RSS 地址。</p>
      </div>
    )
  }

  return (
    <ul className="feed-urls">
      {feeds.map((feed) => (
        <li key={feed.url || feed.name}>
          <span className="feed-url-name">
            {feed.name}
            {feed.country ? <small>{feed.country}</small> : null}
          </span>
          {feed.url ? (
            <a href={feed.url} target="_blank" rel="noreferrer">
              {feed.url}
            </a>
          ) : (
            <span className="muted">地址待解析</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function SourceDetailPage({ all = false }: { all?: boolean }) {
  const { sourceId } = useParams()
  const { user } = useAuth()
  const { items, loading } = useSources()

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  if (!all && !loading && sourceId && !items.some((s) => s.id === sourceId)) {
    return <Navigate to="/sources" replace />
  }

  const item = all ? null : items.find((s) => s.id === sourceId) ?? null
  const feeds = all ? items.flatMap((s) => s.feeds.filter((f) => f.url)) : item?.feeds ?? []
  const title = all ? '抓取源' : item?.label || '抓取源'
  const lead = all
    ? '爬虫每次都会请求这些网址。点目录里的某个源，可以只看那一组。'
    : item?.kind === 'preset'
      ? '这是内置的塞尔维亚主流媒体订阅，抓取时会请求下面这些 RSS。'
      : '这个源解析出的订阅地址如下，抓取时只会请求这些网址。'

  return (
    <div className="feed">
      <PageHead
        kicker={all ? '抓取源' : kindLabel(item?.kind ?? 'preset')}
        title={title}
        lead={loading ? '加载抓取源中…' : lead}
        meta={
          <span>
            {loading
              ? '地址加载中…'
              : all
                ? `${items.length} 组源 · ${feeds.length} 个网址`
                : item
                  ? statusLabel(item)
                  : '暂无抓取源'}
          </span>
        }
      />

      {item?.status === 'error' && <p className="notice notice-error">{item.errorText}</p>}
      {loading ? (
        <p className="loading-line">正在加载网址…</p>
      ) : all ? (
        items.length === 0 ? (
          <div className="empty">
            <p className="empty-title">还没有抓取源</p>
            <p>在目录里点「添加抓取源」即可。</p>
          </div>
        ) : (
          items.map((group) => (
            <section key={group.id} className="source-group">
              <h2 className="dateline">
                <span className="dateline-rel">{group.label}</span>
                <span className="dateline-date">
                  {kindLabel(group.kind)} · {statusLabel(group)}
                </span>
              </h2>
              <FeedList feeds={group.feeds} />
            </section>
          ))
        )
      ) : (
        <FeedList feeds={feeds} />
      )}
    </div>
  )
}
