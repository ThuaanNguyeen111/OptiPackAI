import { UserRole, type UserRole as Role } from '../types/auth'

const STAFF_PREFIXES: Record<
  | typeof UserRole.WAREHOUSE_STAFF
  | typeof UserRole.PACKAGING_STAFF
  | typeof UserRole.SHIPPING_COORDINATOR,
  string[]
> = {
  [UserRole.WAREHOUSE_STAFF]: ['/app/warehouse', '/app/inventory'],
  [UserRole.PACKAGING_STAFF]: ['/app/packing'],
  [UserRole.SHIPPING_COORDINATOR]: ['/app/shipping'],
}

/**
 * Store Owner — giám sát / cấu hình, không thao tác sàn kho.
 * Khớp whitelist đã chốt với user (2026-09-16).
 */
const STORE_OWNER_PREFIXES = [
  '/app/orders',
  '/app/order-groups',
  '/app/packaging-rules',
  '/app/staff',
  '/app/analytics',
  '/app/profile',
  '/app/settings',
] as const

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

export function homePath(role: Role): string {
  switch (role) {
    case UserRole.ADMIN:
      return '/app/admin'
    case UserRole.WAREHOUSE_STAFF:
      return '/app/warehouse'
    case UserRole.PACKAGING_STAFF:
      return '/app/packing'
    case UserRole.SHIPPING_COORDINATOR:
      return '/app/shipping'
    default:
      return '/app'
  }
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const path = normalizePath(pathname)

  if (path === '/app/profile' || path === '/app/settings') return true

  if (role === UserRole.ADMIN) {
    return true
  }

  if (path === '/app/admin' || path.startsWith('/app/admin/')) return false

  if (role === UserRole.STORE_OWNER) {
    if (path === '/app') return true
    return STORE_OWNER_PREFIXES.some((p) => matchesPrefix(path, p))
  }

  // Đơn đa kênh (GET /orders) — chỉ Admin + Store Owner theo BE
  if (path === '/app/orders' || path.startsWith('/app/orders/')) {
    return false
  }

  const prefixes = STAFF_PREFIXES[role]
  if (!prefixes) return false
  return prefixes.some((p) => matchesPrefix(path, p))
}

export function canSeeNavItem(role: Role, to: string): boolean {
  return canAccessPath(role, to)
}
