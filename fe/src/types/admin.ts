export const Role = {
  STORE_OWNER: 0 as const,
  WAREHOUSE_STAFF: 1 as const,
  PACKAGING_STAFF: 2 as const,
  SHIPPING_COORDINATOR: 3 as const,
  ADMIN: 4 as const,
} as const

export type Role = (typeof Role)[keyof typeof Role]

export const ROLE_VALUES: Role[] = [
  Role.STORE_OWNER,
  Role.WAREHOUSE_STAFF,
  Role.PACKAGING_STAFF,
  Role.SHIPPING_COORDINATOR,
  Role.ADMIN,
]

export const roleLabelsVN: Record<Role, string> = {
  [Role.STORE_OWNER]: 'Chủ cửa hàng',
  [Role.WAREHOUSE_STAFF]: 'Nhân viên kho',
  [Role.PACKAGING_STAFF]: 'Nhân viên đóng gói',
  [Role.SHIPPING_COORDINATOR]: 'Điều phối vận chuyển',
  [Role.ADMIN]: 'Quản trị hệ thống',
}

export const roleLabelsEN: Record<Role, string> = {
  [Role.STORE_OWNER]: 'Store Owner',
  [Role.WAREHOUSE_STAFF]: 'Warehouse Staff',
  [Role.PACKAGING_STAFF]: 'Packaging Staff',
  [Role.SHIPPING_COORDINATOR]: 'Shipping Coordinator',
  [Role.ADMIN]: 'Admin',
}

export const LoginType = {
  LOCAL: 'local',
  GOOGLE: 'google',
} as const

export type LoginType = (typeof LoginType)[keyof typeof LoginType]

/** Trạng thái khóa tài khoản — khớp Auth/Users backend */
export type UserLockState =
  | 'active'
  | 'inactive'
  | 'must_change'
  | 'locked_72h'
  | 'login_locked'

export type AdminUser = {
  id: string
  name: string
  email: string
  role: Role
  phone?: string
  address?: string
  employeeCode?: string
  department?: string
  mfaEnabled: boolean
  active: boolean
  loginType: LoginType
  mustChangePassword: boolean
  /** ISO — hết hạn cửa sổ 72h đổi mật khẩu tạm */
  mustChangePasswordBy?: string
  /** ISO — khóa tạm do sai mật khẩu nhiều lần */
  lockedUntil?: string
  lastLoginAt?: string
  createdAt: string
}

export type CreateUserInput = {
  name: string
  email: string
  role: Role
}

export type UpdateUserInput = Partial<
  Pick<AdminUser, 'name' | 'role' | 'phone' | 'address' | 'employeeCode' | 'department'>
>

export type AiPackagingParams = {
  /** NFR Report 2: AI recommendation ≤ 5s */
  timeoutSeconds: number
  min_fill_rate: number
  autoFallback: boolean
}

export type PackagingTemplate = {
  id: string
  name: string
  description?: string
  boxCode: string
  lengthCm: number
  widthCm: number
  heightCm: number
  maxWeightKg: number
  cushioning?: string
  createdBy: string
  createdAt: string
  active: boolean
}

export function getUserLockState(
  user: AdminUser,
  now = Date.now(),
): UserLockState {
  if (!user.active) return 'inactive'
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
    return 'login_locked'
  }
  if (
    user.mustChangePassword &&
    user.mustChangePasswordBy &&
    new Date(user.mustChangePasswordBy).getTime() < now
  ) {
    return 'locked_72h'
  }
  if (user.mustChangePassword) return 'must_change'
  return 'active'
}
