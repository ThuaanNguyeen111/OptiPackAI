import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Clock3,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  Zap,
} from 'lucide-react'
import {
  listOrderGroups,
  setOrderGroupPriority,
} from '../api/order-groups.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { cn } from '../lib/cn'
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

function statusTone(
  status: string,
): 'default' | 'primary' | 'success' | 'warning' {
  if (
    status === 'delivered' ||
    status === 'packed' ||
    status === 'shipped'
  ) {
    return 'success'
  }
  if (
    status === 'partial_needs_review' ||
    status === 'pending_approval' ||
    status === 'awaiting_packaging'
  ) {
    return 'warning'
  }
  if (status === 'picking' || status === 'picked' || status === 'approved_for_packing') {
    return 'primary'
  }
  return 'default'
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : new Date(value).toISOString()
}

function shortId(id: string): string {
  return id.length > 8 ? `…${id.slice(-8)}` : id
}

function platformLabel(platform: string): string {
  const p = platform.toLowerCase()
  if (p === 'lazada') return 'Lazada'
  if (p === 'tiktok') return 'TikTok'
  if (p === 'tiki') return 'Tiki'
  return platform
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
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
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

  useEffect(() => {
    if (!selectedId) {
      const clearId = window.setTimeout(() => setDetail(null), 0)
      return () => window.clearTimeout(clearId)
    }
    const fromList = groups.find((g) => g.id === selectedId) ?? null
    const timer = window.setTimeout(() => {
      setDetail(fromList)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [selectedId, groups])

  const stats = useMemo(() => {
    const express = groups.filter((g) => g.orderPriority === 'express').length
    const overdue = groups.filter((g) => g.isOverdue).length
    const normal = groups.length - express
    return { total: groups.length, express, normal, overdue }
  }, [groups])

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
      setToast(
        priority === 'express'
          ? vi
            ? 'Đã đánh dấu Hỏa tốc.'
            : 'Marked as Express.'
          : vi
            ? 'Đã chuyển về đơn thường.'
            : 'Set back to Normal.',
      )
      window.setTimeout(() => setToast(null), 2800)
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const filterChips: Array<{
    value: 'all' | OrderPriority
    label: string
    icon: typeof Layers
  }> = [
    {
      value: 'all',
      label: vi ? `Tất cả (${stats.total})` : `All (${stats.total})`,
      icon: Layers,
    },
    {
      value: 'express',
      label: vi ? `Hỏa tốc (${stats.express})` : `Express (${stats.express})`,
      icon: Zap,
    },
    {
      value: 'normal',
      label: vi ? `Thường (${stats.normal})` : `Normal (${stats.normal})`,
      icon: Package,
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Nhóm đơn & Hỏa tốc' : 'Order groups & Express' },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-canvas p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Nhóm đơn & Hỏa tốc' : 'Order groups & Express'}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-subtle">
              {vi
                ? 'Xem tiến độ xử lý theo từng nhóm đơn. Đánh dấu Hỏa tốc để hệ thống tính hạn đóng gói theo giờ hành chính (8h–17h).'
                : 'Track processing progress by order group. Mark Express so the system sets a packaging deadline in business hours (8–17).'}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-9 shrink-0 gap-1.5 text-xs"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {vi ? 'Tải lại' : 'Refresh'}
          </Button>
        </div>

        {/* Stats + filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted">
              <Layers className="h-3 w-3" />
              {vi ? `${stats.total} nhóm` : `${stats.total} groups`}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
              <Zap className="h-3 w-3" />
              {vi ? `${stats.express} hỏa tốc` : `${stats.express} express`}
            </span>
            {stats.overdue > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                <AlertTriangle className="h-3 w-3" />
                {vi ? `${stats.overdue} quá hạn` : `${stats.overdue} overdue`}
              </span>
            ) : null}
          </div>

          <div className="ml-auto flex flex-wrap gap-1.5 rounded-lg border border-hairline bg-surface-2/80 p-1">
            {filterChips.map((chip) => {
              const Icon = chip.icon
              const active = priorityFilter === chip.value
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setPriorityFilter(chip.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-surface text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          {/* Table */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <p className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">
                {vi ? 'Danh sách nhóm' : 'Group list'}
              </p>
              <p className="text-[11px] text-ink-subtle">
                {vi ? 'Chọn dòng để đặt Hỏa tốc' : 'Select a row to set Express'}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {vi ? 'Đang tải nhóm đơn…' : 'Loading order groups…'}
                </div>
              ) : error ? (
                <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                  {error}
                </div>
              ) : groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-subtle">
                    <Package className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-ink">
                    {vi ? 'Chưa có nhóm đơn' : 'No order groups yet'}
                  </p>
                  <p className="max-w-sm text-xs text-ink-subtle">
                    {vi
                      ? 'Nhóm được tạo khi hệ thống backfill/gộp đơn. Đổi bộ lọc hoặc tải lại sau khi sync đơn Lazada.'
                      : 'Groups appear after backfill/consolidation. Change filter or refresh after Lazada sync.'}
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[640px] text-center text-sm">
                  <thead className="sticky top-0 z-10 border-b border-hairline bg-surface-2/95 backdrop-blur">
                    <tr className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                      <th className="px-4 py-3">{vi ? 'Nhóm' : 'Group'}</th>
                      <th className="px-3 py-3">{vi ? 'Kênh' : 'Channel'}</th>
                      <th className="px-3 py-3">{vi ? 'Trạng thái' : 'Status'}</th>
                      <th className="px-3 py-3">{vi ? 'Ưu tiên' : 'Priority'}</th>
                      <th className="px-3 py-3">{vi ? 'Số đơn' : 'Orders'}</th>
                      <th className="px-4 py-3">{vi ? 'Cập nhật' : 'Updated'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {groups.map((g) => {
                      const selected = selectedId === g.id
                      const updated = toIso(g.updatedAt)
                      return (
                        <tr
                          key={g.id}
                          onClick={() => setSelectedId(g.id)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            selected
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/30'
                              : 'hover:bg-surface-2/80',
                          )}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                {shortId(g.id)}
                              </span>
                              {g.isOverdue ? (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-200"
                                  title={vi ? 'Quá hạn SLA' : 'SLA overdue'}
                                >
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  {vi ? 'Quá hạn' : 'Overdue'}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-center">
                              <span className="inline-flex rounded-full border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                                {platformLabel(g.platform)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-center">
                              <Badge tone={statusTone(g.fulfillmentStatus)}>
                                {statusLabel(g.fulfillmentStatus, vi)}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-center">
                              {g.orderPriority === 'express' ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
                                  <Zap className="h-3 w-3 fill-amber-500" />
                                  {vi ? 'Hỏa tốc' : 'Express'}
                                </span>
                              ) : (
                                <span className="text-xs text-ink-muted">
                                  {vi ? 'Thường' : 'Normal'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs tabular-nums text-ink">
                            {g.orderCount}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] whitespace-nowrap text-ink-muted">
                            {updated ? formatDateTime(updated) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Detail panel */}
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-sm">
            <div className="border-b border-hairline bg-gradient-to-r from-amber-50/80 to-transparent px-4 py-3 dark:from-amber-950/30">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  <Zap className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-ink">
                    {vi ? 'Chi tiết & Hỏa tốc' : 'Detail & Express'}
                  </h2>
                  <p className="text-[11px] text-ink-subtle">
                    {vi
                      ? 'Chỉ Store Owner / Admin đặt tay'
                      : 'Store Owner / Admin mark manually'}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!detail ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <Layers className="h-8 w-8 text-ink-subtle/50" />
                  <p className="text-sm text-ink-subtle">
                    {vi
                      ? 'Chọn một nhóm bên trái để xem và đặt ưu tiên.'
                      : 'Select a group on the left to view and set priority.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold tracking-wider text-ink-subtle uppercase">
                      {vi ? 'Mã nhóm' : 'Group ID'}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-ink">
                      {detail.id}
                    </p>
                  </div>

                  <dl className="grid gap-3 rounded-lg border border-hairline bg-canvas/60 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-ink-subtle">{vi ? 'Kênh' : 'Channel'}</dt>
                      <dd className="font-medium text-ink">
                        {platformLabel(detail.platform)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-ink-subtle">
                        {vi ? 'Trạng thái' : 'Status'}
                      </dt>
                      <dd>
                        <Badge tone={statusTone(detail.fulfillmentStatus)}>
                          {statusLabel(detail.fulfillmentStatus, vi)}
                        </Badge>
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-ink-subtle">
                        {vi ? 'Ưu tiên' : 'Priority'}
                      </dt>
                      <dd>
                        {detail.orderPriority === 'express' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                            <Zap className="h-3.5 w-3.5 fill-amber-500" />
                            {vi ? 'Hỏa tốc' : 'Express'}
                          </span>
                        ) : (
                          <span className="text-ink">{vi ? 'Thường' : 'Normal'}</span>
                        )}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <dt className="text-ink-subtle">
                        {vi ? 'Số đơn trong nhóm' : 'Orders in group'}
                      </dt>
                      <dd className="font-mono tabular-nums text-ink">
                        {detail.orderCount}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <dt className="inline-flex items-center gap-1 text-ink-subtle">
                        <Clock3 className="h-3.5 w-3.5" />
                        {vi ? 'Hạn đóng gói' : 'Deadline'}
                      </dt>
                      <dd
                        className={cn(
                          'text-right text-xs',
                          detail.isOverdue
                            ? 'font-semibold text-rose-600'
                            : 'text-ink',
                        )}
                      >
                        {toIso(detail.packagingDeadline)
                          ? formatDateTime(toIso(detail.packagingDeadline)!)
                          : '—'}
                        {detail.isOverdue ? (
                          <span className="mt-0.5 block text-[10px]">
                            {vi ? 'Đã quá hạn SLA' : 'SLA breached'}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  </dl>

                  <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <label className="block text-xs font-medium text-amber-950 dark:text-amber-100">
                      {vi
                        ? 'Số giờ hành chính khi đặt Hỏa tốc'
                        : 'Business hours when setting Express'}
                    </label>
                    <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-200/70">
                      {vi
                        ? 'Mặc định 4h · khung 8h–17h, tính cả Thứ 7'
                        : 'Default 4h · 8–17, includes Saturday'}
                    </p>
                    <input
                      type="number"
                      min={1}
                      value={deadlineHours}
                      onChange={(e) => setDeadlineHours(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-amber-200/80 bg-white px-3 py-2 text-sm text-ink dark:border-amber-800 dark:bg-zinc-900"
                    />

                    <div className="mt-3 flex flex-col gap-2">
                      <Button
                        type="button"
                        className="h-9 w-full gap-1.5 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                        disabled={busy || detail.orderPriority === 'express'}
                        onClick={() => void applyPriority('express')}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                        {vi ? 'Đặt Hỏa tốc' : 'Set Express'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 w-full"
                        disabled={busy || detail.orderPriority === 'normal'}
                        onClick={() => void applyPriority('normal')}
                      >
                        {vi ? 'Chuyển về thường' : 'Set Normal'}
                      </Button>
                    </div>
                  </div>

                  {actionError ? (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                      {actionError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
