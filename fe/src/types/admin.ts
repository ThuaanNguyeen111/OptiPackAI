export const Role = {
  STORE_OWNER: 0 as const,
  WAREHOUSE_STAFF: 1 as const,
  PACKAGING_STAFF: 2 as const,
  SHIPPING_COORDINATOR: 3 as const,
  ADMIN: 4 as const,
} as const

export type Role = typeof Role[keyof typeof Role]

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
  [Role.PACKAGING_STAFF]: 'Packaging Specialist',
  [Role.SHIPPING_COORDINATOR]: 'Shipping Coordinator',
  [Role.ADMIN]: 'System Admin',
}

export type AdminUser = {
  id: string
  email: string
  fullName?: string
  role: Role
  employeeCode?: string
  department?: string
  mfaEnabled: boolean
  active: boolean
  mustChangePassword?: boolean
  createdAt: string
}

export type AiPackagingParams = {
  timeoutSeconds: number
  min_fill_rate: number // 0-1
  autoFallback: boolean
}

export type PackagingTemplate = {
  id: string
  name: string
  description?: string
  boxType: string
  maxWeightKg?: number
  createdBy: string
  createdAt: string
}
