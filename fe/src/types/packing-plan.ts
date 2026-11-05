/** Khớp response `GET /order-groups/:groupId/packing-plan` — chỉ các field màn đóng gói đang đọc. */

export type PackingMm = {
  lengthMm: number
  widthMm: number
  heightMm: number
}

export type PackingPlanScan = {
  itemKey: string
  sku: string
}

export type PackingOrientation = 'LWH' | 'WLH' | 'LHW' | 'HLW' | 'WHL' | 'HWL'

/** Một món đã xếp trong kiện. Hệ trục BE: x dài, y rộng, z hướng lên; mm. */
export type PackingPlacement = {
  itemKey: string
  sku: string
  /** Thứ tự đặt vào thùng, bắt đầu từ 1. */
  step: number
  x: number
  y: number
  z: number
  /** Kích thước khối chiếm chỗ SAU khi xoay / gập đôi. */
  dx: number
  dy: number
  dz: number
  orientation: PackingOrientation
  /** true = thuật toán đã gập đôi món để vừa thùng nhỏ hơn. */
  folded: boolean
  /** Kiện gộp nhiều đơn: món này thuộc đơn nào. Kiện 1 đơn = null. */
  orderId?: string | null
}

/** Hồ sơ SKU chụp lúc tính kế hoạch — nối với placement theo `sku`. */
export type PackingItemProfile = {
  sku: string
  productCategory: string | null
  zipBagCode: string | null
  zipBagFolded: boolean
}

export type PackingPlanParcel = {
  parcelNo: number
  box: {
    code: string
    name: string
    /** 'mailer' = túi niêm phong. Bản ghi cũ không có = thùng. */
    kind?: 'box' | 'mailer'
    outerMm: PackingMm
    /** Lòng thùng — món đặt theo kích thước này. */
    innerMm?: PackingMm
  }
  placements?: PackingPlacement[]
  /** true = kiện nhập tay, không có tọa độ xếp thật — không dựng cảnh 3D. */
  manualLayout?: boolean
  fillRatio?: number
  estimatedWeightG: number
  actualWeightKg: number | null
  materials: { name: string; quantity: number; code?: string | null; unit?: string }[]
  shippingCostVnd: number | null
  status: string
  scannedCount?: number
  itemCount?: number
  isAbnormal?: boolean
  scans?: PackingPlanScan[]
  guide?: PackingGuide | null
  orderId?: string | null
  recipientName?: string | null
  platformOrderId?: string | null
  /** Kiện gộp: ≥ 2 đơn cùng người nhận trong 1 kiện. Kiện thường có đúng 1 phần tử. */
  orderIds?: string[]
  platformOrderIds?: (string | null)[]
  shareGroup?: string | null
  boxSourceUsed?: 'new' | 'reused' | null
  boxSourceOverride?: {
    source: 'new' | 'reused'
    planned: 'new' | 'reused' | null
    reason: string
    note: string | null
  } | null
}

export type PackingPlan = {
  id: string
  orderGroupId: string
  version: number
  status: string
  /** true khi hồ sơ SKU được đo lại sau lúc tính kế hoạch (chỉ GET trả đúng). */
  profileStale?: boolean
  failureReason: string | null
  orders: {
    overParcelLimit: boolean
    orderId?: string
    platformOrderId?: string | null
    recipientName?: string | null
  }[]
  parcels: PackingPlanParcel[]
  itemProfiles?: PackingItemProfile[]
  totals: {
    parcels: number
    packagingCostVnd: number
    estimatedWeightG: number
  }
  session?: {
    assignedPackerId: string | null
    assignedPackerName?: string | null
  }
}

export const BOX_SOURCE_REASONS = [
  'REUSED_BOX_WORN',
  'REUSED_BOX_DIRTY',
  'OLD_LABEL_NOT_CLEAN',
  'REUSED_NOT_ON_SHELF',
  'HIGH_VALUE_ORDER',
  'OTHER',
] as const

export type BoxSourceReason = (typeof BOX_SOURCE_REASONS)[number]

export const BOX_SOURCE_REASON_LABELS: Record<BoxSourceReason, { vi: string; en: string }> = {
  REUSED_BOX_WORN: { vi: 'Thùng tái sử dụng đã sờn', en: 'Reused box is worn' },
  REUSED_BOX_DIRTY: { vi: 'Thùng tái sử dụng bẩn', en: 'Reused box is dirty' },
  OLD_LABEL_NOT_CLEAN: { vi: 'Nhãn cũ chưa gỡ sạch', en: 'Old label not removed' },
  REUSED_NOT_ON_SHELF: { vi: 'Không thấy thùng tái sử dụng trên kệ', en: 'Reused box not on shelf' },
  HIGH_VALUE_ORDER: { vi: 'Đơn giá trị cao', en: 'High-value order' },
  OTHER: { vi: 'Khác', en: 'Other' },
}

export type BoxSourceChoice = 'auto' | 'new' | 'reused'

export type BoxSourceInput = {
  source: BoxSourceChoice
  reason?: BoxSourceReason
  note?: string
}

export type PackingBoxSourceParcel = {
  parcelNo: number
  boxCode: string
  state: string
  reusedAllowed: boolean
  planned: 'new' | 'reused' | null
  forcedNewReason: string | null
  outOfStock: boolean
  used: 'new' | 'reused' | null
}

export type PackingBoxSources = {
  orderGroupId: string
  version: number
  allowReusedForFragile: boolean
  parcels: PackingBoxSourceParcel[]
  stock: { code: string; name: string; qtyNew: number; qtyReused: number; reusable: boolean }[]
}

/** Lựa chọn khác gợi ý (`planned`) thì cần lý do; `auto` luôn theo gợi ý. */
export function boxSourceNeedsReason(
  choice: BoxSourceChoice,
  planned: 'new' | 'reused' | null | undefined,
): boolean {
  if (choice === 'auto') return false
  return planned != null && choice !== planned
}

export function boxSourceBody(input?: BoxSourceInput): Record<string, unknown> {
  if (!input || input.source === 'auto') return {}
  return {
    box_source: input.source,
    ...(input.reason ? { box_source_reason: input.reason } : {}),
    ...(input.reason === 'OTHER' && input.note?.trim()
      ? { box_source_note: input.note.trim().slice(0, 300) }
      : {}),
  }
}

export type PackingGuide = {
  source: 'ai' | 'template'
  model: string | null
  fallbackReason: string | null
  summary: string
  steps: { step: number; instruction: string; tip: string | null }[]
}

export type PackingPlanSummary = {
  orderGroupId: string
  status: string
  version: number
  parcels: number
  packagingCostVnd: number
  failureReason: string | null
  assignedPackerId: string | null
  assignedPackerName?: string | null
}

export type PackingStaffMember = {
  staffId: string
  fullName: string
  email: string
  activeWorkload: number
  onLeave?: boolean
  onLeaveUntil?: string | null
}

export type PackingSettings = {
  version: number | null
  abnormalWeightThreshold: number
  fragileCushionMm: number
  defaultPrefer: 'fewest_parcels' | 'cheapest'
  maxParcelsPerOrder: number | null
  allowReusedBoxForFragile: boolean
  requireScan: boolean
  mailerEnabled: boolean
  mailerMarginWidthMm: number
  mailerMarginLengthMm: number
  mailerMaxThicknessMm: number
  splitMinSavingVnd: number
  estFeeFirstStepVnd: number
  estFeePerExtraStepVnd: number
}

export type PackingReport = {
  from: string
  to: string
  groups: number
  orders: number
  parcels: number
  avgWaitMinutes: number | null
  avgPackMinutes: number | null
  heldRate: number | null
  approvedIntactRate: number | null
  minimalParcelRate: number | null
  scanRate: number | null
  packagingCostVnd: number
  issues: { damaged: number; missing: number; wrongItem: number }
  byStaff: {
    staffId: string
    name: string | null
    groups: number
    parcels: number
    avgPackMinutes: number | null
  }[]
}

export type PackingFeedbackReport = {
  from: string
  to: string
  minCount: number
  plans: number
  followedRate: number | null
  adjustedPlans: number
  rejectedPlans: number
  suggestions: { reason: string; count: number; message: string }[]
  waste: { events: number; costVnd: number }
  boxSource?: {
    overrides: number
    byReason: { reason: string; count: number }[]
    byBox: { boxCode: string; reason: string; count: number }[]
  }
}

export const ADJUSTMENT_REASONS = [
  'PRODUCT_MORE_FRAGILE_THAN_EXPECTED',
  'RECOMMENDED_BOX_NOT_IN_STOCK',
  'ITEM_DIMENSION_WRONG',
  'ITEM_WEIGHT_WRONG',
  'BOX_TOO_TIGHT',
  'BOX_TOO_LOOSE',
  'BOX_SPEC_WRONG',
  'TOO_MANY_PARCELS',
  'ITEM_DAMAGED',
  'OTHER',
] as const

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]

export const REJECT_REASONS = [
  ...ADJUSTMENT_REASONS,
  'SPECIAL_PACKING_NEEDED',
  'PLAN_UNREALISTIC',
] as const

export type RejectReason = (typeof REJECT_REASONS)[number]

export const PARCEL_REVIEW_REASONS = [
  'SCALE_ERROR',
  'MATERIALS_HEAVIER',
  'PRODUCT_WEIGHT_WRONG',
  'WRONG_ITEM_INSIDE',
  'OTHER',
] as const

export type ParcelReviewReason = (typeof PARCEL_REVIEW_REASONS)[number]

export const PARCEL_REVIEW_LABELS: Record<
  ParcelReviewReason,
  { vi: string; en: string }
> = {
  SCALE_ERROR: { vi: 'Cân lỗi hoặc đặt lệch', en: 'Scale error' },
  MATERIALS_HEAVIER: {
    vi: 'Vật tư nặng hơn ước tính',
    en: 'Materials heavier than estimated',
  },
  PRODUCT_WEIGHT_WRONG: {
    vi: 'Cân nặng hồ sơ sai',
    en: 'Product weight in the profile is wrong',
  },
  WRONG_ITEM_INSIDE: {
    vi: 'Nghi có món sai trong kiện',
    en: 'Wrong item may be inside',
  },
  OTHER: { vi: 'Khác', en: 'Other' },
}

export const PACKING_REASON_LABELS: Record<
  RejectReason,
  { vi: string; en: string }
> = {
  PRODUCT_MORE_FRAGILE_THAN_EXPECTED: {
    vi: 'Sản phẩm dễ vỡ hơn dự kiến',
    en: 'Product more fragile than expected',
  },
  RECOMMENDED_BOX_NOT_IN_STOCK: {
    vi: 'Thùng đề xuất không có trong kho',
    en: 'Recommended box not in stock',
  },
  ITEM_DIMENSION_WRONG: {
    vi: 'Số đo món hàng sai',
    en: 'Item dimensions are wrong',
  },
  ITEM_WEIGHT_WRONG: {
    vi: 'Cân nặng món hàng sai',
    en: 'Item weight is wrong',
  },
  BOX_TOO_TIGHT: { vi: 'Thùng quá chật', en: 'Box is too tight' },
  BOX_TOO_LOOSE: { vi: 'Thùng quá rộng', en: 'Box is too loose' },
  BOX_SPEC_WRONG: { vi: 'Quy cách thùng sai', en: 'Box spec is wrong' },
  TOO_MANY_PARCELS: { vi: 'Quá nhiều kiện', en: 'Too many parcels' },
  ITEM_DAMAGED: { vi: 'Hàng bị hỏng', en: 'Item is damaged' },
  OTHER: { vi: 'Khác', en: 'Other' },
  SPECIAL_PACKING_NEEDED: {
    vi: 'Cần cách đóng đặc biệt',
    en: 'Needs special packing',
  },
  PLAN_UNREALISTIC: {
    vi: 'Kế hoạch không làm được',
    en: 'Plan is unrealistic',
  },
}

export function outerCm(box: PackingPlanParcel['box']): {
  lengthCm: number
  widthCm: number
  heightCm: number
} {
  return {
    lengthCm: box.outerMm.lengthMm / 10,
    widthCm: box.outerMm.widthMm / 10,
    heightCm: box.outerMm.heightMm / 10,
  }
}

export function planWeightKg(plan: PackingPlan | null): number {
  if (!plan || plan.parcels.length === 0) return 0
  return plan.parcels.reduce((sum, parcel) => {
    if (parcel.actualWeightKg != null && parcel.actualWeightKg > 0) {
      return sum + parcel.actualWeightKg
    }
    return sum + parcel.estimatedWeightG / 1000
  }, 0)
}

export function planVolumeCbm(plan: PackingPlan | null): number {
  if (!plan) return 0
  return plan.parcels.reduce((sum, parcel) => {
    const { lengthCm, widthCm, heightCm } = outerCm(parcel.box)
    return sum + (lengthCm * widthCm * heightCm) / 1_000_000
  }, 0)
}
