import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url, anonKey)
  : (null as unknown as SupabaseClient)

/**
 * Columns for article lists. Spelled out rather than `*` to leave `body` on the server:
 * it holds the full extracted source text, which lists never render and which would add
 * megabytes to a 200-article response.
 */
export const ARTICLE_LIST_COLUMNS =
  'id, source, title, summary, title_zh, summary_zh, lead_zh, url, published_at, raw_text_normalized, created_at'
