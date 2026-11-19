/** AOFP-322 — dựng / kiểm bản nháp "Đóng gói thủ công" từ kế hoạch bị từ chối. */
import type { PackingPlan } from '../../types/packing-plan'

export type ManualUnit = { itemKey: string; sku: string; orderId: string }
export type ManualParcelDraft = { id: number; orderId: string; boxCode: string }

/** Món của kế hoạch (theo đơn) — lấy từ các vị trí xếp của kế hoạch bị từ chối. */
export function unitsOfPlan(plan: PackingPlan): ManualUnit[] {
  const fallbackOrder = plan.orders[0]?.orderId ?? ''
  return plan.parcels.flatMap((parcel) =>
    (parcel.placements ?? []).map((p) => ({
      itemKey: p.itemKey,
      sku: p.sku,
      orderId: p.orderId ?? parcel.orderId ?? fallbackOrder,
    })),
  )
}

/** Mặc định: giữ đúng các kiện của kế hoạch cũ (cùng đơn, cùng thùng, cùng món) — người đóng chỉ sửa chỗ khác. */
export function initialManualDraft(plan: PackingPlan, units: ManualUnit[]): {
  parcels: ManualParcelDraft[]
  assign: Record<string, number>
} {
  const parcels: ManualParcelDraft[] = []
  const assign: Record<string, number> = {}
  for (const parcel of plan.parcels) {
    const keys = (parcel.placements ?? []).map((p) => p.itemKey)
    if (keys.length === 0) continue
    const orderId = units.find((u) => u.itemKey === keys[0])?.orderId ?? ''
    parcels.push({ id: parcel.parcelNo, orderId, boxCode: parcel.box.code })
    for (const key of keys) assign[key] = parcel.parcelNo
  }
  return { parcels, assign }
}

/** Lỗi nhập trước khi gửi (BE vẫn kiểm lại): món chưa vào kiện, kiện rỗng / chưa chọn thùng, ghi chú ngắn. */
export function manualDraftProblem(
  units: ManualUnit[],
  parcels: ManualParcelDraft[],
  assign: Record<string, number>,
  note: string,
  vi: boolean,
): string | null {
  if (units.length === 0) return vi ? 'Kế hoạch không có món nào để đóng.' : 'No items to pack.'
  const missing = units.filter((u) => !parcels.some((p) => p.id === assign[u.itemKey] && p.orderId === u.orderId))
  if (missing.length > 0) {
    return vi
      ? `Còn ${String(missing.length)} món chưa nằm trong kiện nào của đúng đơn.`
      : `${String(missing.length)} item(s) are not in a parcel of their order.`
  }
  for (const p of parcels) {
    if (!units.some((u) => assign[u.itemKey] === p.id)) {
      return vi ? `Kiện #${String(p.id)} chưa có món nào — xoá kiện hoặc thêm món.` : `Parcel #${String(p.id)} is empty.`
    }
    if (!p.boxCode) return vi ? `Kiện #${String(p.id)} chưa chọn thùng.` : `Parcel #${String(p.id)} has no box.`
  }
  if (note.trim().length < 3) return vi ? 'Ghi lý do đóng thủ công (ít nhất 3 ký tự).' : 'Add a note (3+ characters).'
  return null
}
