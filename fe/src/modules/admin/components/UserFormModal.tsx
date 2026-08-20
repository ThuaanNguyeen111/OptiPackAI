import { useState, useEffect } from 'react'
import type { AdminUser } from '../../../types/admin'
import { Role } from '../../../types/admin'
import { Button } from '../../../components/ui/Button'

type Props = {
  open: boolean
  onClose: () => void
  user: AdminUser
  onSave: (id: string, patch: Partial<Pick<AdminUser, 'role' | 'employeeCode' | 'department'>>) => Promise<void>
}

export function UserFormModal({ open, onClose, user, onSave }: Props) {
  const [role, setRole] = useState<Role | undefined>(undefined)
  const [employeeCode, setEmployeeCode] = useState('')
  const [department, setDepartment] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) {
      setRole(user.role)
      setEmployeeCode(user.employeeCode ?? '')
      setDepartment(user.department ?? '')
    } else {
      setRole(undefined)
      setEmployeeCode('')
      setDepartment('')
    }
  }, [user])

  if (!open) return null
  if (!user) return null

  async function handleSave() {
    setSaving(true)
    await onSave(user.id, {
      role: role ?? user.role,
      employeeCode: employeeCode || undefined,
      department: department || undefined,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Đóng"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-hairline bg-surface-1 sm:rounded-2xl">
        <div className="flex h-12 items-center justify-between border-b border-hairline px-4">
          <div className="text-sm font-medium">Chỉnh sửa người dùng</div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-subtle">Email</label>
            <div className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink">{user.email}</div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-subtle">Vai trò</label>
            <select
              value={String(role ?? user.role)}
              onChange={(e) => setRole(Number(e.target.value) as Role)}
              className="w-full rounded-lg border border-[#222734] bg-[#151922] px-3 py-2 text-sm text-ink focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/40"
            >
              <option value={0}>Chủ cửa hàng</option>
              <option value={1}>Nhân viên kho</option>
              <option value={2}>Nhân viên đóng gói</option>
              <option value={3}>Điều phối vận chuyển</option>
              <option value={4}>Quản trị hệ thống</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-subtle">Mã nhân viên</label>
            <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} className="w-full rounded-lg border border-[#222734] bg-[#151922] px-3 py-2 text-sm text-ink focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/40" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-subtle">Phòng ban</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full rounded-lg border border-[#222734] bg-[#151922] px-3 py-2 text-sm text-ink focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/40" />
          </div>
        </div>

        <div className="border-t border-hairline p-4">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Hủy</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
