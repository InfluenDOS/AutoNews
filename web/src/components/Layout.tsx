import { useState, type FormEvent } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useKeywordWorkspace } from '../context/KeywordWorkspace'
import { useToast } from '../context/ToastContext'
import { PoetryOrnament } from './PoetryOrnament'
import { Spinner } from './Spinner'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, configured } = useAuth()
  const { showToast } = useToast()
  const {
    keywords,
    selectedId,
    selectKeyword,
    addKeyword,
    deleteKeyword,
    collapsed,
    setCollapsed,
    saving,
    loading: kwLoading,
  } = useKeywordWorkspace()
  const [adding, setAdding] = useState(false)
  const [phrase, setPhrase] = useState('')

  async function onSignOut() {
    await signOut()
    showToast('您已安全退出', 'info')
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const row = await addKeyword(phrase)
    if (row) {
      setPhrase('')
      setAdding(false)
      setCollapsed(false)
    }
  }

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="专题导航">
        <div className="side-top">
          <Link to="/" className="side-brand" title="AutoNews 巴尔干时讯">
            <span className="side-logo">AN</span>
            {!collapsed && (
              <span>
                <strong>AutoNews</strong>
                <small>巴尔干时讯</small>
              </span>
            )}
          </Link>
          <button
            type="button"
            className="side-collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            title={collapsed ? '展开' : '收起'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {user ? (
          <div className="kw-rail">
            {!collapsed && <p className="kw-rail-label">我的专题</p>}
            <div className="kw-rail-list" role="tablist" aria-label="专题列表">
              {kwLoading && keywords.length === 0 ? (
                <p className="kw-rail-empty">{collapsed ? '…' : '正在载入…'}</p>
              ) : keywords.length === 0 ? (
                !collapsed && <p className="kw-rail-empty">尚未创建专题</p>
              ) : (
                keywords.map((k) => {
                  const pending = !(k.search_terms || []).length
                  const active = k.id === selectedId
                  return (
                    <div key={k.id} className={`kw-rail-item${active ? ' active' : ''}`}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className="kw-rail-btn"
                        title={k.phrase}
                        onClick={() => selectKeyword(k.id)}
                      >
                        {pending && <Spinner size="sm" />}
                        <span className="kw-rail-text">
                          {collapsed ? k.phrase.slice(0, 1) : k.phrase}
                        </span>
                      </button>
                      {active && !collapsed && (
                        <button
                          type="button"
                          className="kw-rail-del"
                          title="移除专题"
                          disabled={saving}
                          onClick={() => void deleteKeyword(k.id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className="kw-rail-add">
              {adding && !collapsed ? (
                <form className="kw-add-form" onSubmit={(e) => void onAdd(e)}>
                  <input
                    type="text"
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    placeholder="用一句话描述关注主题…"
                    maxLength={200}
                    autoFocus
                    disabled={saving}
                    required
                  />
                  <div className="kw-add-actions">
                    <button className="btn btn-sm" type="submit" disabled={saving}>
                      {saving ? '提交中…' : '创建'}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setAdding(false)
                        setPhrase('')
                      }}
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="kw-add-btn"
                  title="新建专题"
                  aria-label="新建专题"
                  disabled={saving}
                  onClick={() => {
                    setCollapsed(false)
                    setAdding(true)
                  }}
                >
                  +
                </button>
              )}
            </div>

            {!collapsed && <PoetryOrnament variant="sidebar" seed={7} />}
          </div>
        ) : (
          !collapsed && (
            <div className="kw-rail-guest">
              <p>登录后即可创建专题，持续追踪巴尔干半岛要闻。</p>
              <NavLink className="btn btn-sm" to="/auth">
                登录 / 注册
              </NavLink>
              <PoetryOrnament variant="sidebar" seed={3} />
            </div>
          )
        )}

        <nav className="side-nav side-nav-foot">
          <NavLink to="/stars" title="收藏夹">
            {collapsed ? '★' : '收藏夹'}
          </NavLink>
          {user ? (
            <button type="button" className="side-logout" onClick={() => void onSignOut()}>
              {collapsed ? '⎋' : '退出'}
            </button>
          ) : (
            <NavLink to="/auth" title="登录">
              {collapsed ? '⌁' : '登录 / 注册'}
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="content-shell">
        <div className="content-atmosphere" aria-hidden="true" />
        {!configured && (
          <div className="banner warn">服务尚未完成配置，请联系管理员完成初始化。</div>
        )}
        <main className="main fade-rise">{children}</main>
        <footer className="footer">
          <PoetryOrnament variant="inline" seed={11} />
          <p>精选摘要 · 注明出处 · 定时更新 · 不转载全文</p>
        </footer>
      </div>
    </div>
  )
}
