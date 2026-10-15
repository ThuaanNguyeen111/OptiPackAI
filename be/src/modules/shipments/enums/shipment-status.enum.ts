/**
 * G1 (27/09/2026) — trạng thái VẬN ĐƠN (chi tiết hơn trạng thái nhóm đơn).
 * Nhóm đơn giữ mức thô: shipped / delivered / returned.
 *
 * C4 (14/10/2026) — thêm 3 trạng thái cho vận đơn giao qua HÃNG THẬT (GHN):
 * `awaiting_pickup`, `in_transit`, `cancelled`. Vận đơn tự giao / hãng mẫu
 * (G1, thi_dev) KHÔNG bao giờ vào 3 trạng thái này.
 */
export enum ShipmentStatus {
  AWAITING_PICKUP = 'awaiting_pickup', // C4 — đã tạo vận đơn ở hãng, chờ shipper đến lấy
  IN_TRANSIT = 'in_transit', // C4 — hãng đã lấy hàng, đang trung chuyển giữa các kho
  OUT_FOR_DELIVERY = 'out_for_delivery', // đang đi giao (lần 1 hoặc giao lại)
  DELIVERY_FAILED = 'delivery_failed', // giao thất bại, chờ giao lại
  RETURNING_TO_WAREHOUSE = 'returning_to_warehouse', // đang mang hàng về kho
  DELIVERED = 'delivered', // KẾT THÚC — giao thành công
  RETURNED_TO_WAREHOUSE = 'returned_to_warehouse', // KẾT THÚC — kho đã nhận lại kiện
  CANCELLED = 'cancelled', // C4 — KẾT THÚC: đã huỷ vận đơn ở hãng trước khi lấy hàng (tạo lại được)
}

export const TERMINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  ShipmentStatus.DELIVERED,
  ShipmentStatus.RETURNED_TO_WAREHOUSE,
  ShipmentStatus.CANCELLED,
];
