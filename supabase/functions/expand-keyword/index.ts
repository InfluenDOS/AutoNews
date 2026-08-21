import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPAND_SYSTEM = `你是多语种新闻检索助手。用户用中文描述想关注的话题。
请把意图拆成「检索结构」，用于在巴尔干等外语媒体标题/摘要中命中。

只输出 JSON：
{
  "match_mode": "strict" 或 "loose",
  "match_groups": [["变体A","变体B"], ["变体C","变体D"]],
  "search_terms": ["可选的完整短语…"],
  "ai_note": "一句中文说明"
}

规则：
1. 短话题：match_mode=loose；search_terms 给 4～10 个多词短语。
2. 长意图（多要素）：match_mode=strict；match_groups 至少 2 组要素变体。
3. 不要把过宽单词语单独作为一整组。
4. 变体用目标媒体常见原文；ai_note 用中文；不要 Markdown。`

type ExpandResult = {
  match_mode: 'strict' | 'loose'
  match_groups: string[][]
  search_terms: string[]
  ai_note: string
}

function suggestMatchMode(phrase: string): 'strict' | 'loose' {
  const cjk = [...phrase].filter((ch) => ch >= '\u4e00' && ch <= '\u9fff').length
  if (cjk >= 8 || phrase.length >= 24) return 'strict'
  return 'loose'
}

function cleanGroups(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return []
  const out: string[][] = []
  for (const g of raw) {
    if (!Array.isArray(g)) continue
    const cleaned = g
      .map((x) => String(x ?? '').trim())
      .filter((s) => s.length > 0)
      .slice(0, 12)
    if (cleaned.length) out.push(cleaned)
  }
  return out.slice(0, 6)
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = (text || '').trim()
  try {
    const obj = JSON.parse(trimmed)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj as Record<string, unknown>
  } catch {
    /* fall through */
  }
  const m = trimmed.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('Model did not return JSON')
  const obj = JSON.parse(m[0])
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('JSON root must be object')
  return obj as Record<string, unknown>
}

async function chatJson(system: string, user: string): Promise<Record<string, unknown>> {
  const key = Deno.env.get('AI_API_KEY')?.trim()
  if (!key) throw new Error('AI_API_KEY not configured')
  const base = (Deno.env.get('AI_BASE_URL') || 'https://api.deepseek.com').replace(/\/$/, '')
  const model = (Deno.env.get('AI_MODEL') || 'deepseek-chat').trim() || 'deepseek-chat'

  const payload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
  }

  let resp = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    if (resp.status >= 400 && errText.includes('response_format')) {
      delete payload.response_format
      resp = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } else {
      throw new Error(`AI HTTP ${resp.status}: ${errText.slice(0, 200)}`)
    }
  }

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`AI HTTP ${resp.status}: ${errText.slice(0, 200)}`)
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  return parseJsonObject(String(content))
}

function normalizeExpand(phrase: string, data: Record<string, unknown>): ExpandResult {
  const suggested = suggestMatchMode(phrase)
  const groups = cleanGroups(data.match_groups)
  const termsRaw = Array.isArray(data.search_terms)
    ? data.search_terms.map((t) => String(t).trim()).filter(Boolean)
    : []
  const aiMode = String(data.match_mode || '').trim()
  const wantStrict = (aiMode === 'strict' || suggested === 'strict') && groups.length >= 2

  if (wantStrict) {
    const flat: string[] = []
    const seen = new Set<string>()
    for (const g of groups) {
      for (const alt of g) {
        const key = alt.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          flat.push(alt)
        }
      }
    }
    return {
      match_mode: 'strict',
      match_groups: groups,
      search_terms: (flat.length ? flat : termsRaw).slice(0, 12),
      ai_note: String(data.ai_note || '').trim().slice(0, 300),
    }
  }

  return {
    match_mode: 'loose',
    match_groups: [],
    search_terms: (termsRaw.length ? termsRaw : [phrase]).slice(0, 12),
    ai_note: String(data.ai_note || '').trim().slice(0, 300),
  }
}

async function maybeTriggerCrawl(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ triggered: boolean; reason?: string }> {
  const token = Deno.env.get('GITHUB_TOKEN')?.trim()
  const repo = (Deno.env.get('GITHUB_REPO') || 'InfluenDOS/AutoNews').trim()
  const workflow = (Deno.env.get('GITHUB_WORKFLOW') || 'crawl.yml').trim()
  if (!token) return { triggered: false, reason: 'missing_github_token' }

  const cooldownSec = Number(Deno.env.get('CRAWL_COOLDOWN_SEC') || '90')
  const { data: cool } = await admin
    .from('crawl_dispatch_cooldown')
    .select('last_triggered_at')
    .eq('id', 1)
    .maybeSingle()

  if (cool?.last_triggered_at) {
    const elapsed = Date.now() - new Date(cool.last_triggered_at).getTime()
    if (elapsed < cooldownSec * 1000) {
      return { triggered: false, reason: 'cooldown' }
    }
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
    return { triggered: false, reason: `github_${resp.status}:${text.slice(0, 120)}` }
  }

  await admin.from('crawl_dispatch_cooldown').upsert({
    id: 1,
    last_triggered_at: new Date().toISOString(),
    last_by: userId,
  })

  return { triggered: true }
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
    const keywordId = String(body?.keyword_id || '').trim()
    const wantCrawl = body?.trigger_crawl !== false
    if (!keywordId) {
      return new Response(JSON.stringify({ error: 'keyword_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: row, error: loadErr } = await admin
      .from('keywords')
      .select('id, user_id, phrase, search_terms, match_groups')
      .eq('id', keywordId)
      .maybeSingle()

    if (loadErr || !row) {
      return new Response(JSON.stringify({ error: 'keyword not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (row.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const terms = (row.search_terms as string[] | null) || []
    const groups = cleanGroups(row.match_groups)
    let skipped = false
    let expandedPayload: ExpandResult | null = null

    if (terms.length > 0 || groups.length >= 2) {
      skipped = true
    } else {
      const phrase = String(row.phrase || '').trim()
      if (!phrase) {
        return new Response(JSON.stringify({ error: 'empty phrase' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const suggested = suggestMatchMode(phrase)
      const raw = await chatJson(
        EXPAND_SYSTEM,
        `用户输入：${phrase}\n（系统建议 match_mode=${suggested}，长意图请用 strict+match_groups）`,
      )
      expandedPayload = normalizeExpand(phrase, raw)
      const normalized = expandedPayload.search_terms.join(' ').slice(0, 2000) || phrase

      const { error: updErr } = await admin
        .from('keywords')
        .update({
          search_terms: expandedPayload.search_terms,
          match_groups: expandedPayload.match_groups,
          match_mode: expandedPayload.match_mode,
          ai_note: expandedPayload.ai_note,
          normalized_phrase: normalized,
        })
        .eq('id', keywordId)

      if (updErr) throw updErr
    }

    let crawl: { triggered: boolean; reason?: string } = { triggered: false, reason: 'not_requested' }
    if (wantCrawl) {
      crawl = await maybeTriggerCrawl(admin, user.id)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        skipped,
        match_mode: expandedPayload?.match_mode,
        search_terms: expandedPayload?.search_terms,
        match_groups: expandedPayload?.match_groups,
        crawl,
      }),
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
