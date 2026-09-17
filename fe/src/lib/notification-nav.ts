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
  if (type === 'sync_failed' || type === 'connection_lost') {
    return role === UserRole.STORE_OWNER || role === UserRole.ADMIN
      ? '/app'
      : '/app'
  }
  if (type === 'pending_approval' || type === 'abnormal_package') {
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    if (role === UserRole.STORE_OWNER) return '/app/order-groups'
    return '/app/packing'
  }
  if (type === 'missing_item') {
    if (role === UserRole.WAREHOUSE_STAFF) return '/app/warehouse'
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    if (role === UserRole.STORE_OWNER) return '/app/order-groups'
    return '/app'
  }
  if (type === 'sla_warning' || type === 'sla_breach') {
    if (role === UserRole.WAREHOUSE_STAFF) return '/app/warehouse'
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    if (role === UserRole.SHIPPING_COORDINATOR) return '/app/shipping'
    if (role === UserRole.STORE_OWNER) return '/app/order-groups'
    return '/app'
  }
  if (notif.relatedEntityType === 'order_group' && entityId) {
    if (role === UserRole.PACKAGING_STAFF) return '/app/packing'
    if (role === UserRole.STORE_OWNER) return '/app/order-groups'
  }
  if (notif.relatedEntityType === 'order' && entityId) {
    return `/app/orders/${entityId}`
  }
  return '/app'
}
