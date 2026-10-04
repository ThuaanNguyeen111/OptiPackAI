/**
 * G1 (27/09/2026) — trạng thái VẬN ĐƠN (chi tiết hơn trạng thái nhóm đơn).
 * Nhóm đơn giữ mức thô: shipped / delivered / returned.
 */
export enum ShipmentStatus {
  OUT_FOR_DELIVERY = 'out_for_delivery', // đang đi giao (lần 1 hoặc giao lại)
  DELIVERY_FAILED = 'delivery_failed', // giao thất bại, chờ giao lại
  RETURNING_TO_WAREHOUSE = 'returning_to_warehouse', // đang mang hàng về kho
  DELIVERED = 'delivered', // KẾT THÚC — giao thành công
  RETURNED_TO_WAREHOUSE = 'returned_to_warehouse', // KẾT THÚC — kho đã nhận lại kiện
}

export const TERMINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  ShipmentStatus.DELIVERED,
  ShipmentStatus.RETURNED_TO_WAREHOUSE,
];
