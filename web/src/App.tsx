import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import { KeywordWorkspaceProvider } from './context/KeywordWorkspace'
import { ToastProvider } from './context/ToastContext'
import { ArticleDetailPage } from './pages/ArticleDetailPage'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { StarsPage } from './pages/StarsPage'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <HashRouter>
          <KeywordWorkspaceProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/article/:id" element={<ArticleDetailPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/keywords" element={<Navigate to="/" replace />} />
                <Route path="/stars" element={<StarsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </KeywordWorkspaceProvider>
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
