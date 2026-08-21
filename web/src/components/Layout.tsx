import { useState, type FormEvent } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useKeywordWorkspace } from '../context/KeywordWorkspace'
import { useToast } from '../context/ToastContext'
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
    showToast('已退出登录', 'info')
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
      <aside className="sidebar" aria-label="关键词侧栏">
        <div className="side-top">
          <Link to="/" className="side-brand" title="AutoNews">
            <span className="side-logo">AN</span>
            {!collapsed && (
              <span>
                <strong>AutoNews</strong>
                <small>巴尔干关键词新闻</small>
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
            {!collapsed && <p className="kw-rail-label">我的关键词</p>}
            <div className="kw-rail-list" role="tablist" aria-label="关键词">
              {kwLoading && keywords.length === 0 ? (
                <p className="kw-rail-empty">{collapsed ? '…' : '加载中…'}</p>
              ) : keywords.length === 0 ? (
                !collapsed && <p className="kw-rail-empty">还没有关键词</p>
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
                          title="删除关键词"
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
                    placeholder="用中文描述关注点…"
                    maxLength={200}
                    autoFocus
                    disabled={saving}
                    required
                  />
                  <div className="kw-add-actions">
                    <button className="btn btn-sm" type="submit" disabled={saving}>
                      {saving ? '提交中…' : '添加'}
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
                  title="新建关键词"
                  aria-label="新建关键词"
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
          </div>
        ) : (
          !collapsed && (
            <div className="kw-rail-guest">
              <p>登录后可在侧栏管理关键词，并按关键词浏览新闻。</p>
              <NavLink className="btn btn-sm" to="/auth">
                登录 / 注册
              </NavLink>
            </div>
          )
        )}

        <nav className="side-nav side-nav-foot">
          <NavLink to="/stars" title="收藏夹">
            {collapsed ? '★' : '收藏夹'}
          </NavLink>
          {user ? (
            <button type="button" className="side-logout" onClick={() => void onSignOut()}>
              {collapsed ? '⎋' : '退出登录'}
            </button>
          ) : (
            <NavLink to="/auth" title="登录">
              {collapsed ? '⌁' : '登录 / 注册'}
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="content-shell">
        {!configured && (
          <div className="banner warn">请先配置 Supabase，并完成数据库迁移。</div>
        )}
        <main className="main">{children}</main>
        <footer className="footer">
          站内中文短讯 · 底部可打开原文 · 定时更新 · 不转载全文
        </footer>
      </div>
    </div>
  )
}
