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

export type PackingPlanParcel = {
  parcelNo: number
  box: {
    code: string
    name: string
    outerMm: PackingMm
  }
  estimatedWeightG: number
  actualWeightKg: number | null
  materials: { name: string; quantity: number; code?: string | null }[]
  shippingCostVnd: number | null
  status: string
  scannedCount?: number
  itemCount?: number
  isAbnormal?: boolean
  scans?: PackingPlanScan[]
  guide?: PackingGuide | null
}

export type PackingPlan = {
  id: string
  orderGroupId: string
  version: number
  status: string
  failureReason: string | null
  orders: { overParcelLimit: boolean }[]
  parcels: PackingPlanParcel[]
  totals: {
    parcels: number
    packagingCostVnd: number
    estimatedWeightG: number
  }
  session?: {
    assignedPackerId: string | null
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
}

export type PackingStaffMember = {
  staffId: string
  fullName: string
  email: string
  activeWorkload: number
}

export type PackingSettings = {
  version: number | null
  abnormalWeightThreshold: number
  fragileCushionMm: number
  defaultPrefer: 'fewest_parcels' | 'cheapest'
  maxParcelsPerOrder: number | null
  allowReusedBoxForFragile: boolean
  requireScan: boolean
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
