import { Outlet } from 'react-router-dom'
import { AdminSidebar } from '../../modules/admin/components/AdminSidebar'

export function AdminLayout() {
  return (
    <div className="owner-shell">
      <AdminSidebar />
      <div className="owner-stage">
        <Outlet />
      </div>
    </div>
  )
}
