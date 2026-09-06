/** News outlets used for keyword feeds. Keep in sync with crawler/sources.py NEWS_SOURCES. */

export const SERBIA_MAINSTREAM_FEEDS: { name: string; url: string; country: string }[] = [
  { name: 'Blic', url: 'https://www.blic.rs/rss/vesti', country: 'RS' },
  { name: 'Blic Politika', url: 'https://www.blic.rs/rss/vesti/politika', country: 'RS' },
  { name: 'B92', url: 'https://www.b92.net/info/rss/vesti.xml', country: 'RS' },
  { name: 'RTS', url: 'https://www.rts.rs/page/stories/ci/rss.html', country: 'RS' },
  { name: 'Novosti', url: 'https://www.novosti.rs/rss/vesti', country: 'RS' },
  { name: 'N1 Serbia', url: 'https://n1info.rs/feed/', country: 'RS' },
  { name: 'Danas', url: 'https://www.danas.rs/feed/', country: 'RS' },
  { name: 'Balkan Insight', url: 'https://balkaninsight.com/feed/', country: 'REG' },
]

export const NEWS_SOURCE_NAMES = new Set(SERBIA_MAINSTREAM_FEEDS.map((f) => f.name))

/** Guest movie/culture pool only. Keep in sync with crawler/sources.py PREVIEW_SOURCES. */
export const PREVIEW_SOURCE_NAMES = new Set([
  'Blic Kultura',
  'Blic Zabava',
  'B92 Kultura',
  'Novosti Kultura',
  'Variety',
])

export const SERBIA_MAINSTREAM_KEY = 'serbia_mainstream'
export const SERBIA_MAINSTREAM_LABEL = '塞尔维亚主流媒体'

const PRESET_ALIASES = new Set([
  SERBIA_MAINSTREAM_LABEL,
  '塞尔维亚媒体',
  'serbia mainstream',
  SERBIA_MAINSTREAM_KEY,
])

export function isSerbiaMainstreamPhrase(phrase: string): boolean {
  const q = phrase.trim().toLocaleLowerCase()
  return PRESET_ALIASES.has(q) || PRESET_ALIASES.has(phrase.trim())
}

export function isNewsSource(
  name: string | null | undefined,
  extraNames?: Iterable<string>,
): boolean {
  const n = name || ''
  if (PREVIEW_SOURCE_NAMES.has(n)) return false
  if (NEWS_SOURCE_NAMES.has(n)) return true
  if (extraNames) {
    for (const x of extraNames) {
      if (x === n) return true
    }
  }
  return false
}

export function looksLikeFeedUrl(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  return /^[a-z0-9.-]+\.[a-z]{2,}([/:].*)?$/i.test(s)
}
