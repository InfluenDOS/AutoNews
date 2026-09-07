import { useTheme } from '../context/ThemeContext'
import { IconPalette } from './NavIcons'

export function SkinSwitcher() {
  const { skin, skins, setSkin } = useTheme()
  const current = skins.find((item) => item.id === skin) ?? skins[0]
  const currentIndex = skins.findIndex((item) => item.id === skin)
  const next = skins[(currentIndex + 1) % skins.length] ?? skins[0]

  function onClick() {
    if (skins.length < 2) return
    if (next) setSkin(next.id)
  }

  return (
    <button
      type="button"
      className="side-item skin-switch"
      title={`当前皮肤：${current.label}；切换到${next.label}`}
      aria-label={`当前皮肤：${current.label}；切换到${next.label}`}
      onClick={onClick}
    >
      <span className="nav-icon" aria-hidden>
        <IconPalette />
      </span>
      <span className="nav-label">皮肤 · {current.label}</span>
      <span className="skin-swatch" aria-hidden />
    </button>
  )
}
