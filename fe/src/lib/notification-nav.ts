import { UserRole, type UserRole as Role } from '../types/auth'
import type { AppNotification } from '../types/notifications'

/**
 * Deep-link theo type + role — không đụng Admin OAuth / marketplace connect.
 */
export function resolveNotificationPath(
  notif: AppNotification,
  role: Role | null | undefined,
): string {
  const entityId = notif.relatedEntityId
  const type = notif.type

  // Tiki: sắp hết hạn xác nhận đủ hàng — mở chi tiết đơn (khối Giao qua sàn).
  if (type === 'marketplace_confirm_required') {
    return entityId ? `/app/orders/${entityId}` : '/app/orders'
  }
  // 11/11/2026 — nhập kho / nhập vật tư lệch số với phiếu NCC (entity: stock_receipt | packaging_material).
  if (type === 'stock_receipt_mismatch') {
    if (notif.relatedEntityType === 'packaging_material') {
      return role === UserRole.ADMIN ? '/app/admin/packaging-materials' : '/app/packaging-materials'
    }
    return '/app/inventory?view=receipts'
  }
  if (type === 'cancel_confirmation_required') {
    return entityId ? `/app/orders/${entityId}` : '/app/orders'
  }
  // relatedEntityId là id document marketplace_shops (không phải mã shop Lazada —
  // mã đó nằm trong title). Chỉ Admin kết nối lại được shop.
  if (type === 'sync_failed' || type === 'connection_lost') {
    return role === UserRole.ADMIN ? '/app/admin/marketplace' : '/app'
  }
  if (type === 'pending_approval' || type === 'abnormal_package') {
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    if (role === UserRole.STORE_OWNER) return '/app/order-groups'
    return '/app/packing'
  }
  if (type === 'packaging_rejected') {
    return '/app/packing'
  }
  if (type === 'low_box_stock' || type === 'low_material_stock') {
    // BE: relatedEntityType = packaging_box | packaging_bag | packaging_material, relatedEntityId = mã vật liệu.
    const tab =
      type === 'low_box_stock' || notif.relatedEntityType === 'packaging_box'
        ? 'boxes'
        : notif.relatedEntityType === 'packaging_bag'
          ? 'bags'
          : 'cushions'
    const code = entityId ? `&code=${encodeURIComponent(entityId)}` : ''
    return role === UserRole.ADMIN
      ? `/app/admin/packaging-materials?tab=${tab}${code}`
      : `/app/packaging-materials?tab=${tab}${code}`
  }
  if (
    type === 'delivery_failed' ||
    type === 'delivery_returning' ||
    type === 'delivery_overdue'
  ) {
    return '/app/shipping'
  }
  if (type === 'return_requested') {
    return role === UserRole.ADMIN ? '/app/admin/returns' : '/app/returns'
  }
  if (type === 'packing_blocked') {
    if (role === UserRole.ADMIN) return '/app/admin/warehouse'
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    return '/app/order-groups'
  }
  if (type === 'consolidation_name_mismatch') {
    return '/app/order-groups'
  }
  if (
    type === 'group_auto_canceled' ||
    type === 'packaging_plan_invalidated' ||
    type === 'stock_shortage' ||
    type === 'return_to_shelf' ||
    type === 'unpack_required' ||
    type === 'packing_assigned' ||
    type === 'packing_parcel_held' ||
    type === 'packing_issue'
  ) {
    if (role === UserRole.WAREHOUSE_STAFF) {
      return entityId ? `/app/warehouse?groupId=${entityId}` : '/app/warehouse'
    }
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    if (role === UserRole.SHIPPING_COORDINATOR) return '/app/shipping'
    return '/app/order-groups'
  }
  if (type === 'missing_item') {
    if (role === UserRole.WAREHOUSE_STAFF) {
      return entityId ? `/app/warehouse?groupId=${entityId}` : '/app/warehouse'
    }
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    if (role === UserRole.STORE_OWNER) return '/app/order-groups'
    return '/app'
  }
  if (type === 'sla_warning' || type === 'sla_breach') {
    if (role === UserRole.WAREHOUSE_STAFF) {
      return entityId ? `/app/warehouse?groupId=${entityId}` : '/app/warehouse'
    }
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    if (role === UserRole.SHIPPING_COORDINATOR) return '/app/shipping'
    if (role === UserRole.STORE_OWNER) return '/app/order-groups'
    return '/app'
  }
  if (notif.relatedEntityType === 'order_group' && entityId) {
    if (role === UserRole.WAREHOUSE_STAFF) {
      return `/app/warehouse?groupId=${entityId}`
    }
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    if (role === UserRole.STORE_OWNER) return '/app/order-groups'
  }
  if (notif.relatedEntityType === 'order' && entityId) {
    return `/app/orders/${entityId}`
  }
  return '/app'
}
