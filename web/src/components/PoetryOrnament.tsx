import { useEffect, useState } from 'react'
import { pickPoem, type PoemSnippet } from '../lib/poetry'

type Props = {
  variant?: 'panel' | 'inline' | 'sidebar'
  seed?: number
  className?: string
}

export function PoetryOrnament({ variant = 'panel', seed, className = '' }: Props) {
  const [poem, setPoem] = useState<PoemSnippet>(() => pickPoem(seed ?? 1))

  useEffect(() => {
    setPoem(pickPoem(seed ?? Date.now()))
  }, [seed])

  return (
    <figure className={`poetry poetry-${variant} ${className}`.trim()} aria-hidden="true">
      <blockquote>
        {poem.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </blockquote>
      <figcaption>— {poem.source}</figcaption>
    </figure>
  )
}
