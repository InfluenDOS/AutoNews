import { supabase } from './supabase'
import {
  groupDuplicateStories,
  groupStoriesWithPairs,
  type StoryGroup,
  type StoryPair,
} from './storyDedup'
import type { Article } from '../types'

type PairRow = {
  article_lo: string
  article_hi: string
  same: boolean
}

function orFilter(ids: string[]): string {
  const list = ids.join(',')
  return `article_lo.in.(${list}),article_hi.in.(${list})`
}

export async function loadGroupedStories(articles: Article[]): Promise<StoryGroup[]> {
  if (articles.length === 0) return []
  const ids = articles.map((a) => a.id)
  const pageIds = new Set(ids)
  const { data, error } = await supabase
    .from('article_story_pairs')
    .select('article_lo, article_hi, same')
    .eq('same', true)
    .or(orFilter(ids))

  if (error) return groupDuplicateStories(articles)

  // Pagination is defined by the articles already selected for this page. Pair
  // rows may point at stories on another page, but those articles must never be
  // pulled into this page or replace one of its cards.
  const pairs: StoryPair[] = []
  for (const row of (data as PairRow[]) ?? []) {
    if (row.same && pageIds.has(row.article_lo) && pageIds.has(row.article_hi)) {
      pairs.push({ lo: row.article_lo, hi: row.article_hi })
    }
  }
  return pairs.length > 0
    ? groupStoriesWithPairs(articles, pairs)
    : groupDuplicateStories(articles)
}
