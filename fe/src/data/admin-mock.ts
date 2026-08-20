import type { AdminUser, AiPackagingParams } from '../types/admin'
import { Role, roleLabelsVN } from '../types/admin'

export const adminUsersMock: AdminUser[] = [
  {
    id: 'u-1001',
    email: 'alice@shop.local',
    fullName: 'Alice Nguyễn',
    role: Role.ADMIN,
    employeeCode: 'EMP-001',
    department: 'IT',
    mfaEnabled: true,
    active: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'u-1002',
    email: 'bao@shop.local',
    fullName: 'Bảo Trần',
    role: Role.WAREHOUSE_STAFF,
    employeeCode: 'EMP-012',
    department: 'Kho',
    mfaEnabled: false,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'u-1003',
    email: 'cuong@shop.local',
    fullName: 'Cường Lê',
    role: Role.PACKAGING_STAFF,
    employeeCode: 'PKG-07',
    department: 'Packing',
    mfaEnabled: false,
    active: false,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  },
]

export const defaultAiPackagingParams: AiPackagingParams = {
  timeoutSeconds: 12,
  min_fill_rate: 0.82,
  autoFallback: true,
}

export function getRoleLabelVN(role: Role): string {
  return roleLabelsVN[role]
}
