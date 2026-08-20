import { useMemo, useState } from 'react'
import type { AdminUser } from '../../../types/admin'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { UserFormModal } from './UserFormModal'

type Props = {
  users: AdminUser[]
  onUpdateUser: (id: string, patch: Partial<Pick<AdminUser, 'role' | 'employeeCode' | 'department'>>) => Promise<void>
  onResetPassword: (id: string) => Promise<void>
  onToggleActive: (id: string, active: boolean) => Promise<void>
}

export function UserManagementTable({ users, onUpdateUser, onResetPassword, onToggleActive }: Props) {
  const [editing, setEditing] = useState<AdminUser | null>(null)

  const rows = useMemo(() => users ?? [], [users])

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface-1">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-hairline text-ink-subtle">
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Tên</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">MFA</th>
            <th className="px-4 py-3 font-medium">Trạng thái</th>
            <th className="px-4 py-3 font-medium">Hành động</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-hairline/70 transition-colors last:border-b-0 hover:bg-surface-2/60">
              <td className="px-4 py-3">
                <div className="font-medium text-ink">{u.email}</div>
                <div className="text-xs text-ink-tertiary">{u.id}</div>
              </td>
              <td className="px-4 py-3">{u.fullName ?? '-'}</td>
              <td className="px-4 py-3">
                <RoleBadge role={u.role} />
                {u.employeeCode ? <div className="mt-1 font-mono text-xs text-ink-tertiary">{u.employeeCode}</div> : null}
              </td>
              <td className="px-4 py-3">
                {u.mfaEnabled ? <Badge tone="success">Bật</Badge> : <Badge>Chưa</Badge>}
              </td>
              <td className="px-4 py-3">{u.active ? <Badge tone="primary">Kích hoạt</Badge> : <Badge tone="warning">Bị khóa</Badge>}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setEditing(u)}>Sửa</Button>
                  <Button variant="secondary" onClick={() => onResetPassword(u.id)}>Reset PW</Button>
                  <Button variant="tertiary" onClick={() => onToggleActive(u.id, !u.active)}>
                    {u.active ? 'Vô hiệu' : 'Kích hoạt'}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-ink-subtle">Không có người dùng.</td>
            </tr>
          )}
        </tbody>
      </table>

      {editing ? (
        <UserFormModal
          open={true}
          onClose={() => setEditing(null)}
          user={editing}
          onSave={async (id, patch) => {
            await onUpdateUser(id, patch)
          }}
        />
      ) : null}
    </div>
  )
}

// Small mapping component - import Role enum at top-level causes circular if not used carefully; keep simple mapping
import { Role } from '../../../types/admin'
import { roleLabelsVN } from '../../../types/admin'

function RoleBadge({ role }: { role: Role }) {
  const tone = role === Role.ADMIN ? 'primary' : role === Role.STORE_OWNER ? 'success' : 'default'
  return <Badge tone={tone}>{roleLabelsVN[role]}</Badge>
}
