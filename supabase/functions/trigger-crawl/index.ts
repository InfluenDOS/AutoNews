import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USER_COOLDOWN_SEC = 300

async function createJob(
  admin: ReturnType<typeof createClient>,
  row: {
    user_id: string
    keyword_id?: string | null
    step: 'expand' | 'crawl' | 'translate'
    status: 'queued' | 'running' | 'done' | 'error'
    title: string
    detail?: string
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from('user_jobs')
    .insert({
      user_id: row.user_id,
      keyword_id: row.keyword_id ?? null,
      step: row.step,
      status: row.status,
      title: row.title,
      detail: row.detail ?? '',
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('createJob', error.message)
    return null
  }
  return data?.id ?? null
}

async function updateJob(
  admin: ReturnType<typeof createClient>,
  id: string | null,
  patch: { status?: string; title?: string; detail?: string },
): Promise<void> {
  if (!id) return
  await admin
    .from('user_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
}

function remainingFrom(at: string | null | undefined, windowSec: number): number {
  if (!at) return 0
  const elapsed = Date.now() - new Date(at).getTime()
  return Math.max(0, windowSec - Math.floor(elapsed / 1000))
}

async function cooldownRemaining(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { data: userCool } = await admin
    .from('user_crawl_cooldown')
    .select('last_triggered_at')
    .eq('user_id', userId)
    .maybeSingle()
  return remainingFrom(userCool?.last_triggered_at, USER_COOLDOWN_SEC)
}

async function markUserCooldown(admin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  await admin.from('user_crawl_cooldown').upsert({
    user_id: userId,
    last_triggered_at: new Date().toISOString(),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'missing auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(supabaseUrl, serviceKey)

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const keywordId = String(body?.keyword_id || '').trim() || null
    let phrase = String(body?.phrase || '').trim()

    if (keywordId) {
      const { data: row } = await admin
        .from('keywords')
        .select('id, user_id, phrase')
        .eq('id', keywordId)
        .maybeSingle()
      if (!row || row.user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'keyword not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      phrase = String(row.phrase || phrase).trim()
    }

    const left = await cooldownRemaining(admin, user.id)
    if (left > 0) {
      return new Response(
        JSON.stringify({ ok: true, triggered: false, reason: 'cooldown', remaining_sec: left }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const token = Deno.env.get('GITHUB_TOKEN')?.trim()
    const repo = (Deno.env.get('GITHUB_REPO') || 'InfluenDOS/AutoNews').trim()
    const workflow = (Deno.env.get('GITHUB_WORKFLOW') || 'crawl.yml').trim()
    const label = phrase ? `「${phrase}」` : '全部关键词'

    const crawlJobId = await createJob(admin, {
      user_id: user.id,
      keyword_id: keywordId,
      step: 'crawl',
      status: 'queued',
      title: `手动抓取${label}`,
      detail: `等待触发抓取 ${label}`,
    })

    if (!token) {
      await updateJob(admin, crawlJobId, {
        status: 'error',
        detail: '缺少 GITHUB_TOKEN，无法触发抓取',
      })
      return new Response(JSON.stringify({ error: 'missing_github_token', triggered: false }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    })

    if (!resp.ok) {
      const text = await resp.text()
      await updateJob(admin, crawlJobId, {
        status: 'error',
        detail: `触发失败 HTTP ${resp.status}`,
      })
      return new Response(
        JSON.stringify({
          error: `github_${resp.status}`,
          triggered: false,
          remaining_sec: 0,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    await markUserCooldown(admin, user.id)

    await updateJob(admin, crawlJobId, {
      status: 'running',
      detail: `正在抓取并匹配 ${label} …`,
    })

    return new Response(
      JSON.stringify({ ok: true, triggered: true, remaining_sec: USER_COOLDOWN_SEC }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
