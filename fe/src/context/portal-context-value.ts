import { createContext } from 'react'

export type Locale = 'vi' | 'en'

/** Phạm vi đồ án: Shopee + TikTok Shop (nhiều shop/account trên mỗi sàn) */
export type ShopPlatform = 'shopee' | 'tiktok'

export type ConnectedShop = {
  id: string
  platform: ShopPlatform
  account_name: string
  store_label: string
  status: 'connected' | 'pending'
  connected_at: string
}

export type PortalContextValue = {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  locale: Locale
  setLocale: (l: Locale) => void
  mobileNavOpen: boolean
  setMobileNavOpen: (v: boolean) => void
  shops: ConnectedShop[]
  /** Nhiều shop có thể active cùng lúc (đồng bộ đơn đa kênh) */
  activeShopIds: string[]
  isShopActive: (id: string) => boolean
  toggleShopActive: (id: string) => void
  setShopActive: (id: string, active: boolean) => void
  activateAllShops: () => void
  addShop: (shop: Omit<ConnectedShop, 'id' | 'connected_at' | 'status'>) => ConnectedShop
  removeShop: (id: string) => void
  scannerOpen: boolean
  setScannerOpen: (v: boolean) => void
}

export const PLATFORM_META: Record<
  ShopPlatform,
  { label: string; accent: string }
> = {
  shopee: { label: 'Shopee', accent: '#FF6B00' },
  tiktok: { label: 'TikTok Shop', accent: '#00E5FF' },
}

export const DEFAULT_SHOPS: ConnectedShop[] = [
  {
    id: 'shop-shopee-1',
    platform: 'shopee',
    account_name: 'AnhMinh_Official',
    store_label: 'Anh Minh Store',
    status: 'connected',
    connected_at: '2025-01-12',
  },
  {
    id: 'shop-tiktok-1',
    platform: 'tiktok',
    account_name: 'AnhMinh_Studio',
    store_label: 'Anh Minh Store',
    status: 'connected',
    connected_at: '2025-01-12',
  },
]

export const PortalContext = createContext<PortalContextValue | null>(null)
