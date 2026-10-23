/**
 * ===================================================================
 * DANH SÁCH MÃ LỖI — module order-groups (prefix: ORD_GROUP_)
 * ===================================================================
 * Cùng nguyên tắc đã áp dụng ở ORD_ERROR_CODES/MKT_ERROR_CODES: prefix
 * theo MODULE, đăng ký hết vào đây, không gõ string lỗi trực tiếp.
 * ===================================================================
 */
export const ORD_GROUP_ERROR_CODES = {
  INVALID_GROUP_ID: 'ORD_GROUP_INVALID_ID',
  GROUP_NOT_FOUND: 'ORD_GROUP_NOT_FOUND',
  STATE_CONFLICT: 'ORD_GROUP_STATE_CONFLICT', // Rule #18 optimistic concurrency — version không khớp
  INVALID_TRANSITION: 'ORD_GROUP_INVALID_TRANSITION', // MỚI — chuyển trạng thái không hợp lệ theo allowed-status-transitions.ts
  // BỔ SUNG (2026-09-10) — pick-item
  INSUFFICIENT_STOCK: 'ORD_GROUP_INSUFFICIENT_STOCK', // quantity_on_hand không đủ — FE nên gợi ý report-missing
  // BỔ SUNG (2026-09-10) — item-detail
  ITEM_NOT_IN_GROUP: 'ORD_GROUP_ITEM_NOT_IN_GROUP', // SKU truyền vào không thuộc group này
  PACKAGING_PROFILE_NOT_READY: 'ORD_GROUP_PACKAGING_PROFILE_NOT_READY', // thiếu số đo/quy cách kho xác nhận
  // BỔ SUNG (2026-09-15) — fix bug đơn canceled vẫn bị tính vào Packaging/Picking List
  ALL_ORDERS_CANCELED: 'ORD_GROUP_ALL_ORDERS_CANCELED', // toàn bộ đơn trong group đã bị hủy, không còn gì để đóng gói/lấy hàng
  // BỔ SUNG (21/09/2026, BE-4a) — luồng lấy hàng
  PICK_NOT_ALLOWED: 'ORD_GROUP_PICK_NOT_ALLOWED', // quét khi group không ở trạng thái picking
  WRONG_WAREHOUSE: 'ORD_GROUP_WRONG_WAREHOUSE', // 21/10/2026 — 409: lượt lấy đã quét ở kho khác, không đổi kho giữa chừng
  PICK_EXCEEDS_ORDERED: 'ORD_GROUP_PICK_EXCEEDS_ORDERED', // tổng đã quét trong lượt vượt số lượng đặt
  PICK_INCOMPLETE: 'ORD_GROUP_PICK_INCOMPLETE', // bấm "đã lấy xong" khi còn SKU chưa đủ — dùng report-missing
  NO_PICK_EVENTS: 'ORD_GROUP_NO_PICK_EVENTS', // chưa có lần quét nào trong lượt hiện tại
  // 13/10/2026 — liên kết tay nhóm đơn (Coordinator)
  LINK_SELF: 'ORD_GROUP_LINK_SELF', // liên kết nhóm với chính nó
  LINK_NOT_ALLOWED: 'ORD_GROUP_LINK_NOT_ALLOWED', // nhóm đã giao/đã xong — không đổi liên kết
  NOT_MANUALLY_LINKED: 'ORD_GROUP_NOT_MANUALLY_LINKED', // bỏ liên kết khi nhóm không có liên kết tay
  // 22/10/2026 — người bán hủy đơn AURELLE
  ORDER_NOT_FOUND: 'ORD_GROUP_ORDER_NOT_FOUND', // 404: không có đơn
  SELLER_CANCEL_NOT_ALLOWED: 'ORD_GROUP_SELLER_CANCEL_NOT_ALLOWED', // 409: không phải đơn AURELLE / đã đóng gói xong / đã hủy
  // 23/10/2026 — tách / gộp nhóm đơn tay
  REGROUP_NOT_ALLOWED: 'ORD_GROUP_REGROUP_NOT_ALLOWED', // 409: nhóm không còn ở chờ/đang lấy, hoặc chỉ còn 1 đơn, hoặc đơn đã hủy
  REGROUP_HAS_PICKS: 'ORD_GROUP_REGROUP_HAS_PICKS', // 409: nhóm đã quét lấy hàng ở lượt hiện tại — tách/gộp sẽ lệch hàng đã lấy
  MERGE_SELF: 'ORD_GROUP_MERGE_SELF', // 400: gộp nhóm với chính nó
  MERGE_SCOPE_MISMATCH: 'ORD_GROUP_MERGE_SCOPE_MISMATCH', // 409: 2 nhóm khác sàn/khác shop (tồn kho + hồ sơ SKU theo shop)
  MERGE_RECIPIENT_MISMATCH: 'ORD_GROUP_MERGE_RECIPIENT_MISMATCH', // 409: 2 nhóm có SĐT người nhận thật khác nhau (vận đơn dùng chung địa chỉ)
} as const;
// Mã lỗi Phân công nhân viên (NO_STAFF_AVAILABLE, STAFF_NOT_FOUND,
// STAFF_INACTIVE) khai ở staff-assignment.errors.ts — module riêng,
// không lặp lại ở đây.
