import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/use-auth'

export function ProtectedRoute() {
  const { session, ready } = useAuth()
  const location = useLocation()

  if (!ready) return null
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (session.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
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
    return <Navigate to="/app" replace />
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
    return <Navigate to="/app" replace />
  }
  return <Outlet />
}
