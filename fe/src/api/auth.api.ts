import { API_BASE_URL, apiRequest } from '../lib/api'
import { isUserRole, type LoginResponse, type LoginSuccess } from '../types/auth'

export type LoginBody = {
  email: string
  password: string
  mfa_token?: string
  backup_code?: string
  device_token?: string
}

function asLoginResponse(payload: unknown): LoginResponse {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Phản hồi đăng nhập không hợp lệ.')
  }
  const data = payload as Record<string, unknown>
  if (data.mfa_required === true) {
    return typeof data.mfa_challenge === 'string'
      ? { mfa_required: true, mfa_challenge: data.mfa_challenge }
      : { mfa_required: true }
  }

  const role = Number(data.role)
  if (
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    !isUserRole(role)
  ) {
    throw new Error('Phản hồi đăng nhập thiếu token hoặc role.')
  }

  const success: LoginSuccess = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    must_change_password: Boolean(data.must_change_password),
    role,
  }
  if (typeof data.trusted_device_token === 'string') {
    success.trusted_device_token = data.trusted_device_token
  }
  return success
}

export async function login(body: LoginBody): Promise<LoginResponse> {
  const payload: Record<string, string> = {
    email: body.email,
    password: body.password,
  }
  if (body.mfa_token) payload.mfa_token = body.mfa_token
  if (body.backup_code) payload.backup_code = body.backup_code
  if (body.device_token) payload.device_token = body.device_token

  const raw = await apiRequest<unknown>('/auth/login', {
    method: 'POST',
    body: payload,
  })
  return asLoginResponse(raw)
}

export async function forgotPassword(email: string) {
  return apiRequest<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  })
}

export async function resetPassword(token: string, new_password: string) {
  return apiRequest<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: { token, new_password },
  })
}

export async function changePassword(
  current_password: string,
  new_password: string,
) {
  return apiRequest<{ message: string }>('/auth/change-password', {
    method: 'POST',
    auth: true,
    body: { current_password, new_password },
  })
}

export async function logout(refresh_token: string) {
  return apiRequest<{ message: string }>('/auth/logout', {
    method: 'POST',
    auth: true,
    body: { refresh_token },
  })
}

export function googleAuthUrl() {
  return `${API_BASE_URL}/auth/google`
}

/** AOFP-333 — MFA đang bật thì phải gửi mã hiện tại hoặc mật khẩu. QR là data-URL do BE vẽ. */
export async function setupMfa(
  reauth: { current_token?: string; password?: string } = {},
): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
  return apiRequest<{ otpauthUrl: string; qrDataUrl: string }>('/auth/mfa/setup', {
    method: 'POST',
    auth: true,
    body: reauth,
  })
}

/** AOFP-333 — đổi `login_code` (1 lần, 60 giây) trên URL /oauth-success lấy kết quả đăng nhập Google. */
export async function exchangeGoogleLogin(login_code: string): Promise<LoginResponse> {
  const raw = await apiRequest<unknown>('/auth/google/exchange', {
    method: 'POST',
    body: { login_code },
  })
  return asLoginResponse(raw)
}

/** AOFP-333 — tài khoản bật MFA đăng nhập Google: nhập mã TOTP hoặc mã dự phòng. */
export async function googleMfaLogin(body: {
  mfa_challenge: string
  mfa_token?: string
  backup_code?: string
}): Promise<LoginResponse> {
  const raw = await apiRequest<unknown>('/auth/google/mfa', {
    method: 'POST',
    body,
  })
  return asLoginResponse(raw)
}

export async function verifyMfaSetup(
  token: string,
): Promise<{ message: string; backup_codes: string[] }> {
  return apiRequest<{ message: string; backup_codes: string[] }>(
    '/auth/mfa/verify',
    {
      method: 'POST',
      auth: true,
      body: { token },
    },
  )
}
