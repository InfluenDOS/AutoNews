import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url, anonKey)
  : (null as unknown as SupabaseClient)

/**
 * Columns for article lists. Spelled out rather than `*` to leave heavy text on the server:
 * `body` is the full extracted source, and `raw_text_normalized` is the match corpus —
 * lists never render either, and including them made multi-thousand-hit feeds unloadable.
 * Client-side rule fallbacks still work from title + summary when no relevance verdict exists.
 */
export const ARTICLE_LIST_COLUMNS =
  'id, source, title, summary, title_zh, summary_zh, lead_zh, url, published_at, created_at'
