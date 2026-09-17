import { apiRequest } from '../lib/api'
import type {
  ListOrdersParams,
  ListOrdersResponse,
  MarketplaceOrderDetail,
  SyncLazadaResult,
} from '../types/marketplace-orders'

function toQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    qs.set(key, String(value))
  }
  const encoded = qs.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listOrders(
  params: ListOrdersParams = {},
): Promise<ListOrdersResponse> {
  const query = toQuery({
    shop_id: params.shop_id,
    status: params.status,
    consolidated_group_id: params.consolidated_group_id,
    before: params.before,
    limit: params.limit ?? 20,
  })
  return apiRequest<ListOrdersResponse>(`/orders${query}`, { auth: true })
}

export async function getOrderById(
  id: string,
): Promise<MarketplaceOrderDetail> {
  return apiRequest<MarketplaceOrderDetail>(`/orders/${id}`, { auth: true })
}

export async function syncLazadaOrders(
  shopId: string,
): Promise<SyncLazadaResult> {
  const query = toQuery({ shop_id: shopId })
  return apiRequest<SyncLazadaResult>(`/orders/lazada/sync${query}`, {
    method: 'POST',
    auth: true,
  })
}
