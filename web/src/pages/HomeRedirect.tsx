import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Logged-in users land on the all-keywords feed. */
export function HomeRedirect() {
  const { user, loading: authLoading } = useAuth()

  if (authLoading) {
    return <p className="muted">加载中…</p>
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return <Navigate to="/keywords" replace />
}
