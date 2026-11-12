import { createContext } from 'react'
import type { Feature } from '../lib/rbac'
import type { AuthSession, LoginSuccess } from '../types/auth'

export type AuthContextValue = {
  session: AuthSession | null
  ready: boolean
  /** Trang role hiện tại được vào (từ /role-permissions/me). null = đang tải. */
  features: Feature[] | null
  applyLoginSuccess: (result: LoginSuccess) => void
  setMustChangePassword: (value: boolean) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
