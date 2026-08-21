import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { normalizeForMatch } from '../lib/normalize'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Keyword } from '../types'

export function KeywordsPage() {
  const { user } = useAuth()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('keywords')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setKeywords((data as Keyword[]) ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  if (!user) {
    return (
      <section className="panel">
        <h1>关键词</h1>
        <p className="muted">
          请先 <Link to="/auth">登录</Link> 后再管理订阅关键词。
        </p>
      </section>
    )
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const trimmed = phrase.trim()
    if (!trimmed) return
    setError(null)
    const { error: err } = await supabase.from('keywords').insert({
      user_id: user.id,
      phrase: trimmed,
      normalized_phrase: normalizeForMatch(trimmed),
      search_terms: [],
      ai_note: '',
    })
    if (err) {
      setError(err.message)
      return
    }
    setPhrase('')
    await load()
  }

  async function onDelete(id: string) {
    setError(null)
    const { error: err } = await supabase.from('keywords').delete().eq('id', id)
    if (err) setError(err.message)
    else await load()
  }

  return (
    <section className="panel">
      <h1>关键词</h1>
      <p className="muted">
        可以用中文写一句模糊需求，例如「关注锂矿谈判和武契奇的最新表态」。AI
        会提炼成塞尔维亚检索词，并在抓取后把新闻译成中文。
      </p>

      <form className="form row" onSubmit={onAdd}>
        <input
          type="text"
          placeholder="用中文描述你想看的新闻…"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          maxLength={200}
          required
        />
        <button className="btn" type="submit">
          添加
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">加载中…</p>
      ) : keywords.length === 0 ? (
        <p className="muted">还没有关键词。添加一句中文描述即可开始订阅。</p>
      ) : (
        <ul className="keyword-list">
          {keywords.map((k) => {
            const terms = k.search_terms || []
            const ready = terms.length > 0
            return (
              <li key={k.id} className="keyword-item">
                <div>
                  <strong>{k.phrase}</strong>
                  {k.ai_note && <p className="kw-note">{k.ai_note}</p>}
                  {ready ? (
                    <p className="kw-terms">检索词：{terms.join(' · ')}</p>
                  ) : (
                    <p className="kw-pending">等待 AI 处理（本地运行 process_ai 或等定时任务）</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => void onDelete(k.id)}
                >
                  删除
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
