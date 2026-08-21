import { useMemo } from 'react'
import { useJobs } from '../context/JobsContext'
import { useKeywords } from '../context/KeywordsContext'
import type { UserJob } from '../types/jobs'

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
          </>
        ) : (
          <strong>最近完成</strong>
        )}
      </div>
      <ul className="process-banner-list">
        {items.map((job) => {
          const linked = job.keyword_id ? phraseById.get(job.keyword_id) : null
          const showKw =
            linked && !job.title.includes(`「${linked}」`) ? linked : null
          return (
            <li key={job.id} className={`process-item is-${job.status}`}>
              <span className="process-step">{stepLabel(job.step)}</span>
              <span className="process-title">{job.title}</span>
              <span className="process-status">{statusLabel(job.status)}</span>
              {showKw ? (
                <span className="process-keyword">关键词：{showKw}</span>
              ) : null}
              {job.detail ? <span className="process-detail">{job.detail}</span> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
