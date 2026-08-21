export type DailyPoem = {
  text: string
  author: string
  source: string
}

const CACHE_KEY = 'autonews-daily-poem'
const TOKEN_KEY = 'autonews-jinrishici-token'
const API = 'https://v2.jinrishici.com/one.json'

type JinrishiciResponse = {
  status: string
  token?: string
  data?: {
    content?: string
    origin?: {
      title?: string
      author?: string
      dynasty?: string
    }
  }
}

function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function readCache(): DailyPoem | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { date?: string; poem?: DailyPoem }
    if (parsed.date === todayKey() && parsed.poem?.text) return parsed.poem
  } catch {
    /* ignore */
  }
  return null
}

function writeCache(poem: DailyPoem) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ date: todayKey(), poem }))
  } catch {
    /* ignore */
  }
}

/** Prefer a single verse line from the API sentence. */
function oneLine(content: string): string {
  const parts = content
    .split(/[，。？！；、]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return content.replace(/\s+/g, '').trim()
  return parts[Math.floor(Math.random() * parts.length)] ?? parts[0]!
}

export async function loadDailyPoem(): Promise<DailyPoem | null> {
  const cached = readCache()
  if (cached) return cached

  const headers: HeadersInit = { Accept: 'application/json' }
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) headers['X-User-Token'] = token
  } catch {
    /* ignore */
  }

  const res = await fetch(API, { headers })
  if (!res.ok) return null
  const json = (await res.json()) as JinrishiciResponse
  if (json.status !== 'success' || !json.data?.content) return null

  if (json.token) {
    try {
      localStorage.setItem(TOKEN_KEY, json.token)
    } catch {
      /* ignore */
    }
  }

  const title = (json.data.origin?.title || '').trim()
  const poem: DailyPoem = {
    text: oneLine(json.data.content),
    author: (json.data.origin?.author || '佚名').trim(),
    source: title ? `《${title}》` : '古诗',
  }
  writeCache(poem)
  return poem
}
