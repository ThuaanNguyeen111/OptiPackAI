export enum ShipmentEventType {
  START_DELIVERY = 'start_delivery',
  DELIVERED = 'delivered',
  DELIVERY_FAILED = 'delivery_failed',
  RETRY = 'retry',
  AUTO_RETURN = 'auto_return', // hệ thống tự chuyển hoàn về (lần 2 / khách từ chối)
  RETURN_RECEIVED = 'return_received',
  LEGACY_BACKFILL = 'legacy_backfill', // tạo bù cho nhóm đơn đã "shipped" trước G1
  LEGACY_RETURN = 'legacy_return', // hoàn qua route cũ POST .../fulfillment/return
  // C4/C5 (14/10/2026) — vận đơn giao qua hãng thật (GHN)
  CARRIER_BOOKED = 'carrier_booked', // đã tạo (đủ) vận đơn ở hãng cho mọi kiện
  CARRIER_STATUS = 'carrier_status', // hãng báo đổi trạng thái (webhook / đồng bộ / nút mô phỏng)
  CARRIER_CANCELLED = 'carrier_cancelled', // đã huỷ vận đơn ở hãng
  CARRIER_INCIDENT = 'carrier_incident', // hãng báo sự cố: mất / hư hỏng / ngoại lệ / tiêu huỷ
}
