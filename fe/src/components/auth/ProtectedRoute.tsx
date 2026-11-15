import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/use-auth'
import { canAccessPath, homePath } from '../../lib/rbac'
import { UserRole } from '../../types/auth'

export function ProtectedRoute() {
  const { session, ready, features } = useAuth()
  const location = useLocation()

  if (!ready) return null
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (session.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  // Chờ quyền trang (Admin không cần) — tránh đẩy nhầm về trang khác lúc đang tải.
  if (features === null && session.role !== UserRole.ADMIN) return null
  if (!canAccessPath(session.role, location.pathname, features)) {
    return <Navigate to={homePath(session.role, features)} replace />
  }
  return <Outlet />
}

export function GuestRoute() {
  const { session, ready } = useAuth()

  if (!ready) return null
  if (session?.mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }
  if (session) {
    return <Navigate to={homePath(session.role)} replace />
  }
  return <Outlet />
}

export function ForceChangeRoute() {
  const { session, ready } = useAuth()

  if (!ready) return null
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (!session.mustChangePassword) {
    return <Navigate to={homePath(session.role)} replace />
  }
  return <Outlet />
}
