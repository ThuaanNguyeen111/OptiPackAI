import { useState } from 'react'
import { Check, CheckCircle2, Loader2, Shield } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'

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

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-surface-3'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export function AdminSettingsPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [forceMfa, setForceMfa] = useState(true)
  const [lockInactive, setLockInactive] = useState(true)
  const [mustChangeOnCreate, setMustChangeOnCreate] = useState(true)
  const [sessionHours, setSessionHours] = useState(8)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 700))
    setSaving(false)
    setToast(vi ? 'Đã lưu cấu hình hệ thống' : 'System config saved')
    window.setTimeout(() => setToast(null), 2800)
  }

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Cấu hình' : 'Settings' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Cấu hình hệ thống' : 'System configuration'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? 'Bảo mật tài khoản · phiên đăng nhập · chính sách MFA'
                : 'Account security · session policy · MFA rules'}
            </p>
          </div>

          <section className="rounded-xl border border-hairline bg-surface-1 p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
              <Shield className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
              {vi ? 'Chính sách bảo mật' : 'Security policy'}
            </h2>
            <div className="space-y-3">
              <ToggleRow
                label={vi ? 'Bắt buộc MFA cho nhân viên' : 'Require MFA for staff'}
                description={
                  vi
                    ? 'Warehouse / Packing / Shipping phải bật MFA'
                    : 'Warehouse / Packing / Shipping must enable MFA'
                }
                checked={forceMfa}
                onChange={setForceMfa}
              />
              <ToggleRow
                label={
                  vi
                    ? 'Khóa tài khoản không hoạt động'
                    : 'Lock inactive accounts'
                }
                description={
                  vi
                    ? 'Tự khóa sau 30 ngày không đăng nhập'
                    : 'Auto-lock after 30 days without sign-in'
                }
                checked={lockInactive}
                onChange={setLockInactive}
              />
              <ToggleRow
                label={
                  vi
                    ? 'Đổi mật khẩu khi tạo user mới'
                    : 'Force password change on create'
                }
                description={
                  vi
                    ? 'User mới phải đổi mật khẩu lần đăng nhập đầu'
                    : 'New users must change password on first login'
                }
                checked={mustChangeOnCreate}
                onChange={setMustChangeOnCreate}
              />
              <div className="rounded-lg border border-hairline bg-canvas px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {vi ? 'Thời hạn phiên đăng nhập' : 'Session lifetime'}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {vi
                        ? 'Hết hạn JWT / bắt buộc đăng nhập lại'
                        : 'JWT expiry / force re-login'}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-primary-hover">
                    {sessionHours}h
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={24}
                  step={1}
                  value={sessionHours}
                  onChange={(e) => setSessionHours(Number(e.target.value))}
                  className="mt-3 w-full accent-[#6366F1]"
                />
                <p className="mt-1 font-mono text-[11px] text-ink-tertiary">
                  Default 8h · current={sessionHours}h
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              className="mt-4 h-9 min-h-9"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              {vi ? 'Lưu cấu hình' : 'Save config'}
            </Button>
          </section>
        </div>
      </main>

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  )
}
