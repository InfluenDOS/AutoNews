/** News outlets used for keyword feeds. Keep in sync with crawler/sources.py NEWS_SOURCES. */

export const NEWS_SOURCE_NAMES = new Set([
  'Blic',
  'Blic Politika',
  'B92',
  'RTS',
  'Novosti',
  'N1 Serbia',
  'Danas',
  'Balkan Insight',
])

export function isNewsSource(name: string | null | undefined): boolean {
  return NEWS_SOURCE_NAMES.has(name || '')
}
