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
