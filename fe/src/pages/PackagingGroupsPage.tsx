import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Loader2, Zap } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { listOrderGroups } from '../api/packaging.api'
import { formatApiError } from '../lib/api'
import { FULFILLMENT_STATUS_LABELS, type OrderGroupSummary } from '../types/packaging'

/** Các trạng thái có việc đóng gói: tính phương án → duyệt → đóng → đã đóng. */
const PACKAGING_STATUSES = ['picked', 'pending_approval', 'approved_for_packing', 'packed'] as const

/**
 * /app/packing/groups — danh sách nhóm đơn đã lấy hàng xong, vào từng
 * nhóm để xem kế hoạch đóng gói 3D (dữ liệu thật từ API).
 */
export function PackagingGroupsPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [groups, setGroups] = useState<OrderGroupSummary[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listOrderGroups()
      .then((all) => {
        if (!cancelled) {
          setGroups(all.filter((g) => (PACKAGING_STATUSES as readonly string[]).includes(g.fulfillmentStatus)))
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = filter === 'all' ? groups : groups.filter((g) => g.fulfillmentStatus === filter)
  const label = (status: string) => {
    const l = FULFILLMENT_STATUS_LABELS[status]
    return l ? (vi ? l.vi : l.en) : status
  }

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Kế hoạch đóng gói' : 'Packaging plans' },
        ]}
      />
      <main className="flex-1 overflow-y-auto bg-[#F9FAFB] dark:bg-[#0B0E14]">
        <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap gap-2">
            {['all', ...PACKAGING_STATUSES].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setFilter(status)
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  filter === status
                    ? 'border-[#2563eb] bg-blue-50 text-[#1d4ed8] dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {status === 'all' ? (vi ? 'Tất cả' : 'All') : label(status)}
                {status !== 'all' && (
                  <span className="ml-1 text-slate-400">
                    {groups.filter((g) => g.fulfillmentStatus === status).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1">
            {loading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {vi ? 'Đang tải…' : 'Loading…'}
              </div>
            ) : visible.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                {vi
                  ? 'Chưa có nhóm đơn nào ở bước đóng gói (cần lấy hàng xong trước).'
                  : 'No order groups in the packaging stage yet (picking must finish first).'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((g) => (
                  <li key={g.id}>
                    <Link
                      to={`/app/packing/groups/${g.id}`}
                      className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="font-mono text-xs text-slate-500">…{g.id.slice(-8)}</span>
                      <span className="text-slate-700 dark:text-slate-200">
                        {g.orderCount} {vi ? 'đơn' : 'orders'}
                      </span>
                      {g.orderPriority === 'express' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                          <Zap className="h-3 w-3" />
                          {vi ? 'Hỏa tốc' : 'Express'}
                        </span>
                      )}
                      <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {label(g.fulfillmentStatus)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
