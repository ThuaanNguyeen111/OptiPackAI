import { UserRole, type UserRole as Role } from '../types/auth'

/** Sidebar nổi + khung chính bo góc (palette login cyan/teal). */
export function usesTealAppChrome(role: Role | undefined): boolean {
  return (
    role === UserRole.STORE_OWNER ||
    role === UserRole.PACKAGING_STAFF ||
    role === UserRole.SHIPPING_COORDINATOR
  )
}
