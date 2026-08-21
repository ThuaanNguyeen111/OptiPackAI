import { API_BASE_URL, apiRequest } from '../lib/api'
import type { LoginResponse } from '../types/auth'

export type LoginBody = {
  email: string
  password: string
  mfa_token?: string
  backup_code?: string
  device_token?: string
}

export function login(body: LoginBody) {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body,
  })
}

export function forgotPassword(email: string) {
  return apiRequest<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  })
}

export function resetPassword(token: string, new_password: string) {
  return apiRequest<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: { token, new_password },
  })
}

export function changePassword(current_password: string, new_password: string) {
  return apiRequest<{ message: string }>('/auth/change-password', {
    method: 'POST',
    auth: true,
    body: { current_password, new_password },
  })
}

export function logout(refresh_token: string) {
  return apiRequest<{ message: string }>('/auth/logout', {
    method: 'POST',
    auth: true,
    skipRefresh: true,
    body: { refresh_token },
  })
}

export function googleAuthUrl() {
  return `${API_BASE_URL}/auth/google`
}
