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
import type { UserJob } from '../types/jobs'

type JobsContextValue = {
  jobs: UserJob[]
  activeJobs: UserJob[]
  recentDone: UserJob[]
  hasActive: boolean
  refreshJobs: () => Promise<void>
}

const JobsContext = createContext<JobsContextValue | null>(null)

const RECENT_DONE_MS = 90_000

export function JobsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<UserJob[]>([])
  const [now, setNow] = useState(() => Date.now())

  const refreshJobs = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setJobs([])
      return
    }
    const { data, error } = await supabase
      .from('user_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(40)
    if (error) {
      // Table may not exist yet before migration
      console.warn('user_jobs', error.message)
      setJobs([])
      return
    }
    setJobs((data as UserJob[]) ?? [])
  }, [user])

  useEffect(() => {
    void refreshJobs()
  }, [refreshJobs])

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return
    const channel = supabase
      .channel(`user_jobs:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_jobs',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshJobs()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, refreshJobs])

  const hasActive = useMemo(
    () => jobs.some((j) => j.status === 'queued' || j.status === 'running'),
    [jobs],
  )

  useEffect(() => {
    if (!hasActive && jobs.every((j) => j.status !== 'done' && j.status !== 'error')) return
    const id = window.setInterval(() => {
      void refreshJobs()
      setNow(Date.now())
    }, hasActive ? 2500 : 5000)
    return () => window.clearInterval(id)
  }, [hasActive, jobs, refreshJobs])

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === 'queued' || j.status === 'running'),
    [jobs],
  )

  const recentDone = useMemo(
    () =>
      jobs.filter((j) => {
        if (j.status !== 'done' && j.status !== 'error') return false
        const t = Date.parse(j.updated_at || j.created_at)
        return Number.isFinite(t) && now - t < RECENT_DONE_MS
      }),
    [jobs, now],
  )

  const value = useMemo(
    () => ({ jobs, activeJobs, recentDone, hasActive, refreshJobs }),
    [jobs, activeJobs, recentDone, hasActive, refreshJobs],
  )

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}

export function useJobs() {
  const ctx = useContext(JobsContext)
  if (!ctx) throw new Error('useJobs must be used within JobsProvider')
  return ctx
}
