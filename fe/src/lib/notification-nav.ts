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
    if (role === UserRole.ADMIN) return '/app/admin/packing-plans'
    return '/app/packing'
  }
  if (type === 'packaging_rejected') {
    return role === UserRole.ADMIN
      ? '/app/admin/packing-plans'
      : '/app/packing'
  }
  if (type === 'low_box_stock' || type === 'low_material_stock') {
    return role === UserRole.ADMIN ? '/app/admin/warehouse' : '/app'
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
