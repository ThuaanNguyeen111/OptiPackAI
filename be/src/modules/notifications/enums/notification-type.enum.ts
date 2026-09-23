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
}
