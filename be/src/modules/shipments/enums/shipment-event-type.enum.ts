export enum ShipmentEventType {
  START_DELIVERY = 'start_delivery',
  DELIVERED = 'delivered',
  DELIVERY_FAILED = 'delivery_failed',
  RETRY = 'retry',
  AUTO_RETURN = 'auto_return', // hệ thống tự chuyển hoàn về (lần 2 / khách từ chối)
  RETURN_RECEIVED = 'return_received',
  LEGACY_BACKFILL = 'legacy_backfill', // tạo bù cho nhóm đơn đã "shipped" trước G1
  LEGACY_RETURN = 'legacy_return', // hoàn qua route cũ POST .../fulfillment/return
}
