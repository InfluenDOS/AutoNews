import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export function usePageParam(): [number, (page: number) => void] {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get('page') || '1')
  const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1

  const setPage = useCallback(
    (next: number) => {
      const p = Math.max(1, Math.floor(next))
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          if (p <= 1) n.delete('page')
          else n.set('page', String(p))
          return n
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return [page, setPage]
}
