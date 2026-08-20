import { useMemo, useState } from 'react'
import { KeyRound, Pencil, ShieldCheck, UserX } from 'lucide-react'
import type { AdminUser } from '../../../types/admin'
import { Role, roleLabelsEN, roleLabelsVN } from '../../../types/admin'
import { Badge } from '../../../components/ui/Badge'
import { usePortal } from '../../../context/use-portal'
import { UserFormModal } from './UserFormModal'

type StatusFilter = 'all' | 'active' | 'locked' | 'admin'

type Props = {
  users: AdminUser[]
  query?: string
  onUpdateUser: (
    id: string,
    patch: Partial<Pick<AdminUser, 'role' | 'employeeCode' | 'department'>>,
  ) => Promise<void>
  onResetPassword: (id: string) => Promise<void>
  onToggleActive: (id: string, active: boolean) => Promise<void>
  onCreateUser?: (
    user: Omit<AdminUser, 'id' | 'createdAt'>,
  ) => Promise<void>
  creating?: boolean
  onCreatingChange?: (v: boolean) => void
}

function RoleBadge({ role }: { role: Role }) {
  const { locale } = usePortal()
  const label = locale === 'vi' ? roleLabelsVN[role] : roleLabelsEN[role]
  const tone =
    role === Role.ADMIN
      ? 'primary'
      : role === Role.STORE_OWNER
        ? 'success'
        : 'default'
  return <Badge tone={tone}>{label}</Badge>
}

export function UserManagementTable({
  users,
  query = '',
  onUpdateUser,
  onResetPassword,
  onToggleActive,
  onCreateUser,
  creating = false,
  onCreatingChange,
}: Props) {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (statusFilter === 'active' && !u.active) return false
      if (statusFilter === 'locked' && u.active) return false
      if (statusFilter === 'admin' && u.role !== Role.ADMIN) return false
      if (!q) return true
      const hay = [u.email, u.fullName, u.employeeCode, u.department, u.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [users, query, statusFilter])

  const filterTabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: vi ? 'Tất cả' : 'All users' },
    { key: 'active', label: vi ? 'Đang hoạt động' : 'Active' },
    { key: 'locked', label: vi ? 'Bị khóa' : 'Locked' },
    { key: 'admin', label: 'Admin' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface-1 p-1">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === tab.key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-ink-subtle hover:bg-canvas hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm text-ink">
            <thead>
              <tr className="border-b border-hairline text-ink-subtle">
                <th className="px-4 py-3 font-medium">
                  {vi ? 'Người dùng' : 'User'}
                </th>
                <th className="px-4 py-3 font-medium">
                  {vi ? 'Vai trò' : 'Role'}
                </th>
                <th className="px-4 py-3 font-medium">
                  {vi ? 'Phòng ban' : 'Dept'}
                </th>
                <th className="px-4 py-3 font-medium">MFA</th>
                <th className="px-4 py-3 font-medium">
                  {vi ? 'Trạng thái' : 'Status'}
                </th>
                <th className="px-4 py-3 font-medium">
                  {vi ? 'Thao tác' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-hairline/70 last:border-0 hover:bg-surface-2/60"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">
                      {u.fullName ?? '—'}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-tertiary">
                      {u.email}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-tertiary">
                      {u.id}
                      {u.employeeCode ? ` · ${u.employeeCode}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {u.department ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {u.mfaEnabled ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success-bg px-2 py-0.5 text-[10px] font-medium text-success">
                        <ShieldCheck className="h-3 w-3" strokeWidth={2} />
                        {vi ? 'Bật' : 'On'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
                        {vi ? 'Chưa' : 'Off'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      {u.active ? (
                        <Badge tone="success">
                          {vi ? 'Kích hoạt' : 'Active'}
                        </Badge>
                      ) : (
                        <Badge tone="warning">
                          {vi ? 'Bị khóa' : 'Locked'}
                        </Badge>
                      )}
                      {u.mustChangePassword ? (
                        <span className="text-[10px] text-amber-700 dark:text-amber-300">
                          {vi ? 'Cần đổi mật khẩu' : 'Must change password'}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing(u)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-indigo-500/40 hover:text-ink"
                      >
                        <Pencil className="h-3 w-3" />
                        {vi ? 'Sửa' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onResetPassword(u.id)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-indigo-500/40 hover:text-ink"
                      >
                        <KeyRound className="h-3 w-3" />
                        Reset PW
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggleActive(u.id, !u.active)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-hairline px-2.5 text-xs font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
                      >
                        <UserX className="h-3 w-3" />
                        {u.active
                          ? vi
                            ? 'Vô hiệu'
                            : 'Disable'
                          : vi
                            ? 'Kích hoạt'
                            : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-subtle">
              {vi ? 'Không có người dùng khớp bộ lọc.' : 'No users match filters.'}
            </p>
          ) : null}
        </div>
      </div>

      <UserFormModal
        open={creating || editing !== null}
        onClose={() => {
          setEditing(null)
          onCreatingChange?.(false)
        }}
        user={creating ? null : editing}
        onSave={async (id, patch) => {
          await onUpdateUser(id, patch)
        }}
        onCreate={onCreateUser}
      />
    </div>
  )
}
