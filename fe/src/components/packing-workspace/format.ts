import type { PlanParcel, PlanPlacement } from '../../types/packing-plan'

export function cm(mm: number, vi: boolean): string {
  return (mm / 10).toLocaleString(vi ? 'vi-VN' : 'en-US', { maximumFractionDigits: 1 })
}

export function dims(d: { lengthMm: number; widthMm: number; heightMm: number }, vi: boolean): string {
  return `${cm(d.lengthMm, vi)}×${cm(d.widthMm, vi)}×${cm(d.heightMm, vi)} cm`
}

export function kg(g: number | null, vi: boolean): string {
  if (g === null) return '—'
  return `${(g / 1000).toLocaleString(vi ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 })} kg`
}

export function vnd(n: number | null): string {
  return n === null ? '—' : `${n.toLocaleString('vi-VN')} đ`
}

export function orderLabel(parcel: Pick<PlanParcel, 'platformOrderId' | 'orderId'>): string {
  return parcel.platformOrderId ?? `…${parcel.orderId.slice(-6)}`
}

/** Câu hướng dẫn dự phòng khi kiện chưa có hướng dẫn (AI/câu mẫu) từ máy chủ. */
export function fallbackInstruction(p: PlanPlacement, vi: boolean): string {
  const where = p.z === 0 ? (vi ? 'sát đáy thùng' : 'on the carton floor') : vi ? 'lên lớp hàng bên dưới' : 'on top of the layer below'
  const fold = p.folded ? (vi ? 'Gập đôi rồi đặt ' : 'Fold in half, then place ') : vi ? 'Đặt ' : 'Place '
  return `${fold}${p.sku} ${where}.`
}

export function sortedPlacements(parcel: PlanParcel): PlanPlacement[] {
  return [...parcel.placements].sort((a, b) => a.step - b.step)
}
