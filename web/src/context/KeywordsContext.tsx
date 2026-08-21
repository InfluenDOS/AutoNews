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
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { normalizeForMatch } from '../lib/normalize'
import type { Keyword } from '../types'

type KeywordsContextValue = {
  keywords: Keyword[]
  loading: boolean
  refresh: () => Promise<void>
  addKeyword: (phrase: string) => Promise<{ id?: string; error?: string }>
  deleteKeyword: (id: string) => Promise<{ error?: string }>
}

const KeywordsContext = createContext<KeywordsContextValue | null>(null)

function isAiPending(k: Keyword) {
  return !(k.search_terms && k.search_terms.length > 0)
}

export function KeywordsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setKeywords([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('keywords')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (!error) setKeywords((data as Keyword[]) ?? [])
    else setKeywords([])
    setLoading(false)
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll while any keyword waits for AI search_terms
  useEffect(() => {
    if (!user || !keywords.some(isAiPending)) return
    const id = window.setInterval(() => void refresh(), 8_000)
    return () => window.clearInterval(id)
  }, [user, keywords, refresh])

  const addKeyword = useCallback(
    async (phrase: string) => {
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
        })
        .select('id')
        .maybeSingle()
      if (error) return { error: error.message }
      await refresh()
      return { id: data?.id as string | undefined }
    },
    [user, refresh],
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
    () => ({ keywords, loading, refresh, addKeyword, deleteKeyword }),
    [keywords, loading, refresh, addKeyword, deleteKeyword],
  )

  return <KeywordsContext.Provider value={value}>{children}</KeywordsContext.Provider>
}

export function useKeywords() {
  const ctx = useContext(KeywordsContext)
  if (!ctx) throw new Error('useKeywords must be used within KeywordsProvider')
  return ctx
}

export function keywordAiReady(k: Keyword) {
  return Boolean(k.search_terms && k.search_terms.length > 0)
}
