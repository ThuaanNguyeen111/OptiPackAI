/** Khớp `PackagingRecommendationResponse` camelCase từ BE packaging.controller. */

export type PackagingBoxSize = {
  lengthCm: number
  widthCm: number
  heightCm: number
}

export type PackagingRecommendation = {
  id: string
  orderGroupId: string
  boxSize: PackagingBoxSize
  materialType: string
  materialQuantity: number
  estimatedShippingCostVnd: number
  computationTimeMs: number
  fallbackUsed: boolean
  approvalStatus: string
  approvedBy: string | null
  approvedAt: string | null
  actualMeasuredWeightKg: number | null
  isAbnormal: boolean
  createdAt: string
  updatedAt: string
}

export type ApprovePackagingInput = {
  actual_measured_weight_kg: number
  expected_group_version: number
}

export type AdjustPackagingInput = {
  box_size: {
    length_cm: number
    width_cm: number
    height_cm: number
  }
  material_type: string
  adjustment_reason:
    | 'PRODUCT_MORE_FRAGILE_THAN_EXPECTED'
    | 'RECOMMENDED_BOX_NOT_IN_STOCK'
    | 'OTHER'
  adjustment_note?: string
  actual_measured_weight_kg: number
  expected_group_version: number
}

export type RejectPackagingInput = {
  expected_group_version: number
}

export const ADJUSTMENT_REASON_LABELS: Record<
  AdjustPackagingInput['adjustment_reason'],
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
  OTHER: { vi: 'Khác', en: 'Other' },
}
