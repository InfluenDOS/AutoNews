import { useEffect, useState } from 'react'
import { msUntilNextSlot, poemForSlot, poemSlot, type Poem } from '../lib/poems'

/** The couplet for the current half hour; switches on :00 and :30. */
export function useHalfHourPoem(): Poem {
  const [slot, setSlot] = useState(() => poemSlot())

  useEffect(() => {
    let timer = 0
    const sync = () => {
      setSlot(poemSlot())
      window.clearTimeout(timer)
      // A little past the boundary so the new slot is certain.
      timer = window.setTimeout(sync, msUntilNextSlot() + 500)
    }
    // Background tabs throttle timers; catch up as soon as the tab is visible.
    const onVisible = () => {
      if (!document.hidden) sync()
    }
    timer = window.setTimeout(sync, msUntilNextSlot() + 500)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return poemForSlot(slot)
}
