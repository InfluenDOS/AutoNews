import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useJobs } from '../context/JobsContext'
import { keywordAiReady, useKeywords } from '../context/KeywordsContext'
import { useSources } from '../context/SourcesContext'
import { loadDailyPoem, type DailyPoem } from '../lib/dailyPoem'
import { ProcessBanner } from './ProcessBanner'
import { BrandLogo } from './BrandLogo'
import {
  IconChevron,
  IconHash,
  IconKeywords,
  IconLogin,
  IconLogout,
  IconPlus,
  IconRss,
  IconStar,
  IconTrash,
} from './NavIcons'

const STORAGE_KEY = 'autonews-sidebar-collapsed'
const KW_OPEN_KEY = 'autonews-kw-open-v2'
const SRC_OPEN_KEY = 'autonews-src-open-v1'
const MOBILE_MQ = '(max-width: 960px)'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, configured } = useAuth()
  const { keywords, addKeyword, deleteKeyword } = useKeywords()
  const { items: sourceItems, addSource, deleteSource } = useSources()
  const { refreshJobs } = useJobs()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches) {
        return true
      }
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [kwOpen, setKwOpen] = useState(() => {
    try {
      const v = localStorage.getItem(KW_OPEN_KEY)
      return v === null ? false : v === '1'
    } catch {
      return false
    }
  })
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
  const [poem, setPoem] = useState<DailyPoem | null>(null)

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
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (collapsed) {
      cancelAdd()
      cancelSrcAdd()
    }
  }, [collapsed])

  useEffect(() => {
    try {
      localStorage.setItem(KW_OPEN_KEY, kwOpen ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [kwOpen])

  useEffect(() => {
    try {
      localStorage.setItem(SRC_OPEN_KEY, srcOpen ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [srcOpen])

  useEffect(() => {
    if (adding) {
      setKwOpen(true)
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

  useEffect(() => {
    let cancelled = false
    void loadDailyPoem()
      .then((p) => {
        if (!cancelled) setPoem(p)
      })
      .catch(() => {
        if (!cancelled) setPoem(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="stage-bg" aria-hidden="true">
        <div className="stage-photo" />
        <div className="stage-shade" />
        <div className="stage-blob stage-blob-a" />
        <div className="stage-blob stage-blob-b" />
      </div>

      <button
        type="button"
        className="sidebar-scrim"
        aria-label="关闭侧边栏"
        tabIndex={collapsed ? -1 : 0}
        onClick={closeSidebar}
      />

      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-body">
          <Link to="/" className="side-brand" title="AutoNews">
            <BrandLogo />
            <span className="brand-name">
              AutoNews
              <small>关键词订阅新闻</small>
            </span>
          </Link>

          <nav id="side-nav" className="side-nav">
            <div className={`side-group${kwOpen ? '' : ' is-folded'}`}>
              <div className="side-item-row">
                <NavLink to="/keywords" className="side-item side-item-grow" title="关键词" end>
                  <span className="nav-icon" aria-hidden>
                    <IconKeywords />
                  </span>
                  <span className="nav-label">关键词</span>
                </NavLink>
                <button
                  type="button"
                  className="side-fold"
                  aria-expanded={kwOpen}
                  aria-controls="side-kw-children"
                  title={kwOpen ? '收起关键词列表' : '展开关键词列表'}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setKwOpen((v) => !v)
                  }}
                >
                  <IconChevron />
                </button>
              </div>

              <div
                id="side-kw-children"
                className="side-children-panel"
                aria-hidden={!kwOpen}
              >
                <div className="side-children">
                  {user &&
                    keywords.map((k) => (
                      <div key={k.id} className="side-kw-row">
                        <NavLink
                          to={`/k/${k.id}`}
                          className="side-item side-item-child side-item-grow"
                          title={k.phrase}
                          tabIndex={kwOpen ? undefined : -1}
                        >
                          <span className="nav-icon" aria-hidden>
                            <IconHash />
                          </span>
                          <span className="nav-label">{k.phrase}</span>
                          {!keywordAiReady(k) && (
                            <span
                              className="kw-spinner"
                              title="AI 处理中"
                              aria-label="加载中"
                            />
                          )}
                        </NavLink>
                        <button
                          type="button"
                          className="side-kw-delete"
                          title={`删除「${k.phrase}」`}
                          tabIndex={kwOpen ? undefined : -1}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void onDeleteKeyword(k.id, k.phrase)
                          }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    ))}

                  {user && !collapsed ? (
                    adding ? (
                      <form
                        ref={addFormRef}
                        className="side-add-form"
                        onSubmit={(e) => void onAddSubmit(e)}
                      >
                        <span className="nav-icon" aria-hidden>
                          <IconPlus />
                        </span>
                        <input
                          ref={inputRef}
                          type="text"
                          className="side-add-input"
                          placeholder="输入关键词…"
                          value={draft}
                          maxLength={200}
                          disabled={addBusy}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelAdd()
                          }}
                        />
                        <button
                          type="submit"
                          className="side-add-submit"
                          disabled={addBusy || !draft.trim()}
                        >
                          {addBusy ? '…' : '添加'}
                        </button>
                        {addError && <p className="side-add-error">{addError}</p>}
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="side-item side-item-child side-add"
                        title="添加关键词"
                        tabIndex={kwOpen ? undefined : -1}
                        onClick={() => {
                          setAddError(null)
                          setAdding(true)
                        }}
                      >
                        <span className="nav-icon" aria-hidden>
                          <IconPlus />
                        </span>
                        <span className="nav-label">添加关键词</span>
                      </button>
                    )
                  ) : !user && !collapsed ? (
                    <span
                      className="side-item side-item-child side-add is-disabled"
                      title="登录后才能添加关键词"
                      aria-disabled="true"
                    >
                      <span className="nav-icon" aria-hidden>
                        <IconPlus />
                      </span>
                      <span className="nav-label">添加关键词</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {user && (
              <div className={`side-group${srcOpen ? '' : ' is-folded'}`}>
                <div className="side-item-row">
                  <NavLink to="/sources" className="side-item side-item-grow" title="抓取源" end>
                    <span className="nav-icon" aria-hidden>
                      <IconRss />
                    </span>
                    <span className="nav-label">抓取源</span>
                  </NavLink>
                  <button
                    type="button"
                    className="side-fold"
                    aria-expanded={srcOpen}
                    aria-controls="side-src-children"
                    title={srcOpen ? '收起抓取源' : '展开抓取源'}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setSrcOpen((v) => !v)
                    }}
                  >
                    <IconChevron />
                  </button>
                </div>

                <div
                  id="side-src-children"
                  className="side-children-panel"
                  aria-hidden={!srcOpen}
                >
                  <div className="side-children">
                    {sourceItems.map((s) => (
                      <div key={s.id} className="side-kw-row">
                        <NavLink
                          to={`/s/${s.id}`}
                          className="side-item side-item-child side-item-grow"
                          title={s.errorText || s.label}
                          tabIndex={srcOpen ? undefined : -1}
                        >
                          <span className="nav-icon" aria-hidden>
                            <IconRss />
                          </span>
                          <span className="nav-label">{s.label}</span>
                          {s.status === 'pending' && (
                            <span className="kw-spinner" title="解析中" aria-label="加载中" />
                          )}
                          {s.status === 'error' && (
                            <span className="src-error-dot" title={s.errorText || '解析失败'}>
                              !
                            </span>
                          )}
                        </NavLink>
                        <button
                          type="button"
                          className="side-kw-delete"
                          title={`删除「${s.label}」`}
                          tabIndex={srcOpen ? undefined : -1}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void onDeleteSource(s.id, s.label)
                          }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    ))}

                    {!collapsed ? (
                      srcAdding ? (
                        <form
                          ref={srcFormRef}
                          className="side-add-form"
                          onSubmit={(e) => void onAddSourceSubmit(e)}
                        >
                          <span className="nav-icon" aria-hidden>
                            <IconPlus />
                          </span>
                          <input
                            ref={srcInputRef}
                            type="text"
                            className="side-add-input"
                            placeholder="网站、RSS 或媒体范围…"
                            value={srcDraft}
                            maxLength={200}
                            disabled={srcBusy}
                            onChange={(e) => setSrcDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') cancelSrcAdd()
                            }}
                          />
                          <button
                            type="submit"
                            className="side-add-submit"
                            disabled={srcBusy || !srcDraft.trim()}
                          >
                            {srcBusy ? '…' : '添加'}
                          </button>
                          {srcError && <p className="side-add-error">{srcError}</p>}
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="side-item side-item-child side-add"
                          title="添加抓取源"
                          tabIndex={srcOpen ? undefined : -1}
                          onClick={() => {
                            setSrcError(null)
                            setSrcAdding(true)
                          }}
                        >
                          <span className="nav-icon" aria-hidden>
                            <IconPlus />
                          </span>
                          <span className="nav-label">添加抓取源</span>
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            <NavLink to="/stars" className="side-item" title="收藏夹">
              <span className="nav-icon" aria-hidden>
                <IconStar />
              </span>
              <span className="nav-label">收藏夹</span>
            </NavLink>

            {!user ? (
              <NavLink to="/auth" className="side-item" title="登录 / 注册">
                <span className="nav-icon" aria-hidden>
                  <IconLogin />
                </span>
                <span className="nav-label">登录 / 注册</span>
              </NavLink>
            ) : (
              <button
                type="button"
                className="side-item side-logout"
                title="退出登录"
                onClick={() => {
                  if (window.confirm('确定要退出登录吗？')) {
                    void signOut()
                  }
                }}
              >
                <span className="nav-icon" aria-hidden>
                  <IconLogout />
                </span>
                <span className="nav-label">退出登录</span>
              </button>
            )}
          </nav>

          {poem && (
            <div className="side-poem">
              <p className="side-poem-text">{poem.text}</p>
              <p className="side-poem-meta">
                —— {poem.author} · {poem.source}
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          className="side-toggle"
          onClick={toggleSidebar}
          aria-expanded={!collapsed}
          aria-controls="side-nav"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <span className="side-toggle-rail" aria-hidden />
          <span className="side-toggle-icon" aria-hidden>
            ‹
          </span>
        </button>
      </aside>

      <div className="content-shell">
        {!configured && (
          <div className="banner warn">请先配置 Supabase 并完成数据库迁移。</div>
        )}

        <ProcessBanner />

        <main className="main-stage">{children}</main>

        <footer className="footer">
          <p>
            © {new Date().getFullYear()} AutoNews ·{' '}
            <a href="mailto:speechlessgorilla@gmail.com">speechlessgorilla@gmail.com</a>
          </p>
        </footer>
      </div>
    </div>
  )
}
