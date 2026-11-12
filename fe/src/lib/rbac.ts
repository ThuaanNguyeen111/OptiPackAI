import { UserRole, type UserRole as Role } from '../types/auth'

/** Trang Admin bật/tắt được cho từng role — khớp be/src/common/enums/feature.enum.ts. */
export const FEATURE_VALUES = [
  'dashboard',
  'orders',
  'order_groups',
  'returns',
  'order_sync',
  'picking',
  'inventory',
  'packing',
  'shipping',
  'packaging_rules',
  'packaging_materials',
  'staff',
  'analytics',
  'history',
] as const
export type Feature = (typeof FEATURE_VALUES)[number]

export const FEATURE_PATHS: Record<Feature, string> = {
  dashboard: '/app',
  orders: '/app/orders',
  order_groups: '/app/order-groups',
  returns: '/app/returns',
  order_sync: '/app/order-sync',
  picking: '/app/warehouse',
  inventory: '/app/inventory',
  packing: '/app/packing',
  shipping: '/app/shipping',
  packaging_rules: '/app/packaging-rules',
  packaging_materials: '/app/packaging-materials',
  staff: '/app/staff',
  analytics: '/app/analytics',
  history: '/app/history',
}

export const FEATURE_LABELS: Record<Feature, { vi: string; en: string }> = {
  dashboard: { vi: 'Tổng quan', en: 'Dashboard' },
  orders: { vi: 'Đơn đa kênh', en: 'Omnichannel orders' },
  order_groups: { vi: 'Nhóm đơn & Hỏa tốc', en: 'Groups & Express' },
  returns: { vi: 'Trả hàng', en: 'Returns' },
  order_sync: { vi: 'Đồng bộ đơn', en: 'Order sync' },
  picking: { vi: 'Lấy hàng trong kho', en: 'Warehouse picking' },
  inventory: { vi: 'Tình trạng kho', en: 'Warehouse inventory' },
  packing: { vi: 'Đóng gói', en: 'Packing station' },
  shipping: { vi: 'Vận chuyển', en: 'Shipping' },
  packaging_rules: { vi: 'Quy tắc bao bì', en: 'Packaging rules' },
  packaging_materials: { vi: 'Vật liệu đóng gói', en: 'Packaging materials' },
  staff: { vi: 'Nhân viên', en: 'Staff directory' },
  analytics: { vi: 'Báo cáo', en: 'Analytics' },
  history: { vi: 'Lịch sử thao tác', en: 'Activity history' },
}

const ALWAYS_ALLOWED = ['/app/profile', '/app/settings']

/** Trang mở đầu quen thuộc của từng role, dùng khi trang đó còn được bật. */
const NATURAL_HOME: Record<Role, string> = {
  [UserRole.ADMIN]: '/app/admin',
  [UserRole.STORE_OWNER]: '/app',
  [UserRole.WAREHOUSE_STAFF]: '/app/warehouse',
  [UserRole.PACKAGING_STAFF]: '/app/packing',
  [UserRole.SHIPPING_COORDINATOR]: '/app/shipping',
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function featureOfPath(path: string): Feature | null {
  if (path === '/app') return 'dashboard'
  for (const f of FEATURE_VALUES) {
    const prefix = FEATURE_PATHS[f]
    if (prefix !== '/app' && (path === prefix || path.startsWith(`${prefix}/`))) return f
  }
  return null
}

/**
 * Trang đầu tiên role được vào. `features` chưa tải (VD ngay sau đăng nhập) → trang quen thuộc;
 * ProtectedRoute sẽ chuyển tiếp nếu trang đó bị tắt. Luôn có lối ra: hồ sơ cá nhân.
 */
export function homePath(role: Role, features?: readonly Feature[] | null): string {
  if (role === UserRole.ADMIN || !features) return NATURAL_HOME[role]
  if (canAccessPath(role, NATURAL_HOME[role], features)) return NATURAL_HOME[role]
  const first = FEATURE_VALUES.find((f) => features.includes(f))
  return first ? FEATURE_PATHS[first] : '/app/profile'
}

export function canAccessPath(
  role: Role,
  pathname: string,
  features: readonly Feature[] | null,
): boolean {
  const path = normalizePath(pathname)
  if (role === UserRole.ADMIN) return true
  if (ALWAYS_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return true
  if (path === '/app/admin' || path.startsWith('/app/admin/')) return false
  const feature = featureOfPath(path)
  return feature !== null && (features ?? []).includes(feature)
}

export function canSeeNavItem(role: Role, to: string, features: readonly Feature[] | null): boolean {
  return canAccessPath(role, to, features)
}
