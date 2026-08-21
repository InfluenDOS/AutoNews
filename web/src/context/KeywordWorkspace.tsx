import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { requestCrawl } from '../lib/crawl'
import { normalizeForMatch } from '../lib/normalize'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Keyword } from '../types'

const PENDING_POLL_MS = 8_000
const COLLAPSE_KEY = 'autonews.kwSidebarCollapsed'
const SELECTED_KEY = 'autonews.selectedKeywordId'

function isPending(k: Keyword): boolean {
  return !(k.search_terms || []).length
}

type KeywordWorkspaceValue = {
  keywords: Keyword[]
  selectedId: string | null
  selected: Keyword | null
  loading: boolean
  saving: boolean
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  selectKeyword: (id: string) => void
  addKeyword: (phrase: string) => Promise<Keyword | null>
  deleteKeyword: (id: string) => Promise<boolean>
  refreshKeywords: (opts?: { quiet?: boolean }) => Promise<void>
}

const KeywordWorkspaceContext = createContext<KeywordWorkspaceValue | null>(null)

export function KeywordWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const hadPendingRef = useRef(false)

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    try {
      localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  const refreshKeywords = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!user || !isSupabaseConfigured) {
        setKeywords([])
        setSelectedId(null)
        setLoading(false)
        return
      }
      if (!opts?.quiet) setLoading(true)
      const { data, error } = await supabase
        .from('keywords')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) {
        showToast(error.message, 'error')
        setLoading(false)
        return
      }
      const rows = (data as Keyword[]) ?? []
      const pending = rows.some(isPending)
      if (hadPendingRef.current && !pending && rows.length > 0) {
        showToast('关键词已就绪', 'ok')
      }
      hadPendingRef.current = pending
      setKeywords(rows)
      setLoading(false)
    },
    [user, showToast],
  )

  useEffect(() => {
    void refreshKeywords()
  }, [refreshKeywords])

  useEffect(() => {
    if (!user || !keywords.some(isPending)) return
    const id = window.setInterval(() => void refreshKeywords({ quiet: true }), PENDING_POLL_MS)
    return () => window.clearInterval(id)
  }, [user, keywords, refreshKeywords])

  // Resolve selection: URL > localStorage > first keyword
  useEffect(() => {
    if (!user) {
      setSelectedId(null)
      return
    }
    if (keywords.length === 0) {
      setSelectedId(null)
      return
    }
    const fromUrl = searchParams.get('kw')
    let stored: string | null = null
    try {
      stored = localStorage.getItem(SELECTED_KEY)
    } catch {
      stored = null
    }
    const preferred =
      (fromUrl && keywords.some((k) => k.id === fromUrl) && fromUrl) ||
      (stored && keywords.some((k) => k.id === stored) && stored) ||
      keywords[0]!.id
    setSelectedId(preferred)
  }, [user, keywords, searchParams])

  const selectKeyword = useCallback(
    (id: string) => {
      setSelectedId(id)
      try {
        localStorage.setItem(SELECTED_KEY, id)
      } catch {
        /* ignore */
      }
      const next = new URLSearchParams(searchParams)
      next.set('kw', id)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  async function triggerCrawlAfterChange() {
    const result = await requestCrawl()
    if (result.ok) {
      showToast('已开始处理关键词', 'ok')
      return
    }
    if (result.kind === 'rate_limit') {
      showToast('已保存，抓取冷却中', 'info')
      return
    }
    showToast(result.message, 'info')
  }

  const addKeyword = useCallback(
    async (phrase: string) => {
      if (!user || saving) return null
      const trimmed = phrase.trim()
      if (!trimmed) return null
      setSaving(true)
      const { data, error } = await supabase
        .from('keywords')
        .insert({
          user_id: user.id,
          phrase: trimmed,
          normalized_phrase: normalizeForMatch(trimmed),
          search_terms: [],
          ai_note: '',
        })
        .select('*')
        .single()
      if (error) {
        showToast(error.message || '添加失败', 'error')
        setSaving(false)
        return null
      }
      const row = data as Keyword
      showToast('已添加，正在交给 AI…', 'ok')
      await refreshKeywords({ quiet: true })
      selectKeyword(row.id)
      await triggerCrawlAfterChange()
      setSaving(false)
      return row
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, saving, showToast, refreshKeywords, selectKeyword],
  )

  const deleteKeyword = useCallback(
    async (id: string) => {
      if (!user || saving) return false
      setSaving(true)
      const { error } = await supabase.from('keywords').delete().eq('id', id)
      if (error) {
        showToast(error.message || '删除失败', 'error')
        setSaving(false)
        return false
      }
      showToast('已删除关键词', 'ok')
      const remaining = keywords.filter((k) => k.id !== id)
      setKeywords(remaining)
      if (remaining[0]) selectKeyword(remaining[0].id)
      else {
        setSelectedId(null)
        try {
          localStorage.removeItem(SELECTED_KEY)
        } catch {
          /* ignore */
        }
        const next = new URLSearchParams(searchParams)
        next.delete('kw')
        setSearchParams(next, { replace: true })
      }
      await triggerCrawlAfterChange()
      setSaving(false)
      return true
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, saving, keywords, showToast, selectKeyword, searchParams, setSearchParams],
  )

  const selected = useMemo(
    () => keywords.find((k) => k.id === selectedId) ?? null,
    [keywords, selectedId],
  )

  const value = useMemo(
    () => ({
      keywords,
      selectedId,
      selected,
      loading,
      saving,
      collapsed,
      setCollapsed,
      selectKeyword,
      addKeyword,
      deleteKeyword,
      refreshKeywords,
    }),
    [
      keywords,
      selectedId,
      selected,
      loading,
      saving,
      collapsed,
      setCollapsed,
      selectKeyword,
      addKeyword,
      deleteKeyword,
      refreshKeywords,
    ],
  )

  return (
    <KeywordWorkspaceContext.Provider value={value}>{children}</KeywordWorkspaceContext.Provider>
  )
}

export function useKeywordWorkspace() {
  const ctx = useContext(KeywordWorkspaceContext)
  if (!ctx) throw new Error('useKeywordWorkspace must be used within KeywordWorkspaceProvider')
  return ctx
}
