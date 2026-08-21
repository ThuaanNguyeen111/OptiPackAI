import { useMemo, useState } from 'react'
import { Plus, Search, Shield, UserCheck, UserX, Users } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { AdminToast } from '../modules/admin/components/AdminToast'
import { TempPasswordDialog } from '../modules/admin/components/TempPasswordDialog'
import { UserManagementTable } from '../modules/admin/components/UserManagementTable'
import { Role, getUserLockState } from '../types/admin'

export default function AdminPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const api = useAdminUsers()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [tempPw, setTempPw] = useState<{
    email: string
    temporaryPassword: string
    reason: 'create' | 'reset'
  } | null>(null)

  const stats = useMemo(() => {
    const active = api.users.filter((u) => u.active).length
    const locked72 = api.users.filter(
      (u) => getUserLockState(u) === 'locked_72h',
    ).length
    return {
      total: api.users.length,
      active,
      locked72,
      admins: api.users.filter((u) => u.role === Role.ADMIN).length,
    }
  }, [api.users])

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Người dùng' : 'Users' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi ? 'Quản trị người dùng' : 'User administration'}
              </h1>
            <Button
              variant="primary"
              className="h-9 min-h-9"
              onClick={() => setCreating(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {vi ? 'Tạo tài khoản' : 'Create account'}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: vi ? 'Tổng tài khoản' : 'Total accounts',
                value: stats.total,
                icon: Users,
              },
              {
                label: vi ? 'Đang hoạt động' : 'Active',
                value: stats.active,
                icon: UserCheck,
              },
              {
                label: vi ? 'Khóa cứng 72h' : 'Hard-locked 72h',
                value: stats.locked72,
                icon: UserX,
              },
              {
                label: 'Admin',
                value: stats.admins,
                icon: Shield,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-hairline bg-surface-1 p-5"
              >
                <card.icon
                  className="h-4 w-4 text-primary-hover"
                  strokeWidth={1.75}
                />
                <p className="mt-3 text-sm text-ink-subtle">{card.label}</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                vi
                  ? 'Tìm email, tên, mã nhân viên…'
                  : 'Search email, name, employee code…'
              }
              className="h-9 w-full rounded-md border border-hairline bg-surface-1 py-1.5 pr-3 pl-8 text-xs text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <UserManagementTable
            users={api.users}
            query={query}
            creating={creating}
            onCreatingChange={setCreating}
            onUpdateUser={async (id, patch) => {
              await api.updateUser(id, patch)
              showToast(vi ? 'Đã cập nhật người dùng' : 'User updated')
            }}
            onResetPassword={async (id) => {
              const user = api.users.find((u) => u.id === id)
              const { temporaryPassword } = await api.resetPassword(id)
              if (user) {
                setTempPw({
                  email: user.email,
                  temporaryPassword,
                  reason: 'reset',
                })
              }
            }}
            onDeactivate={async (id) => {
              await api.deactivate(id)
              showToast(vi ? 'Đã vô hiệu hóa' : 'Account deactivated')
            }}
            onReactivate={async (id) => {
              await api.reactivate(id)
              showToast(vi ? 'Đã kích hoạt lại' : 'Account reactivated')
            }}
            onDisableMfa={async (id) => {
              await api.disableMfa(id)
              showToast(
                vi
                  ? 'Đã tắt MFA — user phải setup lại nếu muốn bật'
                  : 'MFA disabled — user must set up again to re-enable',
              )
            }}
            onCreateUser={async (input) => {
              const { temporaryPassword } = await api.createUser(input)
              setTempPw({
                email: input.email,
                temporaryPassword,
                reason: 'create',
              })
              return { temporaryPassword }
            }}
          />
        </div>
      </main>

      {toast ? <AdminToast message={toast} onClose={() => setToast(null)} /> : null}
      {tempPw ? (
        <TempPasswordDialog
          email={tempPw.email}
          temporaryPassword={tempPw.temporaryPassword}
          reason={tempPw.reason}
          onClose={() => setTempPw(null)}
        />
      ) : null}
    </>
  )
}
