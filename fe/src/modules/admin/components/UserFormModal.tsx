import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { AdminUser } from '../../../types/admin'
import { Role, roleLabelsEN, roleLabelsVN } from '../../../types/admin'
import { Button } from '../../../components/ui/Button'
import { usePortal } from '../../../context/use-portal'

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 caret-slate-900 placeholder:text-slate-400 transition-shadow focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-[#1C212D] dark:text-[#F3F4F6] dark:caret-[#F3F4F6] dark:placeholder:text-[#9CA3AF] dark:[color-scheme:dark]'

const optionClass = 'bg-white text-slate-900 dark:bg-[#1C212D] dark:text-[#F3F4F6]'

const ROLE_OPTIONS: Role[] = [
  Role.STORE_OWNER,
  Role.WAREHOUSE_STAFF,
  Role.PACKAGING_STAFF,
  Role.SHIPPING_COORDINATOR,
  Role.ADMIN,
]

type CreatePayload = Omit<AdminUser, 'id' | 'createdAt'>
type EditPayload = Partial<
  Pick<AdminUser, 'role' | 'employeeCode' | 'department'>
>

type Props = {
  open: boolean
  onClose: () => void
  user: AdminUser | null
  onSave: (id: string, patch: EditPayload) => Promise<void>
  onCreate?: (user: CreatePayload) => Promise<void>
}

export function UserFormModal({
  open,
  onClose,
  user,
  onSave,
  onCreate,
}: Props) {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const isCreate = user === null

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>(Role.WAREHOUSE_STAFF)
  const [employeeCode, setEmployeeCode] = useState('')
  const [department, setDepartment] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (user) {
      setEmail(user.email)
      setFullName(user.fullName ?? '')
      setRole(user.role)
      setEmployeeCode(user.employeeCode ?? '')
      setDepartment(user.department ?? '')
    } else {
      setEmail('')
      setFullName('')
      setRole(Role.WAREHOUSE_STAFF)
      setEmployeeCode('')
      setDepartment('')
    }
  }, [open, user])

  if (!open) return null

  async function handleSubmit() {
    setSaving(true)
    if (isCreate) {
      if (!onCreate || !email.trim()) {
        setSaving(false)
        return
      }
      await onCreate({
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        role,
        employeeCode: employeeCode.trim() || undefined,
        department: department.trim() || undefined,
        mfaEnabled: false,
        active: true,
      })
    } else if (user) {
      await onSave(user.id, {
        role,
        employeeCode: employeeCode.trim() || undefined,
        department: department.trim() || undefined,
      })
    }
    setSaving(false)
    onClose()
  }

  const labels = vi ? roleLabelsVN : roleLabelsEN

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={vi ? 'Đóng' : 'Close'}
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-hairline bg-surface-1 sm:rounded-2xl">
        <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
          <h2 className="text-sm font-medium text-ink">
            {isCreate
              ? vi
                ? 'Tạo người dùng'
                : 'Create user'
              : vi
                ? 'Chỉnh sửa người dùng'
                : 'Edit user'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink"
            aria-label={vi ? 'Đóng' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              Email
            </label>
            {isCreate ? (
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@shop.local"
              />
            ) : (
              <div className="rounded-md border border-hairline bg-canvas px-3 py-2 font-mono text-sm text-ink">
                {user?.email}
              </div>
            )}
          </div>

          {isCreate ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-subtle">
                {vi ? 'Họ và tên' : 'Full name'}
              </label>
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={vi ? 'Nguyễn Văn A' : 'Full name'}
              />
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              {vi ? 'Vai trò hệ thống' : 'System role'}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(Number(e.target.value) as Role)}
              className={inputClass}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r} className={optionClass}>
                  {labels[r]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              {vi ? 'Mã nhân viên' : 'Employee code'}
            </label>
            <input
              className={`${inputClass} font-mono`}
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="EMP-001"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              {vi ? 'Phòng ban' : 'Department'}
            </label>
            <input
              className={inputClass}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder={vi ? 'Kho / Packing / IT' : 'Warehouse / Packing / IT'}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-hairline p-4">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {vi ? 'Hủy' : 'Cancel'}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => void handleSubmit()}
            disabled={saving || (isCreate && !email.trim())}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            {saving
              ? vi
                ? 'Đang lưu…'
                : 'Saving…'
              : vi
                ? 'Lưu'
                : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
