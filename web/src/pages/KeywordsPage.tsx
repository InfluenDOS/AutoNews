import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { requestCrawl } from '../lib/crawl'
import { normalizeForMatch } from '../lib/normalize'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Keyword } from '../types'

const PENDING_POLL_MS = 8_000

function isKeywordPending(k: Keyword): boolean {
  return !(k.search_terms || []).length
}

export function KeywordsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const hadPendingRef = useRef(false)

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!user || !isSupabaseConfigured) {
        setLoading(false)
        return
      }
      if (!opts?.quiet) setLoading(true)
      const { data, error: err } = await supabase
        .from('keywords')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (err) setError(err.message)
      else {
        const rows = (data as Keyword[]) ?? []
        const pending = rows.some(isKeywordPending)
        if (hadPendingRef.current && !pending && rows.length > 0) {
          setInfo('AI 已提炼检索词，可回首页查看匹配新闻')
          showToast('关键词已就绪', 'ok')
        }
        hadPendingRef.current = pending
        setKeywords(rows)
      }
      if (!opts?.quiet) setLoading(false)
    },
    [user, showToast],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!user || !keywords.some(isKeywordPending)) return
    const id = window.setInterval(() => void load({ quiet: true }), PENDING_POLL_MS)
    return () => window.clearInterval(id)
  }, [user, keywords, load])

  async function triggerCrawlAfterKeywordChange() {
    const result = await requestCrawl()
    if (result.ok) {
      setInfo('已保存并开始处理：AI 先提炼塞尔维亚检索词，再抓新闻（约 1～3 分钟），本页会自动更新')
      showToast('已开始处理关键词', 'ok')
      return
    }
    if (result.kind === 'rate_limit') {
      setInfo('关键词已保存。抓取冷却中（约 2 分钟），本页会自动检查进度')
      showToast('已保存，抓取冷却中', 'info')
      return
    }
    setInfo(`关键词已保存，但未能立即触发抓取：${result.message}`)
    showToast('已保存关键词', 'info')
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
      showToast('添加失败', 'error')
      setSaving(false)
      return
    }
    setPhrase('')
    showToast('已添加，正在交给 AI…', 'ok')
    await load()
    await triggerCrawlAfterKeywordChange()
    setSaving(false)
  }

  async function onDelete(id: string) {
    if (saving || deletingId) return
    setError(null)
    setInfo(null)
    setDeletingId(id)
    const { error: err } = await supabase.from('keywords').delete().eq('id', id)
    if (err) {
      setError(err.message)
      showToast('删除失败', 'error')
      setDeletingId(null)
      return
    }
    showToast('已删除关键词', 'ok')
    await load()
    await triggerCrawlAfterKeywordChange()
    setDeletingId(null)
  }

  const pendingCount = keywords.filter(isKeywordPending).length

  return (
    <section className="panel">
      <h1>关键词</h1>
      <p className="muted">
        用中文描述关注点即可。中文不能直接搜塞尔维亚媒体，所以需要等 AI
        提炼检索词（约 1～3 分钟）；添加后会自动开始，本页会自动刷新，不用干等着狂点。
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
          {saving ? '提交中…' : '添加'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {info && <p className="ok">{info}</p>}
      {pendingCount > 0 && (
        <p className="status-pill" role="status">
          {pendingCount} 个关键词正在 AI 处理中…
        </p>
      )}

      {loading ? (
        <p className="muted">加载中…</p>
      ) : keywords.length === 0 ? (
        <p className="muted">还没有关键词。添加一句中文描述即可开始订阅。</p>
      ) : (
        <ul className="keyword-list">
          {keywords.map((k) => {
            const terms = k.search_terms || []
            const ready = terms.length > 0
            const deleting = deletingId === k.id
            return (
              <li key={k.id} className="keyword-item">
                <div>
                  <strong>{k.phrase}</strong>
                  {k.ai_note && <p className="kw-note">{k.ai_note}</p>}
                  {ready ? (
                    <p className="kw-terms">检索词：{terms.join(' · ')}</p>
                  ) : (
                    <p className="kw-pending">AI 提炼中…约 1～3 分钟，本页会自动更新</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={saving || Boolean(deletingId)}
                  onClick={() => void onDelete(k.id)}
                >
                  {deleting ? '删除中…' : '删除'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
