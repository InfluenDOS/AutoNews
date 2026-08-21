import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return '邮箱或密码不正确'
  if (m.includes('email not confirmed')) return '请先在邮箱中确认账号，或在 Supabase 关闭邮箱验证'
  if (m.includes('user already registered')) return '该邮箱已注册，请直接登录'
  if (m.includes('password')) return '密码不符合要求（至少 6 位）'
  if (m.includes('rate limit')) return '操作太频繁，请稍后再试'
  if (m.includes('supabase is not configured')) {
    return '尚未配置 Supabase，请设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY'
  }
  return message
}

export function AuthPage() {
  const { user, signIn, signUp, loading } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email.trim(), password)
        if (err) {
          setError(translateAuthError(err))
          showToast('登录失败', 'error')
        } else {
          showToast('登录成功', 'ok')
          navigate('/')
        }
      } else {
        const { error: err } = await signUp(email.trim(), password)
        if (err) {
          setError(translateAuthError(err))
          showToast('注册失败', 'error')
        } else {
          setMessage('注册成功。若开启了邮箱确认，请先查收邮件再登录。')
          showToast('注册成功', 'ok')
          setMode('signin')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel auth-panel">
      <h1>{mode === 'signin' ? '登录' : '注册账号'}</h1>
      <p className="muted">保存关键词、筛选塞尔维亚新闻，并将感兴趣的文章加入收藏夹。</p>

      <form className="form" onSubmit={onSubmit}>
        <label>
          邮箱
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="ok">{message}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? '请稍候…' : mode === 'signin' ? '登录' : '注册'}
        </button>
      </form>

      <button
        type="button"
        className="linkish"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
          setError(null)
          setMessage(null)
        }}
      >
        {mode === 'signin' ? '没有账号？去注册' : '已有账号？去登录'}
      </button>
    </section>
  )
}
