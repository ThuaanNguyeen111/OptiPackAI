/** Khớp `ShipmentResponse` / events camelCase từ `shipments.controller.ts`. */

export const SHIPMENT_STATUSES = [
  'out_for_delivery',
  'delivery_failed',
  'returning_to_warehouse',
  'delivered',
  'returned_to_warehouse',
] as const

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

export const DELIVERY_FAILURE_REASONS = [
  'customer_unreachable',
  'customer_rescheduled',
  'wrong_address',
  'area_inaccessible',
  'customer_refused',
  'other',
] as const

export type DeliveryFailureReason = (typeof DELIVERY_FAILURE_REASONS)[number]

export type Shipment = {
  id: string
  shipmentCode: string
  orderGroupId: string
  status: ShipmentStatus | string
  attemptCount: number
  maxAttempts: number
  lastFailureReason: string | null
  deliveredAt: string | null
  returnedAt: string | null
  version: number
  createdAt: string | null
  updatedAt: string | null
}

export type ShipmentEvent = {
  id: string
  eventType: string
  statusFrom: string | null
  statusTo: string
  attemptNo: number | null
  actorId: string
  actorRole: number | string | null
  reasonCode: string | null
  reasonLabel: string | null
  note: string | null
  occurredAt: string | null
}

export type FailureReasonOption = {
  code: DeliveryFailureReason | string
  label: string
}

export type ShipmentListResult = {
  items: Shipment[]
  total: number
  page: number
  limit: number
}

export const SHIPMENT_STATUS_LABELS: Record<string, { vi: string; en: string }> = {
  packed: { vi: 'Chờ giao', en: 'Ready to ship' },
  out_for_delivery: { vi: 'Đang giao', en: 'Out for delivery' },
  delivery_failed: { vi: 'Giao thất bại', en: 'Delivery failed' },
  returning_to_warehouse: { vi: 'Đang hoàn về', en: 'Returning' },
  delivered: { vi: 'Đã giao', en: 'Delivered' },
  returned_to_warehouse: { vi: 'Đã về kho', en: 'Returned to WH' },
}

export const SHIPMENT_ERROR_MESSAGES: Record<string, string> = {
  SHP_GROUP_NOT_READY: 'Nhóm đơn chưa đóng gói xong — chỉ bắt đầu giao khi trạng thái packed.',
  SHP_ALREADY_EXISTS: 'Nhóm đơn đã có vận đơn. Mở vận đơn sẵn có, không tạo thêm.',
  SHP_INVALID_TRANSITION: 'Không làm được bước này ở trạng thái hiện tại. Tải lại rồi thử nút đúng.',
  SHP_STATE_CONFLICT: 'Dữ liệu vừa đổi (người khác đang thao tác). Tải lại rồi bấm lại.',
  SHP_NOTE_REQUIRED: 'Chọn «Lý do khác» thì bắt buộc ghi chú.',
  SHP_NOT_FOUND: 'Không tìm thấy vận đơn.',
  SHP_INVALID_ID: 'Mã vận đơn không hợp lệ.',
}
