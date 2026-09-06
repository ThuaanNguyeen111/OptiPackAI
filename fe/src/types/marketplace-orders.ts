export const MARKETPLACE_PLATFORMS = ['lazada'] as const
export type MarketplacePlatform = (typeof MARKETPLACE_PLATFORMS)[number]

export const ORDER_STATUSES = [
  'unpaid',
  'pending',
  'packed',
  'ready_to_ship',
  'shipped',
  'delivered',
  'canceled',
  'returned',
  'failed',
] as const

export type MarketplaceOrderStatus = (typeof ORDER_STATUSES)[number]

export type LazadaConnectResponse = {
  authUrl: string
}

export type LazadaCallbackResult = {
  platform: string
  shopId: string
  shopName: string | null
  connected: true
}

export type StoredLazadaShop = {
  shopId: string
  shopName: string | null
  connectedAt: string
}

export type MarketplaceOrderListItem = {
  id: string
  platform: string
  shopId: string
  platformOrderId: string
  platformOrderNumber?: string
  status: MarketplaceOrderStatus
  recipientName: string
  recipientCity: string
  isConsolidated: boolean
  consolidatedGroupId: string | null
  totalAmount: number
  currency: string
  itemCount: number
  createdAt: string
}

export type MarketplaceOrderItem = {
  sku: string
  name: string
  variation: string | null
  status: MarketplaceOrderStatus
  quantity: number
  unitPrice: number
  lineTotal: number
  platformOrderItemIds: string[]
}

export type MarketplaceOrderDetail = MarketplaceOrderListItem & {
  recipientPhone: string
  recipientAddressLine1: string
  recipientAddressLine2: string | null
  recipientPostalCode: string | null
  recipientCountry: string
  items: MarketplaceOrderItem[]
}

export type ListOrdersResponse = {
  orders: MarketplaceOrderListItem[]
  nextCursor: string | null
}

export type ListOrdersParams = {
  shop_id?: string
  status?: MarketplaceOrderStatus
  consolidated_group_id?: string
  before?: string
  limit?: number
}

export type SyncLazadaResult = {
  fetched: number
  upserted: number
  newlyConsolidated: number
}

export const ORDER_STATUS_LABELS: Record<
  MarketplaceOrderStatus,
  { vi: string; en: string }
> = {
  unpaid: { vi: 'Chưa thanh toán', en: 'Unpaid' },
  pending: { vi: 'Chờ xử lý', en: 'Pending' },
  packed: { vi: 'Đã đóng gói', en: 'Packed' },
  ready_to_ship: { vi: 'Sẵn sàng giao', en: 'Ready to ship' },
  shipped: { vi: 'Đã giao vận', en: 'Shipped' },
  delivered: { vi: 'Đã giao', en: 'Delivered' },
  canceled: { vi: 'Đã hủy', en: 'Canceled' },
  returned: { vi: 'Hoàn hàng', en: 'Returned' },
  failed: { vi: 'Thất bại', en: 'Failed' },
}

export const LAZADA_OAUTH_MESSAGE_TYPE = 'optipack-lazada-connected'

export function isMarketplaceOrderStatus(
  value: unknown,
): value is MarketplaceOrderStatus {
  return (
    typeof value === 'string' &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  )
}

export const MARKETPLACE_ORDERS_ERROR_MESSAGES: Record<string, string> = {
  MKT_OAUTH_STATE_INVALID:
    'Phiên kết nối sàn hết hạn hoặc không hợp lệ. Hãy bấm Kết nối lại.',
  MKT_ADAPTER_NOT_REGISTERED: 'Sàn này chưa được hỗ trợ.',
  MKT_SHOP_NOT_CONNECTED:
    'Shop chưa được kết nối hoặc đã bị ngắt. Hãy kết nối shop Lazada trước.',
  MKT_TOKEN_EXCHANGE_FAILED:
    'Không đổi được mã ủy quyền từ Lazada. Hãy kết nối lại shop.',
  MKT_TOKEN_REFRESH_FAILED:
    'Phiên shop Lazada đã hết hạn. Admin cần kết nối lại shop từ đầu.',
  MKT_TOKEN_DECRYPT_FAILED:
    'Không đọc được token shop đã lưu. Liên hệ phụ trách backend.',
  MKT_WEBHOOK_SIGNATURE_INVALID: 'Chữ ký webhook không hợp lệ.',
  MKT_SHOP_LOOKUP_FAILED: 'Không tìm được shop trong hệ thống.',
  ORD_SYNC_FAILED:
    'Đồng bộ thất bại, vui lòng thử lại sau hoặc kiểm tra trạng thái xác minh shop trên Lazada Seller Center.',
  ORD_UNSUPPORTED_PLATFORM: 'Sàn này chưa hỗ trợ đồng bộ đơn.',
  ORD_INVALID_ORDER_ID: 'Mã đơn không đúng định dạng.',
  ORD_ORDER_NOT_FOUND: 'Không tìm thấy đơn hàng.',
}

export function displayOrderNumber(order: {
  platformOrderId: string
  platformOrderNumber?: string
}): string {
  return order.platformOrderNumber ?? order.platformOrderId
}
