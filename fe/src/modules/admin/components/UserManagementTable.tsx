import { useMemo, useState } from 'react'
import {
  KeyRound,
  Pencil,
  ShieldOff,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react'
import type {
  AdminUser,
  CreateUserInput,
  Role,
  UpdateUserInput,
  UserLockState,
} from '../../../types/admin'
import {
  ROLE_VALUES,
  getUserLockState,
  roleLabelsEN,
  roleLabelsVN,
  Role as RoleEnum,
} from '../../../types/admin'
import { Badge } from '../../../components/ui/Badge'
import { usePortal } from '../../../context/use-portal'
import { UserFormModal } from './UserFormModal'

type StatusFilter = 'all' | UserLockState

type Props = {
  users: AdminUser[]
  query?: string
  onUpdateUser: (id: string, patch: UpdateUserInput) => Promise<void>
  onResetPassword: (id: string) => Promise<void>
  onDeactivate: (id: string) => Promise<void>
  onReactivate: (id: string) => Promise<void>
  onDisableMfa: (id: string) => Promise<void>
  onCreateUser?: (
    user: CreateUserInput,
  ) => Promise<{ temporaryPassword: string } | void>
  creating?: boolean
  onCreatingChange?: (v: boolean) => void
}

function RoleBadge({ role }: { role: Role }) {
  const { locale } = usePortal()
  const label = locale === 'vi' ? roleLabelsVN[role] : roleLabelsEN[role]
  const tone =
    role === RoleEnum.ADMIN
      ? 'primary'
      : role === RoleEnum.STORE_OWNER
        ? 'success'
        : 'default'
  return <Badge tone={tone}>{label}</Badge>
}

function StatusCell({ user }: { user: AdminUser }) {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const state = getUserLockState(user)

  if (state === 'inactive') {
    return (
      <Badge tone="warning">{vi ? 'Vô hiệu' : 'Deactivated'}</Badge>
    )
  }
  if (state === 'locked_72h') {
    return (
      <div className="flex flex-col gap-1">
        <Badge tone="warning">{vi ? 'Khóa cứng 72h' : 'Hard-locked 72h'}</Badge>
        <span className="text-[10px] text-amber-700 dark:text-amber-300">
          {vi ? 'Reset PW để mở khóa' : 'Reset PW to unlock'}
        </span>
      </div>
    )
  }
  if (state === 'login_locked') {
    return (
      <Badge tone="warning">{vi ? 'Khóa đăng nhập tạm' : 'Login locked'}</Badge>
    )
  }
  if (state === 'must_change') {
    return (
      <div className="flex flex-col gap-1">
        <Badge tone="success">{vi ? 'Kích hoạt' : 'Active'}</Badge>
        <span className="text-[10px] text-amber-700 dark:text-amber-300">
          {vi ? 'Cần đổi mật khẩu' : 'Must change password'}
        </span>
      </div>
    )
  }
  return <Badge tone="success">{vi ? 'Kích hoạt' : 'Active'}</Badge>
}

const actionBtn =
  'inline-flex h-8 items-center gap-1 rounded-md border border-hairline bg-canvas px-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-indigo-500/40 hover:text-ink'

export function UserManagementTable({
  users,
  query = '',
  onUpdateUser,
  onResetPassword,
  onDeactivate,
  onReactivate,
  onDisableMfa,
  onCreateUser,
  creating = false,
  onCreatingChange,
}: Props) {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (statusFilter !== 'all' && getUserLockState(u) !== statusFilter) {
        return false
      }
      if (!q) return true
      const hay = [
        u.email,
        u.name,
        u.employeeCode,
        u.department,
        u.phone,
        u.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [users, query, statusFilter, roleFilter])

  const filterTabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: vi ? 'Tất cả' : 'All' },
    { key: 'active', label: vi ? 'Hoạt động' : 'Active' },
    { key: 'must_change', label: vi ? 'Cần đổi MK' : 'Must change PW' },
    { key: 'locked_72h', label: vi ? 'Khóa 72h' : 'Locked 72h' },
    { key: 'login_locked', label: vi ? 'Khóa login' : 'Login locked' },
    { key: 'inactive', label: vi ? 'Vô hiệu' : 'Deactivated' },
  ]

  const roleLabels = vi ? roleLabelsVN : roleLabelsEN

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="shrink-0">{vi ? 'Role' : 'Role'}</span>
          <select
            value={roleFilter === 'all' ? 'all' : String(roleFilter)}
            onChange={(e) =>
              setRoleFilter(
                e.target.value === 'all'
                  ? 'all'
                  : (Number(e.target.value) as Role),
              )
            }
            className="h-9 rounded-lg border border-hairline bg-surface-1 px-2.5 font-mono text-xs text-ink focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="all">{vi ? 'Tất cả role' : 'All roles'}</option>
            {ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {r} · {roleLabels[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm text-ink">
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
              {filtered.map((u) => {
                const state = getUserLockState(u)
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-hairline/70 last:border-0 hover:bg-surface-2/60 ${
                      state === 'locked_72h' ? 'bg-amber-500/[0.04]' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{u.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-tertiary">
                        {u.email}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-tertiary">
                        {u.id}
                        {u.employeeCode ? ` · ${u.employeeCode}` : ''}
                        {` · ${u.loginType}`}
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
                      <StatusCell user={u} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(u)}
                          className={actionBtn}
                        >
                          <Pencil className="h-3 w-3" />
                          {vi ? 'Sửa' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onResetPassword(u.id)}
                          className={actionBtn}
                          title={
                            vi
                              ? 'Sinh mật khẩu tạm + mở khóa 72h'
                              : 'Issue temp password + unlock 72h lock'
                          }
                        >
                          <KeyRound className="h-3 w-3" />
                          {state === 'locked_72h'
                            ? vi
                              ? 'Mở khóa'
                              : 'Unlock'
                            : 'Reset PW'}
                        </button>
                        {u.mfaEnabled ? (
                          <button
                            type="button"
                            onClick={() => void onDisableMfa(u.id)}
                            className={actionBtn}
                            title={
                              vi
                                ? 'Tắt MFA hộ (mất điện thoại / hết mã dự phòng)'
                                : 'Disable MFA (lost phone / used backup codes)'
                            }
                          >
                            <ShieldOff className="h-3 w-3" />
                            {vi ? 'Tắt MFA' : 'Disable MFA'}
                          </button>
                        ) : null}
                        {u.active ? (
                          <button
                            type="button"
                            onClick={() => void onDeactivate(u.id)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[#EF4444]/30 px-2.5 text-xs font-medium text-[#EF4444] hover:bg-[#EF4444]/10"
                          >
                            <UserX className="h-3 w-3" />
                            {vi ? 'Vô hiệu' : 'Deactivate'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void onReactivate(u.id)}
                            className={actionBtn}
                          >
                            <UserCheck className="h-3 w-3" />
                            {vi ? 'Kích hoạt lại' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-subtle">
              {vi
                ? 'Không có người dùng khớp bộ lọc.'
                : 'No users match filters.'}
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
        onSave={onUpdateUser}
        onCreate={onCreateUser}
      />
    </div>
  )
}
