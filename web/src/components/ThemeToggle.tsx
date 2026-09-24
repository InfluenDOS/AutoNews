import { THEME_MODES, useTheme } from '../context/ThemeContext'

export function ThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="配色">
      {THEME_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          className={mode === m.id ? 'is-on' : undefined}
          onClick={() => setMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
