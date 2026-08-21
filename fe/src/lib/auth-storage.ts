import {
  isUserRole,
  type AuthSession,
  type UserRole,
} from '../types/auth'

const ACCESS_KEY = 'optipack-access-token'
const REFRESH_KEY = 'optipack-refresh-token'
const ROLE_KEY = 'optipack-role'
const MUST_CHANGE_KEY = 'optipack-must-change-password'
const DEVICE_KEY = 'optipack-device-token'
const REMEMBER_EMAIL_KEY = 'optipack-remember'

export function getDeviceToken(): string | null {
  return localStorage.getItem(DEVICE_KEY)
}

export function setDeviceToken(token: string): void {
  localStorage.setItem(DEVICE_KEY, token)
}

export function getRememberedEmail(): string {
  return localStorage.getItem(REMEMBER_EMAIL_KEY) ?? ''
}

export function setRememberedEmail(email: string | null): void {
  if (email) localStorage.setItem(REMEMBER_EMAIL_KEY, email)
  else localStorage.removeItem(REMEMBER_EMAIL_KEY)
}

export function readSession(): AuthSession | null {
  const accessToken = localStorage.getItem(ACCESS_KEY)
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  const roleRaw = localStorage.getItem(ROLE_KEY)
  const mustChange = localStorage.getItem(MUST_CHANGE_KEY) === 'true'
  const role = roleRaw !== null ? Number(roleRaw) : NaN

  if (!accessToken || !refreshToken || !isUserRole(role)) return null

  return {
    accessToken,
    refreshToken,
    role,
    mustChangePassword: mustChange,
  }
}

export function writeSession(session: {
  accessToken: string
  refreshToken: string
  role: UserRole
  mustChangePassword: boolean
}): void {
  localStorage.setItem(ACCESS_KEY, session.accessToken)
  localStorage.setItem(REFRESH_KEY, session.refreshToken)
  localStorage.setItem(ROLE_KEY, String(session.role))
  localStorage.setItem(MUST_CHANGE_KEY, String(session.mustChangePassword))
}

export function updateTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem(MUST_CHANGE_KEY)
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}
