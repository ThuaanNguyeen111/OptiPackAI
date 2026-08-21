export enum UserRole {
  STORE_OWNER = 0,
  WAREHOUSE_STAFF = 1,
  PACKAGING_STAFF = 2,
  SHIPPING_COORDINATOR = 3,
  ADMIN = 4,
}

export const USER_ROLE_LABELS: Record<UserRole, { vi: string; en: string }> = {
  [UserRole.STORE_OWNER]: { vi: 'Chủ cửa hàng', en: 'Store Owner' },
  [UserRole.WAREHOUSE_STAFF]: { vi: 'Nhân viên kho', en: 'Warehouse Staff' },
  [UserRole.PACKAGING_STAFF]: { vi: 'Nhân viên đóng gói', en: 'Packaging Staff' },
  [UserRole.SHIPPING_COORDINATOR]: {
    vi: 'Điều phối vận chuyển',
    en: 'Shipping Coordinator',
  },
  [UserRole.ADMIN]: { vi: 'Quản trị viên', en: 'Admin' },
}

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === 'number' &&
    value >= UserRole.STORE_OWNER &&
    value <= UserRole.ADMIN
  )
}

export type LoginSuccess = {
  access_token: string
  refresh_token: string
  must_change_password: boolean
  role: UserRole
  trusted_device_token?: string
}

export type MfaRequired = {
  mfa_required: true
}

export type LoginResponse = LoginSuccess | MfaRequired

export function isMfaRequired(res: LoginResponse): res is MfaRequired {
  return 'mfa_required' in res && res.mfa_required === true
}

export type TokenPair = {
  access_token: string
  refresh_token: string
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  role: UserRole
  mustChangePassword: boolean
}

export const GOOGLE_OAUTH_ERRORS: Record<string, string> = {
  missing_code: 'Đăng nhập Google thất bại, thử lại.',
  invalid_state: 'Phiên đăng nhập hết hạn, thử lại.',
  email_not_verified: 'Vui lòng xác thực email Google trước.',
  account_not_registered:
    'Tài khoản chưa tồn tại, liên hệ Admin để được cấp tài khoản.',
  account_inactive: 'Tài khoản đã bị khóa, liên hệ Admin.',
  account_locked:
    'Tài khoản đã bị khóa do chưa đổi mật khẩu trong 72 giờ. Vui lòng liên hệ Admin để được mở khóa.',
  server_error: 'Có lỗi xảy ra, thử lại sau.',
}

export const ACCOUNT_LOCKED_DEADLINE =
  'Tài khoản đã bị khóa do chưa đổi mật khẩu trong 72 giờ. Vui lòng liên hệ Admin để được mở khóa.'
