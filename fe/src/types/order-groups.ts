/** Khớp `OrderGroupResponse` camelCase từ BE `order-groups.controller.ts`. */

export const GROUP_FULFILLMENT_STATUSES = [
  'awaiting_packaging',
  'pending_approval',
  'approved_for_packing',
  'picking',
  'picked',
  'partial_needs_review',
  'packed',
  'shipped',
  'delivered',
  'returned',
] as const

export type GroupFulfillmentStatus =
  (typeof GROUP_FULFILLMENT_STATUSES)[number]

export type OrderPriority = 'normal' | 'express'

export type OrderGroup = {
  id: string
  platform: string
  shopId: string
  orderCount: number
  fulfillmentStatus: GroupFulfillmentStatus | string
  activePackagingRecommendationId: string | null
  assignedStaffId: string | null
  orderPriority: OrderPriority | string
  packagingDeadline: string | null
  isOverdue: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export type ListOrderGroupsParams = {
  fulfillment_status?: GroupFulfillmentStatus | string
  platform?: string
  order_priority?: OrderPriority
}

export type SetPriorityInput = {
  order_priority: OrderPriority
  deadline_hours?: number
}

export type DecidePartialInput = {
  approve: boolean
  expected_version: number
}

export type ScanMethod = 'barcode' | 'manual'

/** Khớp `PackableItem` — hợp đồng snake_case, không camelCase. */
export type PackableItem = {
  sku: string
  quantity: number
  length_cm: number
  width_cm: number
  height_cm: number
  weight_kg: number
  is_fragile: boolean
}

export type PickItemInput = {
  sku: string
  scanned_quantity: number
  scan_method: ScanMethod
  warehouse_id: string
  client_event_id?: string
}

export type PickItemResult = {
  sku: string
  decrementedBy: number
  remainingStock: number
}

export type ReportMissingInput = {
  sku: string
  missing_quantity: number
  warehouse_id: string
  note?: string
  expected_version: number
}

export type TransitionOrderGroupInput = {
  expected_version: number
}

/** Kho lấy hàng trước — không đợi duyệt gợi ý thùng. */
export const WAREHOUSE_PICKABLE_STATUSES = [
  'awaiting_packaging',
  'pending_approval',
  'approved_for_packing',
  'picking',
] as const

/** Hàng đợi Warehouse Staff (lọc FE sau GET /order-groups). */
export const WAREHOUSE_STAFF_QUEUE_STATUSES = [
  ...WAREHOUSE_PICKABLE_STATUSES,
  'partial_needs_review',
  'picked',
  'packed',
  'shipped',
  'delivered',
  'returned',
] as const

export function isWarehousePickableStatus(status: string): boolean {
  return (WAREHOUSE_PICKABLE_STATUSES as readonly string[]).includes(status)
}

export const GROUP_FULFILLMENT_STATUS_LABELS: Record<
  string,
  { vi: string; en: string }
> = {
  awaiting_packaging: { vi: 'Đơn mới — cần lấy', en: 'New — to pick' },
  pending_approval: {
    vi: 'Chờ duyệt kế hoạch thùng',
    en: 'Pending packaging plan approval',
  },
  approved_for_packing: {
    vi: 'Đã duyệt — chờ kho đóng gói',
    en: 'Plan approved — await warehouse pack',
  },
  picking: { vi: 'Đang lấy hàng', en: 'Picking' },
  picked: { vi: 'Đã lấy xong — chờ gợi ý/duyệt', en: 'Picked — await plan' },
  partial_needs_review: {
    vi: 'Thiếu hàng — cần duyệt',
    en: 'Partial — needs review',
  },
  packed: { vi: 'Đã đóng gói', en: 'Packed' },
  shipped: { vi: 'Đã giao vận', en: 'Shipped' },
  delivered: { vi: 'Đã giao', en: 'Delivered' },
  returned: { vi: 'Hoàn hàng', en: 'Returned' },
}

export const ORDER_GROUPS_ERROR_MESSAGES: Record<string, string> = {
  ORD_GROUP_INVALID_ID: 'Mã nhóm đơn không hợp lệ.',
  ORD_GROUP_NOT_FOUND: 'Không tìm thấy nhóm đơn.',
  ORD_GROUP_INVALID_TRANSITION:
    'BE không cho phép bước này từ trạng thái hiện tại. Luồng: kho lấy (→ picked) → duyệt kế hoạch Packaging (→ approved_for_packing) → Warehouse pack (→ packed).',
  ORD_GROUP_STATE_CONFLICT:
    'Dữ liệu nhóm đơn đã đổi. Tải lại rồi thao tác tiếp.',
  ORD_GROUP_INSUFFICIENT_STOCK: 'Không đủ tồn kho cho SKU này.',
  ORD_GROUP_ITEM_NOT_IN_GROUP: 'SKU không thuộc nhóm đơn này.',
  ORD_GROUP_NO_STAFF_AVAILABLE: 'Không còn nhân viên trống để gán.',
  ORD_GROUP_STAFF_NOT_FOUND: 'Không tìm thấy nhân viên.',
  ORD_GROUP_STAFF_INACTIVE: 'Nhân viên này đang bị vô hiệu hóa, không gán được việc.',
  ORD_GROUP_ALL_ORDERS_CANCELED:
    'Nhóm đơn này không còn hàng cần lấy (đơn đã hủy hoặc gặp sự cố logistics).',
}
