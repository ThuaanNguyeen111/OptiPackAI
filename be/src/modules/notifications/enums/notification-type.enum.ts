/**
 * Loại thông báo — mở rộng thêm khi có sự kiện mới, không đổi giá
 * trị cũ (FE có thể đã lưu/so sánh theo string này).
 *
 * ĐÃ THAY ĐỔI 2026-09-14: thêm MFA_DISABLED (Admin tắt MFA hộ user).
 */
export enum NotificationType {
  MISSING_ITEM = 'missing_item',
  ABNORMAL_PACKAGE = 'abnormal_package',
  SLA_WARNING = 'sla_warning',
  SLA_BREACH = 'sla_breach',
  CONNECTION_LOST = 'connection_lost',
  PENDING_APPROVAL = 'pending_approval',
  SYNC_FAILED = 'sync_failed',
  // BỔ SUNG (AOFP-XX, 2026-09-15) — O6: buyer yêu cầu hủy đơn, seller có
  // hạn (cancel_trigger_time) để phản hồi trước khi Lazada tự động hủy.
  CANCEL_CONFIRMATION_REQUIRED = 'cancel_confirmation_required',
  // BỔ SUNG (AOFP-16) — Admin tắt MFA của user, báo cho chính user đó.
  MFA_DISABLED = 'mfa_disabled',
  // BỔ SUNG (21/09/2026, báo cáo thật từ FE) — notify Admin khi
  // Packaging Staff Reject gợi ý đóng gói (packaging.service.ts reject()).
  PACKAGING_REJECTED = 'packaging_rejected',
  // BỔ SUNG (22/09/2026) — tồn thùng carton xuống ≤ mức cảnh báo sau khi đóng gói.
  LOW_BOX_STOCK = 'low_box_stock',
  // BỔ SUNG (28/09/2026, P1) — vật tư chèn xuống ≤ mức cảnh báo, hoặc đóng
  // gói khi kho thiếu vật tư (không chặn packed, chỉ ghi nhận + báo).
  LOW_MATERIAL_STOCK = 'low_material_stock',
  // BỔ SUNG (29/09/2026, N1) — nhóm đơn tự động chuyển CANCELED vì mọi đơn
  // bên trong đều không còn fulfill được (order-groups.service.ts,
  // cancelIfAllOrdersUnfulfillable()).
  GROUP_AUTO_CANCELED = 'group_auto_canceled',
  // BỔ SUNG (30/09/2026) — 1 đơn trong nhóm bị hủy sau khi đã có phương án
  // đóng gói: phương án cũ bị vô hiệu, nhóm quay lại `picked` để tính lại.
  PACKAGING_PLAN_INVALIDATED = 'packaging_plan_invalidated',
  // Hoàn thiện giao hàng + trả hàng + chống bán lố (27/09/2026)
  DELIVERY_FAILED = 'delivery_failed',
  DELIVERY_RETURNING = 'delivery_returning',
  DELIVERY_OVERDUE = 'delivery_overdue',
  RETURN_REQUESTED = 'return_requested',
  STOCK_SHORTAGE = 'stock_shortage',
}
