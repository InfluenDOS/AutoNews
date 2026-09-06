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
import {
  isSerbiaMainstreamPhrase,
  looksLikeFeedUrl,
  SERBIA_MAINSTREAM_FEEDS,
  SERBIA_MAINSTREAM_KEY,
  SERBIA_MAINSTREAM_LABEL,
} from '../lib/sources'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { SourceBundle, SourceFeed } from '../types'

export type SourceListItem = {
  id: string
  label: string
  kind: 'preset' | 'rss' | 'fuzzy'
  status: 'pending' | 'ready' | 'error'
  virtual?: boolean
  errorText?: string
  feeds: SourceFeed[]
}

type SourcesContextValue = {
  bundles: SourceBundle[]
  items: SourceListItem[]
  extraNewsNames: string[]
  defaultEnabled: boolean
  loading: boolean
  refresh: (opts?: { quiet?: boolean }) => Promise<void>
  addSource: (input: string) => Promise<{ id?: string; error?: string }>
  deleteSource: (id: string) => Promise<{ error?: string }>
}

const SourcesContext = createContext<SourcesContextValue | null>(null)

function parseFeeds(raw: unknown): SourceFeed[] {
  if (!Array.isArray(raw)) return []
  const out: SourceFeed[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const name = String(rec.name || '').trim()
    const url = String(rec.url || '').trim()
    if (!name || !url) continue
    out.push({ name, url, country: String(rec.country || '') })
  }
  return out
}

export function SourcesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [bundles, setBundles] = useState<SourceBundle[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!user || !isSupabaseConfigured) {
        setBundles([])
        setLoading(false)
        return
      }
      if (!opts?.quiet) setLoading(true)
      const { data, error } = await supabase
        .from('user_source_bundles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (error) {
        console.warn('user_source_bundles', error.message)
        setBundles([])
      } else {
        setBundles(
          ((data as SourceBundle[]) ?? []).map((row) => ({
            ...row,
            resolved_feeds: parseFeeds(row.resolved_feeds),
          })),
        )
      }
      setLoading(false)
    },
    [user],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!user || !bundles.some((b) => b.status === 'pending')) return
    const id = window.setInterval(() => void refresh({ quiet: true }), 3_000)
    return () => window.clearInterval(id)
  }, [user, bundles, refresh])

  const presetRow = useMemo(
    () => bundles.find((b) => b.kind === 'preset' && b.preset_key === SERBIA_MAINSTREAM_KEY) ?? null,
    [bundles],
  )
  const defaultEnabled = !presetRow || presetRow.enabled

  const customReady = useMemo(
    () => bundles.filter((b) => b.kind !== 'preset' && b.enabled && b.status === 'ready'),
    [bundles],
  )

  const items = useMemo<SourceListItem[]>(() => {
    const out: SourceListItem[] = []
    if (defaultEnabled) {
      out.push({
        id: presetRow?.id || 'default',
        label: SERBIA_MAINSTREAM_LABEL,
        kind: 'preset',
        status: 'ready',
        virtual: !presetRow,
        feeds: SERBIA_MAINSTREAM_FEEDS.map((f) => ({ ...f })),
      })
    }
    for (const b of bundles) {
      if (b.kind === 'preset') continue
      out.push({
        id: b.id,
        label: b.label,
        kind: b.kind,
        status: b.status,
        errorText: b.error_text,
        feeds: b.resolved_feeds,
      })
    }
    return out
  }, [bundles, defaultEnabled, presetRow])

  const extraNewsNames = useMemo(() => {
    const names = new Set<string>()
    for (const b of customReady) {
      for (const f of b.resolved_feeds) {
        if (f.name) names.add(f.name)
      }
    }
    return [...names]
  }, [customReady])

  const addSource = useCallback(
    async (input: string) => {
      if (!user || !isSupabaseConfigured) return { error: '请先登录' }
      const trimmed = input.trim()
      if (!trimmed) return { error: '请输入网站、RSS 或媒体范围' }

      if (isSerbiaMainstreamPhrase(trimmed)) {
        if (defaultEnabled) return { error: '已包含「塞尔维亚主流媒体」' }
        if (presetRow) {
          const { error } = await supabase
            .from('user_source_bundles')
            .update({ enabled: true, status: 'ready', error_text: '' })
            .eq('id', presetRow.id)
          if (error) return { error: error.message }
          await refresh()
          return { id: presetRow.id }
        }
        const { data, error } = await supabase
          .from('user_source_bundles')
          .insert({
            user_id: user.id,
            label: SERBIA_MAINSTREAM_LABEL,
            kind: 'preset',
            preset_key: SERBIA_MAINSTREAM_KEY,
            enabled: true,
            status: 'ready',
            resolved_feeds: [],
          })
          .select('id')
          .maybeSingle()
        if (error) return { error: error.message }
        await refresh()
        return { id: (data?.id as string | undefined) || 'default' }
      }

      const asUrl = looksLikeFeedUrl(trimmed)
      let hostLabel = trimmed
      if (asUrl) {
        try {
          const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
          hostLabel = new URL(href).hostname.replace(/^www\./, '')
        } catch {
          hostLabel = trimmed
        }
      }

      const { data, error } = await supabase
        .from('user_source_bundles')
        .insert({
          user_id: user.id,
          label: asUrl ? hostLabel : trimmed,
          kind: asUrl ? 'rss' : 'fuzzy',
          rss_url: asUrl ? (/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`) : null,
          enabled: true,
          status: 'pending',
          resolved_feeds: [],
        })
        .select('id')
        .maybeSingle()
      if (error) {
        if (error.message.toLowerCase().includes('duplicate')) return { error: '这个抓取源已经添加过了' }
        return { error: error.message }
      }
      const id = data?.id as string | undefined
      if (id) {
        const { error: fnErr } = await supabase.functions.invoke('expand-source', {
          body: { bundle_id: id },
        })
        if (fnErr) console.warn('expand-source failed', fnErr)
      }
      await refresh()
      return { id }
    },
    [user, defaultEnabled, presetRow, refresh],
  )

  const deleteSource = useCallback(
    async (id: string) => {
      if (!user || !isSupabaseConfigured) return { error: '请先登录' }
      const removingDefault = id === 'default' || id === presetRow?.id
      const remainingCustom = customReady.filter((b) => b.id !== id).length
      if (removingDefault && remainingCustom === 0) {
        return { error: '至少保留一个抓取源' }
      }
      if (!removingDefault && remainingCustom === 0 && !defaultEnabled) {
        return { error: '至少保留一个抓取源' }
      }

      if (removingDefault) {
        if (presetRow) {
          const { error } = await supabase
            .from('user_source_bundles')
            .update({ enabled: false })
            .eq('id', presetRow.id)
          if (error) return { error: error.message }
        } else {
          const { error } = await supabase.from('user_source_bundles').insert({
            user_id: user.id,
            label: SERBIA_MAINSTREAM_LABEL,
            kind: 'preset',
            preset_key: SERBIA_MAINSTREAM_KEY,
            enabled: false,
            status: 'ready',
            resolved_feeds: [],
          })
          if (error) return { error: error.message }
        }
        await refresh()
        return {}
      }

      const { error } = await supabase.from('user_source_bundles').delete().eq('id', id)
      if (error) return { error: error.message }
      await refresh()
      return {}
    },
    [user, presetRow, customReady, defaultEnabled, refresh],
  )

  const value = useMemo(
    () => ({
      bundles,
      items,
      extraNewsNames,
      defaultEnabled,
      loading,
      refresh,
      addSource,
      deleteSource,
    }),
    [bundles, items, extraNewsNames, defaultEnabled, loading, refresh, addSource, deleteSource],
  )

  return <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>
}

export function useSources() {
  const ctx = useContext(SourcesContext)
  if (!ctx) throw new Error('useSources must be used within SourcesProvider')
  return ctx
}
