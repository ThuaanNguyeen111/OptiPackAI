import { useAdminUsers } from '../hooks/useAdminUsers'
import { UserManagementTable } from '../modules/admin/components/UserManagementTable'
import { AiConfigPanel } from '../modules/admin/components/AiConfigPanel'
import { AdminHeader } from '../modules/admin/components/AdminHeader'
import { AdminSidebar } from '../modules/admin/components/AdminSidebar'

export default function AdminPage() {
  const api = useAdminUsers()

  return (
    <div className="flex h-svh overflow-hidden bg-canvas">
      <div className="hidden lg:block">
        <AdminSidebar />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Admin header */}
        <AdminHeader title="Quản trị hệ thống" description="Quản lý người dùng và cấu hình AI" />

        <main className="p-6 overflow-auto">
          <div className="space-y-6">
            <div>
              <h2 className="mb-3 text-lg font-semibold">Quản trị người dùng</h2>
              <UserManagementTable
                users={api.users}
                onUpdateUser={async (id, patch) => await api.updateUser(id, patch)}
                onResetPassword={async (id) => await api.resetPassword(id)}
                onToggleActive={async (id, active) => await api.setActive(id, active)}
              />
            </div>

            <div>
              <h2 className="mb-3 text-lg font-semibold">Cấu hình AI Packaging</h2>
              <AiConfigPanel params={api.aiParams} onUpdate={(p) => api.updateAiParams(p)} />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
