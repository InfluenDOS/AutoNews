import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { jobsSnapshotEqual } from '../lib/listSnapshot'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { UserJob } from '../types/jobs'
import { useAuth } from './AuthContext'

type JobsActionsValue = {
  refreshJobs: () => Promise<void>
}

type JobsStatusValue = {
  hasActive: boolean
}

type JobsDataValue = {
  jobs: UserJob[]
}

const JobsActionsContext = createContext<JobsActionsValue | null>(null)
const JobsStatusContext = createContext<JobsStatusValue | null>(null)
const JobsDataContext = createContext<JobsDataValue | null>(null)

export const RECENT_DONE_MS = 90_000

export function JobsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<UserJob[]>([])

  const refreshJobs = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setJobs((prev) => (prev.length === 0 ? prev : []))
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
      setJobs((prev) => (prev.length === 0 ? prev : []))
      return
    }
    const next = (data as UserJob[]) ?? []
    setJobs((prev) => (jobsSnapshotEqual(prev, next) ? prev : next))
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

  // Realtime pushes job changes; polling is only a fallback while a job is in
  // flight or finished within RECENT_DONE_MS (the banner still shows it). Each poll
  // is ~100 KB, so polling for as long as any job had *ever* finished used to cost
  // over 1 GB of database egress per day for a single open tab.
  useEffect(() => {
    const finishedAt = jobs
      .filter((j) => j.status === 'done' || j.status === 'error')
      .map((j) => Date.parse(j.updated_at || j.created_at) || 0)
    const pollUntil = Math.max(0, ...finishedAt) + RECENT_DONE_MS
    if (!hasActive && Date.now() > pollUntil) return
    const id = window.setInterval(() => {
      if (!hasActive && Date.now() > pollUntil) {
        window.clearInterval(id)
        return
      }
      if (!document.hidden) void refreshJobs()
    }, hasActive ? 2500 : 5000)
    return () => window.clearInterval(id)
  }, [hasActive, jobs, refreshJobs])

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void refreshJobs()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshJobs])

  const actions = useMemo(() => ({ refreshJobs }), [refreshJobs])
  const status = useMemo(() => ({ hasActive }), [hasActive])
  const data = useMemo(() => ({ jobs }), [jobs])

  return (
    <JobsActionsContext.Provider value={actions}>
      <JobsStatusContext.Provider value={status}>
        <JobsDataContext.Provider value={data}>{children}</JobsDataContext.Provider>
      </JobsStatusContext.Provider>
    </JobsActionsContext.Provider>
  )
}

export function useJobsRefresh() {
  const ctx = useContext(JobsActionsContext)
  if (!ctx) throw new Error('useJobsRefresh must be used within JobsProvider')
  return ctx.refreshJobs
}

export function useJobsStatus() {
  const ctx = useContext(JobsStatusContext)
  if (!ctx) throw new Error('useJobsStatus must be used within JobsProvider')
  return ctx
}

export function useJobs() {
  const data = useContext(JobsDataContext)
  const status = useContext(JobsStatusContext)
  const actions = useContext(JobsActionsContext)
  if (!data || !status || !actions) throw new Error('useJobs must be used within JobsProvider')
  return { jobs: data.jobs, hasActive: status.hasActive, refreshJobs: actions.refreshJobs }
}
