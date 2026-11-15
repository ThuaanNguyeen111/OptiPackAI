import { useEffect, useState } from 'react'
import { AlertTriangle, Check, RotateCcw } from 'lucide-react'
import {
  fetchRolePermissions,
  updateRolePermissions,
  type RoleFeatureMatrix,
  type RolePermissions,
} from '../api/role-permissions.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import { FEATURE_LABELS, type Feature } from '../lib/rbac'
import { AdminToast } from '../modules/admin/components/AdminToast'
import { USER_ROLE_LABELS, UserRole } from '../types/auth'

const GROUPS: { vi: string; en: string; features: Feature[] }[] = [
  { vi: 'Bán hàng', en: 'Sales', features: ['dashboard', 'orders', 'order_groups', 'returns', 'order_sync'] },
  {
    vi: 'Vận hành kho',
    en: 'Warehouse operations',
    features: ['picking', 'inventory', 'packing', 'shipping', 'packaging_materials', 'packaging_rules'],
  },
  { vi: 'Quản lý', en: 'Management', features: ['staff', 'analytics', 'history'] },
]

function sameSet(a: readonly Feature[] = [], b: readonly Feature[] = []): boolean {
  return a.length === b.length && a.every((f) => b.includes(f))
}

function Switch({
  checked,
  changed,
  label,
  disabled,
  onChange,
}: {
  checked: boolean
  changed: boolean
  label: string
  disabled: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-surface-3'
      } ${changed ? 'ring-2 ring-amber-500/70 ring-offset-2 ring-offset-surface-1' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function AdminRolesPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [saved, setSaved] = useState<RolePermissions | null>(null)
  const [draft, setDraft] = useState<RoleFeatureMatrix>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchRolePermissions()
      .then((data) => {
        if (cancelled) return
        setSaved(data)
        setDraft(data.matrix)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  function retry() {
    setLoadError(null)
    setReloadKey((k) => k + 1)
  }

  const roles = saved?.roles ?? []
  const dirtyRoles = roles.filter((r) => !sameSet(draft[r], saved?.matrix[r]))
  const changedCells = dirtyRoles.reduce<number>((n, r) => {
    const before = saved?.matrix[r] ?? []
    const after = draft[r] ?? []
    return n + after.filter((f) => !before.includes(f)).length + before.filter((f) => !after.includes(f)).length
  }, 0)

  function toggle(role: UserRole, feature: Feature, on: boolean) {
    setSaveError(null)
    setDraft((prev) => {
      const current = prev[role] ?? []
      return { ...prev, [role]: on ? [...current, feature] : current.filter((f) => f !== feature) }
    })
  }

  function restoreDefault(role: UserRole) {
    setSaveError(null)
    setDraft((prev) => ({ ...prev, [role]: [...(saved?.defaults[role] ?? [])] }))
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    const failed = new Map<UserRole, string>()
    let latest = saved
    for (const role of dirtyRoles) {
      try {
        latest = await updateRolePermissions(role, draft[role] ?? [])
      } catch (err: unknown) {
        failed.set(role, formatApiError(err))
      }
    }
    setSaving(false)
    if (latest) {
      setSaved(latest)
      // Giữ phần chưa lưu được của role lỗi để Admin thử lại.
      setDraft((prev) => {
        const next = { ...latest.matrix }
        for (const role of failed.keys()) next[role] = prev[role]
        return next
      })
    }
    if (failed.size > 0) {
      setSaveError(
        [...failed].map(([role, msg]) => `${vi ? USER_ROLE_LABELS[role].vi : USER_ROLE_LABELS[role].en}: ${msg}`).join(' · '),
      )
    } else {
      setToast(vi ? 'Đã lưu phân quyền. Nhân viên nhận quyền mới khi tải lại trang.' : 'Permissions saved. Staff get them on next reload.')
    }
  }

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Phân quyền' : 'RBAC' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4 pb-24">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-balance text-ink">
              {vi ? 'Phân quyền theo vai trò' : 'Role-based access'}
            </h1>
            <p className="max-w-[70ch] text-sm text-ink-subtle">
              {vi
                ? 'Bật hoặc tắt từng trang cho mỗi vai trò. Trang bị tắt sẽ biến khỏi menu, không mở được bằng đường dẫn, và API của trang đó trả lỗi 403 cho vai trò ấy. Admin luôn có toàn quyền.'
                : 'Turn each page on or off per role. A page that is off disappears from the menu, cannot be opened by URL, and its API returns 403 for that role. Admin always has full access.'}
            </p>
          </div>

          {loadError ? (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 bg-surface-1 p-4">
              <p className="text-sm text-ink">
                {vi ? 'Không tải được phân quyền: ' : 'Could not load permissions: '}
                {loadError}
              </p>
              <Button variant="secondary" onClick={retry}>
                {vi ? 'Thử lại' : 'Retry'}
              </Button>
            </section>
          ) : !saved ? (
            <section className="rounded-xl border border-hairline bg-surface-1 p-6 text-sm text-ink-subtle" aria-busy="true">
              {vi ? 'Đang tải phân quyền…' : 'Loading permissions…'}
            </section>
          ) : (
            <section className="rounded-xl border border-hairline bg-surface-1 p-2 sm:p-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-hairline align-bottom text-ink-subtle">
                      <th scope="col" className="px-3 py-3 font-medium">
                        {vi ? 'Trang' : 'Page'}
                      </th>
                      {roles.map((role) => {
                        const offDefault = !sameSet(draft[role], saved.defaults[role])
                        const empty = (draft[role] ?? []).length === 0
                        return (
                          <th key={role} scope="col" className="px-3 py-3 text-center font-medium">
                            <span className="block text-ink">
                              {vi ? USER_ROLE_LABELS[role].vi : USER_ROLE_LABELS[role].en}
                            </span>
                            {offDefault ? (
                              <button
                                type="button"
                                onClick={() => restoreDefault(role)}
                                disabled={saving}
                                className="mt-1 inline-flex items-center gap-1 rounded text-[11px] font-normal text-primary-hover underline-offset-2 hover:underline disabled:opacity-50"
                              >
                                <RotateCcw className="h-3 w-3" strokeWidth={2} />
                                {vi ? 'Về mặc định' : 'Reset to default'}
                              </button>
                            ) : (
                              <span className="mt-1 block text-[11px] font-normal text-ink-tertiary">
                                {vi ? 'Mặc định' : 'Default'}
                              </span>
                            )}
                            {empty ? (
                              <span className="mt-1 flex items-center justify-center gap-1 text-[11px] font-normal text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                                {vi ? 'Chỉ còn trang hồ sơ' : 'Profile only'}
                              </span>
                            ) : null}
                          </th>
                        )
                      })}
                      <th scope="col" className="px-3 py-3 text-center font-medium">
                        <span className="block text-ink">
                          {vi ? USER_ROLE_LABELS[UserRole.ADMIN].vi : USER_ROLE_LABELS[UserRole.ADMIN].en}
                        </span>
                        <span className="mt-1 block text-[11px] font-normal text-ink-tertiary">
                          {vi ? 'Luôn toàn quyền' : 'Always full'}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  {GROUPS.map((group) => (
                    <tbody key={group.en}>
                      <tr>
                        <th
                          scope="colgroup"
                          colSpan={roles.length + 2}
                          className="px-3 pt-5 pb-2 text-xs font-semibold text-ink-subtle"
                        >
                          {vi ? group.vi : group.en}
                        </th>
                      </tr>
                      {group.features.map((feature) => {
                        const label = vi ? FEATURE_LABELS[feature].vi : FEATURE_LABELS[feature].en
                        return (
                          <tr key={feature} className="border-t border-hairline/70 hover:bg-surface-2/40">
                            <th scope="row" className="px-3 py-2.5 font-normal text-ink">
                              {label}
                            </th>
                            {roles.map((role) => {
                              const on = (draft[role] ?? []).includes(feature)
                              const wasOn = (saved.matrix[role] ?? []).includes(feature)
                              const roleLabel = vi ? USER_ROLE_LABELS[role].vi : USER_ROLE_LABELS[role].en
                              return (
                                <td key={role} className="px-3 py-2.5 text-center">
                                  <span className="inline-flex">
                                    <Switch
                                      checked={on}
                                      changed={on !== wasOn}
                                      disabled={saving}
                                      label={`${label} — ${roleLabel}`}
                                      onChange={(next) => toggle(role, feature, next)}
                                    />
                                  </span>
                                </td>
                              )
                            })}
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-success"
                                aria-label={vi ? 'Admin: có quyền' : 'Admin: allowed'}
                              >
                                <Check className="h-4 w-4" strokeWidth={2.5} />
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            </section>
          )}
        </div>
      </main>

      {dirtyRoles.length > 0 || saveError ? (
        <div className="sticky bottom-0 z-20 border-t border-hairline bg-surface-1/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className={`text-sm ${saveError ? 'text-error' : 'text-ink'}`} role={saveError ? 'alert' : 'status'}>
              {saveError
                ? `${vi ? 'Chưa lưu được — ' : 'Not saved — '}${saveError}`
                : vi
                  ? `${String(changedCells)} thay đổi chưa lưu`
                  : `${String(changedCells)} unsaved change${changedCells === 1 ? '' : 's'}`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={saving || dirtyRoles.length === 0}
                onClick={() => {
                  setSaveError(null)
                  if (saved) setDraft(saved.matrix)
                }}
              >
                {vi ? 'Hoàn tác' : 'Discard'}
              </Button>
              <Button disabled={saving || dirtyRoles.length === 0} onClick={() => void save()}>
                {saving ? (vi ? 'Đang lưu…' : 'Saving…') : vi ? 'Lưu thay đổi' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <AdminToast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  )
}
