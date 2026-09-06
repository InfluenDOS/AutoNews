import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function useCrawlTrigger() {
  const { user } = useAuth()
  const [remaining, setRemaining] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshRemaining = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setRemaining(0)
      return
    }
    const { data, error: err } = await supabase.rpc('crawl_cooldown_remaining')
    if (err) {
      console.warn('crawl_cooldown_remaining', err.message)
      return
    }
    setRemaining(Math.max(0, Number(data) || 0))
  }, [user])

  useEffect(() => {
    void refreshRemaining()
  }, [refreshRemaining])

  const cooling = remaining > 0

  useEffect(() => {
    if (!cooling) return
    const id = window.setInterval(() => {
      setRemaining((v) => (v > 0 ? v - 1 : 0))
    }, 1000)
    return () => window.clearInterval(id)
  }, [cooling])

  const trigger = useCallback(
    async (keywordId?: string | null) => {
      if (!user || !isSupabaseConfigured || busy || remaining > 0) return { triggered: false }
      setBusy(true)
      setError(null)
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('trigger-crawl', {
          body: { keyword_id: keywordId || null },
        })
        if (fnErr) {
          setError(fnErr.message)
          return { triggered: false, error: fnErr.message }
        }
        const payload = (data ?? {}) as {
          triggered?: boolean
          remaining_sec?: number
          error?: string
          reason?: string
        }
        if (payload.error && !payload.triggered) {
          setError(payload.error)
        }
        const left = Math.max(0, Number(payload.remaining_sec) || 0)
        if (left > 0) setRemaining(left)
        else await refreshRemaining()
        return { triggered: Boolean(payload.triggered), reason: payload.reason }
      } finally {
        setBusy(false)
      }
    },
    [user, busy, remaining, refreshRemaining],
  )

  return { remaining, cooling, busy, error, trigger, refreshRemaining }
}
