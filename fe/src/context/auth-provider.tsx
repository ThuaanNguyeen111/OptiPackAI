import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { logout as logoutApi } from '../api/auth.api'
import {
  clearSession,
  readSession,
  setDeviceToken,
  writeSession,
} from '../lib/auth-storage'
import type { AuthSession, LoginSuccess } from '../types/auth'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readSession())
  const [ready] = useState(true)

  const applyLoginSuccess = useCallback((result: LoginSuccess) => {
    const next: AuthSession = {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      role: result.role,
      mustChangePassword: result.must_change_password,
    }
    writeSession(next)
    if (result.trusted_device_token) {
      setDeviceToken(result.trusted_device_token)
    }
    setSession(next)
  }, [])

  const setMustChangePassword = useCallback((value: boolean) => {
    setSession((prev) => {
      if (!prev) return prev
      const next = { ...prev, mustChangePassword: value }
      writeSession(next)
      return next
    })
  }, [])

  const logout = useCallback(async () => {
    const current = readSession()
    if (current) {
      try {
        await logoutApi(current.refreshToken)
      } catch {
        // vẫn xóa phiên local nếu BE không phản hồi
      }
    }
    clearSession()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      ready,
      applyLoginSuccess,
      setMustChangePassword,
      logout,
    }),
    [session, ready, applyLoginSuccess, setMustChangePassword, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
