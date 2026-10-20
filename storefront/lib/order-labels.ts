const orderStatusLabels: Record<string, string> = {
  pending: 'Đang chờ xác nhận',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã hủy',
  completed: 'Hoàn tất',
}

const paymentStatusLabels: Record<string, string> = {
  unpaid: 'Chưa thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thanh toán thất bại',
  refunded: 'Đã hoàn tiền',
}

const fulfillmentStatusLabels: Record<string, string> = {
  awaiting_packaging: 'Chờ đóng gói',
  packed: 'Đã đóng gói',
  shipped: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  failed_delivery: 'Giao hàng không thành công',
  shipped_back: 'Đang hoàn trả về người bán',
  returned: 'Đã hoàn hàng',
}

export function getOrderStatusLabel(status: string) {
  return orderStatusLabels[status] ?? status
}

export function getPaymentStatusLabel(status: string) {
  return paymentStatusLabels[status] ?? status
}

export function getPaymentMethodLabel(method: string | null | undefined) {
  if (method === 'cod') return 'Thanh toán khi nhận hàng (COD)'
  if (method === 'bank_transfer') return 'Chuyển khoản ngân hàng'
  return 'Chưa cập nhật'
}

export function getFulfillmentStatusLabel(status: string) {
  return fulfillmentStatusLabels[status] ?? status
}

export const RETURN_REASON_OPTIONS = [
  { value: 'size_not_fit', label: 'Không vừa size' },
  { value: 'defective', label: 'Hàng lỗi / hư hỏng' },
  { value: 'wrong_item', label: 'Giao sai sản phẩm' },
  { value: 'not_as_described', label: 'Không đúng mô tả' },
  { value: 'changed_mind', label: 'Đổi ý, không muốn mua nữa' },
  { value: 'other', label: 'Lý do khác' },
] as const

export const RETURN_TYPE_LABELS: Record<string, string> = {
  return_refund: 'Trả hàng và hoàn tiền',
  refund_only: 'Hoàn tiền, không cần trả hàng',
}

/** Yêu cầu còn đang xử lý — đơn chưa gửi thêm yêu cầu mới được. */
export const OPEN_RETURN_STATUSES = ['requested', 'approved', 'received']
