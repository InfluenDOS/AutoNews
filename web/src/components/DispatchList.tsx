import type { ReactNode } from 'react'
import { dayKey, dayLabel } from '../lib/dates'
import type { StoryGroup } from '../lib/storyDedup'

type Props = {
  groups: StoryGroup[]
  renderItem: (group: StoryGroup) => ReactNode
}

/** Story groups arrive newest first; print a dateline whenever the day changes. */
export function DispatchList({ groups, renderItem }: Props) {
  const days: { key: string; when: string | null; items: StoryGroup[] }[] = []
  for (const group of groups) {
    const when = group.article.published_at ?? group.article.created_at
    const key = dayKey(when)
    const last = days[days.length - 1]
    if (last && last.key === key) last.items.push(group)
    else days.push({ key, when, items: [group] })
  }

  return (
    <div className="timeline">
      {days.map((day) => {
        const label = dayLabel(day.when)
        return (
          <section key={day.key} className="timeline-day">
            <h2 className="dateline">
              {label.relative && <span className="dateline-rel">{label.relative}</span>}
              <span className="dateline-date">{label.date}</span>
            </h2>
            {day.items.map((group) => renderItem(group))}
          </section>
        )
      })}
    </div>
  )
}
