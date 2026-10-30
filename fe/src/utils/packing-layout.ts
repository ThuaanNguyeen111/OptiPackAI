import type {
  PackingItemProfile,
  PackingMm,
  PackingPlacement,
  PackingPlan,
  PackingPlanParcel,
} from '../types/packing-plan'
import { itemModelFor } from '../components/packing/product-models'

/**
 * Hàm thuần cho cảnh 3D hướng dẫn đóng gói.
 * BE: x = dài (trái → phải), y = rộng (người đóng → phía sau), z = hướng lên; mm.
 * three: y hướng lên; mét. Gốc = tâm đáy LÒNG thùng.
 */

export const MM = 0.001

export type Vec3 = [number, number, number]

export type SceneMode = 'no-plan' | 'computing' | 'failed' | 'list' | 'scene'

export function selectParcel(
  plan: PackingPlan | null,
  parcelNo: number | null | undefined,
): PackingPlanParcel | undefined {
  if (!plan) return undefined
  return plan.parcels.find((p) => p.parcelNo === parcelNo) ?? plan.parcels[0]
}

/**
 * Chỉ dựng cảnh khi có kế hoạch, kiện không phải nhập tay và có ít nhất 1 món.
 * Kiện nhập tay: mọi món ở 0,0,0 — vẽ ra sẽ trông như một cách xếp thật.
 */
export function sceneMode(plan: PackingPlan | null, parcel: PackingPlanParcel | undefined): SceneMode {
  if (!plan) return 'no-plan'
  if (plan.status === 'computing') return 'computing'
  if (plan.status === 'failed') return 'failed'
  if (!parcel) return 'list'
  const placements = parcel.placements ?? []
  if (parcel.manualLayout === true || placements.length === 0) return 'list'
  if (!parcel.box.innerMm) return 'list'
  return 'scene'
}

/** Lòng thùng; dữ liệu cũ thiếu innerMm thì lấy kích thước ngoài trừ 6 mm. */
export function innerOf(parcel: PackingPlanParcel): PackingMm {
  if (parcel.box.innerMm) return parcel.box.innerMm
  const o = parcel.box.outerMm
  return {
    lengthMm: Math.max(1, o.lengthMm - 6),
    widthMm: Math.max(1, o.widthMm - 6),
    heightMm: Math.max(1, o.heightMm - 6),
  }
}

/** Kích thước lòng / ngoài thùng ở hệ three (m): [dài, cao, rộng]. */
export function boxSize(mm: PackingMm): Vec3 {
  return [mm.lengthMm * MM, mm.heightMm * MM, mm.widthMm * MM]
}

/** Khối chiếm chỗ của 1 món trong hệ three, gốc = tâm đáy lòng thùng. */
export function placementToThree(
  p: PackingPlacement,
  inner: PackingMm,
): { size: Vec3; center: Vec3 } {
  return {
    size: [p.dx * MM, p.dz * MM, p.dy * MM],
    center: [
      (p.x + p.dx / 2 - inner.lengthMm / 2) * MM,
      (p.z + p.dz / 2) * MM,
      (p.y + p.dy / 2 - inner.widthMm / 2) * MM,
    ],
  }
}

export function profileFor(
  profiles: PackingItemProfile[] | undefined,
  sku: string,
): PackingItemProfile | undefined {
  return profiles?.find((p) => p.sku === sku)
}

export function sortedPlacements(parcel: PackingPlanParcel): PackingPlacement[] {
  return [...(parcel.placements ?? [])].sort((a, b) => a.step - b.step)
}

/**
 * prepare: thùng + vật tư. fold: gấp áo (clip có sẵn). halfFold: gập đôi thêm (placement.folded).
 * zip: cho vào túi zip + kéo khoá (clip). zipFold: gập túi. shoeBox: đóng hộp giày (clip).
 * place: đặt vào thùng. close: gập nắp.
 */
export type PackStepKind =
  | 'prepare'
  | 'fold'
  | 'halfFold'
  | 'zip'
  | 'zipFold'
  | 'shoeBox'
  | 'place'
  | 'close'

export type PackStep = {
  kind: PackStepKind
  /** Vị trí trong `sortedPlacements`; null cho prepare / close. */
  item: number | null
}

export function buildPackSteps(
  placements: PackingPlacement[],
  profiles: PackingItemProfile[] | undefined,
): PackStep[] {
  const steps: PackStep[] = [{ kind: 'prepare', item: null }]
  placements.forEach((p, item) => {
    const profile = profileFor(profiles, p.sku)
    const model = itemModelFor(profile?.productCategory)
    if (model?.kind === 'garment') steps.push({ kind: 'fold', item })
    if (model?.kind === 'rigid') steps.push({ kind: 'shoeBox', item })
    if (p.folded) steps.push({ kind: 'halfFold', item })
    if (profile?.zipBagCode) {
      steps.push({ kind: 'zip', item })
      if (profile.zipBagFolded) steps.push({ kind: 'zipFold', item })
    }
    steps.push({ kind: 'place', item })
  })
  steps.push({ kind: 'close', item: null })
  return steps
}

/** Món ở vị trí `item` đang ở trạng thái nào khi xem bước `index`. */
export type ItemRole = 'hidden' | 'staged' | 'placing' | 'placed'

export function itemRole(steps: PackStep[], index: number, item: number): ItemRole {
  const current = steps[index]
  if (!current) return 'hidden'
  if (current.item === item) return current.kind === 'place' ? 'placing' : 'staged'
  const placeAt = steps.findIndex((s) => s.kind === 'place' && s.item === item)
  if (placeAt >= 0 && placeAt < index) return 'placed'
  return 'hidden'
}

export function stepLabel(kind: PackStepKind, vi: boolean): string {
  switch (kind) {
    case 'prepare':
      return vi ? 'Chuẩn bị thùng và vật tư' : 'Prepare box and materials'
    case 'fold':
      return vi ? 'Gấp gọn món hàng' : 'Fold the item'
    case 'halfFold':
      return vi ? 'Gập đôi để vừa thùng' : 'Fold in half to fit'
    case 'zip':
      return vi ? 'Cho vào túi zip, kéo khoá' : 'Put into zip bag and close'
    case 'zipFold':
      return vi ? 'Gập đôi túi zip' : 'Fold the zip bag'
    case 'shoeBox':
      return vi ? 'Đóng hộp giày' : 'Pack the shoe box'
    case 'place':
      return vi ? 'Đặt vào thùng' : 'Place into the box'
    case 'close':
      return vi ? 'Gập nắp thùng' : 'Close the flaps'
  }
}

/** Thời lượng hoạt ảnh của bước (giây) — clip trong file được kéo/nén cho vừa. */
export const STEP_SECONDS: Record<PackStepKind, number> = {
  prepare: 0,
  fold: 2.6,
  halfFold: 1.2,
  zip: 4,
  zipFold: 1.2,
  shoeBox: 5,
  place: 1,
  close: 1.8,
}
