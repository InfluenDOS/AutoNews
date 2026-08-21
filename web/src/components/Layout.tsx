import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, configured } = useAuth()
  const { showToast } = useToast()

  async function onSignOut() {
    await signOut()
    showToast('已退出登录', 'info')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="side-brand">
          <span className="side-logo">AN</span>
          <span>
            <strong>AutoNews</strong>
            <small>塞尔维亚关键词新闻</small>
          </span>
        </Link>

        <nav className="side-nav">
          <NavLink to="/" end>
            新闻首页
          </NavLink>
          {user && (
            <>
              <NavLink to="/keywords">我的关键词</NavLink>
              <NavLink to="/stars">收藏夹</NavLink>
            </>
          )}
          {!user ? (
            <NavLink to="/auth">登录 / 注册</NavLink>
          ) : (
            <button type="button" className="side-logout" onClick={() => void onSignOut()}>
              退出登录
            </button>
          )}
        </nav>

        <div className="side-tip">
          <strong>今日提示</strong>
          <p>用中文写一句关注点，系统会自动匹配塞尔维亚相关报道并译成中文。</p>
        </div>
      </aside>

      <div className="content-shell">
        <header className="top-welcome">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1 className="welcome-title">{user ? '又见面啦' : '欢迎来到 AutoNews'}</h1>
            <p className="welcome-sub">
              {user ? '看看今天有没有你关心的新消息。' : '登录后即可订阅关键词、收藏新闻。'}
            </p>
          </div>
          <div className="welcome-meta">
            <span>{new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
        </header>

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
