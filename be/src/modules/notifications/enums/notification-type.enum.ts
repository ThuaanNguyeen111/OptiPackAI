/**
 * 7 loại thông báo đã nghiên cứu trong CLAUDE.md (mục "Nghiên cứu
 * Notification") — mở rộng thêm khi có sự kiện mới, không đổi giá
 * trị cũ (FE có thể đã lưu/so sánh theo string này).
 */
export enum NotificationType {
  MISSING_ITEM = 'missing_item',
  ABNORMAL_PACKAGE = 'abnormal_package',
  SLA_WARNING = 'sla_warning',
  SLA_BREACH = 'sla_breach',
  CONNECTION_LOST = 'connection_lost',
  PENDING_APPROVAL = 'pending_approval',
  SYNC_FAILED = 'sync_failed',
}
