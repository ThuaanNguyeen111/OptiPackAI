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
  MFA_DISABLED = 'mfa_disabled',
}
