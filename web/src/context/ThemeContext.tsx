import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/** Keep in sync with the inline script in index.html. */
export const THEME_STORAGE_KEY = 'autonews-theme-v3'

export const THEME_MODES = [
  { id: 'auto', label: '自动' },
  { id: 'light', label: '日间' },
  { id: 'dark', label: '夜间' },
] as const

export type ThemeMode = (typeof THEME_MODES)[number]['id']

type ThemeContextValue = {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function isThemeMode(value: string | null): value is ThemeMode {
  return THEME_MODES.some((m) => m.id === value)
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeMode(stored)) return stored
  } catch {
    /* ignore */
  }
  return 'auto'
}

/** `auto` leaves data-theme unset so the prefers-color-scheme tokens apply. */
function applyMode(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'auto') delete root.dataset.theme
  else root.dataset.theme = mode
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)

  useEffect(() => {
    applyMode(mode)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
