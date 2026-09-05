
export enum OrderStatus {
  UNPAID = 'unpaid',
  PENDING = 'pending', // đã thanh toán, seller chưa xử lý
  PACKED = 'packed', // đã đóng gói, chưa bàn giao vận chuyển
  READY_TO_SHIP = 'ready_to_ship',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELED = 'canceled',
  RETURNED = 'returned',
  FAILED = 'failed',
}

// Tập trạng thái được coi là "CHƯA FULFILL XONG" — CHỈ những đơn ở
// nhóm này mới được xét consolidation (đơn đã DELIVERED/CANCELED 3
// tháng trước không bao giờ nên bị gộp nhầm vào đơn mới hôm nay).
// Export ra vì cả schema (partial index) LẪN service (query) đều cần
// dùng ĐÚNG 1 danh sách này — khai 2 nơi dễ lệch nhau nếu sau này chỉ
// sửa 1 chỗ.
export const UNFULFILLED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.UNPAID,
  OrderStatus.PENDING,
  OrderStatus.PACKED,
  OrderStatus.READY_TO_SHIP,
];
