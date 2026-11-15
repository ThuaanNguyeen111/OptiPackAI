import { NotificationType } from '../enums/notification-type.enum';

/**
 * 10/11/2026 — Loại thông báo được gửi push (Thuận duyệt bảng BE_MOBILE_CHECKLIST mục 3).
 * Nguyên tắc: chỉ push việc phải làm ngay hoặc có hạn chót; tác vụ nền tự xử lý, lỗi tự
 * phục hồi, thông tin không gấp chỉ hiện trong app (chuông). Không chia theo `severity`.
 */
export const PUSH_TYPES: ReadonlySet<NotificationType> = new Set([
  // Kho
  NotificationType.MISSING_ITEM,
  NotificationType.RETURN_TO_SHELF,
  NotificationType.SLA_WARNING,
  NotificationType.STOCK_SHORTAGE,
  NotificationType.PICKING_ASSIGNED,
  // Đóng gói
  NotificationType.PACKING_ASSIGNED,
  NotificationType.PENDING_APPROVAL,
  NotificationType.PACKING_PARCEL_HELD,
  NotificationType.PACKING_ISSUE,
  NotificationType.UNPACK_REQUIRED,
  NotificationType.PACKING_BLOCKED,
  // Giao hàng
  NotificationType.DELIVERY_FAILED,
  NotificationType.DELIVERY_OVERDUE,
  NotificationType.SLA_BREACH,
  // Store Owner / Admin
  NotificationType.CANCEL_CONFIRMATION_REQUIRED,
  NotificationType.MARKETPLACE_CONFIRM_REQUIRED,
  NotificationType.CONNECTION_LOST,
  NotificationType.RETURN_REQUESTED,
  NotificationType.GROUP_AUTO_CANCELED,
  NotificationType.MFA_DISABLED,
]);

/** Chỉ push khi gửi đích danh 1 người (VD nhóm bị huỷ: báo nhân viên đang làm, không báo cả role Owner). */
export const PUSH_DIRECT_ONLY_TYPES: ReadonlySet<NotificationType> = new Set([NotificationType.GROUP_AUTO_CANCELED]);

export function shouldPush(type: NotificationType, isDirect: boolean): boolean {
  if (!PUSH_TYPES.has(type)) return false;
  return isDirect || !PUSH_DIRECT_ONLY_TYPES.has(type);
}
