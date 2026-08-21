import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { requestCrawl } from '../lib/crawl'
import { normalizeForMatch } from '../lib/normalize'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Keyword } from '../types'

export function KeywordsPage() {
  const { user } = useAuth()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  async function triggerCrawlAfterKeywordChange() {
    const result = await requestCrawl()
    if (result.ok) {
      setInfo('已触发抓取：AI 提炼检索词后会拉取匹配新闻，约 1～3 分钟后可在首页查看')
      return
    }
    if (result.kind === 'rate_limit') {
      setInfo('关键词已保存。抓取冷却中（约 2 分钟），稍后会自动跑定时任务，也可回首页手动抓取')
      return
    }
    // Keyword save succeeded; crawl trigger failure should not look like a keyword error
    setInfo(`关键词已保存，但未能立即触发抓取：${result.message}`)
  }

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
    if (!user || saving) return
    const trimmed = phrase.trim()
    if (!trimmed) return
    setError(null)
    setInfo(null)
    setSaving(true)
    const { error: err } = await supabase.from('keywords').insert({
      user_id: user.id,
      phrase: trimmed,
      normalized_phrase: normalizeForMatch(trimmed),
      search_terms: [],
      ai_note: '',
    })
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    setPhrase('')
    await load()
    await triggerCrawlAfterKeywordChange()
    setSaving(false)
  }

  async function onDelete(id: string) {
    if (saving) return
    setError(null)
    setInfo(null)
    setSaving(true)
    const { error: err } = await supabase.from('keywords').delete().eq('id', id)
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    await load()
    await triggerCrawlAfterKeywordChange()
    setSaving(false)
  }

  return (
    <section className="panel">
      <h1>关键词</h1>
      <p className="muted">
        可以用中文写一句模糊需求，例如「关注锂矿谈判和武契奇的最新表态」。添加或删除后会立即触发一次抓取：AI
        提炼检索词，并拉取匹配新闻译成中文。
      </p>

      <form className="form row" onSubmit={onAdd}>
        <input
          type="text"
          placeholder="用中文描述你想看的新闻…"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          maxLength={200}
          required
          disabled={saving}
        />
        <button className="btn" type="submit" disabled={saving}>
          {saving ? '处理中…' : '添加'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {info && <p className="ok">{info}</p>}
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
                    <p className="kw-pending">等待 AI 处理（已触发抓取或等定时任务）</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={saving}
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
