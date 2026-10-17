import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { keywordsSnapshotEqual } from '../lib/listSnapshot'
import { normalizeForMatch } from '../lib/normalize'
import { SERBIA_MAINSTREAM_KEY } from '../lib/sources'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Keyword } from '../types'

type KeywordsContextValue = {
  keywords: Keyword[]
  loading: boolean
  refresh: (opts?: { quiet?: boolean }) => Promise<void>
  addKeyword: (phrase: string, sourceKeys?: string[]) => Promise<{ id?: string; error?: string }>
  updateKeywordSources: (id: string, sourceKeys: string[]) => Promise<{ error?: string }>
  deleteKeyword: (id: string) => Promise<{ error?: string }>
}

const KeywordsContext = createContext<KeywordsContextValue | null>(null)

// Only the custom (non-built-in) sources change the expansion prompt: without them
// the keyword uses the Serbia prompt, with them the prompt names the outlets.
function expandPromptKey(keys: string[] | null | undefined) {
  const list = keys ?? []
  if (!list.some((k) => k !== SERBIA_MAINSTREAM_KEY)) return ''
  return [...new Set(list)].sort().join(',')
}

function isAiPending(k: Keyword) {
  return !(k.search_terms && k.search_terms.length > 0)
}

export function KeywordsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!user || !isSupabaseConfigured) {
      setKeywords([])
      setLoading(false)
      return
    }
    // Avoid blanking the feed on background polls (AI expand / interval refresh).
    if (!opts?.quiet) setLoading(true)
    const { data, error } = await supabase
      .from('keywords')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (!error) {
      const next = (data as Keyword[]) ?? []
      setKeywords((prev) => (keywordsSnapshotEqual(prev, next) ? prev : next))
    } else {
      setKeywords((prev) => (prev.length === 0 ? prev : []))
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll faster while AI expand is pending
  useEffect(() => {
    if (!user || !keywords.some(isAiPending)) return
    const id = window.setInterval(() => {
      if (!document.hidden) void refresh({ quiet: true })
    }, 3_000)
    return () => window.clearInterval(id)
  }, [user, keywords, refresh])

  const addKeyword = useCallback(
    async (phrase: string, sourceKeys?: string[]) => {
      if (!user || !isSupabaseConfigured) return { error: '请先登录' }
      const trimmed = phrase.trim()
      if (!trimmed) return { error: '请输入关键词' }
      const { data, error } = await supabase
        .from('keywords')
        .insert({
          user_id: user.id,
          phrase: trimmed,
          normalized_phrase: normalizeForMatch(trimmed),
          search_terms: [],
          ai_note: '',
          // Only sent when chosen: no choice means every source, as before.
          ...(sourceKeys && sourceKeys.length > 0 ? { source_keys: sourceKeys } : {}),
        })
        .select('id')
        .maybeSingle()
      if (error) return { error: error.message }
      const id = data?.id as string | undefined
      if (id) {
        // Await expand only (~几秒); crawl is kicked off in the background by the function
        const { error: fnErr } = await supabase.functions.invoke('expand-keyword', {
          body: { keyword_id: id, trigger_crawl: true, force: true },
        })
        if (fnErr) {
          console.warn('expand-keyword failed', fnErr)
        }
      }
      await refresh()
      return { id }
    },
    [user, refresh],
  )

  const updateKeywordSources = useCallback(
    async (id: string, sourceKeys: string[]) => {
      if (!user || !isSupabaseConfigured) return { error: '请先登录' }
      const before = keywords.find((k) => k.id === id)
      const next = [...new Set(sourceKeys)]
      // Re-expand only when the outlets in the prompt changed (their language decides
      // the search terms); either way crawl now so the new sources are read.
      const force = expandPromptKey(before?.source_keys) !== expandPromptKey(next)
      const { error } = await supabase
        .from('keywords')
        .update({
          // Empty = every source, stored as NULL like a keyword that never chose.
          source_keys: next.length > 0 ? next : null,
          // Marks the terms stale, so the hourly crawl re-expands them if the call
          // below fails; a successful expand sets the version back.
          ...(force ? { expand_version: 0 } : {}),
        })
        .eq('id', id)
      if (error) return { error: error.message }
      const { error: fnErr } = await supabase.functions.invoke('expand-keyword', {
        body: { keyword_id: id, trigger_crawl: true, force },
      })
      if (fnErr) console.warn('expand-keyword failed', fnErr)
      await refresh()
      return {}
    },
    [user, keywords, refresh],
  )

  const deleteKeyword = useCallback(
    async (id: string) => {
      if (!user || !isSupabaseConfigured) return { error: '请先登录' }
      const { error } = await supabase.from('keywords').delete().eq('id', id)
      if (error) return { error: error.message }
      await refresh()
      return {}
    },
    [user, refresh],
  )

  const value = useMemo(
    () => ({ keywords, loading, refresh, addKeyword, updateKeywordSources, deleteKeyword }),
    [keywords, loading, refresh, addKeyword, updateKeywordSources, deleteKeyword],
  )

  return <KeywordsContext.Provider value={value}>{children}</KeywordsContext.Provider>
}

export function useKeywords() {
  const ctx = useContext(KeywordsContext)
  if (!ctx) throw new Error('useKeywords must be used within KeywordsProvider')
  return ctx
}

export function keywordAiReady(k: Keyword) {
  const terms = k.search_terms || []
  const groups = k.match_groups || []
  if (terms.length > 0) return true
  if (Array.isArray(groups) && groups.some((g) => Array.isArray(g) && g.length > 0)) return true
  return false
}
