import { apiRequest } from '../lib/api'
import type { LazadaConnectResponse } from '../types/marketplace-orders'

export async function fetchLazadaConnectUrl(): Promise<LazadaConnectResponse> {
  return apiRequest<LazadaConnectResponse>('/marketplace/lazada/connect', {
    auth: true,
  })
}

export type MarketplacePlatformId = 'lazada' | 'aurelle'

export type ConnectedMarketplaceShop = {
  shopId: string
  shopName: string | null
  environment: 'sandbox' | 'production'
  isActive: boolean
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
  lastPolledAt: string | null
  connectedAt: string | null
}

export async function fetchConnectUrl(
  platform: MarketplacePlatformId,
): Promise<LazadaConnectResponse> {
  return apiRequest<LazadaConnectResponse>(`/marketplace/${platform}/connect`, {
    auth: true,
  })
}

/** Shop đã kết nối OAuth, đọc thật từ DB (không phải localStorage). */
export async function fetchConnectedShops(
  platform: MarketplacePlatformId,
): Promise<ConnectedMarketplaceShop[]> {
  const res = await apiRequest<{ shops: ConnectedMarketplaceShop[] }>(
    `/marketplace/${platform}/shops`,
    { auth: true },
  )
  return res.shops
}

export async function syncPlatformOrders(
  platform: MarketplacePlatformId,
  shopId: string,
): Promise<{ fetched: number; upserted: number }> {
  return apiRequest<{ fetched: number; upserted: number }>(
    `/orders/${platform}/sync?shop_id=${encodeURIComponent(shopId)}`,
    { auth: true, method: 'POST' },
  )
}
