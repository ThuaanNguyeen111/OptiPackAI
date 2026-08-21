import type { LoginResponse, LoginSuccess } from '../types/auth'
import { UserRole } from '../types/auth'
import { ApiError } from '../lib/api'

export type LoginBody = {
  email: string
  password: string
  mfa_token?: string
  backup_code?: string
  device_token?: string
}

const delay = (ms = 600) => new Promise((r) => setTimeout(r, ms))

function mockTokens(email: string): Pick<LoginSuccess, 'access_token' | 'refresh_token'> {
  const stamp = Date.now()
  return {
    access_token: `mock-access.${btoa(email)}.${stamp}`,
    refresh_token: `mock-refresh.${btoa(email)}.${stamp}`,
  }
}

function resolveRole(email: string): UserRole {
  const e = email.toLowerCase()
  if (e.includes('admin')) return UserRole.ADMIN
  if (e.includes('warehouse') || e.includes('kho')) return UserRole.WAREHOUSE_STAFF
  if (e.includes('pack') || e.includes('donggoi')) return UserRole.PACKAGING_STAFF
  if (e.includes('ship') || e.includes('van')) return UserRole.SHIPPING_COORDINATOR
  return UserRole.STORE_OWNER
}

/**
 * Mock auth — không gọi BE.
 * Gợi ý thử:
 * - email bất kỳ + password ≥6 → vào app
 * - email chứa "mfa" → bước MFA (mã 123456 hoặc backup bất kỳ)
 * - email chứa "mustchange" / "admin@" → bắt đổi mật khẩu
 * - email chứa "locked" → khóa 72h
 */
export async function login(body: LoginBody): Promise<LoginResponse> {
  await delay()
  const email = body.email.trim().toLowerCase()

  if (email.includes('locked')) {
    throw new ApiError(403, [
      'Tài khoản đã bị khóa do chưa đổi mật khẩu trong 72 giờ kể từ khi được cấp. Vui lòng liên hệ Quản trị viên để được mở khóa.',
    ])
  }

  const needsMfa = email.includes('mfa')
  if (needsMfa && !body.device_token) {
    if (!body.mfa_token && !body.backup_code) {
      return { mfa_required: true }
    }
    if (body.mfa_token && body.mfa_token !== '123456') {
      throw new ApiError(401, ['Mã xác thực không chính xác.'])
    }
  }

  const mustChange =
    email.includes('mustchange') || email.startsWith('admin@')

  return {
    ...mockTokens(email),
    must_change_password: mustChange,
    role: resolveRole(email),
    ...(needsMfa && (body.mfa_token || body.backup_code)
      ? { trusted_device_token: `mock-device-${Date.now()}` }
      : {}),
  }
}

export async function forgotPassword(_email: string) {
  await delay()
  return {
    message:
      'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hộp thư.',
  }
}

export async function resetPassword(_token: string, _new_password: string) {
  await delay()
  return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' }
}

export async function changePassword(
  _current_password: string,
  _new_password: string,
) {
  await delay()
  return {
    message: 'Đổi mật khẩu thành công. Mọi phiên đăng nhập khác đã bị đăng xuất.',
  }
}

export async function logout(_refresh_token: string) {
  await delay(200)
  return { message: 'Đăng xuất thành công.' }
}

/** Mock Google: redirect thẳng FE /oauth-success với token giả. */
export function googleAuthUrl() {
  const params = new URLSearchParams({
    access_token: `mock-access.google.${Date.now()}`,
    refresh_token: `mock-refresh.google.${Date.now()}`,
    role: String(UserRole.STORE_OWNER),
    must_change_password: 'false',
  })
  return `/oauth-success?${params.toString()}`
}
