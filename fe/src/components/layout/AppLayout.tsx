import { Outlet } from 'react-router-dom'
import { useAuth } from '../../context/use-auth'
import { usesTealAppChrome } from '../../lib/app-chrome'
import { PortalSidebar } from '../portal/PortalSidebar'

export function AppLayout() {
  const { session } = useAuth()
  const tealChrome = usesTealAppChrome(session?.role)

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
