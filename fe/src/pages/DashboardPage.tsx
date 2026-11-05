import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock,
  Leaf,
  ReceiptText,
  ShoppingBag,
  Truck,
  Undo2,
  Warehouse,
  Zap,
  type LucideIcon,
} from 'lucide-react'
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
import { RevenueChart } from '../components/dashboard/RevenueChart'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import type { FulfillmentStage } from '../lib/stage-colors'
import type { PackingReport } from '../types/packing-plan'

type Preset = 'today' | '7' | '30' | 'custom'
type AlertTone = 'danger' | 'warning'

const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

type QueueItem = {
  key: keyof DashboardActionQueue
  vi: string
  en: string
  to: string
}

const ALERT_ITEMS: (QueueItem & { tone: AlertTone; icon: LucideIcon })[] = [
  { key: 'expressOverdue', vi: 'Hỏa tốc quá hạn', en: 'Express overdue', to: '/app/order-groups', tone: 'danger', icon: Zap },
  { key: 'deliveryFailed', vi: 'Giao thất bại', en: 'Delivery failed', to: '/app/shipping', tone: 'danger', icon: Truck },
  { key: 'carrierBookingErrors', vi: 'Lỗi đặt vận đơn', en: 'Booking errors', to: '/app/shipping', tone: 'danger', icon: AlertTriangle },
  { key: 'marketplaceWritebackFailed', vi: 'Ghi ngược sàn lỗi', en: 'Write-back failed', to: '/app/orders', tone: 'danger', icon: AlertTriangle },
  { key: 'expressDueSoon', vi: 'Hỏa tốc sắp hạn', en: 'Express due soon', to: '/app/order-groups', tone: 'warning', icon: Clock },
  { key: 'partialNeedsReview', vi: 'Thiếu hàng cần duyệt', en: 'Partial review', to: '/app/order-groups', tone: 'warning', icon: AlertTriangle },
  { key: 'plansWithHeldParcels', vi: 'Kiện lệch cân', en: 'Held parcels', to: '/app/packing', tone: 'warning', icon: Boxes },
  { key: 'stockShortageGroups', vi: 'Nhóm thiếu tồn', en: 'Stock shortage', to: '/app/order-groups', tone: 'warning', icon: Warehouse },
]

const STAGE_GROUPS: {
  stage: FulfillmentStage
  vi: string
  en: string
  icon: LucideIcon
  items: QueueItem[]
}[] = [
  {
    stage: 'pick',
    vi: 'Lấy hàng',
    en: 'Picking',
    icon: ClipboardList,
    items: [
      { key: 'awaitingPick', vi: 'Chờ lấy hàng', en: 'Awaiting pick', to: '/app/order-groups' },
      { key: 'picking', vi: 'Đang lấy hàng', en: 'In progress', to: '/app/order-groups' },
    ],
  },
  {
    stage: 'pack',
    vi: 'Đóng gói',
    en: 'Packing',
    icon: Boxes,
    items: [
      { key: 'plansAwaitingApproval', vi: 'Kế hoạch chờ duyệt', en: 'Plans to approve', to: '/app/packing' },
      { key: 'plansAwaitingPacking', vi: 'Chờ đóng gói', en: 'Awaiting pack', to: '/app/packing' },
    ],
  },
  {
    stage: 'ship',
    vi: 'Giao hàng',
    en: 'Shipping',
    icon: Truck,
    items: [
      { key: 'readyToShip', vi: 'Chờ giao', en: 'Ready to ship', to: '/app/shipping' },
      { key: 'shipmentsInFlight', vi: 'Đang giao', en: 'In transit', to: '/app/shipping' },
    ],
  },
  {
    stage: 'return',
    vi: 'Hoàn và hủy',
    en: 'Returns and cancels',
    icon: Undo2,
    items: [
      { key: 'returningToWarehouse', vi: 'Đang hoàn kho', en: 'Returning', to: '/app/shipping' },
      { key: 'ordersAwaitingCancelConfirm', vi: 'Chờ xác nhận hủy', en: 'Cancel confirm', to: '/app/orders' },
      { key: 'returnsToReview', vi: 'Phiếu trả chờ duyệt', en: 'Returns to review', to: '/app/returns' },
      { key: 'returnsToReceive', vi: 'Phiếu chờ nhận', en: 'Returns to receive', to: '/app/returns' },
      { key: 'returnsToInspect', vi: 'Phiếu chờ kiểm', en: 'Returns to inspect', to: '/app/returns' },
    ],
  },
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

function formatDate(iso: string, vi: boolean): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
  }).format(at)
}

function formatTime(iso: string, vi: boolean): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
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
  icon: Icon,
  tone,
  hero = false,
}: {
  label: string
  value: string
  hint?: ReactNode
  change?: number | null
  icon: LucideIcon
  tone?: string
  hero?: boolean
}) {
  const up = change !== undefined && change !== null && change >= 0
  return (
    <div
      className={`dash-metric ${hero ? 'dash-metric-hero' : ''}`}
      style={tone ? ({ '--tone': tone } as React.CSSProperties) : undefined}
    >
      <div className="dash-metric-top">
        <span>{label}</span>
        <span className="dash-metric-icon">
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
      </div>
      <p className="dash-metric-value">{value}</p>
      {change !== undefined && change !== null ? (
        <p className="dash-metric-change" data-up={up}>
          {up ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
          {(change * 100).toFixed(1)}%
        </p>
      ) : null}
      {hint ? <p className="dash-metric-hint">{hint}</p> : null}
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
  const openAlerts = summary
    ? ALERT_ITEMS.map((item) => ({ item, count: summary.actionQueue[item.key] })).filter(
        (row) => row.count > 0,
      )
    : []
  const maxPlatformRevenue = Math.max(
    1,
    ...(sales?.byPlatform.map((row) => row.revenuePlacedVnd) ?? [1]),
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
          <section>
            <div className="dash-head">
              <div>
                <p className="dash-date">
                  {new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-GB', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  }).format(new Date())}
                </p>
                <h1 className="dash-title">{vi ? 'Tổng quan cửa hàng' : 'Store overview'}</h1>
              </div>
              <div className="dash-controls">
                <div className="dash-segment" role="group" aria-label={vi ? 'Khoảng thời gian' : 'Date range'}>
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
                      aria-pressed={preset === id}
                      onClick={() => setPreset(id)}
                      className={preset === id ? 'is-active' : ''}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {preset === 'custom' ? (
                  <>
                    <input
                      type="date"
                      aria-label={vi ? 'Từ ngày' : 'From'}
                      value={customFrom}
                      onChange={(event) => setCustomFrom(event.target.value)}
                      className="dash-field"
                    />
                    <input
                      type="date"
                      aria-label={vi ? 'Đến ngày' : 'To'}
                      value={customTo}
                      onChange={(event) => setCustomTo(event.target.value)}
                      className="dash-field"
                    />
                  </>
                ) : null}
                <select
                  aria-label={vi ? 'Sàn' : 'Platform'}
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value as DashboardPlatform | '')}
                  className="dash-field"
                >
                  <option value="">{vi ? 'Tất cả sàn' : 'All platforms'}</option>
                  <option value="lazada">Lazada</option>
                  <option value="aurelle">AURELLE</option>
                </select>
              </div>
            </div>
            {summary ? (
              <p className="dash-note mt-2">
                {vi ? 'So với ' : 'Compared to '}
                {formatDate(summary.range.previousFrom, vi)} – {formatDate(summary.range.previousTo, vi)}
                {vi ? ' · Cập nhật lúc ' : ' · Updated at '}
                {formatTime(summary.range.generatedAt, vi)}
              </p>
            ) : null}
          </section>

          {rangeError ? <p className="text-xs text-rose-600">{rangeError}</p> : null}
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          {loading && !summary ? <p className="dash-empty">{vi ? 'Đang tải số liệu…' : 'Loading…'}</p> : null}

          {summary ? (
            <>
              <section>
                <h2 className="dash-section-title">
                  {vi ? 'Cần xử lý ngay' : 'Needs attention'}
                  <small>{vi ? 'Số hiện tại, không theo khoảng ngày' : 'Live count, ignores the date range'}</small>
                </h2>
                {openAlerts.length === 0 ? (
                  <p className="dash-clear">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {vi ? 'Không có việc gấp.' : 'Nothing urgent.'}
                  </p>
                ) : (
                  <div className="dash-alerts">
                    {openAlerts.map(({ item, count }) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className="dash-alert"
                          data-tone={item.tone}
                          onClick={() => navigate(item.to)}
                        >
                          <Icon className="dash-alert-icon h-5 w-5" strokeWidth={2} aria-hidden />
                          <span className="dash-alert-label">{vi ? item.vi : item.en}</span>
                          <span className="dash-alert-count">{count}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              <section>
                <h2 className="dash-section-title">{vi ? 'Việc theo bước' : 'Work by stage'}</h2>
                <div className="dash-stages">
                  {STAGE_GROUPS.map((group) => {
                    const Icon = group.icon
                    const rows = group.items
                      .map((item) => ({ item, count: summary.actionQueue[item.key] }))
                      .filter((row) => row.count > 0)
                    const total = rows.reduce((sum, row) => sum + row.count, 0)
                    return (
                      <div key={group.stage} className="dash-stage" data-stage={group.stage}>
                        <div className="dash-stage-head">
                          <span className="dash-stage-icon">
                            <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                          </span>
                          <span className="dash-stage-name">{vi ? group.vi : group.en}</span>
                          <span className="dash-stage-total">{total}</span>
                        </div>
                        {rows.length === 0 ? (
                          <p className="dash-stage-idle">{vi ? 'Không có việc.' : 'Nothing waiting.'}</p>
                        ) : (
                          <ul className="dash-stage-rows">
                            {rows.map(({ item, count }) => (
                              <li key={item.key}>
                                <button type="button" onClick={() => navigate(item.to)}>
                                  <span>{vi ? item.vi : item.en}</span>
                                  <b>{count}</b>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="dash-metrics">
                <Metric
                  hero
                  icon={ShoppingBag}
                  label={vi ? 'Doanh thu đặt hàng' : 'Revenue placed'}
                  value={`${formatVnd(sales?.current.revenuePlacedVnd ?? 0)}₫`}
                  change={sales?.change.revenuePlacedVnd}
                  hint={`${sales?.current.ordersReceived ?? 0} ${vi ? 'đơn nhận' : 'orders'}`}
                />
                <Metric
                  icon={Truck}
                  tone="var(--stage-ship)"
                  label={vi ? 'Doanh thu đã giao' : 'Revenue delivered'}
                  value={`${formatVnd(sales?.current.revenueDeliveredVnd ?? 0)}₫`}
                  change={sales?.change.revenueDeliveredVnd}
                  hint={`${sales?.current.ordersDelivered ?? 0} ${vi ? 'đơn' : 'orders'}`}
                />
                <Metric
                  icon={ReceiptText}
                  tone="var(--stage-pick)"
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
                  icon={Zap}
                  tone="var(--status-warning)"
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

              <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="dash-card lg:col-span-2">
                  <h3 className="dash-card-title">{vi ? 'Doanh thu theo ngày' : 'Revenue by day'}</h3>
                  <RevenueChart days={sales?.daily ?? []} vi={vi} />
                </div>
                <div className="dash-card">
                  <h3 className="dash-card-title">{vi ? 'Doanh thu theo sàn' : 'Revenue by platform'}</h3>
                  {sales && sales.byPlatform.length === 0 ? (
                    <p className="dash-empty mt-3">{vi ? 'Chưa có đơn trong kỳ.' : 'No orders in range.'}</p>
                  ) : (
                    <div className="mt-4">
                      {sales?.byPlatform.map((row) => (
                        <div key={row.platform} className="dash-platform">
                          <div className="dash-platform-row">
                            <span>{platformLabel(row.platform)}</span>
                            <b>{formatVnd(row.revenuePlacedVnd)}₫</b>
                          </div>
                          <div className="dash-platform-track">
                            <span style={{ width: `${(row.revenuePlacedVnd / maxPlatformRevenue) * 100}%` }} />
                          </div>
                          <p className="dash-metric-hint">
                            {row.ordersReceived} {vi ? 'đơn' : 'orders'} · {vi ? 'hủy' : 'canceled'} {row.ordersCanceled}
                            {' · '}
                            {vi ? 'đã giao' : 'delivered'} {formatVnd(row.revenueDeliveredVnd)}₫
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="dash-metrics">
                <Metric
                  icon={Truck}
                  tone="var(--stage-ship)"
                  label={vi ? 'Phí ship' : 'Shipping cost'}
                  value={`${formatVnd(summary.costs.shippingCostVnd)}₫`}
                  hint={`${summary.costs.ordersShipped} ${vi ? 'đơn đã gửi' : 'orders shipped'}${
                    summary.costs.shippingCostPerOrderVnd === null
                      ? ''
                      : ` · ${formatVnd(summary.costs.shippingCostPerOrderVnd)}₫/${vi ? 'đơn' : 'order'}`
                  }`}
                />
                <Metric
                  icon={Boxes}
                  tone="var(--stage-pack)"
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
                  icon={Leaf}
                  tone="var(--status-good)"
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
                  icon={CheckCircle2}
                  tone="var(--status-good)"
                  label={vi ? 'Giao lần đầu thành công' : 'First attempt'}
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

              <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="dash-card">
                  <h3 className="dash-card-title">
                    <Undo2 className="h-4 w-4" style={{ color: 'var(--stage-return)' }} aria-hidden />
                    {vi ? 'Trả hàng' : 'Returns'}
                    <button type="button" onClick={() => navigate('/app/returns')} className="dash-link">
                      {vi ? 'Mở phiếu →' : 'Open →'}
                    </button>
                  </h3>
                  <p className="dash-metric-value">{summary.returns.customerRequests}</p>
                  <p className="dash-metric-hint">
                    {vi ? 'Tỷ lệ trả ' : 'Return rate '}
                    {formatPct(summary.returns.returnRate)}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {summary.returns.byType.length === 0 ? (
                      <li className="dash-empty">{vi ? 'Không có phiếu trong kỳ.' : 'No requests in range.'}</li>
                    ) : (
                      summary.returns.byType.map((row) => (
                        <li key={row.type} className="dash-platform-row">
                          <span>{RETURN_TYPE_LABELS[row.type]?.[vi ? 'vi' : 'en'] ?? row.type}</span>
                          <b>{row.count}</b>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="dash-card">
                  <h3 className="dash-card-title">
                    <Warehouse className="h-4 w-4" style={{ color: 'var(--stage-pick)' }} aria-hidden />
                    {vi ? 'Kho và vật tư' : 'Stock and materials'}
                    <button type="button" onClick={() => navigate('/app/inventory')} className="dash-link">
                      {vi ? 'Tồn kho →' : 'Inventory →'}
                    </button>
                  </h3>
                  <p className="dash-metric-hint">
                    {vi
                      ? `${summary.warehouse.shortageSkuCount} SKU thiếu · ${summary.warehouse.outOfStockSkuCount} SKU hết hàng`
                      : `${summary.warehouse.shortageSkuCount} short · ${summary.warehouse.outOfStockSkuCount} out of stock`}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {summary.warehouse.shortageSkus.slice(0, 5).map((row) => (
                      <li key={row.sku} className="dash-platform-row">
                        <span className="font-mono text-xs">{row.sku}</span>
                        <b>
                          {vi ? `thiếu ${row.shortage} · ${row.groups} nhóm` : `short ${row.shortage} · ${row.groups} groups`}
                        </b>
                      </li>
                    ))}
                  </ul>
                  {summary.warehouse.materialsBelowReorder.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => navigate('/app/packaging-materials')}
                      className="dash-alert mt-3"
                    >
                      <AlertTriangle className="dash-alert-icon h-4 w-4" aria-hidden />
                      <span className="dash-alert-label">
                        {vi ? 'Vật tư dưới mức đặt lại: ' : 'Below reorder: '}
                        {summary.warehouse.materialsBelowReorder.map((item) => item.code).join(', ')}
                      </span>
                    </button>
                  ) : (
                    <p className="dash-empty mt-3">
                      {vi ? 'Không có vật tư dưới mức đặt lại.' : 'No materials below reorder.'}
                    </p>
                  )}
                </div>
              </section>

              <section className="dash-card">
                <h3 className="dash-card-title">
                  <Boxes className="h-4 w-4" style={{ color: 'var(--stage-pack)' }} aria-hidden />
                  {vi ? 'Nhân viên đóng gói' : 'Packing staff'}
                  <span className="dash-note ml-auto font-normal">
                    {packReport
                      ? vi
                        ? `Chờ ${packReport.avgWaitMinutes ?? '—'} phút · đóng ${packReport.avgPackMinutes ?? '—'} phút · quét ${formatPct(packReport.scanRate)}`
                        : `Wait ${packReport.avgWaitMinutes ?? '—'} min · pack ${packReport.avgPackMinutes ?? '—'} min · scan ${formatPct(packReport.scanRate)}`
                      : '…'}
                  </span>
                </h3>
                {!packReport || packReport.byStaff.length === 0 ? (
                  <p className="dash-empty mt-3">
                    {vi ? 'Chưa có dữ liệu đóng gói trong kỳ.' : 'No packing data in this range.'}
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="dash-table w-full text-left">
                      <thead>
                        <tr>
                          <th>{vi ? 'Nhân viên' : 'Staff'}</th>
                          <th className="text-right">{vi ? 'Nhóm' : 'Groups'}</th>
                          <th className="text-right">{vi ? 'Kiện' : 'Parcels'}</th>
                          <th className="text-right">{vi ? 'TB đóng (phút)' : 'Avg pack min'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packReport.byStaff.map((row) => (
                          <tr key={row.staffId}>
                            <td className="font-medium">{row.name ?? row.staffId}</td>
                            <td className="text-right">{row.groups}</td>
                            <td className="text-right">{row.parcels}</td>
                            <td className="text-right">{row.avgPackMinutes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="dash-metric-hint mt-3">
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
