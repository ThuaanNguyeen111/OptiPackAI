/**
 * ===================================================================
 * MODULE MỚI `order-groups/` — TÁCH BIỆT HOÀN TOÀN với `orders/enums/order-status.enum.ts`
 * ===================================================================
 * OrderStatus (module orders/, KHÔNG đụng) = trạng thái THẬT lấy từ
 * Lazada qua cron sync — chỉ syncLazadaOrders() được ghi field này.
 *
 * GroupFulfillmentStatus (file này) = trạng thái NỘI BỘ, chỉ đổi qua
 * 5 endpoint pick/pack/ship/deliver/return sắp code — cron sync KHÔNG
 * BAO GIỜ chạm vào field này. 2 field độc lập tuyệt đối, sống ở 2
 * collection khác nhau (orders vs order_groups), tránh tình huống
 * cron ghi đè lên tiến độ đóng gói nhân viên đang thao tác tay.
 * ===================================================================
 */
export enum GroupFulfillmentStatus {
  AWAITING_PACKAGING = 'awaiting_packaging',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED_FOR_PACKING = 'approved_for_packing',
  PICKING = 'picking',
  PICKED = 'picked',
  PACKED = 'packed',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  RETURNED = 'returned',
}

// Database Design Standards Rule #11 (CLAUDE.md) — mảng đã lọc, dùng
// trong @Prop({ enum: ... }) — tránh reverse-mapping của TS string enum
// vô tình chấp nhận cả giá trị không mong muốn.
export const GROUP_FULFILLMENT_STATUS_VALUES = Object.values(GroupFulfillmentStatus);
