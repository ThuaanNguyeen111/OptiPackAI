import { ShipmentStatus } from './enums/shipment-status.enum';
import { DeliveryFailureReason } from './enums/delivery-failure-reason.enum';

/**
 * ===================================================================
 * C5 (14/10/2026) — trạng thái của HÃNG (GHN) → trạng thái vận đơn OptiPack
 * ===================================================================
 * Hàm THUẦN, không đụng DB. Nguồn: developer.ghn.vn/en/docs/master-data/order-status
 * (đọc 07/10 + 13/10/2026). Dùng chung cho webhook thật, nút mô phỏng demo và
 * đồng bộ Order Info → 3 nguồn ra cùng kết quả.
 *
 * Quy ước quan trọng:
 * - `returned` (hãng đã trả hàng về shop) KHÔNG đưa thẳng vận đơn tới
 *   `returned_to_warehouse`: kho vẫn phải quét "Nhận hàng hoàn" để hệ thống tạo
 *   phiếu hoàn + kiểm hàng (G3) — hàng chưa chắc đã về tới kệ.
 * - Sự cố (`lost`, `damage`, `exception`, `scrap`) không đổi trạng thái — gắn cờ
 *   + báo Store Owner xử lý tay.
 * ===================================================================
 */

export const GHN_STATUSES = [
  'ready_to_pick', 'picking', 'money_collect_picking', 'picked', 'storing', 'sorting',
  'transporting', 'delivering', 'money_collect_delivering', 'delivered', 'delivery_fail',
  'waiting_to_return', 'return', 'return_transporting', 'return_sorting', 'returning',
  'return_fail', 'returned', 'cancel', 'exception', 'lost', 'damage', 'scrap',
] as const;
export type GhnStatus = (typeof GHN_STATUSES)[number];

export const GHN_INCIDENT_STATUSES: readonly string[] = ['exception', 'lost', 'damage', 'scrap'];

const MAP: Record<string, ShipmentStatus> = {
  ready_to_pick: ShipmentStatus.AWAITING_PICKUP,
  picking: ShipmentStatus.AWAITING_PICKUP,
  money_collect_picking: ShipmentStatus.AWAITING_PICKUP,
  picked: ShipmentStatus.IN_TRANSIT,
  storing: ShipmentStatus.IN_TRANSIT,
  sorting: ShipmentStatus.IN_TRANSIT,
  transporting: ShipmentStatus.IN_TRANSIT,
  delivering: ShipmentStatus.OUT_FOR_DELIVERY,
  money_collect_delivering: ShipmentStatus.OUT_FOR_DELIVERY,
  delivered: ShipmentStatus.DELIVERED,
  delivery_fail: ShipmentStatus.DELIVERY_FAILED,
  waiting_to_return: ShipmentStatus.RETURNING_TO_WAREHOUSE,
  return: ShipmentStatus.RETURNING_TO_WAREHOUSE,
  return_transporting: ShipmentStatus.RETURNING_TO_WAREHOUSE,
  return_sorting: ShipmentStatus.RETURNING_TO_WAREHOUSE,
  returning: ShipmentStatus.RETURNING_TO_WAREHOUSE,
  return_fail: ShipmentStatus.RETURNING_TO_WAREHOUSE,
  returned: ShipmentStatus.RETURNING_TO_WAREHOUSE,
  cancel: ShipmentStatus.CANCELLED,
};

/** Trạng thái vận đơn ứng với 1 trạng thái hãng; null = sự cố / không biết (không đổi trạng thái). */
export function mapGhnStatus(status: string): ShipmentStatus | null {
  return MAP[status] ?? null;
}

/** Thứ tự tiến độ — dùng để lấy kiện "chậm nhất" khi các kiện khác nhau. */
const PROGRESS: Record<ShipmentStatus, number> = {
  [ShipmentStatus.CANCELLED]: -1,
  [ShipmentStatus.AWAITING_PICKUP]: 0,
  [ShipmentStatus.IN_TRANSIT]: 1,
  [ShipmentStatus.OUT_FOR_DELIVERY]: 2,
  [ShipmentStatus.DELIVERY_FAILED]: 2,
  [ShipmentStatus.RETURNING_TO_WAREHOUSE]: 3,
  [ShipmentStatus.DELIVERED]: 4,
  [ShipmentStatus.RETURNED_TO_WAREHOUSE]: 5,
};

/**
 * Trạng thái của CẢ vận đơn từ trạng thái hãng của từng kiện (1 kiện = 1 đơn hãng):
 * - mọi kiện huỷ → cancelled; bỏ qua kiện đã huỷ khi còn kiện khác;
 * - có kiện đang hoàn → returning (cả vận đơn phải về kho kiểm);
 * - có kiện giao thất bại → delivery_failed;
 * - mọi kiện đã giao → delivered (nhóm đơn chỉ "đã giao" khi đủ kiện);
 * - còn lại lấy kiện CHẬM nhất (chờ lấy < trung chuyển < đang giao).
 * Kiện chưa có trạng thái hãng (chưa tạo được / chưa báo) coi như chờ lấy.
 * Trả null khi mọi kiện đều đang ở trạng thái sự cố.
 */
export function aggregateCarrierStatus(parcelStatuses: (string | null)[]): ShipmentStatus | null {
  if (parcelStatuses.length === 0) return null;
  const mapped = parcelStatuses.map((s) => (s === null ? ShipmentStatus.AWAITING_PICKUP : mapGhnStatus(s)));
  const known = mapped.filter((m): m is ShipmentStatus => m !== null);
  if (known.length === 0) return null;
  if (known.every((m) => m === ShipmentStatus.CANCELLED)) return ShipmentStatus.CANCELLED;
  const live = known.filter((m) => m !== ShipmentStatus.CANCELLED);
  if (live.includes(ShipmentStatus.RETURNING_TO_WAREHOUSE)) return ShipmentStatus.RETURNING_TO_WAREHOUSE;
  if (live.includes(ShipmentStatus.DELIVERY_FAILED)) return ShipmentStatus.DELIVERY_FAILED;
  if (live.every((m) => m === ShipmentStatus.DELIVERED)) return ShipmentStatus.DELIVERED;
  const pending = live.filter((m) => m !== ShipmentStatus.DELIVERED);
  return pending.reduce((slowest, m) => (PROGRESS[m] < PROGRESS[slowest] ? m : slowest));
}

/**
 * AOFP-224 — các đơn có hàng trong 1 kiện vận đơn: `order_ids` (kiện gộp cùng người nhận),
 * vận đơn cũ chưa có trường này thì chỉ đơn chủ `order_id`.
 */
export function carrierParcelOrderIds<T>(p: { order_id?: T | null; order_ids?: readonly T[] | null }): T[] {
  if (p.order_ids && p.order_ids.length > 0) return [...p.order_ids];
  return p.order_id !== undefined && p.order_id !== null ? [p.order_id] : [];
}

export function carrierParcelHasOrder(
  p: { order_id?: unknown; order_ids?: readonly unknown[] | null },
  orderId: unknown,
): boolean {
  return carrierParcelOrderIds<unknown>(p).some((id) => String(id) === String(orderId));
}

/**
 * 28/10/2026 (G2) — Trạng thái hãng của RIÊNG 1 đơn trong vận đơn: chỉ gộp các kiện của đơn đó
 * (mỗi đơn có vận đơn hãng riêng). Nhóm gộp 2 đơn: kiện A giao xong thì đơn A là "đã giao" dù
 * kiện B còn đang chạy. Đơn không có kiện nào trong vận đơn → null.
 */
export function carrierStatusOfOrder(
  parcels: readonly { order_id?: unknown; order_ids?: readonly unknown[] | null; carrier_status?: string | null }[],
  orderId: string,
): ShipmentStatus | null {
  const own = parcels.filter((p) => carrierParcelHasOrder(p, orderId));
  return aggregateCarrierStatus(own.map((p) => p.carrier_status ?? null));
}

/**
 * Luật chuyển trạng thái cho vận đơn do HÃNG quản lý (khác bảng chặt của G1):
 * webhook có thể mất hoặc đến lệch thứ tự nên được phép "nhảy" (VD chờ lấy →
 * giao thành công), nhưng:
 * - không rời trạng thái kết thúc (delivered / returned_to_warehouse / cancelled);
 * - đang hoàn về kho thì chỉ kho quét nhận mới đi tiếp (không quay lại giao);
 * - không quay về "chờ lấy hàng"; chỉ huỷ được khi còn "chờ lấy hàng";
 * - `returned_to_warehouse` chỉ do kho quét nhận, không do hãng.
 */
export function canCarrierMove(from: ShipmentStatus, to: ShipmentStatus): boolean {
  if (from === to) return false;
  if (
    from === ShipmentStatus.DELIVERED ||
    from === ShipmentStatus.RETURNED_TO_WAREHOUSE ||
    from === ShipmentStatus.CANCELLED ||
    from === ShipmentStatus.RETURNING_TO_WAREHOUSE
  ) {
    return false;
  }
  if (to === ShipmentStatus.AWAITING_PICKUP || to === ShipmentStatus.RETURNED_TO_WAREHOUSE) return false;
  if (to === ShipmentStatus.CANCELLED) return from === ShipmentStatus.AWAITING_PICKUP;
  return true;
}

/** Mã lý do giao thất bại của GHN (GHN-DFC… / GHN-DCD…) → lý do cố định của OptiPack (thống kê). */
export function mapGhnFailureReason(reasonCode: string | null | undefined): DeliveryFailureReason {
  const code = (reasonCode ?? '').toUpperCase();
  if (code.startsWith('GHN-DCD')) return DeliveryFailureReason.CUSTOMER_REFUSED;
  if (code === 'GHN-DFC1A0') return DeliveryFailureReason.CUSTOMER_RESCHEDULED;
  if (code === 'GHN-DFC1A2' || code === 'GHN-DFC1A4') return DeliveryFailureReason.CUSTOMER_UNREACHABLE;
  if (code === 'GHN-DFC2A0') return DeliveryFailureReason.AREA_INACCESSIBLE;
  return DeliveryFailureReason.OTHER;
}

/** Nhãn tiếng Việt của trạng thái hãng — dùng cho ghi chú lịch sử và nút mô phỏng. */
export const GHN_STATUS_LABELS: Record<string, string> = {
  ready_to_pick: 'Chờ lấy hàng',
  picking: 'Shipper đang đến lấy',
  money_collect_picking: 'Đang thu tiền khi lấy',
  picked: 'Đã lấy hàng',
  storing: 'Đã nhập kho hãng',
  sorting: 'Đang phân loại',
  transporting: 'Đang trung chuyển',
  delivering: 'Đang giao',
  money_collect_delivering: 'Đang thu tiền khi giao',
  delivered: 'Giao thành công',
  delivery_fail: 'Giao thất bại',
  waiting_to_return: 'Chờ hoàn',
  return: 'Yêu cầu hoàn',
  return_transporting: 'Đang trung chuyển hàng hoàn',
  return_sorting: 'Đang phân loại hàng hoàn',
  returning: 'Đang hoàn về shop',
  return_fail: 'Hoàn thất bại',
  returned: 'Đã hoàn về shop',
  cancel: 'Đã huỷ',
  exception: 'Ngoại lệ — cần xử lý',
  lost: 'Thất lạc',
  damage: 'Hư hỏng',
  scrap: 'Tiêu huỷ',
};

/** Trạng thái hãng mà nút mô phỏng (demo) được phép gửi. `cancel` đi qua nút huỷ riêng. */
export const SIMULATABLE_GHN_STATUSES: readonly string[] = GHN_STATUSES.filter(
  (s) => s !== 'ready_to_pick' && s !== 'cancel',
);
