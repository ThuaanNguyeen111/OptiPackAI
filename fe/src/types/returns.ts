/** Khớp response camelCase từ `returns.controller.ts` (G3). */

export const RETURN_STATUSES = [
  'requested',
  'rejected',
  'awaiting_receipt',
  'received',
  'closed',
] as const

export type ReturnStatus = (typeof RETURN_STATUSES)[number]

export const RETURN_TYPES = [
  'failed_delivery',
  'return_refund',
  'refund_only',
  'exchange',
] as const

export type ReturnType = (typeof RETURN_TYPES)[number]

export type ReturnItem = {
  sellerSku: string
  quantity: number
  reasonCode: string
  reasonLabel: string
}

export type ExchangeItem = {
  sellerSku: string
  quantity: number
}

export type ReturnInspectionLine = {
  sellerSku: string
  quantity: number
  result: string
  disposition: string | null
  note: string | null
}

export type ReturnRequest = {
  id: string
  rmaCode: string
  orderGroupId: string
  shipmentId: string | null
  type: ReturnType | string
  source: string
  status: ReturnStatus | string
  items: ReturnItem[]
  exchangeItems: ExchangeItem[]
  inspection: ReturnInspectionLine[]
  replacementStatus: string | null
  replacementGroupId: string | null
  replacementError: string | null
  customerNote: string | null
  decisionNote: string | null
  createdBy: string | null
  decidedBy: string | null
  version: number
  closedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type QuarantineLine = {
  returnId: string
  rmaCode: string
  lineIndex: number
  sellerSku: string
  quantity: number
  note: string | null
  since: string | null
}

export type CreateReturnItemInput = {
  seller_sku: string
  quantity: number
  reason_code: string
}

export type CreateReturnInput = {
  order_group_id: string
  type: 'return_refund' | 'refund_only' | 'exchange'
  items: CreateReturnItemInput[]
  exchange_items?: { seller_sku: string; quantity: number }[]
  customer_note?: string
}

export type InspectReturnLineInput = {
  seller_sku: string
  quantity: number
  result: 'restock' | 'quarantine' | 'discard'
  warehouse_id?: string
  bin_location_id?: string
  note?: string
}

export type ReturnListResult = {
  items: ReturnRequest[]
  total: number
  page: number
  limit: number
}

export type ReturnActionInput = {
  expected_version: number
  note?: string
}

export const RETURN_STATUS_LABELS: Record<string, { vi: string; en: string }> = {
  requested: { vi: 'Chờ duyệt', en: 'Pending approval' },
  rejected: { vi: 'Đã từ chối', en: 'Rejected' },
  awaiting_receipt: { vi: 'Chờ hàng về kho', en: 'Awaiting receipt' },
  received: { vi: 'Kho đã nhận', en: 'Received' },
  closed: { vi: 'Đã đóng', en: 'Closed' },
}

export const RETURN_TYPE_LABELS: Record<string, { vi: string; en: string }> = {
  failed_delivery: { vi: 'Hoàn do giao thất bại', en: 'Failed delivery return' },
  return_refund: { vi: 'Trả hàng + hoàn tiền', en: 'Return & refund' },
  refund_only: { vi: 'Chỉ hoàn tiền', en: 'Refund only' },
  exchange: { vi: 'Đổi hàng', en: 'Exchange' },
}

export const RETURNS_ERROR_MESSAGES: Record<string, string> = {
  RMA_NOT_FOUND: 'Không tìm thấy phiếu trả hàng.',
  RMA_INVALID_ID: 'Mã phiếu trả không hợp lệ.',
  RMA_ORDER_NOT_DELIVERED: 'Chỉ tạo phiếu trả khi nhóm đơn đã giao thành công.',
  RMA_OPEN_EXISTS: 'Nhóm đơn đang có phiếu trả chưa đóng.',
  RMA_WINDOW_EXPIRED: 'Đã quá hạn trả hàng (15 ngày).',
  RMA_INVALID_ITEMS: 'SKU/số lượng trả không hợp lệ.',
  RMA_INVALID_STATUS: 'Không làm được bước này ở trạng thái hiện tại.',
  RMA_STATE_CONFLICT: 'Dữ liệu vừa đổi. Tải lại rồi thử lại.',
  RMA_SELF_APPROVAL: 'Người tạo phiếu không được tự duyệt — dùng tài khoản Store Owner khác.',
  RMA_NOTE_REQUIRED: 'Từ chối phải ghi lý do.',
  RMA_INSPECTION_MISMATCH: 'Số lượng kiểm không khớp số lượng trên phiếu.',
  RMA_BIN_REQUIRED: 'Nhập lại kho phải chọn kho và ô.',
  RMA_EXCHANGE_ITEMS_REQUIRED: 'Phiếu đổi hàng phải khai hàng muốn đổi sang.',
  RMA_INVALID_EXCHANGE_ITEMS: 'Hàng đổi sang không có trong danh mục sản phẩm của shop.',
  RMA_NOT_EXCHANGE: 'Chỉ tạo đơn thay thế cho phiếu đổi hàng đã kiểm xong.',
  RMA_REPLACEMENT_EXISTS: 'Phiếu này đã có đơn thay thế.',
  RMA_QUARANTINE_LINE_NOT_FOUND: 'Không tìm thấy dòng hàng cách ly.',
  RMA_QUARANTINE_ALREADY_RESOLVED: 'Dòng cách ly này đã được xử lý.',
}
