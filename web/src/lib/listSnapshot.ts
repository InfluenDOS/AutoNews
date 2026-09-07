import type { Article, Keyword, SourceBundle } from '../types'
import type { UserJob } from '../types/jobs'

export function sameStringSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) {
    if (!b.has(x)) return false
  }
  return true
}

export function articleListEqual(a: Article, b: Article): boolean {
  return (
    a.id === b.id &&
    a.source === b.source &&
    a.title === b.title &&
    a.summary === b.summary &&
    (a.title_zh || '') === (b.title_zh || '') &&
    (a.summary_zh || '') === (b.summary_zh || '') &&
    a.url === b.url &&
    a.published_at === b.published_at
  )
}

export function reuseArticleList(prev: Article[], next: Article[]): Article[] {
  if (
    prev.length === next.length &&
    prev.length > 0 &&
    prev.every((row, i) => articleListEqual(row, next[i]))
  ) {
    return prev
  }
  const byId = new Map(prev.map((row) => [row.id, row]))
  return next.map((row) => {
    const old = byId.get(row.id)
    return old && articleListEqual(old, row) ? old : row
  })
}

export function jobsSnapshotEqual(a: UserJob[], b: UserJob[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.detail !== y.detail ||
      x.title !== y.title ||
      x.updated_at !== y.updated_at
    ) {
      return false
    }
    const xc = x.meta?.counts
    const yc = y.meta?.counts
    if ((xc?.done ?? null) !== (yc?.done ?? null) || (xc?.total ?? null) !== (yc?.total ?? null)) {
      return false
    }
    if ((x.meta?.items?.length ?? 0) !== (y.meta?.items?.length ?? 0)) return false
  }
  return true
}

function jsonOf(value: unknown): string {
  return JSON.stringify(value ?? null)
}

export function keywordsSnapshotEqual(a: Keyword[], b: Keyword[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.phrase !== y.phrase ||
      x.match_mode !== y.match_mode ||
      jsonOf(x.search_terms) !== jsonOf(y.search_terms) ||
      jsonOf(x.match_groups) !== jsonOf(y.match_groups) ||
      jsonOf(x.exclude_terms) !== jsonOf(y.exclude_terms)
    ) {
      return false
    }
  }
  return true
}

export function bundlesSnapshotEqual(a: SourceBundle[], b: SourceBundle[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.enabled !== y.enabled ||
      x.error_text !== y.error_text ||
      x.label !== y.label ||
      jsonOf(x.resolved_feeds) !== jsonOf(y.resolved_feeds)
    ) {
      return false
    }
  }
  return true
}
