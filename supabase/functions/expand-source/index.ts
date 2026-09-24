import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Feed = { name: string; url: string; country: string }

const KNOWN_FEEDS: Feed[] = [
  { name: 'Blic', url: 'https://www.blic.rs/rss/vesti', country: 'RS' },
  { name: 'Blic Politika', url: 'https://www.blic.rs/rss/vesti/politika', country: 'RS' },
  { name: 'B92', url: 'https://www.b92.net/info/rss/vesti.xml', country: 'RS' },
  { name: 'RTS', url: 'https://www.rts.rs/page/stories/ci/rss.html', country: 'RS' },
  { name: 'Novosti', url: 'https://www.novosti.rs/rss/vesti', country: 'RS' },
  { name: 'N1 Serbia', url: 'https://n1info.rs/feed/', country: 'RS' },
  { name: 'Danas', url: 'https://www.danas.rs/feed/', country: 'RS' },
  { name: 'Balkan Insight', url: 'https://balkaninsight.com/feed/', country: 'REG' },
  { name: 'Jutarnji', url: 'https://www.jutarnji.hr/rss', country: 'HR' },
  { name: 'Index.hr', url: 'https://www.index.hr/rss/', country: 'HR' },
  { name: 'Klix', url: 'https://www.klix.ba/rss', country: 'BA' },
  { name: 'Vijesti', url: 'https://www.vijesti.me/rss', country: 'ME' },
  { name: 'N1 Croatia', url: 'https://n1info.hr/feed/', country: 'HR' },
  { name: 'N1 Bosnia', url: 'https://n1info.ba/feed/', country: 'BA' },
]

const EXPAND_SYSTEM = `你是新闻 RSS 源助手。用户用中文描述想抓取的媒体范围（国家、地区、或具体媒体名）。
只输出 JSON：{"feeds":[{"name":"媒体名","url":"https://...rss或atom地址","country":"ISO两字母或REG"}]}

硬性规则：
1. url 必须是公开的 RSS 或 Atom 订阅地址（通常含 rss / feed / atom），不要给首页 HTML。
2. 优先给出该地区主流、可公开抓取的新闻媒体，6～10 条即可，不要博客或娱乐站。
3. 不要编造不存在的域名。拿不准就少给。
4. name 用媒体常用名（可英文/本地语），不要中文长句。
5. country 用 ISO 3166-1 alpha-2，跨地区用 REG。`

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
    temperature: 0.1,
    max_tokens: 800,
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

function normalizeUrl(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.toString()
  } catch {
    return ''
  }
}

function catalogHits(phrase: string): Feed[] {
  const q = phrase.toLocaleLowerCase()
  const out: Feed[] = []
  for (const f of KNOWN_FEEDS) {
    const blob = `${f.name} ${f.url} ${f.country}`.toLocaleLowerCase()
    if (blob.includes(q) || q.includes(f.name.toLocaleLowerCase())) out.push(f)
  }
  const regionHints: Record<string, string[]> = {
    塞尔维亚: ['RS'],
    serbia: ['RS'],
    克罗地亚: ['HR'],
    croatia: ['HR'],
    波黑: ['BA'],
    波斯尼亚: ['BA'],
    bosnia: ['BA'],
    黑山: ['ME'],
    montenegro: ['ME'],
    巴尔干: ['RS', 'HR', 'BA', 'ME', 'REG'],
    balkan: ['RS', 'HR', 'BA', 'ME', 'REG'],
  }
  for (const [hint, countries] of Object.entries(regionHints)) {
    if (!q.includes(hint)) continue
    for (const f of KNOWN_FEEDS) {
      if (countries.includes(f.country) && !out.some((x) => x.url === f.url)) out.push(f)
    }
  }
  return out.slice(0, 12)
}

const FETCH_HEADERS = { 'User-Agent': 'AutoNewsBot/1.0 (+https://github.com/InfluenDOS/AutoNews)' }

async function looksLikeFeed(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(15_000),
    })
    if (!resp.ok) return false
    const text = (await resp.text()).slice(0, 8000)
    return /<rss[\s>]|<feed[\s>]|<rdf:RDF/i.test(text)
  } catch {
    return false
  }
}

const COMMON_FEED_PATHS = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/index.xml', '/rss/']

// People usually paste a site address (theguardian.com), not its feed URL. Try the
// address itself, then feeds the homepage advertises via <link rel="alternate">,
// then common feed paths; the first one that parses as RSS/Atom wins.
async function discoverSiteFeed(url: string): Promise<string | null> {
  if (await looksLikeFeed(url)) return url
  const candidates: string[] = []
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(15_000),
    })
    if (resp.ok) {
      const html = (await resp.text()).slice(0, 200_000)
      for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
        if (!/rel=["']?alternate/i.test(tag)) continue
        if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue
        const href = tag.match(/href=["']([^"']+)/i)?.[1]
        if (href) candidates.push(new URL(href, resp.url || url).toString())
      }
    }
  } catch {
    /* fall through to common paths */
  }
  const origin = new URL(url).origin
  candidates.push(...COMMON_FEED_PATHS.map((p) => origin + p))
  for (const candidate of [...new Set(candidates)]) {
    if (await looksLikeFeed(candidate)) return candidate
  }
  return null
}

// Keep in sync with crawler/sources.py. The crawler attributes and gates articles by
// source name and ignores a custom feed that reuses a built-in name for another URL,
// so rename such feeds here to keep them usable.
const BUILTIN_FEED_URLS: Record<string, string> = {
  blic: 'https://www.blic.rs/rss/vesti',
  'blic politika': 'https://www.blic.rs/rss/vesti/politika',
  b92: 'https://www.b92.net/info/rss/vesti.xml',
  rts: 'https://www.rts.rs/page/stories/ci/rss.html',
  novosti: 'https://www.novosti.rs/rss/vesti',
  'n1 serbia': 'https://n1info.rs/feed/',
  danas: 'https://www.danas.rs/feed/',
  'balkan insight': 'https://balkaninsight.com/feed/',
  'blic kultura': 'https://www.blic.rs/rss/kultura',
  'blic zabava': 'https://www.blic.rs/rss/zabava',
  'b92 kultura': 'https://www.b92.net/info/rss/kultura.xml',
  'novosti kultura': 'https://www.novosti.rs/rss/kultura',
  variety: 'https://variety.com/feed/',
}

function withDistinctName(feed: Feed): Feed {
  const builtinUrl = BUILTIN_FEED_URLS[feed.name.toLowerCase()]
  if (!builtinUrl || builtinUrl === feed.url) return feed
  const host = new URL(feed.url).hostname.replace(/^www\./, '')
  return { ...feed, name: `${feed.name} (${host})`.slice(0, 80) }
}

const EXPAND_PER_HOUR = 30

// Every call spends an AI request and outbound fetches; cap it per user.
async function overHourlyLimit(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('user_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('step', 'expand')
    .gte('created_at', since)
  return (count ?? 0) >= EXPAND_PER_HOUR
}

function parseFeeds(raw: unknown): Feed[] {
  if (!Array.isArray(raw)) return []
  const out: Feed[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const url = normalizeUrl(String(rec.url || ''))
    const name = String(rec.name || '').trim().slice(0, 80)
    const country = String(rec.country || 'REG').trim().slice(0, 8) || 'REG'
    if (!url || !name) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ name, url, country })
  }
  return out.slice(0, 12)
}

async function validateFeeds(feeds: Feed[]): Promise<Feed[]> {
  const checked = await Promise.all(
    feeds.map(async (f) => ({ f, ok: await looksLikeFeed(f.url) })),
  )
  return checked.filter((x) => x.ok).map((x) => x.f)
}

async function createJob(
  admin: ReturnType<typeof createClient>,
  userId: string,
  title: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('user_jobs')
    .insert({
      user_id: userId,
      keyword_id: null,
      step: 'expand',
      status: 'running',
      title,
      detail: '正在解析抓取源…',
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
    const bundleId = String(body?.bundle_id || '').trim()
    if (!bundleId) {
      return new Response(JSON.stringify({ error: 'bundle_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: row, error: loadErr } = await admin
      .from('user_source_bundles')
      .select('id, user_id, label, kind, rss_url, status')
      .eq('id', bundleId)
      .maybeSingle()

    if (loadErr || !row || row.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'bundle not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (await overHourlyLimit(admin, user.id)) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const jobId = await createJob(admin, user.id, `解析抓取源「${row.label}」`)

    try {
      let candidates: Feed[] = []
      if (row.kind === 'rss') {
        const url = normalizeUrl(String(row.rss_url || row.label || ''))
        if (!url) throw new Error('无效的 RSS 地址')
        const host = new URL(url).hostname.replace(/^www\./, '')
        const name = String(row.label || host).slice(0, 80)
        const feedUrl = await discoverSiteFeed(url)
        if (feedUrl) {
          candidates = [{ name, url: feedUrl, country: 'REG' }]
        } else {
          // Some sites publish feeds on another host (bbc.com → feeds.bbci.co.uk)
          // or block plain fetches of their homepage; ask the model, then validate.
          const raw = await chatJson(
            EXPAND_SYSTEM,
            `用户输入的网站：${url}\n这个地址本身不是 RSS。只给出这家媒体自己的公开 RSS/Atom 订阅地址，最多 3 条。`,
          )
          candidates = parseFeeds(raw.feeds).slice(0, 3)
        }
      } else {
        const phrase = String(row.label || '').trim()
        candidates = catalogHits(phrase)
        try {
          const raw = await chatJson(
            EXPAND_SYSTEM,
            `用户输入：${phrase}\n已知可用源（可直接选用）：${JSON.stringify(KNOWN_FEEDS)}`,
          )
          candidates = [...candidates, ...parseFeeds(raw.feeds)]
        } catch (aiErr) {
          if (!candidates.length) throw aiErr
        }
      }

      const deduped: Feed[] = []
      const seen = new Set<string>()
      for (const f of candidates) {
        if (seen.has(f.url)) continue
        seen.add(f.url)
        deduped.push(f)
      }

      const valid = (await validateFeeds(deduped)).map(withDistinctName)
      if (!valid.length) {
        await admin
          .from('user_source_bundles')
          .update({
            status: 'error',
            error_text: '没有找到可用的 RSS 源，请改用具体网站的订阅地址',
            resolved_feeds: [],
          })
          .eq('id', bundleId)
        if (jobId) {
          await admin
            .from('user_jobs')
            .update({
              status: 'error',
              detail: '没有找到可用的 RSS 源',
              updated_at: new Date().toISOString(),
            })
            .eq('id', jobId)
        }
        return new Response(JSON.stringify({ ok: false, error: 'no_valid_feeds', feeds: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await admin
        .from('user_source_bundles')
        .update({
          status: 'ready',
          error_text: '',
          resolved_feeds: valid,
          rss_url: row.kind === 'rss' ? valid[0].url : row.rss_url,
        })
        .eq('id', bundleId)

      if (jobId) {
        await admin
          .from('user_jobs')
          .update({
            status: 'done',
            detail: `「${row.label}」解析完成 · ${valid.length} 个源`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
      }

      return new Response(JSON.stringify({ ok: true, feeds: valid }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (inner) {
      const message = inner instanceof Error ? inner.message : String(inner)
      await admin
        .from('user_source_bundles')
        .update({ status: 'error', error_text: message.slice(0, 300) })
        .eq('id', bundleId)
      if (jobId) {
        await admin
          .from('user_jobs')
          .update({
            status: 'error',
            detail: message.slice(0, 200),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
      }
      throw inner
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
