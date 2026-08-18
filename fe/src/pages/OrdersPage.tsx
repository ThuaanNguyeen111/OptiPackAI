import { useMemo, useState } from 'react'
import {
  Box,
  Check,
  Database,
  GitMerge,
  Link2,
  Printer,
  Radio,
  ScanLine,
  Sparkles,
  Split,
  X,
} from 'lucide-react'
import { ConsolidationActionDrawer } from '../components/orders/ConsolidationActionDrawer'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import {
  channelColors,
  channelLabels,
  portalOrders as initialOrders,
  proposePackageId,
  recentStreamEvents,
  statusLabelsVi,
  streamStatus,
  type Channel,
  type Classification,
  type DbSyncStatus,
  type PortalOrder,
  type PackStatus,
} from '../data/portal-mock'

type StatusFilter = 'all' | 'merge_eligible' | 'standalone' | 'synced'

function statusTone(status: PackStatus) {
  switch (status) {
    case 'shipped':
    case 'ready':
      return 'success' as const
    case 'processing':
    case 'consolidated':
      return 'primary' as const
    case 'pending':
      return 'default' as const
    default:
      return 'warning' as const
  }
}

function ClassificationBadge({
  classification,
  locale,
}: {
  classification: Classification
  locale: 'vi' | 'en'
}) {
  const vi = locale === 'vi'
  if (classification === 'consolidated') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-hover">
        <GitMerge className="h-3 w-3" strokeWidth={2} />
        Consolidated
      </span>
    )
  }
  if (classification === 'pending_merge') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
        <Sparkles className="h-3 w-3" strokeWidth={2} />
        {vi ? 'Chờ gộp' : 'Pending merge'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
      Standalone
    </span>
  )
}

function DbStatusBadge({
  status,
  locale,
}: {
  status: DbSyncStatus
  locale: 'vi' | 'en'
}) {
  const vi = locale === 'vi'
  if (status === 'synced') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-success/20 bg-success-bg px-1.5 py-0.5 font-mono text-[10px] text-success">
        <Database className="h-2.5 w-2.5" strokeWidth={2} />
        {vi ? 'DB: Synced to MongoDB' : 'DB Status: Synced to MongoDB'}
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
        <Database className="h-2.5 w-2.5" strokeWidth={2} />
        {vi ? 'DB: Pending write' : 'DB Status: Pending'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-error/20 bg-error/10 px-1.5 py-0.5 font-mono text-[10px] text-error">
      <Database className="h-2.5 w-2.5" strokeWidth={2} />
      {vi ? 'DB: Sync error' : 'DB Status: Error'}
    </span>
  )
}

function StreamActivityHeader({ locale }: { locale: 'vi' | 'en' }) {
  const vi = locale === 'vi'
  const [logsOpen, setLogsOpen] = useState(false)

  return (
    <section className="rounded-xl border border-hairline bg-surface-1 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary-hover">
            <Radio className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink">
              Kafka Ingestion Stream
            </p>
            <p className="truncate font-mono text-[10px] text-ink-subtle">
              {streamStatus.topic}
            </p>
          </div>
          <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-success/20 bg-success-bg px-2 py-0.5 text-[10px] font-medium text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Active ({streamStatus.latency_ms}ms)
          </span>
        </div>
        <button
          type="button"
          onClick={() => setLogsOpen((v) => !v)}
          className="rounded-md border border-hairline bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
        >
          {logsOpen
            ? vi
              ? 'Hide Live Logs'
              : 'Hide Live Logs'
            : vi
              ? 'Show Live Logs'
              : 'Show Live Logs'}
        </button>
      </div>

      {logsOpen ? (
        <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-hairline pt-2">
          {recentStreamEvents.map((evt) => (
            <li
              key={evt.id}
              className="flex items-start gap-2 text-[11px] text-ink-muted"
            >
              <span className="mt-0.5 shrink-0 font-mono text-[10px] text-ink-tertiary">
                {evt.at}
              </span>
              <span
                className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  evt.channel === 'shopee'
                    ? 'bg-shopee'
                    : evt.channel === 'tiktok'
                      ? 'bg-tiktok'
                      : 'bg-primary'
                }`}
              />
              <span className="min-w-0">
                {vi ? evt.message_vi : evt.message_en}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function PackingInspectorBody({
  order,
  locale,
}: {
  order: PortalOrder
  locale: 'vi' | 'en'
}) {
  const vi = locale === 'vi'
  const isConsolidated = order.classification === 'consolidated'
  const isPending = order.classification === 'pending_merge'

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-sm font-medium text-ink">{order.id}</p>
        <p className="mt-0.5 font-mono text-[11px] text-ink-tertiary">
          {isPending
            ? (order.proposed_package_id ?? order.package_id)
            : order.package_id}
        </p>
        <p className="mt-0.5 text-xs text-ink-subtle">{order.customer_name}</p>
      </div>

      <div className="rounded-xl border border-hairline bg-canvas p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Link2 className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
            Matching Criteria
          </div>
          <ClassificationBadge
            classification={order.classification}
            locale={locale}
          />
        </div>

        {(isConsolidated || isPending) && order.match_criteria ? (
          <div className="space-y-3">
            <ul className="space-y-1.5 text-xs text-ink">
              <li className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 font-mono">
                {order.match_criteria.phone_display}
              </li>
              <li className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 font-mono">
                {order.match_criteria.address_display}
              </li>
            </ul>
            <div className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-2 text-xs text-primary-hover">
              <p className="font-mono leading-relaxed">
                {order.source_orders.map((s) => s.label).join(' + ')}
              </p>
              <p className="mt-1.5 font-mono text-[11px]">
                → AOFP Package #
                {isPending
                  ? (order.proposed_package_id ?? order.package_id)
                  : order.package_id}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-subtle">
            {vi
              ? 'Đơn standalone — không khớp Phone/Address với đơn kênh khác.'
              : 'Standalone order — no Phone/Address match across channels.'}
          </p>
        )}

        <div className="mt-3">
          <DbStatusBadge status={order.db_status} locale={locale} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-ink-subtle uppercase">
          {vi ? 'Sản phẩm' : 'Items'}
        </p>
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li
              key={item.sku}
              className="flex items-center justify-between rounded-md border border-hairline bg-canvas px-3 py-2"
            >
              <div>
                <p className="text-sm text-ink">{item.name}</p>
                <p className="font-mono text-[11px] text-ink-tertiary">
                  {item.sku}
                  {item.fragile ? ' · Fragile' : ''}
                </p>
              </div>
              <span className="font-mono text-xs text-ink-muted">×{item.qty}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-hairline bg-canvas p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <Box className="h-4 w-4 text-tiktok" strokeWidth={1.75} />
          {vi ? 'Gợi ý AI' : 'AI Recommendation'}
        </div>
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-subtle">{vi ? 'Mã hộp' : 'Box Code'}</dt>
            <dd className="font-mono font-medium text-ink">{order.ai_box}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-subtle">{vi ? 'Kích thước' : 'Dimensions'}</dt>
            <dd className="font-mono text-ink">{order.ai_dimensions}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-subtle">
              {vi ? 'Tỷ lệ lấp đầy' : 'Space Utilization'}
            </dt>
            <dd className="font-mono text-success">
              {Math.round(order.fill_ratio * 100)}%
            </dd>
          </div>
        </dl>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${order.fill_ratio * 100}%` }}
          />
        </div>
        {order.cushioning ? (
          <p className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
            {order.cushioning}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function SidePanel({
  order,
  locale,
  drawerMode,
  onClose,
  onConfirmConsolidate,
  onUnmerge,
}: {
  order: PortalOrder
  locale: 'vi' | 'en'
  drawerMode: 'consolidate' | 'inspect'
  onClose: () => void
  onConfirmConsolidate: () => void
  onUnmerge: () => void
}) {
  const vi = locale === 'vi'
  const showConsolidationActions =
    drawerMode === 'consolidate' ||
    order.classification === 'pending_merge' ||
    order.classification === 'consolidated'

  if (showConsolidationActions && drawerMode === 'consolidate') {
    return (
      <ConsolidationActionDrawer
        order={order}
        locale={locale}
        mode="consolidate"
        onClose={onClose}
        onConfirmConsolidate={onConfirmConsolidate}
        onUnmerge={onUnmerge}
      />
    )
  }

  return (
    <aside className="flex w-full flex-col border-l border-hairline bg-surface-1 lg:w-[400px]">
      <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
          <h2 className="text-sm font-medium text-ink">
            Consolidation · AI Packing
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <PackingInspectorBody order={order} locale={locale} />
      </div>

      <div className="space-y-2 border-t border-hairline p-4">
        {order.classification === 'pending_merge' ? (
          <Button
            variant="primary"
            className="w-full shadow-[0_0_20px_rgba(99,102,241,0.25)]"
            onClick={onConfirmConsolidate}
          >
            <Check className="mr-1.5 h-4 w-4" />
            {vi ? 'Xác nhận Gộp đơn' : 'Confirm Consolidation'}
          </Button>
        ) : null}
        {order.classification === 'consolidated' ? (
          <Button variant="ghost" className="w-full" onClick={onUnmerge}>
            <Split className="mr-1.5 h-4 w-4" />
            {vi ? 'Tách đơn / Unmerge' : 'Unmerge / Tách đơn'}
          </Button>
        ) : null}
        <Button variant="primary" className="w-full">
          <Check className="mr-1.5 h-4 w-4" />
          {vi ? 'Duyệt AI Packing' : 'Approve AI Packing'}
        </Button>
        <Button variant="ghost" className="w-full">
          <Printer className="mr-1.5 h-4 w-4" />
          {vi ? 'In nhãn (PDF/QR)' : 'Print Shipping Label (PDF/QR)'}
        </Button>
      </div>
    </aside>
  )
}

export function OrdersPage() {
  const { locale, setScannerOpen } = usePortal()
  const vi = locale === 'vi'
  const [orders, setOrders] = useState<PortalOrder[]>(() =>
    structuredClone(initialOrders),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<'consolidate' | 'inspect'>(
    'inspect',
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [platformFilter, setPlatformFilter] = useState<Channel | 'all'>('all')

  const pendingMergeCount = orders.filter(
    (o) => o.classification === 'pending_merge',
  ).length

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter === 'merge_eligible' && o.classification !== 'pending_merge')
        return false
      if (statusFilter === 'standalone' && o.classification !== 'standalone')
        return false
      if (statusFilter === 'synced' && o.db_status !== 'synced') return false
      if (platformFilter !== 'all' && !o.channels.includes(platformFilter))
        return false
      return true
    })
  }, [orders, statusFilter, platformFilter])

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId],
  )

  const filterTabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: vi ? 'All Orders' : 'All Orders' },
    {
      key: 'merge_eligible',
      label: vi
        ? `Merge Eligible (${pendingMergeCount})`
        : `Merge Eligible (${pendingMergeCount})`,
    },
    { key: 'standalone', label: 'Standalone' },
    { key: 'synced', label: vi ? 'Synced to DB' : 'Synced to DB' },
  ]

  function openConsolidate(id: string) {
    setSelectedId(id)
    setDrawerMode('consolidate')
  }

  function openInspect(id: string) {
    setSelectedId(id)
    setDrawerMode('inspect')
  }

  function closeDrawer() {
    setSelectedId(null)
    setDrawerMode('inspect')
  }

  function confirmConsolidate(orderId: string) {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o
        const pkg = o.proposed_package_id ?? proposePackageId()
        return {
          ...o,
          classification: 'consolidated' as const,
          status: 'consolidated' as const,
          package_id: pkg,
          proposed_package_id: undefined,
          db_status: 'synced' as const,
          consolidation_hint: vi
            ? `Đã gộp ${o.source_orders.length} đơn · lưu MongoDB`
            : `Merged ${o.source_orders.length} orders · synced to MongoDB`,
        }
      }),
    )
    setDrawerMode('inspect')
  }

  function unmergeOrder(orderId: string) {
    setOrders((prev) => {
      const target = prev.find((o) => o.id === orderId)
      if (!target || target.source_orders.length < 2) {
        return prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                classification: 'standalone' as const,
                status: 'pending' as const,
                package_id: `PKG-${o.id}`,
                match_criteria: undefined,
                matching_badge: undefined,
                consolidation_hint: undefined,
                channels: o.channels.slice(0, 1),
                source_orders: o.source_orders.slice(0, 1),
                db_status: 'synced' as const,
              }
            : o,
        )
      }

      const [first, ...rest] = target.source_orders
      const splitRows: PortalOrder[] = [
        {
          ...target,
          id: `${target.id}-A`,
          package_id: `PKG-${first.external_id}`,
          proposed_package_id: undefined,
          external_ids: [first.external_id],
          channels: [first.channel],
          source_orders: [first],
          classification: 'standalone',
          status: 'pending',
          db_status: 'synced',
          match_criteria: undefined,
          matching_badge: undefined,
          consolidation_hint: undefined,
          item_count: Math.max(1, Math.ceil(target.item_count / 2)),
        },
        ...rest.map((src, i) => ({
          ...target,
          id: `${target.id}-B${i || ''}`,
          package_id: `PKG-${src.external_id}`,
          proposed_package_id: undefined,
          external_ids: [src.external_id],
          channels: [src.channel] as PortalOrder['channels'],
          source_orders: [src],
          classification: 'standalone' as const,
          status: 'pending' as const,
          db_status: 'synced' as const,
          match_criteria: undefined,
          matching_badge: undefined,
          consolidation_hint: undefined,
          item_count: Math.max(1, Math.floor(target.item_count / 2)),
        })),
      ]

      return prev.flatMap((o) => (o.id === orderId ? splitRows : [o]))
    })
    closeDrawer()
  }

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Đơn đa kênh' : 'Omnichannel Orders' },
        ]}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
        <main className="min-w-0 flex-1 overflow-auto bg-canvas p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi ? 'Đơn hàng đa kênh' : 'Omnichannel Orders'}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {vi
                  ? 'Webhook → Kafka → Match Phone/Address → Gộp đơn → MongoDB'
                  : 'Webhook → Kafka → Phone/Address match → Consolidate → MongoDB'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                className="h-9 min-h-9 text-xs"
                onClick={() => setScannerOpen(true)}
              >
                <ScanLine className="mr-1.5 h-3.5 w-3.5" />
                {vi ? 'Quét mã kho' : 'Warehouse scan'}
              </Button>
              {pendingMergeCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-hover">
                  <Sparkles className="h-3.5 w-3.5" />
                  {pendingMergeCount}{' '}
                  {vi ? 'nhóm chờ gộp' : 'pending consolidations'}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mb-3">
            <StreamActivityHeader locale={locale} />
          </div>

          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface-1 p-1">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === tab.key
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-ink-subtle hover:bg-canvas hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="shrink-0">{vi ? 'Platform' : 'Platform'}</span>
              <select
                value={platformFilter}
                onChange={(e) =>
                  setPlatformFilter(e.target.value as Channel | 'all')
                }
                className="h-9 rounded-lg border border-hairline bg-surface-1 px-2.5 font-mono text-xs text-ink focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="all">{vi ? 'All platforms' : 'All platforms'}</option>
                <option value="shopee">Shopee</option>
                <option value="tiktok">TikTok Shop</option>
                <option value="facebook">Facebook</option>
                <option value="lazada">Lazada</option>
              </select>
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm text-ink">
                <thead>
                  <tr className="border-b border-hairline text-ink-subtle">
                    <th className="px-4 py-3 font-medium">Order / Package</th>
                    <th className="px-4 py-3 font-medium">
                      {vi ? 'Phân loại' : 'Class'}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {vi ? 'Kênh' : 'Channel'}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {vi ? 'Khách' : 'Customer'}
                    </th>
                    <th className="px-4 py-3 font-medium">Items</th>
                    <th className="px-4 py-3 font-medium">Vol. Weight</th>
                    <th className="px-4 py-3 font-medium">AI Box</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">
                      {vi ? 'Thao tác' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className={`border-b border-hairline/70 last:border-0 hover:bg-surface-2/60 ${
                        selectedId === order.id ? 'bg-indigo-500/5' : ''
                      } ${
                        order.classification === 'pending_merge'
                          ? 'bg-indigo-500/[0.04]'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono font-medium text-ink">
                          {order.id}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-ink-tertiary">
                          {order.classification === 'pending_merge'
                            ? (order.proposed_package_id ?? order.package_id)
                            : order.package_id}
                        </p>
                        <div className="mt-1.5">
                          <DbStatusBadge
                            status={order.db_status}
                            locale={locale}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ClassificationBadge
                          classification={order.classification}
                          locale={locale}
                        />
                        {order.matching_badge &&
                        order.classification !== 'standalone' ? (
                          <p className="mt-1.5 max-w-[180px] text-[11px] text-indigo-300">
                            {order.matching_badge}
                          </p>
                        ) : order.consolidation_hint ? (
                          <p className="mt-1.5 max-w-[160px] text-[11px] text-ink-subtle">
                            {order.consolidation_hint}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap gap-1">
                            {order.channels.map((ch) => (
                              <span
                                key={ch}
                                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${channelColors[ch]}`}
                              >
                                {channelLabels[ch]}
                              </span>
                            ))}
                          </div>
                          {(order.classification === 'pending_merge' ||
                            order.classification === 'consolidated') &&
                          order.source_orders.length > 0 ? (
                            <ul className="space-y-0.5">
                              {order.source_orders.map((src) => (
                                <li
                                  key={src.external_id}
                                  className="font-mono text-[10px] text-ink-subtle"
                                >
                                  {channelLabels[src.channel]}: #
                                  {src.external_id}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {order.customer_name}
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {order.item_count}
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {order.volumetric_weight_g}g
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-ink">{order.ai_box}</p>
                        <p className="font-mono text-[11px] text-ink-tertiary">
                          {order.ai_dimensions}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(order.status)}>
                          {vi
                            ? statusLabelsVi[order.status]
                            : order.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          {order.classification === 'pending_merge' ? (
                            <button
                              type="button"
                              onClick={() => openConsolidate(order.id)}
                              className="inline-flex h-8 items-center rounded-md bg-indigo-600 px-2.5 text-xs font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-500"
                            >
                              <GitMerge className="mr-1 h-3.5 w-3.5" />
                              {vi
                                ? `Gộp ${order.source_orders.length} đơn`
                                : 'Consolidate Orders'}
                            </button>
                          ) : null}
                          {order.classification === 'consolidated' ? (
                            <button
                              type="button"
                              onClick={() => openConsolidate(order.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-ink-subtle hover:text-indigo-300"
                            >
                              <Split className="h-3 w-3" />
                              {vi ? 'Tách đơn' : 'Unmerge'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openInspect(order.id)}
                            className="inline-flex h-8 items-center rounded-md border border-hairline bg-canvas px-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-indigo-500/40 hover:text-ink"
                          >
                            Inspect / AI Review
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredOrders.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-subtle">
                  {vi ? 'Không có đơn khớp bộ lọc.' : 'No orders match filters.'}
                </p>
              ) : null}
            </div>
          </div>
        </main>

        {selected ? (
          <div className="hidden lg:flex">
            <SidePanel
              order={selected}
              locale={locale}
              drawerMode={drawerMode}
              onClose={closeDrawer}
              onConfirmConsolidate={() => confirmConsolidate(selected.id)}
              onUnmerge={() => unmergeOrder(selected.id)}
            />
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Đóng"
            onClick={closeDrawer}
          />
          <div className="relative z-10 ml-auto flex h-full w-full max-w-sm">
            <SidePanel
              order={selected}
              locale={locale}
              drawerMode={drawerMode}
              onClose={closeDrawer}
              onConfirmConsolidate={() => confirmConsolidate(selected.id)}
              onUnmerge={() => unmergeOrder(selected.id)}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}
