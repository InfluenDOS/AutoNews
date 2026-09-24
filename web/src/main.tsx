import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './index.css'

// The email confirmation link lands on /#access_token=… (or #error_description=…).
// HashRouter would read that fragment as an unknown route and redirect it away, so
// let supabase-js consume it first, then start the app on the right page.
async function consumeAuthRedirect(): Promise<void> {
  const hash = window.location.hash
  if (!isSupabaseConfigured || !/(^#|&)(access_token|error_description)=/.test(hash)) return
  await supabase.auth.getSession()
  const failed = /(^#|&)error_description=/.test(hash)
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${failed ? 'auth?link=expired' : ''}`)
}

void consumeAuthRedirect().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
