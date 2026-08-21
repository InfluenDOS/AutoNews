export type JobStep = 'expand' | 'crawl' | 'translate'
export type JobStatus = 'queued' | 'running' | 'done' | 'error'

export type UserJob = {
  id: string
  user_id: string
  keyword_id?: string | null
  step: JobStep
  status: JobStatus
  title: string
  detail: string
  created_at: string
  updated_at: string
}
