import { normalizeForMatch } from './normalize'
import type { Article } from '../types'

export const STORY_DEDUP_THRESHOLD = 0.65
const WINDOW_MS = 6 * 60 * 60 * 1000

export type StoryGroup = {
  article: Article
  alts: Article[]
}

function cjkBigrams(text: string): Set<string> {
  const chars = [...text].filter((ch) => !/\s/.test(ch))
  if (chars.length < 4) return text ? new Set([text]) : new Set()
  const grams = new Set<string>()
  for (let i = 0; i < chars.length - 1; i += 1) grams.add(chars[i] + chars[i + 1])
  return grams
}

export function titleTokens(title: string): Set<string> {
  const norm = normalizeForMatch(title)
  const parts = norm.split(/\s+/).filter((t) => t.length >= 2)
  if (parts.length >= 2) return new Set(parts)
  const blob = parts[0] || [...norm].filter((ch) => !/\s/.test(ch)).join('')
  if ([...blob].some((ch) => ch >= '\u4e00' && ch <= '\u9fff')) return cjkBigrams(blob)
  return parts.length ? new Set(parts) : norm ? new Set([norm]) : new Set()
}

export function titleJaccard(a: string, b: string): number {
  const A = titleTokens(a)
  const B = titleTokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) {
    if (B.has(t)) inter += 1
  }
  return inter / (A.size + B.size - inter)
}

export function titlesSimilar(a: string, b: string, threshold = STORY_DEDUP_THRESHOLD): boolean {
  const A = titleTokens(a)
  const B = titleTokens(b)
  if (!A.size || !B.size) return false
  let inter = 0
  for (const t of A) {
    if (B.has(t)) inter += 1
  }
  if (inter / (A.size + B.size - inter) >= threshold) return true
  return inter / Math.min(A.size, B.size) >= 0.75
}

function publishedMs(value: string | null | undefined): number {
  if (!value) return 0
  const t = Date.parse(value)
  return Number.isNaN(t) ? 0 : t
}

function sameUtcDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const da = new Date(a)
  const db = new Date(b)
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  )
}

export function storiesNearDuplicate(a: Article, b: Article, threshold = STORY_DEDUP_THRESHOLD): boolean {
  const ta = publishedMs(a.published_at)
  const tb = publishedMs(b.published_at)
  if (ta && tb) {
    const close = Math.abs(ta - tb) <= WINDOW_MS || sameUtcDay(a.published_at, b.published_at)
    if (!close) return false
  }
  if (titlesSimilar(a.title, b.title, threshold)) return true
  const zhA = (a.title_zh || '').trim()
  const zhB = (b.title_zh || '').trim()
  return Boolean(zhA && zhB && titlesSimilar(zhA, zhB, threshold))
}

function preferCanonical(a: Article, b: Article): number {
  const azh = (a.title_zh || '').trim() ? 1 : 0
  const bzh = (b.title_zh || '').trim() ? 1 : 0
  if (azh !== bzh) return bzh - azh
  const ta = publishedMs(a.published_at)
  const tb = publishedMs(b.published_at)
  if (ta && tb && ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

export function groupDuplicateStories(articles: Article[]): StoryGroup[] {
  const used = new Set<string>()
  const groups: StoryGroup[] = []

  for (const a of articles) {
    if (used.has(a.id)) continue
    const members = [a]
    used.add(a.id)
    for (const b of articles) {
      if (used.has(b.id)) continue
      if (!storiesNearDuplicate(a, b)) continue
      members.push(b)
      used.add(b.id)
    }
    members.sort(preferCanonical)
    groups.push({ article: members[0], alts: members.slice(1) })
  }

  groups.sort((g1, g2) => {
    const ta = publishedMs(g1.article.published_at)
    const tb = publishedMs(g2.article.published_at)
    return tb - ta
  })
  return groups
}
