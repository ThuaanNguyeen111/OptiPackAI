import { API_BASE_URL, ApiError, apiRequest } from '../lib/api'
import { getAccessToken } from '../lib/auth-storage'

export type ParcelQuote = {
  orderId: string | null
  cartonIndex: number
  actualG: number
  volumetricG: number
  chargeableG: number
  costVnd: number
}

export type ServiceQuote = {
  carrierCode: string
  carrierName: string
  serviceCode: string
  serviceName: string
  etaMinDays: number
  etaMaxDays: number
  parcels: ParcelQuote[]
  totalChargeableG: number
  totalCostVnd: number
  isSample: boolean
}

export type GroupQuote = {
  groupId: string
  parcelCount: number
  strategy: 'cheapest' | 'fastest' | 'fixed'
  quotes: ServiceQuote[]
  recommended: { carrierCode: string; serviceCode: string } | null
}

export type Shipment = {
  id: string
  orderGroupId: string
  // null = vận đơn giao bằng đội xe nhà / tạo từ màn giao hàng (không thuộc chuyến)
  tripCode: string | null
  trackingCode: string
  carrierCode: string | null
  carrierName: string | null
  serviceCode: string | null
  serviceName: string | null
  parcelCount: number | null
  chargeableWeightG: number | null
  estimatedCostVnd: number | null
  isSampleRate: boolean | null
  etaFrom: string | null
  etaTo: string | null
  pickupAt: string | null
  note: string | null
  createdAt: string | null
}

export type ShipmentBatchResult = {
  tripCode: string
  carrierCode: string
  serviceCode: string
  totalCostVnd: number
  shipments: {
    id: string
    orderGroupId: string
    trackingCode: string
    parcelCount: number
    estimatedCostVnd: number
    etaFrom: string
    etaTo: string
  }[]
}

export function getGroupQuote(groupId: string): Promise<GroupQuote> {
  return apiRequest<GroupQuote>(`/shipping/quote/${groupId}`, { auth: true })
}

export function createShipmentBatch(body: {
  orderGroupIds: string[]
  carrierCode: string
  serviceCode: string
  note?: string
  pickupAt?: string
}): Promise<ShipmentBatchResult> {
  return apiRequest<ShipmentBatchResult>('/shipments/batch', {
    method: 'POST',
    auth: true,
    body: {
      order_group_ids: body.orderGroupIds,
      carrier_code: body.carrierCode,
      service_code: body.serviceCode,
      note: body.note,
      pickup_at: body.pickupAt,
    },
  })
}

/** GET /shipments (bản main, có phân trang) — trả mảng vận đơn gần nhất. */
export async function listShipments(params: { tripCode?: string; carrierCode?: string } = {}): Promise<Shipment[]> {
  const query = new URLSearchParams({ limit: '100' })
  if (params.tripCode) query.set('trip_code', params.tripCode)
  if (params.carrierCode) query.set('carrier_code', params.carrierCode)
  const res = await apiRequest<{ items: Shipment[] }>(`/shipments?${query.toString()}`, { auth: true })
  return res.items
}

export function schedulePickup(shipmentId: string, pickupAt: string): Promise<Shipment> {
  return apiRequest<Shipment>(`/shipments/${shipmentId}/pickup`, {
    method: 'PATCH',
    auth: true,
    body: { pickup_at: pickupAt },
  })
}

export type PrintableDocument = 'packing-slip' | 'shipping-label' | 'manifest'

/** Tải PDF (cần Bearer nên không mở thẳng bằng thẻ <a>) rồi mở ở tab mới. */
export async function openDocument(kind: PrintableDocument, id: string): Promise<void> {
  const token = getAccessToken()
  const res = await fetch(`${API_BASE_URL}/documents/${kind}/${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    let message = `Không tải được chứng từ (HTTP ${String(res.status)})`
    let code: string | null = null
    try {
      const body = (await res.json()) as { message?: string; error_code?: string }
      if (body.message) message = body.message
      code = body.error_code ?? null
    } catch {
      /* phản hồi không phải JSON */
    }
    throw new ApiError(res.status, [message], code, null)
  }
  const url = URL.createObjectURL(await res.blob())
  window.open(url, '_blank', 'noopener')
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 60_000)
}
