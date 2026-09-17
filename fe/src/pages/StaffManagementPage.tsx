import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search, Users } from 'lucide-react'
import { fetchUsers } from '../api/users.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import type { AdminUser } from '../types/admin'
import { USER_ROLE_LABELS, UserRole, type UserRole as Role } from '../types/auth'
import { formatDateTime } from '../utils/format'

const ROLE_FILTERS: Array<{ value: 'all' | Role; labelVi: string; labelEn: string }> = [
  { value: 'all', labelVi: 'Tất cả vai trò', labelEn: 'All roles' },
  {
    value: UserRole.WAREHOUSE_STAFF,
    labelVi: USER_ROLE_LABELS[UserRole.WAREHOUSE_STAFF].vi,
    labelEn: USER_ROLE_LABELS[UserRole.WAREHOUSE_STAFF].en,
  },
  {
    value: UserRole.PACKAGING_STAFF,
    labelVi: USER_ROLE_LABELS[UserRole.PACKAGING_STAFF].vi,
    labelEn: USER_ROLE_LABELS[UserRole.PACKAGING_STAFF].en,
  },
  {
    value: UserRole.SHIPPING_COORDINATOR,
    labelVi: USER_ROLE_LABELS[UserRole.SHIPPING_COORDINATOR].vi,
    labelEn: USER_ROLE_LABELS[UserRole.SHIPPING_COORDINATOR].en,
  },
  {
    value: UserRole.STORE_OWNER,
    labelVi: USER_ROLE_LABELS[UserRole.STORE_OWNER].vi,
    labelEn: USER_ROLE_LABELS[UserRole.STORE_OWNER].en,
  },
  {
    value: UserRole.ADMIN,
    labelVi: USER_ROLE_LABELS[UserRole.ADMIN].vi,
    labelEn: USER_ROLE_LABELS[UserRole.ADMIN].en,
  },
]

/**
 * Store Owner chỉ được GET /users (xem danh sách) — không tạo/sửa/xóa.
 * CRUD nhân viên thuộc Admin (`/app/admin`).
 */
export function StaffManagementPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchUsers({
        page,
        limit: 50,
        ...(roleFilter === 'all' ? {} : { role: roleFilter }),
      })
      setUsers(res.users)
      setTotal(res.total)
    } catch (err: unknown) {
      setError(formatApiError(err))
      setUsers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, roleFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.employeeCode?.toLowerCase().includes(q) ?? false) ||
        (u.phone?.includes(q) ?? false),
    )
  }, [users, searchQuery])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Nhân viên' : 'Staff directory' },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <Users className="h-5 w-5 text-primary" />
              {vi ? 'Danh sách nhân viên' : 'Staff directory'}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-ink-subtle">
              {vi
                ? 'Chỉ xem (GET /users). Tạo/sửa/xóa tài khoản do Admin thực hiện.'
                : 'Read-only (GET /users). Create/edit/deactivate is Admin-only.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {vi ? 'Tải lại' : 'Refresh'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={vi ? 'Tìm tên, email, mã NV…' : 'Search name, email, code…'}
              className="w-full rounded-lg border border-hairline bg-surface py-2 pr-3 pl-9 text-sm"
            />
          </div>
          <select
            value={roleFilter === 'all' ? 'all' : String(roleFilter)}
            onChange={(e) => {
              setPage(1)
              const v = e.target.value
              setRoleFilter(v === 'all' ? 'all' : (Number(v) as Role))
            }}
            className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
          >
            {ROLE_FILTERS.map((opt) => (
              <option
                key={String(opt.value)}
                value={opt.value === 'all' ? 'all' : String(opt.value)}
              >
                {vi ? opt.labelVi : opt.labelEn}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-hairline bg-surface">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {vi ? 'Đang tải…' : 'Loading…'}
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-rose-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-ink-subtle">
              {vi ? 'Không có nhân viên khớp bộ lọc.' : 'No staff match filters.'}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-hairline bg-surface-2 text-xs text-ink-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{vi ? 'Họ tên' : 'Name'}</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">{vi ? 'Vai trò' : 'Role'}</th>
                  <th className="px-4 py-2.5 font-medium">{vi ? 'Mã NV' : 'Code'}</th>
                  <th className="px-4 py-2.5 font-medium">{vi ? 'Trạng thái' : 'Status'}</th>
                  <th className="px-4 py-2.5 font-medium">
                    {vi ? 'Đăng nhập gần nhất' : 'Last login'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-2/80">
                    <td className="px-4 py-2.5 font-medium text-ink">{u.name}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{u.email}</td>
                    <td className="px-4 py-2.5">
                      {USER_ROLE_LABELS[u.role as Role]
                        ? vi
                          ? USER_ROLE_LABELS[u.role as Role].vi
                          : USER_ROLE_LABELS[u.role as Role].en
                        : u.role}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {u.employeeCode ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          u.active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                            : 'bg-surface-3 text-ink-muted'
                        }`}
                      >
                        {u.active
                          ? vi
                            ? 'Đang hoạt động'
                            : 'Active'
                          : vi
                            ? 'Ngưng'
                            : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-ink-subtle">
          <span>
            {vi ? `Tổng ${total} tài khoản` : `${total} accounts`}
            {searchQuery.trim()
              ? vi
                ? ` · hiện ${filtered.length} sau lọc cục bộ`
                : ` · showing ${filtered.length} after local filter`
              : ''}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-hairline px-2 py-1 disabled:opacity-40"
            >
              ←
            </button>
            <span className="px-1 py-1">
              {vi ? 'Trang' : 'Page'} {page}
            </span>
            <button
              type="button"
              disabled={loading || page * 50 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-hairline px-2 py-1 disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
