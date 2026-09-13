export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'optipack-theme'

export function getPreferredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'

  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored

  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.remove(theme === 'dark' ? 'light' : 'dark')
  root.classList.add(theme)
  root.style.colorScheme = theme
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

/** Call once before React render to avoid flash / desync */
export function bootstrapTheme() {
  applyTheme(getPreferredTheme())
}
