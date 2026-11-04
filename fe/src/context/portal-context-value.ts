import { createContext } from 'react'

export type Locale = 'vi' | 'en'

export type PortalContextValue = {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  locale: Locale
  setLocale: (l: Locale) => void
  mobileNavOpen: boolean
  setMobileNavOpen: (v: boolean) => void
  scannerOpen: boolean
  setScannerOpen: (v: boolean) => void
}

export const PortalContext = createContext<PortalContextValue | null>(null)
