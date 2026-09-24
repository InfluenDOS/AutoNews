import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
  signUp: (
    email: string,
    password: string,
    captchaToken?: string,
  ) => Promise<{ error: string | null; alreadyRegistered?: boolean }>
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: string | null }>
  resendConfirmation: (email: string, captchaToken?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setUser(next?.user ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, captchaToken?: string) => {
    if (!isSupabaseConfigured) {
      return { error: '尚未配置 Supabase，请设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY' }
    }
    // Plain signUp so Supabase enforces the captcha and sends the confirmation email.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { captchaToken, emailRedirectTo: `${window.location.origin}/` },
    })
    if (error) return { error: error.message }
    // With confirmation on, an existing address gets a user with no identities
    // instead of an error (so addresses cannot be enumerated) and no email.
    return { error: null, alreadyRegistered: data.user?.identities?.length === 0 }
  }, [])

  const signIn = useCallback(async (email: string, password: string, captchaToken?: string) => {
    if (!isSupabaseConfigured) {
      return { error: '尚未配置 Supabase，请设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY' }
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    })
    return { error: error?.message ?? null }
  }, [])

  const resendConfirmation = useCallback(async (email: string, captchaToken?: string) => {
    if (!isSupabaseConfigured) return { error: 'supabase is not configured' }
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { captchaToken, emailRedirectTo: `${window.location.origin}/` },
    })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      configured: isSupabaseConfigured,
      signUp,
      signIn,
      resendConfirmation,
      signOut,
    }),
    [user, session, loading, signUp, signIn, resendConfirmation, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
