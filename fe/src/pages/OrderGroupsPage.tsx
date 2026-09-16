import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Zap } from 'lucide-react'
import {
  listOrderGroups,
  setOrderGroupPriority,
} from '../api/order-groups.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import {
  GROUP_FULFILLMENT_STATUS_LABELS,
  type OrderGroup,
  type OrderPriority,
} from '../types/order-groups'
import { formatDateTime } from '../utils/format'

function statusLabel(status: string, vi: boolean): string {
  const known = GROUP_FULFILLMENT_STATUS_LABELS[status]
  if (!known) return status
  return vi ? known.vi : known.en
}

export function OrderGroupsPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  const [priorityFilter, setPriorityFilter] = useState<
    'all' | OrderPriority
  >('all')
  const [groups, setGroups] = useState<OrderGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderGroup | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deadlineHours, setDeadlineHours] = useState('4')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listOrderGroups(
        priorityFilter === 'all'
          ? {}
          : { order_priority: priorityFilter },
      )
      setGroups(rows)
      setSelectedId((prev) => {
        if (prev && rows.some((g) => g.id === prev)) return prev
        return rows[0]?.id ?? null
      })
    } catch (err: unknown) {
      setError(formatApiError(err))
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [priorityFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 150)
    return () => window.clearTimeout(timer)
  }, [load])

  // Dùng bản ghi từ list — tránh GET /order-groups/:id mỗi lần chọn (rate-limit).
  useEffect(() => {
    if (!selectedId) {
      const clearId = window.setTimeout(() => setDetail(null), 0)
      return () => window.clearTimeout(clearId)
    }
    const fromList = groups.find((g) => g.id === selectedId) ?? null
    const timer = window.setTimeout(() => {
      setDetail(fromList)
      setDetailLoading(false)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [selectedId, groups])

  async function applyPriority(priority: OrderPriority): Promise<void> {
    if (!detail) return
    setBusy(true)
    setActionError(null)
    try {
      const hours = Number(deadlineHours)
      const updated = await setOrderGroupPriority(detail.id, {
        order_priority: priority,
        ...(priority === 'express' && Number.isFinite(hours) && hours >= 1
          ? { deadline_hours: Math.floor(hours) }
          : {}),
      })
      setDetail(updated)
      setGroups((prev) =>
        prev.map((g) => (g.id === updated.id ? updated : g)),
      )
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Nhóm đơn & Hỏa tốc' : 'Order groups & Express' },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">
              {vi ? 'Nhóm đơn (Order Groups)' : 'Order Groups'}
            </h1>
            <p className="mt-0.5 text-sm text-ink-subtle">
              {vi
                ? 'Theo dõi fulfillment và đánh dấu đơn Hỏa tốc (PATCH priority).'
                : 'Track fulfillment and mark Express priority.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value as 'all' | OrderPriority)
              }
              className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
            >
              <option value="all">{vi ? 'Mọi mức ưu tiên' : 'All priorities'}</option>
              <option value="express">{vi ? 'Hỏa tốc' : 'Express'}</option>
              <option value="normal">{vi ? 'Thường' : 'Normal'}</option>
            </select>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {vi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_minmax(280px,380px)]">
          <section className="min-h-0 overflow-auto rounded-xl border border-hairline bg-surface">
            {loading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {vi ? 'Đang tải…' : 'Loading…'}
              </div>
            ) : error ? (
              <p className="p-4 text-sm text-rose-600">{error}</p>
            ) : groups.length === 0 ? (
              <p className="p-4 text-sm text-ink-subtle">
                {vi ? 'Chưa có nhóm đơn.' : 'No order groups yet.'}
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-hairline bg-surface-2 text-xs text-ink-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">
                      {vi ? 'Trạng thái' : 'Status'}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {vi ? 'Ưu tiên' : 'Priority'}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {vi ? 'Số đơn' : 'Orders'}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {vi ? 'Cập nhật' : 'Updated'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {groups.map((g) => (
                    <tr
                      key={g.id}
                      onClick={() => setSelectedId(g.id)}
                      className={`cursor-pointer ${
                        selectedId === g.id ? 'bg-primary/10' : 'hover:bg-surface-2'
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        …{g.id.slice(-8)}
                        {g.isOverdue ? (
                          <span className="ml-1 text-rose-600">!</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {statusLabel(g.fulfillmentStatus, vi)}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {g.orderPriority === 'express' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                            <Zap className="h-3 w-3" />
                            express
                          </span>
                        ) : (
                          g.orderPriority
                        )}
                      </td>
                      <td className="px-3 py-2">{g.orderCount}</td>
                      <td className="px-3 py-2 text-xs text-ink-muted">
                        {formatDateTime(
                          typeof g.updatedAt === 'string'
                            ? g.updatedAt
                            : new Date(g.updatedAt).toISOString(),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <aside className="min-h-0 overflow-y-auto rounded-xl border border-hairline bg-surface p-4">
            <h2 className="text-sm font-semibold text-ink">
              {vi ? 'Chi tiết & Hỏa tốc' : 'Detail & Express'}
            </h2>
            {detailLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : !detail ? (
              <p className="mt-3 text-sm text-ink-subtle">
                {vi ? 'Chọn một dòng bên trái.' : 'Select a row.'}
              </p>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <p className="break-all font-mono text-xs text-ink">{detail.id}</p>
                <p>
                  <span className="text-ink-subtle">{vi ? 'Trạng thái: ' : 'Status: '}</span>
                  {statusLabel(detail.fulfillmentStatus, vi)}
                </p>
                <p>
                  <span className="text-ink-subtle">Version: </span>
                  {detail.version}
                </p>
                <p>
                  <span className="text-ink-subtle">
                    {vi ? 'Hạn đóng gói: ' : 'Deadline: '}
                  </span>
                  {detail.packagingDeadline
                    ? formatDateTime(
                        typeof detail.packagingDeadline === 'string'
                          ? detail.packagingDeadline
                          : new Date(detail.packagingDeadline).toISOString(),
                      )
                    : '—'}
                </p>

                <label className="block">
                  <span className="text-ink-subtle">
                    {vi
                      ? 'Giờ hành chính khi đặt Hỏa tốc'
                      : 'Business hours for Express'}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={deadlineHours}
                    onChange={(e) => setDeadlineHours(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                  />
                </label>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy || detail.orderPriority === 'express'}
                    onClick={() => void applyPriority('express')}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {vi ? 'Đặt Hỏa tốc' : 'Set Express'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || detail.orderPriority === 'normal'}
                    onClick={() => void applyPriority('normal')}
                    className="rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                  >
                    {vi ? 'Về thường' : 'Set Normal'}
                  </button>
                </div>
                {actionError ? (
                  <p className="text-sm text-rose-600">{actionError}</p>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
