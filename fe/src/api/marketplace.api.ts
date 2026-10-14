import { apiRequest } from '../lib/api'
import type {
  ConnectedMarketplaceShop,
  LazadaConnectResponse,
} from '../types/marketplace-orders'

export async function fetchLazadaConnectUrl(): Promise<LazadaConnectResponse> {
  return apiRequest<LazadaConnectResponse>('/marketplace/lazada/connect', {
    auth: true,
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

/** Danh sách shop đã từng kết nối OAuth, kể cả shop đã ngắt. */
export async function listMarketplaceShops(
  platform: 'lazada' | 'aurelle' | 'tiktok' | 'tiki' = 'lazada',
): Promise<ConnectedMarketplaceShop[]> {
  const res = await apiRequest<unknown>(
    `/marketplace/${platform}/shops`,
    { auth: true },
  )
  const row = asRecord(res)
  const raw = row?.shops
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const shop = asRecord(item)
    if (!shop) return []
    const shopId = pickString(shop.shopId, shop.shop_id)
    if (!shopId) return []
    return [
      {
        shopId,
        shopName: pickString(shop.shopName, shop.shop_name) || null,
        environment: pickString(shop.environment) || 'production',
        isActive: shop.isActive === true || shop.is_active === true,
        accessTokenExpiresAt:
          pickString(shop.accessTokenExpiresAt, shop.access_token_expires_at) ||
          null,
        refreshTokenExpiresAt:
          pickString(
            shop.refreshTokenExpiresAt,
            shop.refresh_token_expires_at,
          ) || null,
        lastPolledAt:
          pickString(shop.lastPolledAt, shop.last_polled_at) || null,
        connectedAt: pickString(shop.connectedAt, shop.connected_at) || null,
      },
    ]
  })
}
