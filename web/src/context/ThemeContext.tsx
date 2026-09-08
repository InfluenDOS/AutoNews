import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export const SKIN_STORAGE_KEY = 'autonews-skin-v2'

export const SKINS = [
  { id: 'jimo', label: '即墨' },
  { id: 'forest', label: '点翠' },
  { id: 'canhong', label: '残红' },
  { id: 'yuerugou', label: '月如钩' },
] as const

export type SkinId = (typeof SKINS)[number]['id']

export type Skin = (typeof SKINS)[number]

const DEFAULT_SKIN: SkinId = 'forest'

type ThemeContextValue = {
  skin: SkinId
  skins: readonly Skin[]
  setSkin: (id: SkinId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function isSkinId(value: string | null): value is SkinId {
  return SKINS.some((s) => s.id === value)
}

function readStoredSkin(): SkinId {
  try {
    const stored = localStorage.getItem(SKIN_STORAGE_KEY)
    if (isSkinId(stored)) return 'forest'
  } catch {
    /* ignore */
  }
  return DEFAULT_SKIN
}

function applySkin(id: SkinId) {
  document.documentElement.dataset.theme = id === 'forest' ? 'jimo' : id
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<SkinId>(() => {
    const id = readStoredSkin()
    applySkin(id)
    return id
  })

  const setSkin = useCallback((id: SkinId) => {
    if (!isSkinId(id)) return
    applySkin(id)
    setSkinState(id)
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(
    () => ({ skin, skins: SKINS, setSkin }),
    [skin, setSkin],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
