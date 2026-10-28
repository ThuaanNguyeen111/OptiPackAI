/**
 * 28/10/2026 — Hàm thuần cho Bảng điều khiển (không đụng DB): khoảng ngày, kỳ trước,
 * tỷ lệ, trung bình, chia theo ngày giờ Việt Nam. Tách riêng để test không cần Mongo.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ngày trên biểu đồ tính theo giờ Việt Nam (UTC+7), không theo giờ máy chủ. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
/** Khoảng tối đa 1 lần xem — quy mô đồ án đọc trong bộ nhớ, rộng hơn thì chia nhỏ. */
export const MAX_RANGE_DAYS = 366;
export const DEFAULT_RANGE_DAYS = 30;

export interface DashboardRange {
  from: Date;
  to: Date;
  /** Kỳ trước cùng độ dài, kết thúc đúng lúc kỳ này bắt đầu (để so sánh tăng/giảm). */
  previousFrom: Date;
  previousTo: Date;
}

/**
 * `from`/`to` dạng ISO; thiếu `to` = bây giờ, thiếu `from` = 30 ngày trước `to`.
 * Trả null khi sai định dạng, `from >= to` hoặc dài quá MAX_RANGE_DAYS.
 */
export function resolveRange(fromIso: string | undefined, toIso: string | undefined, now: Date = new Date()): DashboardRange | null {
  const to = toIso ? new Date(toIso) : now;
  const from = fromIso ? new Date(fromIso) : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return null;
  const length = to.getTime() - from.getTime();
  if (length > MAX_RANGE_DAYS * DAY_MS) return null;
  return { from, to, previousFrom: new Date(from.getTime() - length), previousTo: from };
}

/** Tỷ lệ 0..1 làm tròn 3 chữ số; mẫu số 0 → null (FE hiện "—", không hiện 0%). */
export function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 1000;
}

/** Trung bình làm tròn 1 chữ số; mảng rỗng → null. */
export function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

/** % thay đổi so với kỳ trước (0.125 = +12,5%); kỳ trước bằng 0 → null (không chia được). */
export function changeRate(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 1000;
}

/** Ngày (YYYY-MM-DD) theo giờ Việt Nam của 1 thời điểm. */
export function vnDayKey(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Mọi ngày (giờ VN) nằm trong [from, to) — để biểu đồ có đủ ngày, kể cả ngày bằng 0. */
export function vnDaysBetween(from: Date, to: Date): string[] {
  const days: string[] = [];
  const last = vnDayKey(new Date(to.getTime() - 1));
  let cursor = vnDayKey(from);
  while (cursor <= last) {
    days.push(cursor);
    cursor = new Date(Date.parse(`${cursor}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
  }
  return days;
}

/**
 * Phí ship của 1 vận đơn: vận đơn qua hãng thật (GHN) có phí từng kiện → cộng phí các kiện còn
 * hiệu lực (có mã hãng, chưa huỷ); không có → dùng báo giá lúc tạo (`estimated_cost_vnd`).
 */
export function shippingCostOf(shipment: {
  estimated_cost_vnd?: number | null;
  carrier_parcels?: readonly { carrier_order_code?: string | null; carrier_status?: string | null; fee?: { total?: number | null } | null }[] | null;
}): number {
  const billed = (shipment.carrier_parcels ?? []).filter((p) => p.carrier_order_code && p.carrier_status !== 'cancel' && p.fee);
  if (billed.length > 0) return billed.reduce((sum, p) => sum + (p.fee?.total ?? 0), 0);
  return shipment.estimated_cost_vnd ?? 0;
}
