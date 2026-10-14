import { ShipmentStatus } from './enums/shipment-status.enum';

/** Luật chuyển trạng thái vận đơn — định nghĩa 1 lần, mọi nút dùng chung. */
const ALLOWED: Record<ShipmentStatus, ShipmentStatus[]> = {
  // C4 (14/10/2026) — 3 trạng thái của vận đơn giao qua hãng thật: KHÔNG có nút bấm tay
  // nào đi qua bảng này. Hãng đổi trạng thái qua webhook/đồng bộ/nút mô phỏng — luật
  // riêng ở carrier-status.util.ts (canCarrierMove).
  [ShipmentStatus.AWAITING_PICKUP]: [],
  [ShipmentStatus.IN_TRANSIT]: [],
  [ShipmentStatus.CANCELLED]: [],
  [ShipmentStatus.OUT_FOR_DELIVERY]: [ShipmentStatus.DELIVERED, ShipmentStatus.DELIVERY_FAILED],
  [ShipmentStatus.DELIVERY_FAILED]: [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.RETURNING_TO_WAREHOUSE],
  [ShipmentStatus.RETURNING_TO_WAREHOUSE]: [ShipmentStatus.RETURNED_TO_WAREHOUSE],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.RETURNED_TO_WAREHOUSE]: [],
};

export function isValidShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return ALLOWED[from].includes(to);
}

export const MAX_DELIVERY_ATTEMPTS = 2; // chuẩn Lazada DBS: tối thiểu 2 lần giao trước khi hoàn
