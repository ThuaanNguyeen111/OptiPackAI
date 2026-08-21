import { createContext } from 'react'
import type { AuthSession, LoginSuccess } from '../types/auth'

export type AuthContextValue = {
  session: AuthSession | null
  ready: boolean
  applyLoginSuccess: (result: LoginSuccess) => void
  setMustChangePassword: (value: boolean) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
