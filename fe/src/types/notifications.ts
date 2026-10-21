/** Khớp response raw của BE `GET /notifications` (snake_case Document). */

export const NOTIFICATION_TYPES = [
  'missing_item',
  'abnormal_package',
  'sla_warning',
  'sla_breach',
  'connection_lost',
  'pending_approval',
  'sync_failed',
  'cancel_confirmation_required',
  'mfa_disabled',
  'packaging_rejected',
  'low_box_stock',
  'low_material_stock',
  'group_auto_canceled',
  'packaging_plan_invalidated',
  'delivery_failed',
  'delivery_returning',
  'delivery_overdue',
  'return_requested',
  'stock_shortage',
  'packing_assigned',
  'packing_parcel_held',
  'packing_issue',
  'unpack_required',
  'return_to_shelf',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export type NotificationSeverity = 'info' | 'warning' | 'critical'

export type AppNotification = {
  id: string
  type: NotificationType | string
  severity: NotificationSeverity
  title: string
  message: string
  relatedEntityType: string | null
  relatedEntityId: string | null
  isRead: boolean
  createdAt: string | null
}

/** Payload thô từ BE (có `_id`, snake_case). */
export type NotificationApiRaw = {
  _id?: string
  id?: string
  type?: string
  severity?: string
  title?: string
  message?: string
  related_entity_type?: string | null
  related_entity_id?: string | null
  is_read?: boolean
  created_at?: string | Date | null
}

export const NOTIFICATION_TYPE_LABELS: Record<
  NotificationType,
  { vi: string; en: string }
> = {
  missing_item: { vi: 'Thiếu hàng', en: 'Missing item' },
  abnormal_package: { vi: 'Gói bất thường', en: 'Abnormal package' },
  sla_warning: { vi: 'Cảnh báo SLA', en: 'SLA warning' },
  sla_breach: { vi: 'Quá hạn SLA', en: 'SLA breach' },
  connection_lost: { vi: 'Mất kết nối sàn', en: 'Connection lost' },
  pending_approval: { vi: 'Chờ duyệt đóng gói', en: 'Pending approval' },
  sync_failed: { vi: 'Đồng bộ thất bại', en: 'Sync failed' },
  cancel_confirmation_required: {
    vi: 'Cần xác nhận hủy',
    en: 'Cancel confirmation',
  },
  mfa_disabled: { vi: 'MFA đã tắt', en: 'MFA disabled' },
  packaging_rejected: {
    vi: 'Kế hoạch đóng gói bị từ chối',
    en: 'Packaging plan rejected',
  },
  low_box_stock: { vi: 'Thùng sắp hết', en: 'Low box stock' },
  low_material_stock: { vi: 'Vật tư sắp hết', en: 'Low material stock' },
  group_auto_canceled: { vi: 'Nhóm đơn đã huỷ', en: 'Group canceled' },
  packaging_plan_invalidated: {
    vi: 'Kế hoạch đóng gói hết hiệu lực',
    en: 'Packing plan invalidated',
  },
  delivery_failed: { vi: 'Giao thất bại', en: 'Delivery failed' },
  delivery_returning: { vi: 'Đang hoàn về kho', en: 'Returning to warehouse' },
  delivery_overdue: { vi: 'Giao quá hạn', en: 'Delivery overdue' },
  return_requested: { vi: 'Yêu cầu trả hàng', en: 'Return requested' },
  stock_shortage: { vi: 'Thiếu tồn để giữ chỗ', en: 'Stock shortage' },
  packing_assigned: { vi: 'Được giao đóng gói', en: 'Packing assigned' },
  packing_parcel_held: { vi: 'Kiện lệch cân', en: 'Parcel held' },
  packing_issue: { vi: 'Sự cố lúc đóng', en: 'Packing issue' },
  unpack_required: { vi: 'Cần tháo kiện', en: 'Unpack required' },
  return_to_shelf: { vi: 'Trả hàng về ô', en: 'Return to shelf' },
}

export function mapNotificationRaw(raw: NotificationApiRaw): AppNotification | null {
  const id =
    (typeof raw._id === 'string' && raw._id) ||
    (typeof raw.id === 'string' && raw.id) ||
    ''
  if (!id) return null
  const severity =
    raw.severity === 'info' ||
    raw.severity === 'warning' ||
    raw.severity === 'critical'
      ? raw.severity
      : 'info'
  const relatedId = raw.related_entity_id
  return {
    id,
    type: typeof raw.type === 'string' ? raw.type : 'info',
    severity,
    title: typeof raw.title === 'string' ? raw.title : '',
    message: typeof raw.message === 'string' ? raw.message : '',
    relatedEntityType:
      typeof raw.related_entity_type === 'string'
        ? raw.related_entity_type
        : null,
    relatedEntityId:
      relatedId == null
        ? null
        : typeof relatedId === 'string'
          ? relatedId
          : String(relatedId),
    isRead: Boolean(raw.is_read),
    createdAt:
      raw.created_at == null
        ? null
        : typeof raw.created_at === 'string'
          ? raw.created_at
          : new Date(raw.created_at).toISOString(),
  }
}

export function formatNotificationTimeAgo(
  iso: string | null,
  locale: 'vi' | 'en' = 'vi',
): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return ''
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return locale === 'vi' ? 'Vừa xong' : 'Just now'
  if (minutes < 60) {
    return locale === 'vi' ? `${minutes} phút trước` : `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return locale === 'vi' ? `${hours} giờ trước` : `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return locale === 'vi' ? `${days} ngày trước` : `${days}d ago`
}
