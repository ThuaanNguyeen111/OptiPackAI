/**
 * Kiểu dữ liệu packaging — khớp response camelCase của BE
 * (GET /order-groups/:groupId/packaging, /packaging/boxes).
 * Tọa độ xếp: mm, trục z của engine là chiều cao (hướng lên).
 */

export type DimensionsMm = {
  lengthMm: number
  widthMm: number
  heightMm: number
}

export type Placement = {
  itemKey: string
  sku: string
  step: number
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  orientation: string
}

export type PackagingApprovalStatus = 'pending' | 'approved' | 'adjusted' | 'rejected'

export type PackagingRecommendation = {
  id: string
  orderGroupId: string
  orderId: string | null
  platformOrderId: string | null
  solutionStatus: 'ok' | 'no_fit'
  noFitReasons: { boxCode: string; reason: string }[]
  boxCode: string | null
  boxName: string | null
  boxInnerMm: DimensionsMm | null
  boxOuterMm: DimensionsMm | null
  placements: Placement[]
  materials: { type: string; quantity: number }[]
  estimatedShippingCostVnd: number | null
  itemsWeightG: number | null
  estimatedPackageWeightG: number | null
  volumetricWeightG: number | null
  fillRatio: number | null
  computationTimeMs: number
  engineVersion: string | null
  approvalStatus: PackagingApprovalStatus
  approvedAt: string | null
  adjustmentReason: string | null
  adjustmentNote: string | null
  adjustedFromBoxCode: string | null
  actualMeasuredWeightKg: number | null
  packedAt: string | null
  isAbnormal: boolean
}

export type PackagingPlan = {
  orderGroupId: string
  recommendations: PackagingRecommendation[]
}

export type PackagingBox = {
  id: string
  code: string
  name: string
  inner: DimensionsMm
  outer: DimensionsMm
  tareG: number
  maxLoadG: number
  priceVnd: number | null
  isSample: boolean
  isActive: boolean
}

export type OrderGroupSummary = {
  id: string
  platform: string
  shopId: string
  orderCount: number
  fulfillmentStatus: string
  assignedStaffId: string | null
  orderPriority: string
  packagingDeadline: string | null
  isOverdue: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export const ADJUSTMENT_REASONS = [
  'PRODUCT_MORE_FRAGILE_THAN_EXPECTED',
  'RECOMMENDED_BOX_NOT_IN_STOCK',
  'OTHER',
] as const

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, { vi: string; en: string }> = {
  PRODUCT_MORE_FRAGILE_THAN_EXPECTED: { vi: 'Hàng dễ vỡ hơn dự kiến', en: 'More fragile than expected' },
  RECOMMENDED_BOX_NOT_IN_STOCK: { vi: 'Thùng đề xuất hết hàng', en: 'Recommended box out of stock' },
  OTHER: { vi: 'Khác', en: 'Other' },
}

export const FULFILLMENT_STATUS_LABELS: Record<string, { vi: string; en: string }> = {
  awaiting_packaging: { vi: 'Chờ lấy hàng', en: 'Awaiting pick' },
  picking: { vi: 'Đang lấy hàng', en: 'Picking' },
  partial_needs_review: { vi: 'Thiếu hàng — chờ xử lý', en: 'Partial — review' },
  picked: { vi: 'Đã lấy xong', en: 'Picked' },
  pending_approval: { vi: 'Chờ duyệt đóng gói', en: 'Pending approval' },
  approved_for_packing: { vi: 'Đã duyệt — chờ đóng', en: 'Approved for packing' },
  packed: { vi: 'Đã đóng gói', en: 'Packed' },
  shipped: { vi: 'Đã giao vận chuyển', en: 'Shipped' },
  delivered: { vi: 'Đã giao', en: 'Delivered' },
  returned: { vi: 'Hoàn hàng', en: 'Returned' },
}
