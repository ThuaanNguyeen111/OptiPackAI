import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { logout as logoutApi } from '../api/auth.api'
import { fetchMyFeatures } from '../api/role-permissions.api'
import type { Feature } from '../lib/rbac'
import {
  clearSession,
  readSession,
  setDeviceToken,
  writeSession,
} from '../lib/auth-storage'
import type { AuthSession, LoginSuccess } from '../types/auth'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  // Khôi phục phiên từ localStorage khi reload — đừng clearSession() ở đây
  // (trước đó xóa token mỗi lần mount → F5 luôn bị đẩy về /login).
  const [session, setSession] = useState<AuthSession | null>(() => readSession())
  const [ready] = useState(true)
  // Theo role, không theo token: token xoay vòng không được làm nháy lại menu.
  const role = session?.role
  const [loaded, setLoaded] = useState<{ role: AuthSession['role']; features: Feature[] } | null>(null)
  // Quyền đã tải của role khác (vừa đổi tài khoản) không được dùng → coi như đang tải.
  const features = loaded && loaded.role === role ? loaded.features : null

  // Quyền trang do Admin cấu hình — tải lại khi đăng nhập / đổi tài khoản. Lỗi → không trang nào (chỉ còn hồ sơ).
  useEffect(() => {
    if (role === undefined) return
    let cancelled = false
    fetchMyFeatures()
      .then((list) => {
        if (!cancelled) setLoaded({ role, features: list })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ role, features: [] })
      })
    return () => {
      cancelled = true
    }
  }, [role])

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
      features,
      applyLoginSuccess,
      setMustChangePassword,
      logout,
    }),
    [session, ready, features, applyLoginSuccess, setMustChangePassword, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
