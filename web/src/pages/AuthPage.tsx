import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BrandLogo } from '../components/BrandLogo'
import { IconEye, IconEyeOff } from '../components/NavIcons'
import { TURNSTILE_SITE_KEY, Turnstile, type TurnstileHandle } from '../components/Turnstile'

function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return '邮箱或密码不正确'
  if (m.includes('email not confirmed')) return '邮箱还没确认：请点击注册确认邮件里的链接，没收到可以在下面重新发送'
  if (m.includes('captcha')) return '人机验证没通过，请重新验证后再试'
  if (m.includes('user already registered') || m.includes('user_already_registered')) {
    return '该邮箱已注册，请直接登录'
  }
  if (m.includes('password_too_short') || (m.includes('password') && m.includes('short'))) {
    return '密码不符合要求（至少 6 位）'
  }
  if (m.includes('over_email_send_rate_limit') || m.includes('email rate limit')) {
    return '注册邮件发送太频繁，请约 1 小时后再试'
  }
  if (m.includes('rate limit')) return '操作太频繁，请稍后再试'
  if (m.includes('network_error')) return '网络异常，请稍后再试'
  if (m.includes('signup_failed')) return '注册失败，请稍后再试'
  if (m.includes('supabase is not configured')) {
    return '尚未配置 Supabase，请设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY'
  }
  return message
}

export function AuthPage() {
  const { user, signIn, signUp, resendConfirmation, loading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [searchParams] = useSearchParams()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [linkExpired] = useState(() => searchParams.get('link') === 'expired')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [enterKey, setEnterKey] = useState(0)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const captcha = useRef<TurnstileHandle>(null)
  const captchaRequired = Boolean(TURNSTILE_SITE_KEY)

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  function switchMode() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
    setError(null)
    setMessage(null)
    setUnconfirmedEmail(null)
    setEnterKey((k) => k + 1)
  }

  function needCaptcha(): boolean {
    if (captchaRequired && !captchaToken) {
      setError('请先完成下方的人机验证')
      return true
    }
    return false
  }

  async function onResend() {
    if (!unconfirmedEmail || needCaptcha()) return
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      const { error: err } = await resendConfirmation(unconfirmedEmail, captchaToken ?? undefined)
      if (err) setError(translateAuthError(err))
      else setMessage(`确认邮件已重新发送到 ${unconfirmedEmail}，没收到请看看垃圾邮件。`)
    } finally {
      captcha.current?.reset()
      setBusy(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (needCaptcha()) return
    setBusy(true)
    const token = captchaToken ?? undefined
    const address = email.trim()
    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(address, password, token)
        if (!err) {
          navigate('/')
          return
        }
        setError(translateAuthError(err))
        setUnconfirmedEmail(err.toLowerCase().includes('email not confirmed') ? address : null)
      } else {
        const { error: err, alreadyRegistered } = await signUp(address, password, token)
        if (err) {
          setError(translateAuthError(err))
        } else if (alreadyRegistered) {
          setError('该邮箱已注册，请直接登录')
        } else {
          setMode('signin')
          setEnterKey((k) => k + 1)
          setUnconfirmedEmail(address)
          setMessage(`确认邮件已发送到 ${address}。请点击邮件里的链接完成注册，然后回来登录；没收到请看看垃圾邮件。`)
        }
      }
    } finally {
      captcha.current?.reset()
      setBusy(false)
    }
  }

  const isSignIn = mode === 'signin'

  return (
    <div className="auth" key={enterKey}>
      <section className="auth-poster" aria-label="AutoNews 简介">
        <BrandLogo className="seal-lg" />
        <p className="kicker">AutoNews · 中文电讯</p>
        <p className="auth-poster-title">用中文写下关心的事，每小时收到塞尔维亚的相关报道。</p>
        <ol className="auth-steps">
          <li>
            <b>写下关键词</b>
            <span>一句中文就行，比如「塞尔维亚大选」</span>
          </li>
          <li>
            <b>AI 挑出相关报道</b>
            <span>从 Blic、N1、RTS 等主流媒体里读全文判断</span>
          </li>
          <li>
            <b>改写成中文短讯</b>
            <span>按时间排好，值得留的可以收藏</span>
          </li>
        </ol>
      </section>

      <section className="auth-panel">
        <h1 className="auth-title">{isSignIn ? '登录' : '注册账号'}</h1>
        <p className="auth-sub">{isSignIn ? '欢迎回来。' : '注册后需要点一下邮件里的确认链接。'}</p>

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
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </label>
          {captchaRequired && <Turnstile ref={captcha} onToken={setCaptchaToken} />}
          {linkExpired && !error && !message && (
            <p className="error">确认链接已失效或已使用过。请直接登录；如果提示邮箱未确认，可以重新发送确认邮件。</p>
          )}
          {error && <p className="error">{error}</p>}
          {message && <p className="ok">{message}</p>}
          <button
            className="btn btn-solid"
            type="submit"
            disabled={busy || (captchaRequired && !captchaToken)}
          >
            {busy ? '请稍候…' : isSignIn ? '登录' : '注册'}
          </button>
        </form>

        {isSignIn && unconfirmedEmail && (
          <button type="button" className="auth-switch" onClick={onResend} disabled={busy}>
            没收到确认邮件？重新发送
          </button>
        )}

        <button type="button" className="auth-switch" onClick={switchMode}>
          {isSignIn ? '没有账号？去注册' : '已有账号？去登录'}
        </button>
      </section>
    </div>
  )
}
