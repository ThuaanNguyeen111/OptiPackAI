import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/use-auth'
import { usesTealAppChrome } from '../../lib/app-chrome'
import { UserRole } from '../../types/auth'
import { PortalSidebar } from '../portal/PortalSidebar'

export function AppLayout() {
  const { session } = useAuth()
  const location = useLocation()
  const tealChrome = usesTealAppChrome(session?.role)

  if (
    session?.role === UserRole.ADMIN &&
    (location.pathname === '/app/returns' ||
      location.pathname.startsWith('/app/returns/'))
  ) {
    return (
      <Navigate
        to={`/app/admin/returns${location.search}`}
        replace
      />
    )
  }

  return (
    <div
      className={
        tealChrome ? 'owner-shell' : 'flex h-svh overflow-hidden bg-canvas'
      }
    >
      <PortalSidebar />
      <div
        className={
          tealChrome
            ? 'owner-stage'
            : 'flex min-w-0 flex-1 flex-col overflow-hidden'
        }
      >
        <Outlet />
      </div>
    </div>
  )
}
