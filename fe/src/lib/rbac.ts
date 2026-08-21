import { UserRole, type UserRole as Role } from '../types/auth'

const STAFF_PREFIXES: Record<
  | typeof UserRole.WAREHOUSE_STAFF
  | typeof UserRole.PACKAGING_STAFF
  | typeof UserRole.SHIPPING_COORDINATOR,
  string[]
> = {
  [UserRole.WAREHOUSE_STAFF]: ['/app/orders'],
  [UserRole.PACKAGING_STAFF]: ['/app/packing'],
  [UserRole.SHIPPING_COORDINATOR]: ['/app/shipping'],
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export function homePath(role: Role): string {
  switch (role) {
    case UserRole.ADMIN:
      return '/app/admin'
    case UserRole.WAREHOUSE_STAFF:
      return '/app/orders'
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
    return path === '/app/admin' || path.startsWith('/app/admin/')
  }

  if (path === '/app/admin' || path.startsWith('/app/admin/')) return false

  if (role === UserRole.STORE_OWNER) {
    return path === '/app' || path.startsWith('/app/')
  }

  const prefixes = STAFF_PREFIXES[role]
  if (!prefixes) return false
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`))
}

export function canSeeNavItem(role: Role, to: string): boolean {
  return canAccessPath(role, to)
}
