import { UserRole, type UserRole as Role } from '../types/auth'

/** Sidebar nổi + khung chính bo góc (Deep Teal + Soft Sage). */
export function usesTealAppChrome(role: Role | undefined): boolean {
  return (
    role === UserRole.STORE_OWNER ||
    role === UserRole.WAREHOUSE_STAFF ||
    role === UserRole.PACKAGING_STAFF ||
    role === UserRole.SHIPPING_COORDINATOR ||
    role === UserRole.ADMIN
  )
}
