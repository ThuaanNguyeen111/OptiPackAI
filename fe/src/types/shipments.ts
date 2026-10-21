/** Khớp `ShipmentResponse` / events camelCase từ `shipments.controller.ts`. */

export const SHIPMENT_STATUSES = [
  'awaiting_pickup',
  'in_transit',
  'out_for_delivery',
  'delivery_failed',
  'returning_to_warehouse',
  'delivered',
  'returned_to_warehouse',
  'cancelled',
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
  /** Hạn giao (giờ hành chính) — BE set lúc tạo vận đơn; null = vận đơn cũ. */
  dueAt: string | null
  deliveredAt: string | null
  returnedAt: string | null
  /** (14/10/2026) Sớm nhất được bấm giao lại (khoảng chờ giữa 2 lần giao); trước giờ này phải gửi `override_reason`. */
  nextAttemptNotBefore?: string | null
  /** (14/10/2026) BE đã gắn cờ quá hạn giao (cron 15 phút). */
  isOverdue?: boolean
  /** (14/10/2026) Mã vận đơn hiển thị (`SHP-…`, GHN thì là mã nội bộ — mã GHN ở từng kiện). */
  trackingCode?: string | null
  carrierCode?: string | null
  carrierName?: string | null
  serviceCode?: string | null
  serviceName?: string | null
  /** true khi hãng là API (GHN). Nút giao nội bộ bị backend từ chối. */
  carrierManaged?: boolean
  carrierStatus?: string | null
  carrierStatusLabel?: string | null
  carrierBookingError?: string | null
  carrierIncident?: string | null
  estimatedCostVnd?: number | null
  tripCode?: string | null
  pickupAt?: string | null
  toLocation?: {
    street: string | null
    wardName: string | null
    provinceName: string | null
    phone: string | null
  } | null
  carrierParcels?: {
    parcelNo: number
    carrierOrderCode: string | null
    sortCode: string | null
    feeTotalVnd: number | null
    carrierStatusLabel: string | null
    bookingError: string | null
  }[]
  version: number
  createdAt: string | null
  updatedAt: string | null
}

/** Quá hạn giao khi còn đang xử lý và dueAt đã qua. */
export function isShipmentDeliveryOverdue(shipment: Shipment): boolean {
  if (!shipment.dueAt) return false
  if (
    shipment.status === 'delivered' ||
    shipment.status === 'returned_to_warehouse' ||
    shipment.status === 'cancelled'
  ) {
    return false
  }
  const due = Date.parse(shipment.dueAt)
  return Number.isFinite(due) && due < Date.now()
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
  awaiting_pickup: { vi: 'Chờ hãng lấy', en: 'Awaiting pickup' },
  in_transit: { vi: 'Đang trung chuyển', en: 'In transit' },
  out_for_delivery: { vi: 'Đang giao', en: 'Out for delivery' },
  delivery_failed: { vi: 'Giao thất bại', en: 'Delivery failed' },
  returning_to_warehouse: { vi: 'Đang hoàn về', en: 'Returning' },
  delivered: { vi: 'Đã giao', en: 'Delivered' },
  returned_to_warehouse: { vi: 'Đã về kho', en: 'Returned to WH' },
  cancelled: { vi: 'Đã huỷ ở hãng', en: 'Cancelled at carrier' },
}

export const SHIPMENT_ERROR_MESSAGES: Record<string, string> = {
  SHP_GROUP_NOT_READY: 'Nhóm đơn chưa đóng gói xong — chỉ bắt đầu giao khi trạng thái packed.',
  SHP_ALREADY_EXISTS: 'Nhóm đơn đã có vận đơn. Mở vận đơn sẵn có, không tạo thêm.',
  SHP_INVALID_TRANSITION: 'Không làm được bước này ở trạng thái hiện tại. Tải lại rồi thử nút đúng.',
  SHP_STATE_CONFLICT: 'Dữ liệu vừa đổi (người khác đang thao tác). Tải lại rồi bấm lại.',
  SHP_NOTE_REQUIRED: 'Chọn «Lý do khác» thì bắt buộc ghi chú.',
  SHP_NOT_FOUND: 'Không tìm thấy vận đơn.',
  SHP_INVALID_ID: 'Mã vận đơn không hợp lệ.',
  SHP_MANAGED_BY_CARRIER:
    'Vận đơn do hãng quản lý. Dùng nút mô phỏng GHN, không bấm giao thành công / thất bại / giao lại.',
  SHP_NOT_CARRIER_SHIPMENT: 'Thao tác hãng chỉ dùng cho vận đơn GHN.',
  SHP_CARRIER_NOT_BOOKED: 'Chưa có kiện nào nhận mã hãng.',
  SHP_CARRIER_CANCEL_NOT_ALLOWED: 'Chỉ huỷ được khi vận đơn còn chờ hãng lấy hàng.',
  SHP_CARRIER_CANCEL_REJECTED: 'Hãng từ chối huỷ vận đơn.',
  SHP_CARRIER_SIMULATION_DISABLED: 'Nút mô phỏng GHN đang tắt trên máy chủ.',
  SHP_CARRIER_STATUS_INVALID: 'Trạng thái mô phỏng không hợp lệ.',
  SHP_TO_LOCATION_LOCKED: 'Mọi kiện đã có mã hãng — không sửa địa chỉ được nữa.',
}
