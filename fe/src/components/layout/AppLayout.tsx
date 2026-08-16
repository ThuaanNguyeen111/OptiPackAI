import { Outlet } from 'react-router-dom'
import { PortalProvider } from '../../context/portal-provider'
import { PortalSidebar } from '../portal/PortalSidebar'

export function AppLayout() {
  return (
    <PortalProvider>
      <div className="flex h-svh overflow-hidden bg-canvas">
        <PortalSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    </PortalProvider>
  )
}
