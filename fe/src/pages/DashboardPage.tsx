import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import {
  getDashboardSummary,
  type DashboardActionQueue,
  type DashboardPlatform,
  type DashboardSummary,
} from '../api/dashboard.api'
import {
  getPackagingMaterialsSavings,
  type PackagingMaterialsSavings,
} from '../api/packaging-materials.api'
import { getPackingReport } from '../api/packing-plan.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import type { PackingReport } from '../types/packing-plan'

type Preset = 'today' | '7' | '30' | 'custom'
type QueueTone = 'rose' | 'amber' | 'slate'

const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const QUEUE_ITEMS: {
  key: keyof DashboardActionQueue
  vi: string
  en: string
  to: string
  tone: QueueTone
}[] = [
  { key: 'expressOverdue', vi: 'Hỏa tốc quá hạn', en: 'Express overdue', to: '/app/order-groups', tone: 'rose' },
  { key: 'deliveryFailed', vi: 'Giao thất bại', en: 'Delivery failed', to: '/app/shipping', tone: 'rose' },
  { key: 'carrierBookingErrors', vi: 'Lỗi đặt vận đơn', en: 'Booking errors', to: '/app/shipping', tone: 'rose' },
  { key: 'marketplaceWritebackFailed', vi: 'Ghi ngược sàn lỗi', en: 'Write-back failed', to: '/app/orders', tone: 'rose' },
  { key: 'expressDueSoon', vi: 'Hỏa tốc sắp hạn', en: 'Express due soon', to: '/app/order-groups', tone: 'amber' },
  { key: 'partialNeedsReview', vi: 'Thiếu hàng cần duyệt', en: 'Partial review', to: '/app/order-groups', tone: 'amber' },
  { key: 'plansWithHeldParcels', vi: 'Kiện lệch cân', en: 'Held parcels', to: '/app/packing', tone: 'amber' },
  { key: 'stockShortageGroups', vi: 'Nhóm thiếu tồn', en: 'Stock shortage', to: '/app/order-groups', tone: 'amber' },
  { key: 'awaitingPick', vi: 'Chờ lấy hàng', en: 'Awaiting pick', to: '/app/order-groups', tone: 'slate' },
  { key: 'picking', vi: 'Đang lấy hàng', en: 'Picking', to: '/app/order-groups', tone: 'slate' },
  { key: 'plansAwaitingApproval', vi: 'Kế hoạch chờ duyệt', en: 'Plans to approve', to: '/app/packing', tone: 'slate' },
  { key: 'plansAwaitingPacking', vi: 'Chờ đóng gói', en: 'Awaiting pack', to: '/app/packing', tone: 'slate' },
  { key: 'readyToShip', vi: 'Chờ giao', en: 'Ready to ship', to: '/app/shipping', tone: 'slate' },
  { key: 'shipmentsInFlight', vi: 'Đang giao', en: 'In transit', to: '/app/shipping', tone: 'slate' },
  { key: 'returningToWarehouse', vi: 'Đang hoàn kho', en: 'Returning', to: '/app/shipping', tone: 'slate' },
  { key: 'ordersAwaitingCancelConfirm', vi: 'Chờ xác nhận hủy', en: 'Cancel confirm', to: '/app/orders', tone: 'slate' },
  { key: 'returnsToReview', vi: 'Phiếu trả chờ duyệt', en: 'Returns to review', to: '/app/returns', tone: 'slate' },
  { key: 'returnsToReceive', vi: 'Phiếu chờ nhận', en: 'Returns to receive', to: '/app/returns', tone: 'slate' },
  { key: 'returnsToInspect', vi: 'Phiếu chờ kiểm', en: 'Returns to inspect', to: '/app/returns', tone: 'slate' },
]

const RETURN_TYPE_LABELS: Record<string, { vi: string; en: string }> = {
  return_refund: { vi: 'Trả hàng hoàn tiền', en: 'Return & refund' },
  refund_only: { vi: 'Chỉ hoàn tiền', en: 'Refund only' },
  exchange: { vi: 'Đổi hàng', en: 'Exchange' },
}

function vnTodayKey(now = new Date()): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10)
}

function addCalendarDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

function rangeFor(
  preset: Preset,
  customFrom: string,
  customTo: string,
  now = new Date(),
): { from: string; to: string } | null {
  if (preset === 'today') {
    const key = vnTodayKey(now)
    return {
      from: new Date(`${key}T00:00:00.000+07:00`).toISOString(),
      to: now.toISOString(),
    }
  }
  if (preset === '7' || preset === '30') {
    const days = preset === '7' ? 7 : 30
    return {
      from: new Date(now.getTime() - days * DAY_MS).toISOString(),
      to: now.toISOString(),
    }
  }
  if (!customFrom || !customTo || customFrom > customTo) return null
  const from = new Date(`${customFrom}T00:00:00.000+07:00`)
  const to = new Date(`${addCalendarDays(customTo, 1)}T00:00:00.000+07:00`)
  if (to.getTime() - from.getTime() > 366 * DAY_MS) return null
  return { from: from.toISOString(), to: to.toISOString() }
}

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount))
}

function formatPct(rate: number | null): string {
  if (rate === null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function formatWhen(iso: string, vi: boolean): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}

function platformLabel(platform: string): string {
  if (platform === 'lazada') return 'Lazada'
  if (platform === 'aurelle') return 'AURELLE'
  return platform
}

function Metric({
  label,
  value,
  hint,
  change,
}: {
  label: string
  value: string
  hint?: string
  change?: number | null
}) {
  const up = change !== undefined && change !== null && change >= 0
  return (
    <div className="owner-panel rounded-2xl p-4">
      <span className="text-xs text-slate-500">{label}</span>
      <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {change !== undefined && change !== null ? (
        <p
          className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}
        >
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {(change * 100).toFixed(1)}%
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const today = vnTodayKey()

  const [preset, setPreset] = useState<Preset>('30')
  const [customFrom, setCustomFrom] = useState(addCalendarDays(today, -29))
  const [customTo, setCustomTo] = useState(today)
  const [platform, setPlatform] = useState<DashboardPlatform | ''>('')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [packReport, setPackReport] = useState<PackingReport | null>(null)
  const [savings, setSavings] = useState<PackagingMaterialsSavings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const range = useMemo(
    () => rangeFor(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  )
  const rangeError =
    preset === 'custom' && range === null
      ? vi
        ? 'Chọn ngày bắt đầu trước ngày kết thúc, trong vòng 366 ngày.'
        : 'Start must be before end, within 366 days.'
      : null

  useEffect(() => {
    if (!range) return
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void Promise.all([
        getDashboardSummary({ from: range.from, to: range.to, platform }),
        getPackingReport({ from: range.from, to: range.to }),
        getPackagingMaterialsSavings(),
      ])
        .then(([nextSummary, report, saved]) => {
          setSummary(nextSummary)
          setPackReport(report)
          setSavings(saved)
        })
        .catch((err: unknown) => setError(formatApiError(err)))
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [range, platform])

  const sales = summary?.sales
  const toneRank: Record<QueueTone, number> = { rose: 0, amber: 1, slate: 2 }
  const openQueue = summary
    ? QUEUE_ITEMS.map((item) => ({ item, count: summary.actionQueue[item.key] }))
        .filter((row) => row.count > 0)
        .sort((x, y) => toneRank[x.item.tone] - toneRank[y.item.tone])
    : []
  const maxDaily = Math.max(
    1,
    ...(sales?.daily.map((day) => Math.max(day.revenuePlacedVnd, day.revenueDeliveredVnd)) ?? [1]),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Tổng quan' : 'Dashboard Overview' },
        ]}
      />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="owner-hero">
            <div>
              <p className="owner-hero-kicker">
                {new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-GB', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }).format(new Date())}
              </p>
              <h1>{vi ? 'Tổng quan cửa hàng' : 'Store overview'}</h1>
            </div>
          </section>

          <section className="flex flex-wrap items-end gap-2">
            {(
              [
                ['today', vi ? 'Hôm nay' : 'Today'],
                ['7', vi ? '7 ngày' : '7 days'],
                ['30', vi ? '30 ngày' : '30 days'],
                ['custom', vi ? 'Tuỳ chọn' : 'Custom'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreset(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  preset === id
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 hover:bg-white dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
            {preset === 'custom' ? (
              <>
                <label className="text-xs text-slate-500">
                  {vi ? 'Từ' : 'From'}
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                    className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  {vi ? 'Đến' : 'To'}
                  <input
                    type="date"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                    className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
              </>
            ) : null}
            <label className="text-xs text-slate-500">
              {vi ? 'Sàn' : 'Platform'}
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value as DashboardPlatform | '')}
                className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">{vi ? 'Tất cả' : 'All'}</option>
                <option value="lazada">Lazada</option>
                <option value="aurelle">AURELLE</option>
              </select>
            </label>
            {summary ? (
              <p className="text-[11px] text-slate-400">
                {vi ? 'So với ' : 'Vs '}
                {formatWhen(summary.range.previousFrom, vi)} – {formatWhen(summary.range.previousTo, vi)}
                {' · '}
                {formatWhen(summary.range.generatedAt, vi)}
              </p>
            ) : null}
          </section>

          {rangeError ? <p className="text-xs text-rose-600">{rangeError}</p> : null}
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          {loading && !summary ? (
            <p className="text-xs text-slate-500">{vi ? 'Đang tải số liệu…' : 'Loading…'}</p>
          ) : null}

          {summary ? (
            <>
              <section className="owner-panel rounded-2xl">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ls-card-border)] px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {vi ? 'Việc đang chờ' : 'Waiting on you'}
                  </h2>
                  <span className="text-[11px] text-slate-400">
                    {vi ? 'Số hiện tại, không theo khoảng ngày' : 'Live count, ignores the date range'}
                  </span>
                </div>
                {openQueue.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500">
                    {vi ? 'Không có việc nào đang tồn.' : 'Nothing is waiting.'}
                  </p>
                ) : (
                  <ul className="m-0 grid list-none grid-cols-1 p-0 sm:grid-cols-2 lg:grid-cols-3">
                    {openQueue.map(({ item, count }) => (
                      <li key={item.key} className="border-b border-[var(--ls-card-border)] last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0">
                        <button
                          type="button"
                          onClick={() => navigate(item.to)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--ls-subtle)]"
                        >
                          <span
                            aria-hidden
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              item.tone === 'rose'
                                ? 'bg-rose-500'
                                : item.tone === 'amber'
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400'
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                            {vi ? item.vi : item.en}
                          </span>
                          <span className="font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-white">
                            {count}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                  label={vi ? 'Đặt hàng' : 'Placed'}
                  value={`${formatVnd(sales?.current.revenuePlacedVnd ?? 0)}₫`}
                  change={sales?.change.revenuePlacedVnd}
                  hint={`${sales?.current.ordersReceived ?? 0} ${vi ? 'đơn nhận' : 'orders'}`}
                />
                <Metric
                  label={vi ? 'Đã giao' : 'Delivered'}
                  value={`${formatVnd(sales?.current.revenueDeliveredVnd ?? 0)}₫`}
                  change={sales?.change.revenueDeliveredVnd}
                  hint={`${sales?.current.ordersDelivered ?? 0} ${vi ? 'đơn' : 'orders'}`}
                />
                <Metric
                  label={vi ? 'Giá trị đơn trung bình' : 'Avg order'}
                  value={
                    sales?.current.avgOrderValueVnd === null || sales?.current.avgOrderValueVnd === undefined
                      ? '—'
                      : `${formatVnd(sales.current.avgOrderValueVnd)}₫`
                  }
                  change={sales?.change.avgOrderValueVnd}
                  hint={`${vi ? 'Hủy' : 'Cancel'} ${formatPct(sales?.current.cancelRate ?? null)}`}
                />
                <Metric
                  label={vi ? 'Hỏa tốc đúng hẹn' : 'Express on time'}
                  value={formatPct(summary.express.onTimeRate)}
                  hint={
                    summary.express.total === 0
                      ? vi
                        ? 'Chưa có đơn hỏa tốc trong kỳ'
                        : 'No express orders in range'
                      : vi
                        ? `${summary.express.onTime} đúng · ${summary.express.late} trễ · ${summary.express.pending} chưa tới hạn`
                        : `${summary.express.onTime} on time · ${summary.express.late} late · ${summary.express.pending} pending`
                  }
                />
              </section>

              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="owner-panel rounded-2xl p-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {vi ? 'Doanh thu theo ngày' : 'Revenue by day'}
                  </h3>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {vi ? 'Cột đậm: đặt hàng. Cột nhạt: đã giao. Ngày không có đơn = 0.' : 'Solid: placed. Pale: delivered. Empty days are 0.'}
                  </p>
                  <div className="mt-3 flex h-36 items-end gap-px overflow-x-auto">
                    {sales?.daily.map((day) => (
                      <div key={day.date} className="flex h-full min-w-[8px] flex-1 items-end gap-px" title={day.date}>
                        <span
                          className="w-1/2 rounded-t bg-slate-800 dark:bg-slate-200"
                          style={{ height: `${(day.revenuePlacedVnd / maxDaily) * 100}%` }}
                        />
                        <span
                          className="w-1/2 rounded-t bg-emerald-400"
                          style={{ height: `${(day.revenueDeliveredVnd / maxDaily) * 100}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="owner-panel rounded-2xl p-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {vi ? 'Theo sàn' : 'By platform'}
                  </h3>
                  {sales && sales.byPlatform.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-400">{vi ? 'Chưa có đơn trong kỳ.' : 'No orders in range.'}</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {sales?.byPlatform.map((row) => (
                        <li
                          key={row.platform}
                          className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
                        >
                          <div>
                            <p className="text-sm font-semibold">{platformLabel(row.platform)}</p>
                            <p className="text-[11px] text-slate-500">
                              {row.ordersReceived} {vi ? 'đơn' : 'orders'} · {vi ? 'hủy' : 'canceled'} {row.ordersCanceled}
                            </p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="font-mono font-bold">{formatVnd(row.revenuePlacedVnd)}₫</p>
                            <p className="text-slate-400">
                              {vi ? 'Đã giao ' : 'Delivered '}
                              {formatVnd(row.revenueDeliveredVnd)}₫
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                  label={vi ? 'Phí ship' : 'Shipping cost'}
                  value={`${formatVnd(summary.costs.shippingCostVnd)}₫`}
                  hint={`${summary.costs.ordersShipped} ${vi ? 'đơn đã gửi' : 'orders shipped'}${
                    summary.costs.shippingCostPerOrderVnd === null
                      ? ''
                      : ` · ${formatVnd(summary.costs.shippingCostPerOrderVnd)}₫/${vi ? 'đơn' : 'order'}`
                  }`}
                />
                <Metric
                  label={vi ? 'Chi phí đóng gói' : 'Pack cost'}
                  value={`${formatVnd(summary.costs.packagingCostVnd)}₫`}
                  hint={
                    vi
                      ? `${summary.costs.ordersPacked} đơn đã đóng${
                          summary.costs.packagingCostPerOrderVnd === null
                            ? ''
                            : ` · ${formatVnd(summary.costs.packagingCostPerOrderVnd)}₫/đơn`
                        }${
                          summary.costs.fulfillmentCostRate === null
                            ? ''
                            : ` · chi phí/doanh thu ${formatPct(summary.costs.fulfillmentCostRate)}`
                        }`
                      : `${summary.costs.ordersPacked} packed${
                          summary.costs.packagingCostPerOrderVnd === null
                            ? ''
                            : ` · ${formatVnd(summary.costs.packagingCostPerOrderVnd)}₫/order`
                        }${
                          summary.costs.fulfillmentCostRate === null
                            ? ''
                            : ` · cost/revenue ${formatPct(summary.costs.fulfillmentCostRate)}`
                        }`
                  }
                />
                <Metric
                  label={vi ? 'Tiết kiệm bao bì' : 'Pack savings'}
                  value={savings ? `${formatVnd(savings.totalSavingVnd)}₫` : '…'}
                  hint={
                    savings
                      ? vi
                        ? `Tái sử dụng ${Math.round(savings.reuseRate * 100)}%`
                        : `Reuse ${Math.round(savings.reuseRate * 100)}%`
                      : undefined
                  }
                />
                <Metric
                  label={vi ? 'Giao lần đầu' : 'First attempt'}
                  value={formatPct(summary.delivery.firstAttemptSuccessRate)}
                  hint={
                    summary.delivery.avgDeliveryHours === null
                      ? `${summary.delivery.shipmentsDelivered}/${summary.delivery.shipmentsCreated}`
                      : vi
                        ? `TB ${summary.delivery.avgDeliveryHours} giờ · hoàn kho ${summary.delivery.returnedToWarehouse}`
                        : `Avg ${summary.delivery.avgDeliveryHours}h · returned ${summary.delivery.returnedToWarehouse}`
                  }
                />
              </section>

              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="owner-panel rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">{vi ? 'Trả hàng' : 'Returns'}</h3>
                    <button type="button" onClick={() => navigate('/app/returns')} className="text-[11px] font-semibold text-blue-600">
                      {vi ? 'Mở phiếu →' : 'Open →'}
                    </button>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-bold">{summary.returns.customerRequests}</p>
                  <p className="text-[11px] text-slate-400">
                    {vi ? 'Tỷ lệ trả ' : 'Return rate '}
                    {formatPct(summary.returns.returnRate)}
                  </p>
                  <ul className="mt-3 space-y-1 text-xs">
                    {summary.returns.byType.length === 0 ? (
                      <li className="text-slate-400">{vi ? 'Không có phiếu trong kỳ.' : 'No requests in range.'}</li>
                    ) : (
                      summary.returns.byType.map((row) => (
                        <li key={row.type} className="flex justify-between">
                          <span>{RETURN_TYPE_LABELS[row.type]?.[vi ? 'vi' : 'en'] ?? row.type}</span>
                          <span className="font-mono">{row.count}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="owner-panel rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">{vi ? 'Kho và vật tư' : 'Stock and materials'}</h3>
                    <button type="button" onClick={() => navigate('/app/inventory')} className="text-[11px] font-semibold text-blue-600">
                      {vi ? 'Tồn kho →' : 'Inventory →'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {vi
                      ? `${summary.warehouse.shortageSkuCount} SKU thiếu · ${summary.warehouse.outOfStockSkuCount} SKU hết hàng`
                      : `${summary.warehouse.shortageSkuCount} short · ${summary.warehouse.outOfStockSkuCount} out of stock`}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {summary.warehouse.shortageSkus.slice(0, 5).map((row) => (
                      <li key={row.sku} className="flex justify-between font-mono">
                        <span>{row.sku}</span>
                        <span>
                          −{row.shortage} · {row.groups}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {summary.warehouse.materialsBelowReorder.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => navigate('/app/packaging-materials')}
                      className="mt-3 text-left text-xs text-amber-800 dark:text-amber-200"
                    >
                      {vi ? 'Vật tư dưới mức đặt lại: ' : 'Below reorder: '}
                      {summary.warehouse.materialsBelowReorder.map((item) => item.code).join(', ')}
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">
                      {vi ? 'Không có vật tư dưới mức đặt lại.' : 'No materials below reorder.'}
                    </p>
                  )}
                </div>
              </section>

              <section className="owner-panel rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">
                    {vi ? 'Nhân viên đóng gói' : 'Packing staff'}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {packReport
                      ? vi
                        ? `Chờ ${packReport.avgWaitMinutes ?? '—'} phút · đóng ${packReport.avgPackMinutes ?? '—'} phút · quét ${formatPct(packReport.scanRate)}`
                        : `Wait ${packReport.avgWaitMinutes ?? '—'} min · pack ${packReport.avgPackMinutes ?? '—'} min · scan ${formatPct(packReport.scanRate)}`
                      : '…'}
                  </span>
                </div>
                {!packReport || packReport.byStaff.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-400">
                    {vi ? 'Chưa có dữ liệu đóng gói trong kỳ.' : 'No packing data in this range.'}
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800">
                          <th className="pb-2 font-semibold">{vi ? 'Nhân viên' : 'Staff'}</th>
                          <th className="pb-2 text-right font-semibold">{vi ? 'Nhóm' : 'Groups'}</th>
                          <th className="pb-2 text-right font-semibold">{vi ? 'Kiện' : 'Parcels'}</th>
                          <th className="pb-2 text-right font-semibold">{vi ? 'TB đóng (phút)' : 'Avg pack min'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packReport.byStaff.map((row) => (
                          <tr key={row.staffId} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                            <td className="py-2 font-semibold">{row.name ?? row.staffId}</td>
                            <td className="py-2 text-right font-mono">{row.groups}</td>
                            <td className="py-2 text-right font-mono">{row.parcels}</td>
                            <td className="py-2 text-right font-mono">{row.avgPackMinutes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-slate-400">
                  {vi
                    ? 'Thời gian lấy hàng trung bình và hiệu suất nhân viên kho / điều phối chưa có trên hệ thống. Bảng đóng gói không lọc theo sàn.'
                    : 'Average pick time and warehouse or coordinator efficiency are not available yet. The packing table is not filtered by platform.'}
                </p>
              </section>
            </>
          ) : null}

        </div>
      </main>
    </div>
  )
}
