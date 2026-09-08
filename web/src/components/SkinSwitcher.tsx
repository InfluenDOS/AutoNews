import { useRef } from 'react'
import { useTheme } from '../context/ThemeContext'

export function SkinSwitcher() {
  const { skin, skins, setSkin } = useTheme()
  const menuRef = useRef<HTMLDetailsElement>(null)
  const current = skins.find((item) => item.id === skin) ?? skins[0]

  return (
    <details ref={menuRef} className="theme-picker">
      <summary className="theme-picker-summary">
        <span className="theme-picker-label">主题 · {current.label}</span>
        <span className={`theme-current-swatch theme-choice-${current.id}`} aria-hidden>
          <span />
        </span>
        <span className="theme-picker-chevron" aria-hidden />
      </summary>
      <div className="theme-picker-options" role="group" aria-label="选择主题">
        {skins.filter((item) => item.id === 'forest' || item.id === 'canhong').map((item) => (
          <button
            key={item.id}
            type="button"
            className={`theme-choice theme-choice-${item.id}${skin === item.id ? ' is-active' : ''}`}
            title={item.label}
            aria-label={`切换到${item.label}`}
            aria-pressed={skin === item.id}
            onClick={() => {
              setSkin(item.id)
              menuRef.current?.removeAttribute('open')
            }}
          >
            <span aria-hidden />
            <b>{item.label}</b>
          </button>
        ))}
      </div>
    </details>
  )
}
