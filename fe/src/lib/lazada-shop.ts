import {
  LAZADA_OAUTH_CHANNEL,
  LAZADA_OAUTH_ERROR_TYPE,
  LAZADA_OAUTH_MESSAGE_TYPE,
  type StoredLazadaShop,
} from '../types/marketplace-orders'

export const LAZADA_SHOPS_STORAGE_KEY = 'optipack-lazada-shops'
export const LAZADA_ACTIVE_SHOP_STORAGE_KEY = 'optipack-lazada-active-shop-id'

export type LazadaOAuthSuccessNotice = {
  type: typeof LAZADA_OAUTH_MESSAGE_TYPE
  shopId: string
  shopName: string | null
}

export type LazadaOAuthErrorNotice = {
  type: typeof LAZADA_OAUTH_ERROR_TYPE
  error: string
}

export type LazadaOAuthNotice = LazadaOAuthSuccessNotice | LazadaOAuthErrorNotice

function isStoredShop(value: unknown): value is StoredLazadaShop {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return (
    typeof rec.shopId === 'string' &&
    rec.shopId.length > 0 &&
    (rec.shopName === null || typeof rec.shopName === 'string') &&
    typeof rec.connectedAt === 'string'
  )
}

export function loadLazadaShops(): StoredLazadaShop[] {
  try {
    const raw = localStorage.getItem(LAZADA_SHOPS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStoredShop)
  } catch {
    return []
  }
}

export function saveLazadaShops(shops: StoredLazadaShop[]): void {
  localStorage.setItem(LAZADA_SHOPS_STORAGE_KEY, JSON.stringify(shops))
}

export function upsertLazadaShop(shop: StoredLazadaShop): StoredLazadaShop[] {
  const shops = loadLazadaShops()
  const index = shops.findIndex((s) => s.shopId === shop.shopId)
  const next =
    index >= 0
      ? shops.map((s, i) => (i === index ? { ...s, ...shop } : s))
      : [...shops, shop]
  saveLazadaShops(next)
  setActiveLazadaShopId(shop.shopId)
  return next
}

export function removeLazadaShop(shopId: string): StoredLazadaShop[] {
  const next = loadLazadaShops().filter((s) => s.shopId !== shopId)
  saveLazadaShops(next)
  const active = getActiveLazadaShopId()
  if (active === shopId) {
    setActiveLazadaShopId(next[0]?.shopId ?? null)
  }
  return next
}

export function getActiveLazadaShopId(): string | null {
  return localStorage.getItem(LAZADA_ACTIVE_SHOP_STORAGE_KEY)
}

export function setActiveLazadaShopId(shopId: string | null): void {
  if (shopId) localStorage.setItem(LAZADA_ACTIVE_SHOP_STORAGE_KEY, shopId)
  else localStorage.removeItem(LAZADA_ACTIVE_SHOP_STORAGE_KEY)
}

export function isLazadaOAuthSuccessNotice(
  value: unknown,
): value is LazadaOAuthSuccessNotice {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return (
    rec.type === LAZADA_OAUTH_MESSAGE_TYPE &&
    typeof rec.shopId === 'string' &&
    rec.shopId.length > 0 &&
    (rec.shopName === null || typeof rec.shopName === 'string')
  )
}

export function isLazadaOAuthErrorNotice(
  value: unknown,
): value is LazadaOAuthErrorNotice {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return rec.type === LAZADA_OAUTH_ERROR_TYPE && typeof rec.error === 'string'
}

export function publishLazadaOAuthNotice(payload: LazadaOAuthNotice): void {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(payload, window.location.origin)
  }
  try {
    const channel = new BroadcastChannel(LAZADA_OAUTH_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  } catch {
    /* Safari private mode / trình duyệt không hỗ trợ BroadcastChannel */
  }
}
