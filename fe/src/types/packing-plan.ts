/**
 * Kế hoạch đóng gói 1 nhóm đơn — GET /order-groups/:groupId/packing-plan
 * (04/10/2026, làm lại: bộ giải BRKGA + CP-SAT, 1 kế hoạch/nhóm).
 * Đơn vị: mm và gram. Trục x = dài thùng, y = rộng, z = cao (hướng lên).
 */
import type { ProductCategory } from './packaging'

export type ProofLabel = 'optimal_global' | 'optimal_in_model' | 'heuristic'

export type PlanStatus = 'computing' | 'ready' | 'approved' | 'packed' | 'rejected' | 'failed' | 'superseded'

export type DimsMm = { lengthMm: number; widthMm: number; heightMm: number }

export type PlanPlacement = {
  itemKey: string
  sku: string
  /** Thứ tự đặt trong kiện (1..n) — món dưới luôn đặt trước. */
  step: number
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  orientation: string
  folded: boolean
}

export type PlanMaterial = {
  type: string
  code: string | null
  name: string
  unit: string
  quantity: number
  weightG: number
  costVnd: number
}

export type PlanGuide = {
  source: 'ai' | 'template'
  model: string | null
  fallbackReason: string | null
  summary: string
  steps: { step: number; instruction: string; tip: string | null }[]
  generatedAt: string
}

export type PlanParcel = {
  parcelNo: number
  orderId: string
  platformOrderId: string | null
  box: {
    code: string
    name: string
    innerMm: DimsMm
    outerMm: DimsMm
    tareG: number
    maxLoadG: number
    priceVnd: number | null
  }
  placements: PlanPlacement[]
  fillRatio: number
  itemsWeightG: number
  estimatedWeightG: number
  volumetricWeightG: number
  materials: PlanMaterial[]
  materialsWeightG: number
  materialsCostVnd: number
  shippingCostVnd: number | null
  guide: PlanGuide | null
  actualWeightKg: number | null
  isAbnormal: boolean
  materialsShortfall: { code: string; missing: number }[]
}

/** Gợi ý kho thùng (04/10/2026): nếu kho đủ các thùng ở `missing` thì đơn đóng được như vậy. Chụp lúc tính. */
export type StockSuggestion = {
  parcels: number
  packagingCostVnd: number
  avgFill: number
  currentParcels: number
  currentAvgFill: number
  /** > 0 rẻ hơn; < 0 đắt hơn nhưng ít kiện hơn. */
  savingVnd: number
  missing: { boxCode: string; boxName: string; needed: number; available: number }[]
}

export type PlanOrder = {
  orderId: string
  platformOrderId: string | null
  status: 'ok' | 'partial' | 'no_fit'
  unplaced: { itemKey: string; code: string; reason: string }[]
  proof: ProofLabel
  lowerBoundParcels: number
  explanation: string[]
  strategy: string
  cpSat: 'pending' | 'done' | 'skipped' | 'unavailable'
  stockSuggestion: StockSuggestion | null
}

export type PlanItemProfile = {
  sku: string
  productCategory: ProductCategory | null
  zipBagCode: string | null
  zipBagFolded: boolean
}

export type PackingPlan = {
  id: string
  orderGroupId: string
  revision: number
  version: number
  status: PlanStatus
  failureReason: string | null
  proof: ProofLabel | null
  cpSatPending: boolean
  orders: PlanOrder[]
  parcels: PlanParcel[]
  itemProfiles: PlanItemProfile[]
  adjustments: { kind: string; detail: string; reason: string; note: string | null; at: string }[]
  solver: { engineVersion: string; computationMs: number; options: { excludeBoxCodes: string[]; prefer: string } }
  totals: { parcels: number; packagingCostVnd: number; estimatedWeightG: number; avgFill: number }
  approvedAt: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  packedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type PackingPlanSummary = {
  orderGroupId: string
  status: PlanStatus
  version: number
  proof: ProofLabel | null
  cpSatPending: boolean
  parcels: number
  packagingCostVnd: number
  failureReason: string | null
}

export const PROOF_LABELS: Record<ProofLabel, { vi: string; en: string; hintVi: string; hintEn: string }> = {
  optimal_global: {
    vi: 'Tối ưu đã chứng minh',
    en: 'Proven optimal',
    hintVi: 'Không thể dùng ít kiện hơn và mọi tổ hợp thùng rẻ hơn đều không chứa được đơn — đúng với mọi cách xếp.',
    hintEn: 'Fewer parcels are impossible and every cheaper box combination is ruled out, for any arrangement.',
  },
  optimal_in_model: {
    vi: 'Tối ưu (luật chồng chặt)',
    en: 'Optimal (strict stacking)',
    hintVi: 'CP-SAT chứng minh mọi tổ hợp tốt hơn đều không xếp được, theo luật chồng hàng chặt hơn thực tế.',
    hintEn: 'CP-SAT proved every better combination infeasible under stricter stacking rules.',
  },
  heuristic: {
    vi: 'Phương án tốt nhất tìm được',
    en: 'Best found',
    hintVi: 'Chưa chứng minh được là tối ưu — cận dưới chỉ tính theo thể tích nên có thể thấp hơn mức xếp được thật.',
    hintEn: 'Not proven optimal — the lower bound only uses volume, so it can be below what is actually packable.',
  },
}

export const PLAN_STATUS_LABELS: Record<PlanStatus, { vi: string; en: string }> = {
  computing: { vi: 'Đang tính', en: 'Computing' },
  ready: { vi: 'Chờ duyệt', en: 'Awaiting approval' },
  approved: { vi: 'Chờ đóng', en: 'Ready to pack' },
  packed: { vi: 'Đã đóng', en: 'Packed' },
  rejected: { vi: 'Xử lý ngoài hệ thống', en: 'Manual handling' },
  failed: { vi: 'Lỗi khi tính', en: 'Failed' },
  superseded: { vi: 'Đã thay', en: 'Superseded' },
}
