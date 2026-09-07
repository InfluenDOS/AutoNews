import { ARTICLE_LIST_COLUMNS, supabase } from './supabase'
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

const MAX_PAIR_HOPS = 4
const MAX_GROUP_ARTICLES = 200

function orFilter(ids: string[]): string {
  const list = ids.join(',')
  return `article_lo.in.(${list}),article_hi.in.(${list})`
}

export async function loadGroupedStories(articles: Article[]): Promise<StoryGroup[]> {
  if (articles.length === 0) return []
  const ids = articles.map((a) => a.id)
  const known = new Set(ids)
  const pairMap = new Map<string, StoryPair>()
  let frontier = ids

  // Follow a short chain so A-B and B-C still produce one group when only A
  // was in the original page. RLS keeps inaccessible articles out of the graph.
  for (let hop = 0; hop < MAX_PAIR_HOPS && frontier.length > 0; hop += 1) {
    const { data, error } = await supabase
      .from('article_story_pairs')
      .select('article_lo, article_hi, same')
      .eq('same', true)
      .or(orFilter(frontier))

    if (error) {
      if (pairMap.size === 0) return groupDuplicateStories(articles)
      break
    }

    const next: string[] = []
    for (const row of (data as PairRow[]) ?? []) {
      if (!row.same) continue
      const key = `${row.article_lo}:${row.article_hi}`
      pairMap.set(key, { lo: row.article_lo, hi: row.article_hi })
      for (const id of [row.article_lo, row.article_hi]) {
        if (known.has(id) || known.size >= MAX_GROUP_ARTICLES) continue
        known.add(id)
        next.push(id)
      }
    }
    frontier = next
  }

  if (pairMap.size === 0) return groupDuplicateStories(articles)

  let pool = articles
  const extraIds = [...known].filter((id) => !ids.includes(id))
  if (extraIds.length > 0) {
    const { data: extra } = await supabase
      .from('articles')
      .select(ARTICLE_LIST_COLUMNS)
      .in('id', extraIds)
    if (extra?.length) pool = [...articles, ...(extra as Article[])]
  }
  return groupStoriesWithPairs(pool, [...pairMap.values()])
}
