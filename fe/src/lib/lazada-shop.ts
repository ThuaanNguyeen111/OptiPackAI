import type { StoredLazadaShop } from '../types/marketplace-orders'

const SHOPS_KEY = 'optipack-lazada-shops'
const ACTIVE_SHOP_KEY = 'optipack-lazada-active-shop-id'

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
    const raw = localStorage.getItem(SHOPS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStoredShop)
  } catch {
    return []
  }
}

export function saveLazadaShops(shops: StoredLazadaShop[]): void {
  localStorage.setItem(SHOPS_KEY, JSON.stringify(shops))
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
  return localStorage.getItem(ACTIVE_SHOP_KEY)
}

export function setActiveLazadaShopId(shopId: string | null): void {
  if (shopId) localStorage.setItem(ACTIVE_SHOP_KEY, shopId)
  else localStorage.removeItem(ACTIVE_SHOP_KEY)
}

export function parseLazadaCallbackPayload(
  raw: string,
): StoredLazadaShop | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^\d{6,}$/.test(trimmed)) {
    return {
      shopId: trimmed,
      shopName: null,
      connectedAt: new Date().toISOString(),
    }
  }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null) return null
    const rec = parsed as Record<string, unknown>
    const shopId = typeof rec.shopId === 'string' ? rec.shopId.trim() : ''
    const shopName =
      typeof rec.shopName === 'string' && rec.shopName.trim()
        ? rec.shopName.trim()
        : null
    const connected = rec.connected === true
    if (!shopId || !connected) return null
    return {
      shopId,
      shopName,
      connectedAt: new Date().toISOString(),
    }
  } catch {
    const idMatch = trimmed.match(/"shopId"\s*:\s*"(\d+)"/)
    if (!idMatch?.[1]) return null
    const nameMatch = trimmed.match(/"shopName"\s*:\s*"([^"]*)"/)
    return {
      shopId: idMatch[1],
      shopName: nameMatch?.[1] ? nameMatch[1] : null,
      connectedAt: new Date().toISOString(),
    }
  }
}
