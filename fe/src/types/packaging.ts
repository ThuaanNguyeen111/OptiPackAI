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
  /** (22/09/2026) Gập đôi món này trước khi đặt. */
  folded?: boolean
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
  itemProfiles: ItemProfile[]
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
  packingGuide: PackingGuide | null
  /** Thùng vừa hơn nhưng kho đã hết lúc tính phương án (22/09/2026). */
  preferredBoxOutOfStock: string | null
}

export type PackingGuideStep = {
  step: number
  instruction: string
  tip: string | null
}

/** Lời hướng dẫn đóng gói từng bước: 'ai' = AI (Groq) viết, 'template' = câu mẫu. */
export type PackingGuide = {
  source: 'ai' | 'template'
  model: string | null
  fallbackReason: 'no_api_key' | 'ai_error' | 'ai_invalid_output' | null
  summary: string
  steps: PackingGuideStep[]
  generatedAt: string
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
  /** Tồn kho (22/09/2026): thực có, đang được phương án chưa đóng giữ chỗ, còn trống. */
  quantityOnHand: number
  reserved: number
  available: number
  reorderLevel: number
  storageLocation: string | null
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock'
}

/** 1 dòng sổ xuất/nhập thùng. */
export type BoxStockMovement = {
  delta: number
  reason: 'stock_in' | 'pack'
  balanceAfter: number
  orderGroupId: string | null
  note: string | null
  createdAt: string | null
}

/** Túi zip bọc từng món (kích thước trải phẳng, mm). */
export type PackagingBag = {
  id: string
  code: string
  name: string
  widthMm: number
  lengthMm: number
  priceVnd: number | null
  isSample: boolean
  isActive: boolean
}

/** Loại sản phẩm — khớp enum ProductCategory ở backend. */
export const PRODUCT_CATEGORIES = [
  't_shirt',
  'shirt',
  'jacket',
  'shorts',
  'trousers',
  'dress',
  'shoes',
  'sandals',
  'accessory',
  'other',
] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, { vi: string; en: string }> = {
  t_shirt: { vi: 'Áo thun', en: 'T-shirt' },
  shirt: { vi: 'Áo sơ mi', en: 'Shirt' },
  jacket: { vi: 'Áo khoác', en: 'Jacket' },
  shorts: { vi: 'Quần đùi/short', en: 'Shorts' },
  trousers: { vi: 'Quần dài/jean', en: 'Trousers/jeans' },
  dress: { vi: 'Váy/đầm', en: 'Dress' },
  shoes: { vi: 'Giày (hộp)', en: 'Shoes (boxed)' },
  sandals: { vi: 'Dép/sandal', en: 'Sandals' },
  accessory: { vi: 'Phụ kiện', en: 'Accessory' },
  other: { vi: 'Khác', en: 'Other' },
}

export type ItemProfile = {
  sku: string
  productCategory: ProductCategory | null
  zipBagCode: string | null
  zipBagFolded: boolean
}

export type ProfileDimension = {
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  weightKg?: number
}

/** Hồ sơ đóng gói SKU — GET /product-master. */
export type ProductProfile = {
  id: string
  platform: string
  shopId: string
  sellerSku: string
  packagingProfileStatus: 'needs_measurement' | 'ready'
  dimension: ProfileDimension | null
  marketplaceDimension: ProfileDimension | null
  isFragile: boolean | null
  orientationRule: 'any' | 'upright_only' | null
  maxStackLoadKg: number | null
  productCategory: ProductCategory | null
  zipBagCode: string | null
  zipBagFolded: boolean
  canFoldInHalf: boolean
  profileConfirmedAt: string | null
  lastSyncedAt: string
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
