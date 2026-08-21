import { Outlet } from 'react-router-dom'
import { AdminSidebar } from '../../modules/admin/components/AdminSidebar'

export function AdminLayout() {
  return (
    <div className="flex h-svh overflow-hidden bg-canvas">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
