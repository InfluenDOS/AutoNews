import { SKINS, THEME_MODES, useTheme } from '../context/ThemeContext'

export function ThemeToggle() {
  const { mode, setMode, skin, setSkin } = useTheme()

  return (
    <div className="theme-controls">
      <div className="theme-toggle" role="radiogroup" aria-label="风格">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={skin === s.id}
            className={skin === s.id ? 'is-on' : undefined}
            onClick={() => setSkin(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="theme-toggle" role="radiogroup" aria-label="明暗">
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
    </div>
  )
}
