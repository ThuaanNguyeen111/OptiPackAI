import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Clock3,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react'
import {
  getOrderGroupById,
  listOrderGroups,
  setOrderGroupPriority,
} from '../api/order-groups.api'
import {
  getOrderGroupTimeline,
  historyShippingLine,
  type HistoryItem,
} from '../api/history.api'
import {
  getPackagingMaterialsSavings,
  type PackagingMaterialsSavings,
} from '../api/packaging-materials.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { cn } from '../lib/cn'
import { formatApiError } from '../lib/api'
import {
  GROUP_FULFILLMENT_STATUS_LABELS,
  isFullyInactiveGroup,
  isPartiallyCanceledGroup,
  type OrderGroup,
  type OrderPriority,
} from '../types/order-groups'
import { formatDateTime } from '../utils/format'
import { useLocalQueuePagination } from '../hooks/useLocalQueuePagination'
import { QueuePaginationBar } from '../components/ui/QueuePaginationBar'
import { GroupOpsPanel } from './order-groups/GroupOpsPanel'
import { UserRole } from '../types/auth'

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
    status === 'returning' ||
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

/** Hiển thị đuôi ObjectId dạng mono, không dùng dấu … (dễ đọc hơn). */
function shortId(id: string): string {
  return id.length > 10 ? id.slice(-10) : id
}

function groupMatchesSearch(group: OrderGroup, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const parts = [
    group.id,
    group.id.slice(-8),
    group.platform,
    group.shopId,
    ...group.recipientNames,
    ...group.orders.flatMap((order) => [
      order.id,
      order.platformOrderId,
      order.recipientName,
      order.recipientPhone,
    ]),
  ]
  return parts.some((part) => part.toLowerCase().includes(q))
}

function RegroupLinkChips({
  group,
  vi,
  onOpen,
}: {
  group: OrderGroup
  vi: boolean
  onOpen: (id: string) => void
}) {
  return (
    <>
      {group.hasMaskedRecipientName ? (
        <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
          {vi ? 'Tên bị che' : 'Masked name'}
        </span>
      ) : null}
      {group.mergedIntoGroupId ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpen(group.mergedIntoGroupId as string)
          }}
          className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          {vi
            ? `Đã gộp vào ${group.mergedIntoGroupId.slice(-8)}`
            : `Merged into ${group.mergedIntoGroupId.slice(-8)}`}
        </button>
      ) : null}
      {group.splitFromGroupId ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpen(group.splitFromGroupId as string)
          }}
          className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          {vi
            ? `Tách từ ${group.splitFromGroupId.slice(-8)}`
            : `Split from ${group.splitFromGroupId.slice(-8)}`}
        </button>
      ) : null}
    </>
  )
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
  const { session } = useAuth()
  const vi = locale === 'vi'
  const role = session?.role
  const canLink =
    role === UserRole.ADMIN || role === UserRole.SHIPPING_COORDINATOR
  const canRegroupRoles =
    role === UserRole.ADMIN ||
    role === UserRole.SHIPPING_COORDINATOR ||
    role === UserRole.STORE_OWNER
  const canSeeStock =
    role === UserRole.ADMIN ||
    role === UserRole.STORE_OWNER ||
    role === UserRole.WAREHOUSE_STAFF
  const canRecheck =
    role === UserRole.ADMIN || role === UserRole.STORE_OWNER
  const canRelease = role === UserRole.ADMIN

  const [priorityFilter, setPriorityFilter] = useState<
    'all' | OrderPriority
  >('all')
  const [shortageOnly, setShortageOnly] = useState(false)
  const [groups, setGroups] = useState<OrderGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderGroup | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [deadlineHours, setDeadlineHours] = useState('4')
  const [savings, setSavings] = useState<PackagingMaterialsSavings | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [remoteGroups, setRemoteGroups] = useState<OrderGroup[] | null>(null)
  const [remoteSearching, setRemoteSearching] = useState(false)
  const [inlineTimeline, setInlineTimeline] = useState<HistoryItem[]>([])
  const [inlineTimelineLoading, setInlineTimelineLoading] = useState(false)
  const [inlineTimelineOpen, setInlineTimelineOpen] = useState(false)
  const [timelineTick, setTimelineTick] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listOrderGroups({
        ...(priorityFilter === 'all'
          ? {}
          : { order_priority: priorityFilter }),
        ...(shortageOnly ? { stock_shortage: true } : {}),
      })
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
  }, [priorityFilter, shortageOnly])

  useEffect(() => {
    let cancelled = false
    void getPackagingMaterialsSavings()
      .then((data) => {
        if (!cancelled) setSavings(data)
      })
      .catch(() => {
        if (!cancelled) setSavings(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    const fromList =
      groups.find((g) => g.id === selectedId) ??
      remoteGroups?.find((g) => g.id === selectedId) ??
      null
    let cancelled = false
    let gotFull = false
    const timer = window.setTimeout(() => {
      if (!cancelled && !gotFull) setDetail(fromList)
    }, 0)
    void getOrderGroupById(selectedId)
      .then((full) => {
        gotFull = true
        if (!cancelled) setDetail(full)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [selectedId, groups, remoteGroups])

  useEffect(() => {
    if (!inlineTimelineOpen || !selectedId) {
      const clear = window.setTimeout(() => setInlineTimeline([]), 0)
      return () => window.clearTimeout(clear)
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setInlineTimelineLoading(true)
      void getOrderGroupTimeline(selectedId)
        .then((res) => {
          if (!cancelled) setInlineTimeline(res.items)
        })
        .catch(() => {
          if (!cancelled) setInlineTimeline([])
        })
        .finally(() => {
          if (!cancelled) setInlineTimelineLoading(false)
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [inlineTimelineOpen, selectedId, timelineTick])

  const stats = useMemo(() => {
    const express = groups.filter((g) => g.orderPriority === 'express').length
    const overdue = groups.filter((g) => g.isOverdue).length
    const shortage = groups.filter((g) => g.stockShortage).length
    const normal = groups.length - express
    return { total: groups.length, express, normal, overdue, shortage }
  }, [groups])

  /** Chỉ sắp xếp hiển thị: quá hạn / thiếu hàng / hỏa tốc lên đầu — không đổi state `groups`. */
  const displayGroups = useMemo(() => {
    const base = searchQuery.trim()
      ? groups
      : groups.filter((group) => !group.mergedIntoGroupId)
    return [...base].sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
      if (a.stockShortage !== b.stockShortage) return a.stockShortage ? -1 : 1
      const aExpress = a.orderPriority === 'express' ? 1 : 0
      const bExpress = b.orderPriority === 'express' ? 1 : 0
      if (aExpress !== bExpress) return bExpress - aExpress
      return 0
    })
  }, [groups, searchQuery])

  const localVisibleGroups = useMemo(() => {
    if (!searchQuery.trim()) return displayGroups
    return displayGroups.filter((g) => groupMatchesSearch(g, searchQuery))
  }, [displayGroups, searchQuery])
  const visibleGroups =
    remoteGroups && localVisibleGroups.length === 0
      ? remoteGroups
      : localVisibleGroups
  const queuePaging = useLocalQueuePagination(visibleGroups)

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 4 || localVisibleGroups.length > 0) {
      const clear = window.setTimeout(() => setRemoteGroups(null), 0)
      return () => window.clearTimeout(clear)
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setRemoteSearching(true)
      void listOrderGroups({
        q: query,
        ...(priorityFilter === 'all'
          ? {}
          : { order_priority: priorityFilter }),
        ...(shortageOnly ? { stock_shortage: true } : {}),
      })
        .then((rows) => {
          if (!cancelled) setRemoteGroups(rows)
        })
        .catch(() => {
          if (!cancelled) setRemoteGroups([])
        })
        .finally(() => {
          if (!cancelled) setRemoteSearching(false)
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery, localVisibleGroups.length, priorityFilter, shortageOnly])

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
                ? 'Tiến độ từng nhóm đơn. Đơn đánh dấu Hỏa tốc có hạn đóng gói tính theo giờ hành chính 8h–17h.'
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
            <button
              type="button"
              onClick={() => setShortageOnly((current) => !current)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                shortageOnly
                  ? 'border-orange-400 bg-orange-100 text-orange-900'
                  : 'border-hairline bg-surface text-ink-muted',
              )}
            >
              {vi ? 'Chỉ nhóm thiếu hàng' : 'Shortage only'}
            </button>
            {stats.shortage > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/70 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
                <AlertTriangle className="h-3 w-3" />
                {vi
                  ? `${stats.shortage} thiếu hàng`
                  : `${stats.shortage} stock short`}
              </span>
            ) : null}
            {savings ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200"
                title={
                  vi
                    ? `Tái sử dụng ${String(savings.reuseRate)}% · theo gợi ý ${String(savings.recommendationFollowRate)}%`
                    : `Reuse ${String(savings.reuseRate)}% · followed rec ${String(savings.recommendationFollowRate)}%`
                }
              >
                {vi
                  ? `Tiết kiệm bao bì ${savings.totalSavingVnd.toLocaleString('vi-VN')}₫`
                  : `Pack savings ${savings.totalSavingVnd.toLocaleString('en-US')}₫`}
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

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={
              vi
                ? 'Tìm mã nhóm, mã đơn, người nhận…'
                : 'Search group, order, recipient…'
            }
            className="h-9 w-full rounded-lg border border-hairline bg-surface pr-9 pl-9 text-sm text-ink"
          />
          {remoteSearching ? (
            <Loader2 className="absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ink-muted" />
          ) : null}
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

            <div className="min-h-0 flex-1 overflow-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {vi ? 'Đang tải nhóm đơn…' : 'Loading order groups…'}
                </div>
              ) : error ? (
                <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                  {error}
                </div>
              ) : groups.length === 0 && !searchQuery.trim() ? (
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
              ) : visibleGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  {remoteSearching ? (
                    <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
                  ) : (
                    <p className="text-sm font-medium text-ink">
                      {vi ? 'Không tìm thấy nhóm đơn' : 'No matching groups'}
                    </p>
                  )}
                </div>
              ) : (
                <table className="w-full min-w-[640px] text-center text-sm">
                  <thead className="sticky top-0 z-10 border-b border-hairline bg-surface-2/95 backdrop-blur">
                    <tr className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                      <th className="min-w-[140px] px-4 py-3">
                        {vi ? 'Nhóm' : 'Group'}
                      </th>
                      <th className="px-3 py-3">{vi ? 'Kênh' : 'Channel'}</th>
                      <th className="px-3 py-3">{vi ? 'Trạng thái' : 'Status'}</th>
                      <th className="px-3 py-3">{vi ? 'Ưu tiên' : 'Priority'}</th>
                      <th className="px-3 py-3">{vi ? 'Số đơn' : 'Orders'}</th>
                      <th className="px-4 py-3">{vi ? 'Cập nhật' : 'Updated'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {queuePaging.pagedItems.map((g) => {
                      const selected = selectedId === g.id
                      const updated = toIso(g.updatedAt)
                      return (
                        <tr
                          key={g.id}
                          onClick={() => setSelectedId(g.id)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            g.isOverdue && 'border-l-4 border-l-rose-600',
                            selected
                              ? 'bg-[color-mix(in_srgb,#D4ECDD_55%,transparent)] dark:bg-[color-mix(in_srgb,var(--ls-cta,#D4ECDD)_12%,transparent)]'
                              : g.isOverdue
                                ? 'bg-rose-50/70 hover:bg-rose-100/70'
                                : 'hover:bg-surface-2/80',
                          )}
                        >
                          <td className="min-w-[140px] px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300"
                                title={g.id}
                              >
                                {shortId(g.id)}
                              </span>
                              {g.stockShortage ? (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200"
                                  title={
                                    g.stockShortageItems.length
                                      ? g.stockShortageItems
                                          .map(
                                            (i) =>
                                              `${i.sku}: thiếu ${String(i.shortage)}`,
                                          )
                                          .join(', ')
                                      : vi
                                        ? 'Thiếu tồn khả dụng'
                                        : 'Stock shortage'
                                  }
                                >
                                  {vi ? 'Thiếu hàng' : 'Shortage'}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-center">
                              <span className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--ls-cta,#152D35)_28%,transparent)] bg-[color-mix(in_srgb,#D4ECDD_70%,white)] px-2 py-0.5 text-[11px] font-medium text-[var(--ls-cta,#152D35)] dark:border-[color-mix(in_srgb,var(--ls-cta,#D4ECDD)_35%,transparent)] dark:bg-[color-mix(in_srgb,var(--ls-cta,#D4ECDD)_12%,transparent)] dark:text-[var(--ls-cta,#D4ECDD)]">
                                {platformLabel(g.platform)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              <Badge tone={statusTone(g.fulfillmentStatus)}>
                                {statusLabel(g.fulfillmentStatus, vi)}
                              </Badge>
                              {isPartiallyCanceledGroup(g) ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
                                  {vi ? 'Một phần đã hủy' : 'Partial cancel'}
                                </span>
                              ) : null}
                              {isFullyInactiveGroup(g) ? (
                                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-200">
                                  {vi ? 'Đã hủy hết' : 'All canceled'}
                                </span>
                              ) : null}
                              {g.recipientNamesDiffer ? (
                                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-800 dark:border-indigo-800/50 dark:bg-indigo-950/40 dark:text-indigo-200">
                                  {vi
                                    ? `Gộp ${g.recipientNames.length} người nhận`
                                    : `Merged ${g.recipientNames.length} recipients`}
                                </span>
                              ) : null}
                              <RegroupLinkChips
                                group={g}
                                vi={vi}
                                onOpen={setSelectedId}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-center">
                              {g.isOverdue ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-200"
                                  title={vi ? 'Hỏa tốc quá hạn SLA' : 'Express SLA overdue'}
                                >
                                  <Zap className="h-3 w-3 fill-rose-600" />
                                  {vi
                                    ? 'Hỏa tốc (Quá hạn)'
                                    : 'Express (Overdue)'}
                                </span>
                              ) : g.orderPriority === 'express' ? (
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
                            <span title={vi ? 'Còn xử lý / Tổng / Đã hủy' : 'Active / Total / Canceled'}>
                              {g.manualLink ? (
                                <span className="mr-1 rounded bg-primary/10 px-1 text-[10px] text-primary-hover">
                                  {vi ? 'tay' : 'link'}
                                </span>
                              ) : null}
                              {g.activeOrderCount}/{g.orderCount}
                              {g.canceledOrderCount > 0
                                ? ` (−${g.canceledOrderCount})`
                                : ''}
                            </span>
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
            {!loading && !error && displayGroups.length > 0 ? (
              <QueuePaginationBar
                vi={vi}
                variant="plain"
                rangeStart={queuePaging.rangeStart}
                rangeEnd={queuePaging.rangeEnd}
                total={queuePaging.total}
                page={queuePaging.page}
                totalPages={queuePaging.totalPages}
                onPrev={() => queuePaging.setPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  queuePaging.setPage((p) =>
                    Math.min(queuePaging.totalPages, p + 1),
                  )
                }
              />
            ) : null}
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

            <div className="min-h-0 flex-1 overflow-y-auto p-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                    <p className="mt-1 select-all rounded border border-slate-200 bg-slate-100 p-1.5 font-mono text-xs break-all text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      {detail.id}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInlineTimelineOpen((open) => !open)}
                        className="text-[11px] text-primary-hover underline-offset-2 hover:underline"
                      >
                        {inlineTimelineOpen
                          ? vi
                            ? 'Ẩn dòng thời gian'
                            : 'Hide timeline'
                          : vi
                            ? 'Dòng thời gian'
                            : 'Timeline'}
                      </button>
                      {inlineTimelineOpen ? (
                        <button
                          type="button"
                          onClick={() => setTimelineTick((tick) => tick + 1)}
                          className="text-[11px] text-primary-hover underline-offset-2 hover:underline"
                        >
                          {vi ? 'Tải lại' : 'Reload'}
                        </button>
                      ) : null}
                      <Link
                        to={
                          role === UserRole.ADMIN
                            ? `/app/admin/history?group=${encodeURIComponent(detail.id)}`
                            : `/app/history?group=${encodeURIComponent(detail.id)}`
                        }
                        className="text-[11px] text-primary-hover underline-offset-2 hover:underline"
                      >
                        {vi ? 'Xem dòng thời gian' : 'View timeline'}
                      </Link>
                    </div>
                    {inlineTimelineOpen ? (
                      <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-hairline bg-surface-2/60 p-2">
                        {inlineTimelineLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
                        ) : inlineTimeline.length === 0 ? (
                          <p className="text-[11px] text-ink-subtle">
                            {vi ? 'Chưa có mốc.' : 'No events yet.'}
                          </p>
                        ) : (
                          <ol className="space-y-1.5">
                            {inlineTimeline.map((item) => (
                              <li key={item.id} className="text-[11px] text-ink">
                                <p className="font-medium">
                                  {item.summary || item.action}
                                </p>
                                <p className="text-ink-muted">
                                  {formatDateTime(item.occurredAt)}
                                  {item.actor?.name ? ` · ${item.actor.name}` : ''}
                                </p>
                                {historyShippingLine(item) ? (
                                  <p className="text-ink-subtle">{historyShippingLine(item)}</p>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {detail.isOverdue ? (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 text-sm font-semibold">
                        {vi ? 'Đã quá hạn SLA' : 'SLA breached'}
                        {toIso(detail.packagingDeadline) ? (
                          <p className="mt-0.5 text-xs font-medium opacity-90">
                            {formatDateTime(toIso(detail.packagingDeadline)!)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

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
                      <dd className="flex flex-wrap items-center justify-end gap-1">
                        <Badge tone={statusTone(detail.fulfillmentStatus)}>
                          {statusLabel(detail.fulfillmentStatus, vi)}
                        </Badge>
                        {isPartiallyCanceledGroup(detail) ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
                            {vi ? 'Một phần đã hủy' : 'Partial cancel'}
                          </span>
                        ) : null}
                        {isFullyInactiveGroup(detail) ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-200">
                            {vi ? 'Đã hủy hết' : 'All canceled'}
                          </span>
                        ) : null}
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
                      <dd className="text-right font-mono text-xs tabular-nums text-ink">
                        <div>
                          {vi ? 'Tổng' : 'Total'}: {detail.orderCount}
                        </div>
                        <div className="text-ink-muted">
                          {vi ? 'Còn xử lý' : 'Active'}: {detail.activeOrderCount}
                        </div>
                        <div className="text-ink-muted">
                          {vi ? 'Đã hủy' : 'Canceled'}: {detail.canceledOrderCount}
                        </div>
                      </dd>
                    </div>
                    {detail.recipientNames.length > 0 ? (
                      <div className="flex items-start justify-between gap-2">
                        <dt className="text-ink-subtle">
                          {vi ? 'Người nhận' : 'Recipients'}
                        </dt>
                        <dd className="text-right text-xs text-ink">
                          {detail.recipientNames.join(' · ')}
                          {detail.recipientNamesDiffer ? (
                            <p className="mt-1 font-medium text-indigo-700 dark:text-indigo-300">
                              {vi
                                ? `Gộp ${detail.recipientNames.length} người nhận`
                                : `Merged ${detail.recipientNames.length} recipients`}
                            </p>
                          ) : null}
                          <div className="mt-1 flex flex-wrap justify-end gap-1">
                            <RegroupLinkChips
                              group={detail}
                              vi={vi}
                              onOpen={setSelectedId}
                            />
                          </div>
                        </dd>
                      </div>
                    ) : null}
                    {detail.stockShortage ? (
                      <div className="col-span-full rounded-md border border-orange-200 bg-orange-50/80 px-2.5 py-2 text-xs text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100">
                        <p className="font-semibold">
                          {vi ? 'Thiếu tồn khả dụng (K5)' : 'Stock shortage (K5)'}
                        </p>
                        {detail.stockShortageItems.length > 0 ? (
                          <ul className="mt-1 space-y-0.5 font-mono">
                            {detail.stockShortageItems.map((item) => (
                              <li key={item.sku}>
                                {item.sku}: {vi ? 'cần' : 'need'} {item.needed},{' '}
                                {vi ? 'giữ' : 'reserved'} {item.reserved},{' '}
                                {vi ? 'thiếu' : 'short'} {item.shortage}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </dl>

                  <GroupOpsPanel
                    detail={detail}
                    vi={vi}
                    canLink={canLink}
                    canRegroup={canRegroupRoles}
                    canSeeStock={canSeeStock}
                    canRecheck={canRecheck}
                    canRelease={canRelease}
                    onOpenGroup={setSelectedId}
                    onChanged={async () => {
                      await load()
                      const full = await getOrderGroupById(detail.id)
                      setDetail(full)
                    }}
                  />

                  <dl className="grid gap-3 rounded-lg border border-hairline bg-canvas/60 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <dt className="inline-flex items-center gap-1 text-ink-subtle">
                        <Clock3 className="h-3.5 w-3.5" />
                        {vi ? 'Hạn đóng gói' : 'Deadline'}
                      </dt>
                      <dd className="text-right text-xs text-ink">
                        {toIso(detail.packagingDeadline)
                          ? formatDateTime(toIso(detail.packagingDeadline)!)
                          : '—'}
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
                        className="w-full gap-1.5 bg-amber-600 py-2.5 text-white shadow-sm hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50"
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
