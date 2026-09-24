import { useEffect, useState } from 'react'
import { FALLBACK_POEM, POEM_ROTATE_MS, loadPoems, pickPoem, type Poem } from '../lib/poems'

/**
 * A random couplet on every page load, replaced by another every half hour
 * while the page stays open. `null` until the couplet file has loaded.
 */
export function useHalfHourPoem(): Poem | null {
  const [poem, setPoem] = useState<Poem | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer = 0
    let shownAt = 0
    let list: Poem[] = []

    const next = () => {
      if (cancelled) return
      setPoem(list.length ? pickPoem(list) : FALLBACK_POEM)
      shownAt = Date.now()
      window.clearTimeout(timer)
      timer = window.setTimeout(next, POEM_ROTATE_MS)
    }
    // Background tabs throttle timers; catch up once the tab is visible again.
    const onVisible = () => {
      if (!document.hidden && shownAt && Date.now() - shownAt >= POEM_ROTATE_MS) next()
    }

    loadPoems()
      .then((loaded) => {
        list = loaded
      })
      .catch(() => {
        list = []
      })
      .finally(next)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return poem
}
