import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useJobs } from '../context/JobsContext'
import { useKeywords } from '../context/KeywordsContext'
import type { JobMeta, JobMetaItem, UserJob } from '../types/jobs'

function stepLabel(step: UserJob['step']) {
  if (step === 'expand') return '扩展'
  if (step === 'crawl') return '抓取'
  return '翻译'
}

function statusLabel(status: UserJob['status']) {
  if (status === 'queued') return '排队中'
  if (status === 'running') return '进行中'
  if (status === 'done') return '完成'
  return '失败'
}

function metaOf(job: UserJob): JobMeta {
  return job.meta && typeof job.meta === 'object' ? job.meta : {}
}

function countsLine(job: UserJob): string | null {
  const c = metaOf(job).counts
  if (!c) return null
  if (typeof c.done === 'number' && typeof c.total === 'number') {
    return `${c.done}/${c.total}`
  }
  const parts: string[] = []
  if (typeof c.matched === 'number') parts.push(`匹配 ${c.matched}`)
  if (typeof c.hits === 'number') parts.push(`hits ${c.hits}`)
  if (typeof c.scanned === 'number') parts.push(`扫描 ${c.scanned}`)
  return parts.length ? parts.join(' · ') : null
}

function ItemRow({ item, step }: { item: JobMetaItem; step: UserJob['step'] }) {
  const title = item.title || item.summary || '（无标题）'
  const inner = (
    <>
      <span className="process-result-title">{title}</span>
      {item.keyword ? <span className="process-result-kw">← {item.keyword}</span> : null}
      {item.summary && item.title ? (
        <span className="process-result-summary">{item.summary}</span>
      ) : null}
    </>
  )
  if (item.id && (step === 'translate' || step === 'crawl')) {
    return (
      <li>
        <Link to={`/article/${item.id}`} className="process-result-link">
          {inner}
        </Link>
      </li>
    )
  }
  return <li>{inner}</li>
}

function JobRow({ job, phraseHint }: { job: UserJob; phraseHint: string | null }) {
  const [open, setOpen] = useState(job.status === 'running' || job.status === 'queued')
  const meta = metaOf(job)
  const items = Array.isArray(meta.items) ? meta.items : []
  const terms = Array.isArray(meta.terms) ? meta.terms : []
  const phrases = Array.isArray(meta.phrases) ? meta.phrases : []
  const countHint = countsLine(job)
  const canExpand =
    items.length > 0 || terms.length > 0 || phrases.length > 0 || Boolean(job.detail) || Boolean(phraseHint)

  const showKw =
    phraseHint && !job.title.includes(`「${phraseHint}」`) ? phraseHint : null

  return (
    <li className={`process-item is-${job.status}${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="process-item-toggle"
        aria-expanded={open}
        disabled={!canExpand}
        onClick={() => canExpand && setOpen((v) => !v)}
      >
        <span className="process-step">{stepLabel(job.step)}</span>
        <span className="process-title">{job.title}</span>
        <span className="process-status">
          {statusLabel(job.status)}
          {countHint ? ` · ${countHint}` : ''}
        </span>
        {canExpand ? (
          <span className="process-chevron" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        ) : (
          <span className="process-chevron is-empty" aria-hidden />
        )}
      </button>

      {open && (
        <div className="process-item-body">
          {showKw ? <p className="process-keyword">关键词：{showKw}</p> : null}
          {job.detail ? <p className="process-detail">{job.detail}</p> : null}

          {phrases.length > 0 && (
            <div className="process-result-block">
              <p className="process-result-label">涉及关键词</p>
              <ul className="process-result-list">
                {phrases.map((p) => (
                  <li key={p}>「{p}」</li>
                ))}
              </ul>
            </div>
          )}

          {terms.length > 0 && (
            <div className="process-result-block">
              <p className="process-result-label">检索词</p>
              <ul className="process-result-list process-terms">
                {terms.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {items.length > 0 && (
            <div className="process-result-block">
              <p className="process-result-label">
                {job.step === 'translate'
                  ? '译出的标题'
                  : job.step === 'crawl'
                    ? '匹配到的稿件'
                    : '结果'}
                {items.length >= 15 ? '（部分）' : ''}
              </p>
              <ul className="process-result-list">
                {items.map((item, i) => (
                  <ItemRow key={item.id || `${item.title}-${i}`} item={item} step={job.step} />
                ))}
              </ul>
            </div>
          )}

          {canExpand && items.length === 0 && terms.length === 0 && phrases.length === 0 && (
            <p className="process-detail">暂无更细条目（旧任务或尚未写入结果列表）。</p>
          )}
        </div>
      )}
    </li>
  )
}

export function ProcessBanner() {
  const { activeJobs, recentDone, hasActive } = useJobs()
  const { keywords } = useKeywords()
  const phraseById = useMemo(() => {
    const map = new Map<string, string>()
    for (const k of keywords) map.set(k.id, k.phrase)
    return map
  }, [keywords])

  const items = useMemo(() => [...activeJobs, ...recentDone], [activeJobs, recentDone])

  if (items.length === 0) return null

  return (
    <div className={`process-banner ${hasActive ? 'is-active' : 'is-idle'}`} role="status" aria-live="polite">
      <div className="process-banner-head">
        {hasActive ? (
          <>
            <span className="process-pulse" aria-hidden />
            <strong>后台处理中</strong>
            <span className="process-banner-hint">点击任务可展开详情</span>
          </>
        ) : (
          <>
            <strong>最近完成</strong>
            <span className="process-banner-hint">点击展开查看结果</span>
          </>
        )}
      </div>
      <ul className="process-banner-list">
        {items.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            phraseHint={job.keyword_id ? phraseById.get(job.keyword_id) ?? null : null}
          />
        ))}
      </ul>
    </div>
  )
}
