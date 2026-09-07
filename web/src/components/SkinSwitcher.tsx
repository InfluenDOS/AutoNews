import { useTheme } from '../context/ThemeContext'
import { IconPalette } from './NavIcons'

export function SkinSwitcher() {
  const { skin, skins, setSkin } = useTheme()

  function onClick() {
    if (skins.length < 2) return
    const i = skins.findIndex((s) => s.id === skin)
    const next = skins[(i + 1) % skins.length]
    if (next) setSkin(next.id)
  }

  return (
    <button
      type="button"
      className="side-item skin-switch"
      title="皮肤"
      aria-label="皮肤"
      onClick={onClick}
    >
      <span className="nav-icon" aria-hidden>
        <IconPalette />
      </span>
      <span className="nav-label">皮肤</span>
    </button>
  )
}
