import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/** Keep both keys in sync with the inline script in index.html. */
export const THEME_STORAGE_KEY = 'autonews-theme-v3'
export const SKIN_STORAGE_KEY = 'autonews-skin-v3'

export const THEME_MODES = [
  { id: 'auto', label: '自动' },
  { id: 'light', label: '日间' },
  { id: 'dark', label: '夜间' },
] as const

export const SKINS = [
  { id: 'wire', label: '电讯' },
  { id: 'bamboo', label: '竹青' },
] as const

export type ThemeMode = (typeof THEME_MODES)[number]['id']
export type SkinId = (typeof SKINS)[number]['id']

/** 竹青 sets headlines in LXGW WenKai; load it only for people who pick that skin. */
const SKIN_FONTS: Partial<Record<SkinId, string>> = {
  bamboo: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/lxgwwenkaigbscreen.css',
}

type ThemeContextValue = {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  skin: SkinId
  setSkin: (skin: SkinId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored<T extends string>(key: string, allowed: readonly { id: T }[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    const hit = allowed.find((item) => item.id === stored)
    if (hit) return hit.id
  } catch {
    /* ignore */
  }
  return fallback
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

/** `auto` leaves data-theme unset so the prefers-color-scheme tokens apply. */
function applyMode(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'auto') delete root.dataset.theme
  else root.dataset.theme = mode
}

function applySkin(skin: SkinId) {
  document.documentElement.dataset.skin = skin
  const href = SKIN_FONTS[skin]
  if (href && !document.querySelector(`link[data-skin-font="${skin}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.skinFont = skin
    document.head.appendChild(link)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored(THEME_STORAGE_KEY, THEME_MODES, 'auto'))
  const [skin, setSkinState] = useState<SkinId>(() => readStored(SKIN_STORAGE_KEY, SKINS, 'wire'))

  useEffect(() => {
    applyMode(mode)
  }, [mode])

  useEffect(() => {
    applySkin(skin)
  }, [skin])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    store(THEME_STORAGE_KEY, next)
  }, [])

  const setSkin = useCallback((next: SkinId) => {
    setSkinState(next)
    store(SKIN_STORAGE_KEY, next)
  }, [])

  const value = useMemo(() => ({ mode, setMode, skin, setSkin }), [mode, setMode, skin, setSkin])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
