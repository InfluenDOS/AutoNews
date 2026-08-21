import { supabase } from './supabase'

export type CrawlTriggerResult =
  | { ok: true; status: string }
  | { ok: false; kind: 'rate_limit' | 'auth' | 'config' | 'error'; message: string }

/** Ask Supabase to dispatch the GitHub Actions crawl workflow. */
export async function requestCrawl(): Promise<CrawlTriggerResult> {
  const { data, error } = await supabase.rpc('enqueue_crawl')
  if (error) {
    const raw = error.message || ''
    if (raw.includes('wait 2 minutes')) {
      return { ok: false, kind: 'rate_limit', message: '请稍等 2 分钟再抓取' }
    }
    if (raw.includes('sign in')) {
      return { ok: false, kind: 'auth', message: '请先登录' }
    }
    return { ok: false, kind: 'error', message: raw }
  }

  const row = data as { status?: string; message?: string } | null
  if (row?.status === 'error' || row?.message === 'missing_github_token') {
    return {
      ok: false,
      kind: 'config',
      message: '手动抓取尚未配置完成，请稍后再试或联系管理员',
    }
  }

  return { ok: true, status: row?.status ?? 'triggered' }
}
