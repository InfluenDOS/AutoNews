import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useJobs } from '../context/JobsContext'
import { keywordAiReady, useKeywords } from '../context/KeywordsContext'
import { loadDailyPoem, type DailyPoem } from '../lib/dailyPoem'
import { ProcessBanner } from './ProcessBanner'
import {
  IconChevron,
  IconHash,
  IconKeywords,
  IconLogin,
  IconLogout,
  IconPlus,
  IconStar,
  IconTrash,
} from './NavIcons'

const STORAGE_KEY = 'autonews-sidebar-collapsed'
const KW_OPEN_KEY = 'autonews-kw-open-v2'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, configured } = useAuth()
  const { keywords, addKeyword, deleteKeyword } = useKeywords()
  const { refreshJobs } = useJobs()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => {
    try {
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
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const addFormRef = useRef<HTMLFormElement>(null)
  const [poem, setPoem] = useState<DailyPoem | null>(null)

  function cancelAdd() {
    if (addBusy) return
    setAdding(false)
    setDraft('')
    setAddError(null)
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
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
    if (adding) {
      setKwOpen(true)
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [adding])

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

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="stage-bg" aria-hidden="true">
        <div className="stage-photo" />
        <div className="stage-shade" />
        <div className="stage-blob stage-blob-a" />
        <div className="stage-blob stage-blob-b" />
      </div>

      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-body">
          <Link to="/" className="side-brand" title="AutoNews">
            <span className="brand-mark">AN</span>
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

                  {user ? (
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
                  ) : (
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
                  )}
                </div>
              </div>
            </div>

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
          onClick={() => setCollapsed((v) => !v)}
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
