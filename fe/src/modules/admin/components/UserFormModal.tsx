import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type {
  AdminUser,
  CreateUserInput,
  UpdateUserInput,
} from '../../../types/admin'
import { ROLE_VALUES, roleLabelsEN, roleLabelsVN, Role } from '../../../types/admin'
import { Button } from '../../../components/ui/Button'
import { usePortal } from '../../../context/use-portal'

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 caret-slate-900 placeholder:text-slate-400 transition-shadow focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-[#1C212D] dark:text-[#F3F4F6] dark:caret-[#F3F4F6] dark:placeholder:text-[#9CA3AF] dark:[color-scheme:dark]'

const optionClass = 'bg-white text-slate-900 dark:bg-[#1C212D] dark:text-[#F3F4F6]'

type Props = {
  open: boolean
  onClose: () => void
  user: AdminUser | null
  onSave: (id: string, patch: UpdateUserInput) => Promise<void>
  onCreate?: (
    user: CreateUserInput,
  ) => Promise<{ temporaryPassword: string } | void>
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
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>(Role.WAREHOUSE_STAFF)
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [department, setDepartment] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (user) {
      setEmail(user.email)
      setName(user.name)
      setRole(user.role)
      setPhone(user.phone ?? '')
      setAddress(user.address ?? '')
      setEmployeeCode(user.employeeCode ?? '')
      setDepartment(user.department ?? '')
    } else {
      setEmail('')
      setName('')
      setRole(Role.WAREHOUSE_STAFF)
      setPhone('')
      setAddress('')
      setEmployeeCode('')
      setDepartment('')
    }
  }, [open, user])

  if (!open) return null

  async function handleSubmit() {
    if (isCreate && (!name.trim() || !email.trim())) return
    setSaving(true)
    if (isCreate) {
      if (!onCreate) {
        setSaving(false)
        return
      }
      await onCreate({
        name: name.trim(),
        email: email.trim(),
        role,
      })
    } else if (user) {
      await onSave(user.id, {
        name: name.trim(),
        role,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
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

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
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
                placeholder="staff@optipackai.com"
              />
            ) : (
              <div className="rounded-md border border-hairline bg-canvas px-3 py-2 font-mono text-sm text-ink">
                {user?.email}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              {vi ? 'Họ và tên' : 'Name'}
            </label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={vi ? 'Nguyễn Văn A' : 'Full name'}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              {vi ? 'Vai trò hệ thống' : 'System role'}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(Number(e.target.value) as Role)}
              className={inputClass}
            >
              {ROLE_VALUES.map((r) => (
                <option key={r} value={r} className={optionClass}>
                  {r} · {labels[r]}
                </option>
              ))}
            </select>
          </div>

          {isCreate ? null : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  {vi ? 'Số điện thoại' : 'Phone'}
                </label>
                <input
                  className={`${inputClass} font-mono`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912345678"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  {vi ? 'Địa chỉ' : 'Address'}
                </label>
                <input
                  className={inputClass}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-subtle">
                  {vi ? 'Mã nhân viên' : 'Employee code'}
                </label>
                <input
                  className={`${inputClass} font-mono`}
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="NV-045"
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
                  placeholder={vi ? 'Kho A' : 'Warehouse A'}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-hairline p-4">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {vi ? 'Hủy' : 'Cancel'}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => void handleSubmit()}
            disabled={
              saving || (isCreate && (!email.trim() || !name.trim()))
            }
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
