import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_SHOPS,
  PortalContext,
  type ConnectedShop,
  type Locale,
} from './portal-context-value'

const SHOPS_KEY = 'optipack-shops'
const ACTIVE_SHOPS_KEY = 'optipack-active-shops'
const LEGACY_ACTIVE_SHOP_KEY = 'optipack-active-shop'

function loadShops(): ConnectedShop[] {
  try {
    const raw = localStorage.getItem(SHOPS_KEY)
    if (!raw) return DEFAULT_SHOPS
    const parsed = JSON.parse(raw) as ConnectedShop[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SHOPS
  } catch {
    return DEFAULT_SHOPS
  }
}

function loadActiveShopIds(shopList: ConnectedShop[]): string[] {
  try {
    const raw = localStorage.getItem(ACTIVE_SHOPS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as string[]
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((id) => shopList.some((s) => s.id === id))
        if (valid.length > 0) return valid
      }
    }
    const legacy = localStorage.getItem(LEGACY_ACTIVE_SHOP_KEY)
    if (legacy && shopList.some((s) => s.id === legacy)) return [legacy]
  } catch {
    /* ignore */
  }
  return shopList.map((s) => s.id)
}

function persistActiveIds(ids: string[]) {
  localStorage.setItem(ACTIVE_SHOPS_KEY, JSON.stringify(ids))
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = localStorage.getItem('optipack-locale')
    return stored === 'en' ? 'en' : 'vi'
  })
  const [shops, setShops] = useState<ConnectedShop[]>(() => loadShops())
  const [activeShopIds, setActiveShopIdsState] = useState<string[]>(() =>
    loadActiveShopIds(loadShops()),
  )
  const [scannerOpen, setScannerOpen] = useState(false)

  const persistShops = useCallback((next: ConnectedShop[]) => {
    setShops(next)
    localStorage.setItem(SHOPS_KEY, JSON.stringify(next))
  }, [])

  const setActiveShopIds = useCallback((ids: string[]) => {
    const unique = [...new Set(ids)]
    setActiveShopIdsState(unique)
    persistActiveIds(unique)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v)
  }, [])

  const handleSetLocale = useCallback((l: Locale) => {
    setLocale(l)
    localStorage.setItem('optipack-locale', l)
  }, [])

  const isShopActive = useCallback(
    (id: string) => activeShopIds.includes(id),
    [activeShopIds],
  )

  const toggleShopActive = useCallback(
    (id: string) => {
      setActiveShopIdsState((prev) => {
        const next = prev.includes(id)
          ? prev.filter((x) => x !== id)
          : [...prev, id]
        // Không cho tắt hết — luôn giữ ≥ 1 shop active
        const safe = next.length > 0 ? next : prev
        persistActiveIds(safe)
        return safe
      })
    },
    [],
  )

  const setShopActive = useCallback((id: string, active: boolean) => {
    setActiveShopIdsState((prev) => {
      let next = active
        ? prev.includes(id)
          ? prev
          : [...prev, id]
        : prev.filter((x) => x !== id)
      if (next.length === 0) next = prev
      persistActiveIds(next)
      return next
    })
  }, [])

  const activateAllShops = useCallback(() => {
    const ids = shops.map((s) => s.id)
    setActiveShopIds(ids)
  }, [shops, setActiveShopIds])

  const addShop = useCallback(
    (shop: Omit<ConnectedShop, 'id' | 'connected_at' | 'status'>) => {
      const created: ConnectedShop = {
        ...shop,
        id: `shop-${shop.platform}-${Date.now()}`,
        status: 'connected',
        connected_at: new Date().toISOString().slice(0, 10),
      }
      persistShops([...shops, created])
      setActiveShopIds([...activeShopIds, created.id])
      return created
    },
    [shops, persistShops, activeShopIds, setActiveShopIds],
  )

  const removeShop = useCallback(
    (id: string) => {
      const next = shops.filter((s) => s.id !== id)
      if (next.length === 0) return
      persistShops(next)
      const nextActive = activeShopIds.filter((x) => x !== id)
      setActiveShopIds(
        nextActive.length > 0 ? nextActive : [next[0].id],
      )
    },
    [shops, persistShops, activeShopIds, setActiveShopIds],
  )

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      toggleSidebar,
      setSidebarCollapsed,
      locale,
      setLocale: handleSetLocale,
      mobileNavOpen,
      setMobileNavOpen,
      shops,
      activeShopIds,
      isShopActive,
      toggleShopActive,
      setShopActive,
      activateAllShops,
      addShop,
      removeShop,
      scannerOpen,
      setScannerOpen,
    }),
    [
      sidebarCollapsed,
      toggleSidebar,
      locale,
      handleSetLocale,
      mobileNavOpen,
      shops,
      activeShopIds,
      isShopActive,
      toggleShopActive,
      setShopActive,
      activateAllShops,
      addShop,
      removeShop,
      scannerOpen,
    ],
  )

  return (
    <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
  )
}
