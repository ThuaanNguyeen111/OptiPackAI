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

export const GROUP_FULFILLMENT_STATUS_LABELS: Record<
  string,
  { vi: string; en: string }
> = {
  awaiting_packaging: { vi: 'Chờ đóng gói', en: 'Awaiting packaging' },
  pending_approval: { vi: 'Chờ duyệt AI', en: 'Pending approval' },
  approved_for_packing: { vi: 'Đã duyệt — chờ lấy', en: 'Approved for packing' },
  picking: { vi: 'Đang lấy hàng', en: 'Picking' },
  picked: { vi: 'Đã lấy xong', en: 'Picked' },
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
  ORD_GROUP_INVALID_TRANSITION: 'Không thể chuyển trạng thái nhóm đơn này.',
  ORD_GROUP_STATE_CONFLICT:
    'Dữ liệu nhóm đơn đã đổi. Tải lại rồi thao tác tiếp.',
  ORD_GROUP_INSUFFICIENT_STOCK: 'Không đủ tồn kho cho SKU này.',
  ORD_GROUP_ITEM_NOT_IN_GROUP: 'SKU không thuộc nhóm đơn này.',
  ORD_GROUP_NO_STAFF_AVAILABLE: 'Không còn nhân viên trống để gán.',
  ORD_GROUP_STAFF_NOT_FOUND: 'Không tìm thấy nhân viên.',
}
