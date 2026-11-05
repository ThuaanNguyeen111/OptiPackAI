import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { PortalContext, type Locale } from './portal-context-value'

export function PortalProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [locale, setLocale] = useState<Locale>(() => {
    localStorage.setItem('optipack-locale', 'vi')
    return 'vi'
  })
  const [scannerOpen, setScannerOpen] = useState(false)

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v)
  }, [])

  const handleSetLocale = useCallback((_l: Locale) => {
    void _l
    setLocale('vi')
    localStorage.setItem('optipack-locale', 'vi')
  }, [])

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      toggleSidebar,
      setSidebarCollapsed,
      locale,
      setLocale: handleSetLocale,
      mobileNavOpen,
      setMobileNavOpen,
      scannerOpen,
      setScannerOpen,
    }),
    [
      sidebarCollapsed,
      toggleSidebar,
      locale,
      handleSetLocale,
      mobileNavOpen,
      scannerOpen,
    ],
  )

  return (
    <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
  )
}
