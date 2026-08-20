import { useMemo, useState } from 'react'
import { CheckCircle2, Plus, Search, Shield, UserCheck, UserX, Users } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { UserManagementTable } from '../modules/admin/components/UserManagementTable'
import { Role } from '../types/admin'

function Toast({
  message,
  onClose,
}: {
  message: string
  onClose: () => void
}) {
  return (
    <div className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-success/30 bg-surface-1 px-4 py-3 shadow-lg shadow-black/30">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <p className="min-w-0 flex-1 text-sm font-medium text-ink">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-ink-subtle hover:text-ink"
      >
        ✕
      </button>
    </div>
  )
}

export default function AdminPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const api = useAdminUsers()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const stats = useMemo(() => {
    const active = api.users.filter((u) => u.active).length
    return {
      total: api.users.length,
      active,
      locked: api.users.length - active,
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
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi ? 'Quản trị người dùng' : 'User administration'}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {vi
                  ? 'Role · MFA · khóa tài khoản · reset mật khẩu'
                  : 'Roles · MFA · lock accounts · reset passwords'}
              </p>
            </div>
            <Button
              variant="primary"
              className="h-9 min-h-9"
              onClick={() => setCreating(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {vi ? 'Tạo user' : 'Create user'}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: vi ? 'Tổng user' : 'Total users',
                value: stats.total,
                icon: Users,
              },
              {
                label: vi ? 'Đang hoạt động' : 'Active',
                value: stats.active,
                icon: UserCheck,
              },
              {
                label: vi ? 'Bị khóa' : 'Locked',
                value: stats.locked,
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
              await api.resetPassword(id)
              showToast(vi ? 'Đã reset mật khẩu' : 'Password reset')
            }}
            onToggleActive={async (id, active) => {
              await api.setActive(id, active)
              showToast(
                active
                  ? vi
                    ? 'Đã kích hoạt tài khoản'
                    : 'Account enabled'
                  : vi
                    ? 'Đã khóa tài khoản'
                    : 'Account locked',
              )
            }}
            onCreateUser={async (user) => {
              await api.createUser(user)
              showToast(vi ? 'Đã tạo người dùng' : 'User created')
            }}
          />
        </div>
      </main>

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  )
}
