import type { ReactNode } from 'react'

type Props = {
  kicker: string
  title: ReactNode
  lead?: ReactNode
  /** Small status line under the title (counts, last update). */
  meta?: ReactNode
  actions?: ReactNode
}

/** Newspaper-style section head: kicker, headline, rule. */
export function PageHead({ kicker, title, lead, meta, actions }: Props) {
  return (
    <header className="page-head">
      <p className="kicker">{kicker}</p>
      <h1 className="page-title">{title}</h1>
      {lead && <p className="page-lead">{lead}</p>}
      {(meta || actions) && (
        <div className="page-meta">
          <div className="page-meta-text">{meta}</div>
          {actions && <div className="page-actions">{actions}</div>}
        </div>
      )}
    </header>
  )
}
