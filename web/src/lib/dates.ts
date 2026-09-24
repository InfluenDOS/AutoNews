/** Date labels for the dispatch timeline (local time, zh-CN). */

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Calendar day in local time, used to group dispatches. */
export function dayKey(value: string | null | undefined): string {
  const d = toDate(value)
  if (!d) return 'unknown'
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** "今天" / "昨天" plus the full date, e.g. 今天 · 9月24日 星期四. */
export function dayLabel(value: string | null | undefined): { relative: string | null; date: string } {
  const d = toDate(value)
  if (!d) return { relative: null, date: '时间未知' }
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  const relative = diff === 0 ? '今天' : diff === 1 ? '昨天' : diff === 2 ? '前天' : null
  const date = new Intl.DateTimeFormat('zh-CN', {
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(d)
  return { relative, date }
}

/** 11:51 */
export function clockTime(value: string | null | undefined): string {
  const d = toDate(value)
  if (!d) return '--:--'
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

/** 9月24日 11:51 (year added when not the current year). */
export function shortStamp(value: string | null | undefined): string {
  const d = toDate(value)
  if (!d) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** Full timestamp for the reader, e.g. 2026年9月24日星期四 11:51. */
export function fullStamp(value: string | null | undefined): string {
  const d = toDate(value)
  if (!d) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeStyle: 'short' }).format(d)
}
