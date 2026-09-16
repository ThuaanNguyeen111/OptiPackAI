import { Outlet } from 'react-router-dom'
import { PortalSidebar } from '../portal/PortalSidebar'

export function AppLayout() {
  return (
    <div className="flex h-svh overflow-hidden bg-canvas">
      <PortalSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
