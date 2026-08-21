import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, configured } = useAuth()

  return (
    <div className="app-shell">
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow" aria-hidden="true" />

      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span>AN</span>
          </span>
          <span className="brand-text">
            <strong>AutoNews</strong>
            <small>KEYWORD INTEL · SRBIJA</small>
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
          请先配置 Supabase 环境变量并执行数据库迁移。
        </div>
      )}

      <main className="main">{children}</main>

      <footer className="footer">
        <div className="footer-line" />
        <p>站内中文短讯 · 底部可打开原文 · RSS 定时更新 · 不转载全文</p>
      </footer>
    </div>
  )
}
