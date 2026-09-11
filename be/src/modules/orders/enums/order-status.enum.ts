
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
  // BỔ SUNG (2026-09-10) — xác nhận qua bảng Error Code thật của
  // GetOrders (mã lỗi 6, liệt kê đủ 19 giá trị hợp lệ) — 9 giá trị cũ
  // ở trên THIẾU 10 giá trị này. Không bổ sung sẽ khiến Mongoose từ
  // chối lưu nếu Lazada trả về 1 trong các trạng thái hiếm gặp này
  // (mất hàng, hư hỏng lúc vận chuyển, hoàn hàng...).
  TO_PACK = 'topack',
  TO_SHIP = 'toship',
  LOST = 'lost',
  LOST_BY_3PL = 'lost_by_3pl',
  DAMAGED_BY_3PL = 'damaged_by_3pl',
  FAILED_DELIVERY = 'failed_delivery',
  SHIPPED_BACK = 'shipped_back',
  SHIPPED_BACK_SUCCESS = 'shipped_back_success',
  SHIPPED_BACK_FAILED = 'shipped_back_failed',
  PACKAGE_SCRAPPED = 'package_scrapped',
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
  // BỔ SUNG (2026-09-10) — 2 trạng thái mới cũng thuộc nhóm "đang xử
  // lý dở", hợp lý để tiếp tục xét consolidation giống PACKED/PENDING.
  OrderStatus.TO_PACK,
  OrderStatus.TO_SHIP,
];

// Lưu ý: OrderStatus là STRING enum, KHÔNG cần mảng lọc kiểu Rule #11
// (rule đó chỉ áp dụng cho enum SỐ — reverse-mapping chỉ xảy ra với
// numeric enum, string enum không bị vấn đề này). order.schema.ts đã
// tham chiếu thẳng `enum: OrderStatus` — giá trị mới ở trên TỰ ĐỘNG
// được nhận diện, không cần sửa gì thêm ở file schema. Giữ mảng này
// lại chỉ để tiện dùng validate ở DTO nếu cần sau này.
export const ORDER_STATUS_VALUES = Object.values(OrderStatus);
