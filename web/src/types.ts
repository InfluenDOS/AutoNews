export type Article = {
  id: string
  source: string
  title: string
  summary: string
  title_zh?: string
  summary_zh?: string
  lead_zh?: string
  body_zh?: string
  url: string
  published_at: string | null
  raw_text_normalized?: string
  created_at: string
}

export type Keyword = {
  id: string
  user_id: string
  phrase: string
  normalized_phrase: string
  search_terms?: string[]
  match_groups?: string[][]
  match_mode?: 'loose' | 'strict'
  exclude_terms?: string[]
  ai_note?: string
  created_at: string
}

export type Star = {
  id: string
  user_id: string
  article_id: string
  created_at: string
}

export type SourceFeed = {
  name: string
  url: string
  country?: string
}

export type SourceBundle = {
  id: string
  user_id: string
  label: string
  kind: 'preset' | 'rss' | 'fuzzy'
  preset_key: string | null
  rss_url: string | null
  enabled: boolean
  status: 'pending' | 'ready' | 'error'
  resolved_feeds: SourceFeed[]
  error_text: string
  created_at: string
}
