import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useJobsRefresh } from '../context/JobsContext'
import { keywordAiReady, useKeywords } from '../context/KeywordsContext'
import { useSources } from '../context/SourcesContext'
import { useHalfHourPoem } from '../hooks/useHalfHourPoem'
import { FALLBACK_POEM } from '../lib/poems'
import { ProcessBanner } from './ProcessBanner'
import { BrandLogo } from './BrandLogo'
import { ThemeToggle } from './ThemeToggle'
import {
  IconChevron,
  IconLogin,
  IconLogout,
  IconPlus,
  IconRss,
  IconStar,
  IconTrash,
} from './NavIcons'

const SRC_OPEN_KEY = 'autonews-src-open-v1'
const MOBILE_MQ = '(max-width: 960px)'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, configured } = useAuth()
  const { keywords, addKeyword, deleteKeyword } = useKeywords()
  const { items: sourceItems, addSource, deleteSource } = useSources()
  const refreshJobs = useJobsRefresh()
  const navigate = useNavigate()
  const location = useLocation()
  // `collapsed` is the mobile drawer state; on desktop the rail is always shown.
  const [collapsed, setCollapsed] = useState(true)
  const [srcOpen, setSrcOpen] = useState(() => {
    try {
      const v = localStorage.getItem(SRC_OPEN_KEY)
      return v === null ? false : v === '1'
    } catch {
      return false
    }
  })
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [srcAdding, setSrcAdding] = useState(false)
  const [srcDraft, setSrcDraft] = useState('')
  const [srcBusy, setSrcBusy] = useState(false)
  const [srcError, setSrcError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const addFormRef = useRef<HTMLFormElement>(null)
  const srcInputRef = useRef<HTMLInputElement>(null)
  const srcFormRef = useRef<HTMLFormElement>(null)
  const poem = useHalfHourPoem()
  const shownPoem = poem ?? FALLBACK_POEM

  function cancelAdd() {
    if (addBusy) return
    setAdding(false)
    setDraft('')
    setAddError(null)
  }

  function cancelSrcAdd() {
    if (srcBusy) return
    setSrcAdding(false)
    setSrcDraft('')
    setSrcError(null)
  }

  function closeSidebar() {
    setCollapsed(true)
    cancelAdd()
    cancelSrcAdd()
  }

  function toggleSidebar() {
    setCollapsed((v) => !v)
  }

  function isMobileViewport() {
    return typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches
  }

  useEffect(() => {
    if (collapsed && isMobileViewport()) {
      cancelAdd()
      cancelSrcAdd()
    }
  }, [collapsed])

  useEffect(() => {
    try {
      localStorage.setItem(SRC_OPEN_KEY, srcOpen ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [srcOpen])

  useEffect(() => {
    if (adding) {
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [adding])

  useEffect(() => {
    if (srcAdding) {
      setSrcOpen(true)
      window.setTimeout(() => srcInputRef.current?.focus(), 50)
    }
  }, [srcAdding])

  useEffect(() => {
    if (!adding) return
    const onPointerDown = (e: PointerEvent) => {
      const form = addFormRef.current
      if (!form) return
      if (form.contains(e.target as Node)) return
      cancelAdd()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [adding, addBusy])

  useEffect(() => {
    if (!srcAdding) return
    const onPointerDown = (e: PointerEvent) => {
      const form = srcFormRef.current
      if (!form) return
      if (form.contains(e.target as Node)) return
      cancelSrcAdd()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [srcAdding, srcBusy])

  // On mobile, close the left drawer after navigation.
  useEffect(() => {
    if (!isMobileViewport()) return
    setCollapsed(true)
  }, [location.pathname, location.hash])

  // Lock page scroll while the mobile drawer is open.
  useEffect(() => {
    if (collapsed || !isMobileViewport()) {
      document.body.style.removeProperty('overflow')
      return
    }
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.removeProperty('overflow')
    }
  }, [collapsed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!collapsed && isMobileViewport()) closeSidebar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed])

  async function onAddSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user || addBusy) return
    setAddError(null)
    setAddBusy(true)
    void refreshJobs()
    const result = await addKeyword(draft)
    await refreshJobs()
    setAddBusy(false)
    if (result.error) {
      setAddError(result.error)
      return
    }
    setDraft('')
    setAdding(false)
    if (result.id) navigate(`/k/${result.id}`)
  }

  async function onDeleteKeyword(id: string, phrase: string) {
    if (!window.confirm(`确定删除关键词「${phrase}」？\n删除后不可恢复。`)) return
    const result = await deleteKeyword(id)
    if (result.error) {
      window.alert(result.error)
      return
    }
    navigate('/keywords')
  }

  async function onAddSourceSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user || srcBusy) return
    setSrcError(null)
    setSrcBusy(true)
    const result = await addSource(srcDraft)
    setSrcBusy(false)
    if (result.error) {
      setSrcError(result.error)
      return
    }
    setSrcDraft('')
    setSrcAdding(false)
    void refreshJobs()
    if (result.id) navigate(`/s/${result.id}`)
    else navigate('/sources')
  }

  async function onDeleteSource(id: string, label: string) {
    if (!window.confirm(`确定删除抓取源「${label}」？\n已抓到的新闻会保留。`)) return
    const result = await deleteSource(id)
    if (result.error) {
      window.alert(result.error)
      return
    }
    if (location.pathname === `/s/${id}`) navigate('/sources')
  }

  const today = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())

  function openAddKeyword() {
    setAddError(null)
    setAdding(true)
  }

  return (
    <div className={`shell${collapsed ? '' : ' drawer-open'}`}>
      <header className="topbar">
        <Link to="/" className="brand brand-compact" aria-label="AutoNews 首页">
          <BrandLogo />
          <span className="brand-word">AutoNews</span>
        </Link>
        <button
          type="button"
          className="topbar-menu"
          onClick={toggleSidebar}
          aria-expanded={!collapsed}
          aria-controls="rail"
        >
          {collapsed ? '目录' : '关闭'}
        </button>
        {user && keywords.length > 0 && (
          <nav className="chipbar" aria-label="关键词">
            <NavLink to="/keywords" end className="chip">
              全部
            </NavLink>
            {keywords.map((k) => (
              <NavLink key={k.id} to={`/k/${k.id}`} className="chip">
                {k.phrase}
                {!keywordAiReady(k) && <span className="spinner-dot" aria-label="处理中" />}
              </NavLink>
            ))}
            <button
              type="button"
              className="chip chip-add"
              aria-label="添加关键词"
              onClick={() => {
                setCollapsed(false)
                openAddKeyword()
              }}
            >
              +
            </button>
          </nav>
        )}
      </header>

      <button
        type="button"
        className="scrim"
        aria-label="关闭目录"
        tabIndex={collapsed ? -1 : 0}
        onClick={closeSidebar}
      />

      <aside id="rail" className="rail" aria-label="主导航">
        <Link to="/" className="brand" title="AutoNews">
          <BrandLogo />
          <span className="brand-text">
            <span className="brand-word">AutoNews</span>
            <span className="brand-sub">关键词新闻 · 中文电讯</span>
          </span>
        </Link>
        <p className="rail-date">{today}</p>

        <nav className="rail-nav">
          <section className="rail-section">
            <h2 className="rail-heading">订阅</h2>
            <ul className="rail-list">
              <li>
                <NavLink to="/keywords" end className="rail-link">
                  <span className="rail-mark" aria-hidden>
                    ¶
                  </span>
                  <span className="rail-label">全部关键词</span>
                </NavLink>
              </li>
              {user &&
                keywords.map((k) => (
                  <li key={k.id} className="rail-row">
                    <NavLink to={`/k/${k.id}`} className="rail-link" title={k.phrase}>
                      <span className="rail-mark" aria-hidden>
                        #
                      </span>
                      <span className="rail-label">{k.phrase}</span>
                      {!keywordAiReady(k) && (
                        <span className="spinner-dot" title="AI 处理中" aria-label="处理中" />
                      )}
                    </NavLink>
                    <button
                      type="button"
                      className="rail-delete"
                      title={`删除「${k.phrase}」`}
                      aria-label={`删除「${k.phrase}」`}
                      onClick={() => void onDeleteKeyword(k.id, k.phrase)}
                    >
                      <IconTrash />
                    </button>
                  </li>
                ))}
              <li>
                {user ? (
                  adding ? (
                    <form
                      ref={addFormRef}
                      className="rail-add-form"
                      onSubmit={(e) => void onAddSubmit(e)}
                    >
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder="如：塞尔维亚大选"
                        aria-label="新关键词"
                        value={draft}
                        maxLength={200}
                        disabled={addBusy}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') cancelAdd()
                        }}
                      />
                      <button type="submit" disabled={addBusy || !draft.trim()}>
                        {addBusy ? '…' : '添加'}
                      </button>
                      {addError && <p className="form-error">{addError}</p>}
                    </form>
                  ) : (
                    <button type="button" className="rail-link rail-add" onClick={openAddKeyword}>
                      <span className="rail-mark" aria-hidden>
                        <IconPlus />
                      </span>
                      <span className="rail-label">添加关键词</span>
                    </button>
                  )
                ) : (
                  <Link to="/auth" className="rail-link rail-add">
                    <span className="rail-mark" aria-hidden>
                      <IconPlus />
                    </span>
                    <span className="rail-label">登录后添加关键词</span>
                  </Link>
                )}
              </li>
            </ul>
          </section>

          {user && (
            <section className="rail-section">
              <h2 className="rail-heading">
                <button
                  type="button"
                  className="rail-fold"
                  aria-expanded={srcOpen}
                  aria-controls="rail-sources"
                  onClick={() => setSrcOpen((v) => !v)}
                >
                  抓取源
                  <IconChevron />
                </button>
              </h2>
              {srcOpen && (
                <ul id="rail-sources" className="rail-list">
                  <li>
                    <NavLink to="/sources" end className="rail-link">
                      <span className="rail-mark" aria-hidden>
                        ¶
                      </span>
                      <span className="rail-label">全部抓取源</span>
                    </NavLink>
                  </li>
                  {sourceItems.map((s) => (
                    <li key={s.id} className="rail-row">
                      <NavLink to={`/s/${s.id}`} className="rail-link" title={s.errorText || s.label}>
                        <span className="rail-mark" aria-hidden>
                          <IconRss />
                        </span>
                        <span className="rail-label">{s.label}</span>
                        {s.status === 'pending' && (
                          <span className="spinner-dot" title="解析中" aria-label="解析中" />
                        )}
                        {s.status === 'error' && (
                          <span className="rail-flag" title={s.errorText || '解析失败'}>
                            !
                          </span>
                        )}
                      </NavLink>
                      <button
                        type="button"
                        className="rail-delete"
                        title={`删除「${s.label}」`}
                        aria-label={`删除「${s.label}」`}
                        onClick={() => void onDeleteSource(s.id, s.label)}
                      >
                        <IconTrash />
                      </button>
                    </li>
                  ))}
                  <li>
                    {srcAdding ? (
                      <form
                        ref={srcFormRef}
                        className="rail-add-form"
                        onSubmit={(e) => void onAddSourceSubmit(e)}
                      >
                        <input
                          ref={srcInputRef}
                          type="text"
                          placeholder="网站、RSS 或媒体范围"
                          aria-label="新抓取源"
                          value={srcDraft}
                          maxLength={200}
                          disabled={srcBusy}
                          onChange={(e) => setSrcDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelSrcAdd()
                          }}
                        />
                        <button type="submit" disabled={srcBusy || !srcDraft.trim()}>
                          {srcBusy ? '…' : '添加'}
                        </button>
                        {srcError && <p className="form-error">{srcError}</p>}
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="rail-link rail-add"
                        onClick={() => {
                          setSrcError(null)
                          setSrcAdding(true)
                        }}
                      >
                        <span className="rail-mark" aria-hidden>
                          <IconPlus />
                        </span>
                        <span className="rail-label">添加抓取源</span>
                      </button>
                    )}
                  </li>
                </ul>
              )}
            </section>
          )}

          <section className="rail-section">
            <ul className="rail-list">
              <li>
                <NavLink to="/stars" className="rail-link">
                  <span className="rail-mark" aria-hidden>
                    <IconStar />
                  </span>
                  <span className="rail-label">收藏夹</span>
                </NavLink>
              </li>
              <li>
                {!user ? (
                  <NavLink to="/auth" className="rail-link">
                    <span className="rail-mark" aria-hidden>
                      <IconLogin />
                    </span>
                    <span className="rail-label">登录 / 注册</span>
                  </NavLink>
                ) : (
                  <button
                    type="button"
                    className="rail-link"
                    title={user.email ?? undefined}
                    onClick={() => {
                      if (window.confirm('确定要退出登录吗？')) void signOut()
                    }}
                  >
                    <span className="rail-mark" aria-hidden>
                      <IconLogout />
                    </span>
                    <span className="rail-label">退出登录</span>
                  </button>
                )}
              </li>
            </ul>
          </section>
        </nav>

        {/* Until the couplet file loads, the fallback holds the space invisibly. */}
        <figure className={`rail-poem${poem ? ' is-ready' : ''}`} aria-hidden={!poem}>
          <blockquote>
            {shownPoem.lines[0]}，
            <br />
            {shownPoem.lines[1]}。
          </blockquote>
          <figcaption>
            {shownPoem.author}《{shownPoem.title}》
          </figcaption>
        </figure>

        <ThemeToggle />
      </aside>

      <div className="page">
        {!configured && <div className="notice notice-warn">请先配置 Supabase 并完成数据库迁移。</div>}
        <ProcessBanner />
        <main className="main">{children}</main>
        <footer className="colophon">
          © {new Date().getFullYear()} AutoNews ·{' '}
          <a href="mailto:speechlessgorilla@gmail.com">speechlessgorilla@gmail.com</a>
        </footer>
      </div>
    </div>
  )
}
