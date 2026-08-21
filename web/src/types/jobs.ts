export type JobStep = 'expand' | 'crawl' | 'translate'
export type JobStatus = 'queued' | 'running' | 'done' | 'error'

export type JobMetaItem = {
  id?: string
  title?: string
  summary?: string
  keyword?: string
  url?: string
}

export type JobMeta = {
  counts?: {
    done?: number
    total?: number
    matched?: number
    hits?: number
    scanned?: number
  }
  items?: JobMetaItem[]
  phrases?: string[]
  terms?: string[]
  mode?: string
}

export type UserJob = {
  id: string
  user_id: string
  keyword_id?: string | null
  step: JobStep
  status: JobStatus
  title: string
  detail: string
  meta?: JobMeta
  created_at: string
  updated_at: string
}
