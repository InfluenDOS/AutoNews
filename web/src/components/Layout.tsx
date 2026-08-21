import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, configured } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">AN</span>
          <span>
            AutoNews
            <small>塞尔维亚新闻 · 关键词订阅</small>
          </span>
        </Link>
        <nav className="nav">
          <NavLink to="/" end>
            新闻
          </NavLink>
          {user && (
            <>
              <NavLink to="/keywords">关键词</NavLink>
              <NavLink to="/stars">收藏夹</NavLink>
            </>
          )}
          {!user ? (
            <NavLink to="/auth" className="btn btn-sm">
              登录
            </NavLink>
          ) : (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void signOut()}>
              退出
            </button>
          )}
        </nav>
      </header>

      {!configured && (
        <div className="banner warn">
          请先在 <code>web/.env</code> 中配置 <code>VITE_SUPABASE_URL</code> 与{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>，并执行 <code>supabase/migrations</code> 中的 SQL。
        </div>
      )}

      <main className="main">{children}</main>

      <footer className="footer">
        点击标题跳转原媒体网站 · 约每 15 分钟更新 RSS · 不转载全文
      </footer>
    </div>
  )
}
