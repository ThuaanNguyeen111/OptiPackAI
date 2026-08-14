export type SyncPipelineStatus =
  | 'ingested'
  | 'normalized'
  | 'consolidated'
  | 'standalone'
  | 'saved'
  | 'sync_error'

export type ConsolidationType = 'consolidated' | 'standalone' | 'pending_merge'

export type OrderStatus = 'pending' | 'consolidated' | 'packing' | 'shipped'

export type Marketplace = 'shopee' | 'tiktok'

export type PaymentStatus = 'paid' | 'cod' | 'pending'

export type ShippingStatus = 'pending' | 'ready' | 'shipped'

export type MatchBy = 'phone' | 'address' | 'manual'

export type OrderPriority = 'normal' | 'urgent'

export type SyncEvent = {
  step: string
  at: string
  detail?: string
}

export type OrderItem = {
  sku: string
  name: string
  qty: number
  price: number
}

export type Customer = {
  name: string
  phone: string
  address: string
}

export type Order = {
  id: string
  external_id: string
  marketplace: Marketplace
  customer: Customer
  items: OrderItem[]
  item_count: number
  total_amount: number
  payment_status: PaymentStatus
  shipping_status: ShippingStatus
  status: OrderStatus
  pipeline_status: SyncPipelineStatus
  consolidation_type: ConsolidationType
  consolidation_group_id?: string
  matched_by?: MatchBy
  is_duplicate?: boolean
  priority: OrderPriority
  sync_events: SyncEvent[]
  created_at: string
}

export type ConsolidationGroup = {
  id: string
  customer: Customer
  order_ids: string[]
  status: 'pending_review' | 'merged' | 'split'
  match_reason: string
}

export type PlatformIntegration = {
  marketplace: Marketplace
  connected: boolean
  webhook_active: boolean
  last_sync_at: string
  orders_today: number
}

export type SyncLogEvent = {
  id: string
  marketplace: Marketplace
  event_type: 'new_order' | 'order_update' | 'cancellation'
  external_id: string
  status: 'success' | 'error'
  at: string
  message?: string
}

export const marketplaceLabels: Record<Marketplace, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
}

export const statusLabels: Record<OrderStatus, string> = {
  pending: 'Chờ xử lý',
  consolidated: 'Đã gộp',
  packing: 'Đang đóng gói',
  shipped: 'Đã giao vận',
}

export const pipelineLabels: Record<SyncPipelineStatus, string> = {
  ingested: 'Đã ingest',
  normalized: 'Đã chuẩn hóa',
  consolidated: 'Đã gộp',
  standalone: 'Đơn lẻ',
  saved: 'Đã lưu',
  sync_error: 'Lỗi đồng bộ',
}

export const consolidationTypeLabels: Record<ConsolidationType, string> = {
  consolidated: 'Gộp đơn',
  standalone: 'Đơn lẻ',
  pending_merge: 'Chờ gộp',
}

export const paymentLabels: Record<PaymentStatus, string> = {
  paid: 'Đã thanh toán',
  cod: 'COD',
  pending: 'Chờ TT',
}

export const shippingLabels: Record<ShippingStatus, string> = {
  pending: 'Chờ ship',
  ready: 'Sẵn sàng',
  shipped: 'Đã giao',
}

export function getOrderById(id: string, orders: Order[]): Order | undefined {
  return orders.find((o) => o.id === id)
}

export function getOrdersByGroupId(groupId: string, orders: Order[]): Order[] {
  return orders.filter((o) => o.consolidation_group_id === groupId)
}
