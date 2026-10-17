import { useSources } from '../context/SourcesContext'
import { SERBIA_MAINSTREAM_KEY } from '../lib/sources'

export type SourceOption = { key: string; label: string }

/** Sources a keyword can be limited to: the built-in set plus ready custom ones. */
export function useKeywordSourceOptions(): SourceOption[] {
  const { items } = useSources()
  return items
    .filter((s) => s.status === 'ready' && (s.kind === 'preset' || s.feeds.length > 0))
    .map((s) => ({ key: s.kind === 'preset' ? SERBIA_MAINSTREAM_KEY : s.id, label: s.label }))
}

/** "抓取源：A、B" for a keyword's source_keys; empty keys read every source. */
export function keywordSourcesLabel(keys: string[] | null | undefined, options: SourceOption[]) {
  const list = keys ?? []
  if (list.length === 0) return '全部抓取源'
  const label = new Map(options.map((s) => [s.key, s.label]))
  return list.map((key) => label.get(key) ?? '已删除的源').join('、')
}

/** Checkbox list of sources; an empty selection means every source. */
export function SourcePicker({
  className,
  options,
  value,
  onChange,
  disabled,
}: {
  className: string
  options: SourceOption[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  return (
    <fieldset className={className} disabled={disabled}>
      <legend>抓取源{value.length === 0 ? '（不选 = 全部）' : ''}</legend>
      {options.map((s) => (
        <label key={s.key}>
          <input
            type="checkbox"
            checked={value.includes(s.key)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, s.key] : value.filter((k) => k !== s.key))
            }
          />
          <span>{s.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
