import { Navigate, useParams } from 'react-router-dom'
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
        <p>还没有可用的抓取网址。</p>
        <p className="muted">解析完成后会显示具体 RSS 地址。</p>
      </div>
    )
  }

  return (
    <div className="source-feed-list">
      {feeds.map((feed) => (
        <article key={feed.url || feed.name} className="source-feed">
          <div className="story-meta">
            <span className="source">{feed.name}</span>
            {feed.country ? <span>{feed.country}</span> : null}
          </div>
          {feed.url ? (
            <a className="source-feed-url" href={feed.url} target="_blank" rel="noreferrer">
              {feed.url}
            </a>
          ) : (
            <p className="muted">地址待解析</p>
          )}
        </article>
      ))}
    </div>
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
    ? '当前会抓取这些网站。点左侧某个源，可只看这一组里的具体网址。'
    : item?.kind === 'preset'
      ? '这是内置的塞尔维亚主流媒体订阅，抓取时会请求下面这些 RSS。'
      : '这个源解析出的订阅地址如下，抓取时只会请求这些网址。'

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{all ? 'Crawl Sources' : 'Source Detail'}</p>
          <h1>{title}</h1>
          <p className="hero-lead">{loading ? '加载抓取源中…' : lead}</p>
          <p className="hero-updated">
            {loading
              ? '地址加载中…'
              : all
                ? `正在使用 ${items.length} 组源 · ${feeds.length} 个网址`
                : item
                  ? `${kindLabel(item.kind)} · ${statusLabel(item)}`
                  : '暂无抓取源'}
          </p>
        </div>
        <div className="hero-window" aria-hidden="true" />
      </section>

      <section className="glass-panel feed">
        <div className="panel-head">
          <h2>抓取网址</h2>
          <span className="muted">{loading ? '加载中' : `${feeds.length} 条`}</span>
        </div>
        {item?.status === 'error' && <p className="error">{item.errorText}</p>}
        {loading ? (
          <p className="muted">正在加载网址…</p>
        ) : all ? (
          items.length === 0 ? (
            <div className="empty">
              <p>还没有抓取源。</p>
              <p className="muted">在左侧点「添加抓取源」即可。</p>
            </div>
          ) : (
            items.map((group) => (
              <div key={group.id} className="source-group">
                <h3 className="source-group-title">
                  {group.label}
                  <span className="muted">
                    {kindLabel(group.kind)} · {statusLabel(group)}
                  </span>
                </h3>
                <FeedList feeds={group.feeds} />
              </div>
            ))
          )
        ) : (
          <FeedList feeds={feeds} />
        )}
      </section>
    </>
  )
}
