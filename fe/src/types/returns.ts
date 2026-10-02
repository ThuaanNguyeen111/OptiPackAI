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

export type ReturnRequest = {
  id: string
  rmaCode: string
  orderGroupId: string
  shipmentId: string | null
  type: ReturnType | string
  source: string
  status: ReturnStatus | string
  items: ReturnItem[]
  customerNote: string | null
  decisionNote: string | null
  createdBy: string | null
  decidedBy: string | null
  version: number
  closedAt: string | null
  createdAt: string | null
  updatedAt: string | null
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
}
