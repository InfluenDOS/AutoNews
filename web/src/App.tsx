import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import { JobsProvider } from './context/JobsContext'
import { KeywordsProvider } from './context/KeywordsContext'
import { ArticleDetailPage } from './pages/ArticleDetailPage'
import { AuthPage } from './pages/AuthPage'
import { HomeRedirect } from './pages/HomeRedirect'
import { KeywordFeedPage } from './pages/KeywordFeedPage'
import { KeywordsPage } from './pages/KeywordsPage'
import { StarsPage } from './pages/StarsPage'

export default function App() {
  return (
    <AuthProvider>
      <KeywordsProvider>
        <JobsProvider>
          <HashRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/k/:keywordId" element={<KeywordFeedPage />} />
                <Route path="/article/:id" element={<ArticleDetailPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/keywords" element={<KeywordsPage />} />
                <Route path="/stars" element={<StarsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </HashRouter>
        </JobsProvider>
      </KeywordsProvider>
    </AuthProvider>
  )
}
