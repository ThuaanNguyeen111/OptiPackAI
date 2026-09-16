/**
 * Presentational UI only — no API / hooks / business state.
 * Wired by MarketplaceOrdersScreen (logic container).
 */
import { Link } from 'react-router-dom'
import {
  ChevronDown,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Store,
  X,
} from 'lucide-react'
import { MarketplaceConsolidationBadge } from './MarketplaceConsolidationBadge'
import { MarketplaceOrderStatusBadge } from './MarketplaceOrderStatusBadge'
import { OrderDetailDrawer } from '../orders/OrderDetailDrawer'
import { PortalTopBar } from '../portal/PortalTopBar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { cn } from '../../lib/cn'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  displayOrderNumber,
  type ListOrdersParams,
  type MarketplaceOrderListItem,
} from '../../types/marketplace-orders'
import { formatCurrency, formatDateTime } from '../../utils/format'

const adminSelectClass =
  'h-9 cursor-pointer appearance-none rounded-lg border border-hairline bg-surface-1 pl-3 pr-8 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40'

const opsSelectClass =
  'h-9 cursor-pointer appearance-none rounded-lg border border-slate-200/60 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-slate-300'

/** Cùng template cho header + mọi hàng — tránh lệch cột kiểu table-fixed/colgroup. */
const OPS_GRID =
  'grid min-w-[1020px] grid-cols-[minmax(15rem,1.6fr)_5.75rem_minmax(8rem,1.1fr)_2.75rem_6.75rem_5.75rem_6.5rem_7.25rem_6.75rem] items-center'

const OPS_HEAD_CELL =
  'px-4 py-3 text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400'

const OPS_BODY_CELL = 'px-4 py-3.5 text-xs'

function platformLabel(platform: string): string {
  if (platform === 'lazada') return 'Lazada'
  if (platform === 'tiktok') return 'TikTok'
  if (platform === 'tiki') return 'Tiki'
  return platform
}

function canStartPicking(status: string): boolean {
  return ![
    'canceled',
    'failed',
    'returned',
    'delivered',
    'shipped',
  ].includes(status)
}

function PlatformPill({ platform }: { platform: string }) {
  const label = platformLabel(platform)
  const tone =
    platform === 'lazada'
      ? 'border-indigo-200/80 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300'
      : platform === 'tiktok'
        ? 'border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
        : 'border-slate-200/80 bg-slate-50 text-slate-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-slate-300'
  return (
    <Badge
      tone="default"
      className={cn(
        'rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide',
        tone,
      )}
    >
      {label}
    </Badge>
  )
}

export type MarketplaceOrdersViewProps = {
  locale: 'vi' | 'en'
  ops: boolean
  topBarVariant: 'ops' | 'admin'
  breadcrumbs: { label: string; to?: string }[]
  title: string
  marketplacePath: string
  canSync: boolean
  toast: string | null
  onDismissToast: () => void
  consolidateView: 'all' | 'grouped' | 'standalone'
  onConsolidateViewChange: (v: 'all' | 'grouped' | 'standalone') => void
  groupedCount: number
  standaloneCount: number
  searchTerm: string
  onSearchTermChange: (v: string) => void
  shopFilter: string
  onShopFilterChange: (v: string) => void
  shops: { shopId: string; shopName?: string | null }[]
  onSelectShop: (shopId: string) => void
  statusFilter: string
  onStatusFilterChange: (v: string) => void
  groupId: string
  onApplyGroupFilter: (v: string) => void
  onResetFilters: () => void
  syncing: boolean
  onSync: () => void
  listParams: ListOrdersParams
  ordersCount: number
  error: string | null
  needsConnect: boolean
  visibleOrders: MarketplaceOrderListItem[]
  loading: boolean
  loadingMore: boolean
  nextCursor: string | null
  emptyMessage: string
  colSpan: number
  onOpenDetail: (order: MarketplaceOrderListItem) => void
  onPickOrder: (orderId: string) => void
  onLoadMore: () => void
  selectedOrderId: string | null
  onCloseDetail: () => void
  onOpenOrderId: (id: string) => void
}

export function MarketplaceOrdersView({
  locale,
  ops,
  topBarVariant,
  breadcrumbs,
  title,
  marketplacePath,
  canSync,
  toast,
  onDismissToast,
  consolidateView,
  onConsolidateViewChange,
  groupedCount,
  standaloneCount,
  searchTerm,
  onSearchTermChange,
  shopFilter,
  onShopFilterChange,
  shops,
  onSelectShop,
  statusFilter,
  onStatusFilterChange,
  groupId,
  onApplyGroupFilter,
  onResetFilters,
  syncing,
  onSync,
  listParams,
  ordersCount,
  error,
  needsConnect,
  visibleOrders,
  loading,
  loadingMore,
  nextCursor,
  emptyMessage,
  colSpan,
  onOpenDetail,
  onPickOrder,
  onLoadMore,
  selectedOrderId,
  onCloseDetail,
  onOpenOrderId,
}: MarketplaceOrdersViewProps) {
  const vi = locale === 'vi'
  const selectClass = ops ? opsSelectClass : adminSelectClass

  return (
    <>
      <PortalTopBar variant={topBarVariant} breadcrumbs={breadcrumbs} />
      <div
        className={
          ops
            ? 'flex-1 overflow-auto bg-slate-50/50 p-4 sm:p-6 dark:bg-zinc-950'
            : 'flex-1 overflow-auto bg-canvas p-4 sm:p-6'
        }
      >
        <div className="mx-auto max-w-7xl space-y-4">
          {toast && ops ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 shadow-xs dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
              <span>{toast}</span>
              <button
                type="button"
                onClick={onDismissToast}
                className="cursor-pointer text-emerald-700 hover:text-emerald-900 dark:text-emerald-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {ops ? (
            <Card className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                    <Layers className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400">
                      {vi
                        ? 'M1 · Hàng đợi lấy hàng'
                        : 'M1 · Batch picking queue'}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {vi ? (
                        <>
                          Đơn đã đồng bộ từ sàn.{' '}
                          <span className="font-mono text-indigo-700 dark:text-indigo-300">
                            {groupedCount}
                          </span>{' '}
                          đơn gộp ·{' '}
                          <span className="font-mono text-slate-800 dark:text-slate-100">
                            {standaloneCount}
                          </span>{' '}
                          đơn lẻ trên trang này.
                        </>
                      ) : (
                        <>
                          Synced marketplace orders.{' '}
                          <span className="font-mono text-indigo-700">
                            {groupedCount}
                          </span>{' '}
                          grouped ·{' '}
                          <span className="font-mono">{standaloneCount}</span>{' '}
                          standalone on this page.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <Tabs
                  value={consolidateView}
                  onValueChange={(v) => {
                    if (
                      v === 'all' ||
                      v === 'grouped' ||
                      v === 'standalone'
                    ) {
                      onConsolidateViewChange(v)
                    }
                  }}
                >
                  <TabsList className="h-9 bg-slate-100 dark:bg-zinc-800">
                    <TabsTrigger value="grouped" className="gap-1.5 font-semibold">
                      <Layers className="h-3.5 w-3.5" />
                      {vi
                        ? `Đơn gộp (${groupedCount})`
                        : `Grouped (${groupedCount})`}
                    </TabsTrigger>
                    <TabsTrigger
                      value="standalone"
                      className="gap-1.5 font-semibold"
                    >
                      <Package className="h-3.5 w-3.5" />
                      {vi
                        ? `Đơn lẻ (${standaloneCount})`
                        : `Standalone (${standaloneCount})`}
                    </TabsTrigger>
                    <TabsTrigger value="all" className="font-medium">
                      {vi ? 'Tất cả' : 'All'}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </Card>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-ink">
                  {title}
                </h1>
                <p className="mt-1 text-xs text-ink-subtle">
                  {vi
                    ? 'Đơn đã đồng bộ từ sàn · GET /orders'
                    : 'Synced marketplace orders · GET /orders'}
                </p>
              </div>
              {canSync ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={marketplacePath}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-surface-2"
                  >
                    <Store className="h-3.5 w-3.5" />
                    {vi ? 'Kết nối sàn' : 'Connect shop'}
                  </Link>
                  <Button
                    type="button"
                    variant="primary"
                    className="h-9 min-h-9 text-xs"
                    disabled={syncing}
                    onClick={onSync}
                  >
                    {syncing ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {vi ? 'Đồng bộ ngay' : 'Sync now'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          <Card
            className={
              ops
                ? 'flex flex-wrap items-center gap-2 rounded-xl p-3'
                : 'flex flex-wrap items-center gap-2 rounded-xl border-hairline bg-surface-1 p-3 shadow-none'
            }
          >
            {ops ? (
              <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder={
                    vi
                      ? 'Tìm mã đơn, người nhận, shop…'
                      : 'Search order id, recipient, shop…'
                  }
                  value={searchTerm}
                  onChange={(e) => onSearchTermChange(e.target.value)}
                  className="pl-9 font-mono placeholder:font-sans"
                />
              </div>
            ) : null}

            <div className="relative">
              <select
                className={selectClass}
                value={shopFilter}
                onChange={(e) => {
                  const value = e.target.value
                  onShopFilterChange(value)
                  if (value !== 'all') onSelectShop(value)
                }}
              >
                <option value="all">
                  {vi ? 'Shop: Tất cả' : 'Shop: All'}
                </option>
                {shops.map((shop) => (
                  <option key={shop.shopId} value={shop.shopId}>
                    {shop.shopName
                      ? `${shop.shopName} · ${shop.shopId}`
                      : `Lazada · ${shop.shopId}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            <div className="relative">
              <select
                className={selectClass}
                value={statusFilter}
                onChange={(e) => onStatusFilterChange(e.target.value)}
              >
                <option value="all">
                  {vi ? 'Trạng thái: Tất cả' : 'Status: All'}
                </option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ops
                      ? `${vi ? 'Trạng thái' : 'Status'}: ${ORDER_STATUS_LABELS[status][locale]}`
                      : ORDER_STATUS_LABELS[status][locale]}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            <div
              className={`relative ${ops ? 'min-w-[180px] flex-1' : 'min-w-[220px] flex-1'}`}
            >
              <Input
                value={groupId}
                onChange={(e) => onApplyGroupFilter(e.target.value)}
                placeholder={
                  vi
                    ? 'Lọc nhóm gộp (bấm badge Đơn gộp)'
                    : 'Filter group (click Grouped badge)'
                }
                className={
                  ops
                    ? 'pr-8 font-mono placeholder:font-sans'
                    : 'border-hairline bg-surface-1 pr-8 font-mono text-ink placeholder:font-sans placeholder:text-ink-tertiary focus-visible:border-primary focus-visible:ring-primary/40'
                }
              />
              {groupId ? (
                <button
                  type="button"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  onClick={() => onApplyGroupFilter('')}
                  aria-label={vi ? 'Xóa lọc nhóm' : 'Clear group filter'}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {ops ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onResetFilters}
                className="ml-auto h-9 min-h-9 gap-1.5 px-2.5 text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{vi ? 'Đặt lại bộ lọc' : 'Reset filters'}</span>
              </Button>
            ) : null}

            {ops && canSync ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  to={marketplacePath}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200"
                >
                  <Store className="h-3.5 w-3.5" />
                  {vi ? 'Kết nối sàn' : 'Connect'}
                </Link>
                <Button
                  type="button"
                  variant="primary"
                  disabled={syncing}
                  onClick={onSync}
                  className="h-9 min-h-9 bg-indigo-600 px-3 text-xs hover:bg-indigo-500"
                >
                  {syncing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {vi ? 'Đồng bộ ngay' : 'Sync now'}
                </Button>
              </div>
            ) : null}
          </Card>

          {listParams.consolidated_group_id ? (
            <p className="text-[11px] text-slate-500">
              {vi
                ? `Đang xem các đơn cùng nhóm gộp · ${ordersCount} đơn`
                : `Showing orders in this consolidation group · ${ordersCount} orders`}
            </p>
          ) : null}

          {error ? (
            <div
              className={
                ops
                  ? 'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300'
                  : 'rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error'
              }
            >
              {error}
              {needsConnect && canSync ? (
                <>
                  {' '}
                  <Link to={marketplacePath} className="font-medium underline">
                    {vi ? 'Kết nối shop' : 'Connect shop'}
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}

          {ops ? (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <span>
                    {vi ? 'Hàng đợi đơn đa kênh' : 'Omnichannel order queue'}
                  </span>
                  <Badge
                    tone="primary"
                    className="rounded-md font-mono text-xs font-semibold"
                  >
                    {visibleOrders.length}
                  </Badge>
                </h2>
                <span className="text-slate-300 dark:text-zinc-700">|</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {vi
                    ? 'Lazada live · bấm mã đơn để xem chi tiết'
                    : 'Lazada live · click order id for detail'}
                </span>
              </div>
            </div>
          ) : null}

          <Card
            className={
              ops
                ? 'overflow-x-auto py-0 shadow-sm'
                : 'overflow-hidden rounded-xl border-hairline bg-surface-1 py-0 shadow-none'
            }
          >
            {ops ? (
              <div className="w-full">
                <div
                  className={`${OPS_GRID} border-b border-slate-200/60 dark:border-zinc-800`}
                >
                  <div className={OPS_HEAD_CELL}>
                    <div className="flex items-center gap-2.5">
                      <span className="inline-block h-8 w-8 shrink-0" aria-hidden />
                      <span>{vi ? 'Mã đơn' : 'Order'}</span>
                    </div>
                  </div>
                  <div className={OPS_HEAD_CELL}>
                    {vi ? 'Kênh' : 'Channel'}
                  </div>
                  <div className={OPS_HEAD_CELL}>
                    {vi ? 'Người nhận' : 'Recipient'}
                  </div>
                  <div className={OPS_HEAD_CELL}>{vi ? 'SP' : 'Items'}</div>
                  <div className={OPS_HEAD_CELL}>{vi ? 'Tổng' : 'Total'}</div>
                  <div className={OPS_HEAD_CELL}>{vi ? 'Gộp' : 'Group'}</div>
                  <div className={OPS_HEAD_CELL}>
                    {vi ? 'Trạng thái' : 'Status'}
                  </div>
                  <div className={OPS_HEAD_CELL}>
                    {vi ? 'Ghi nhận' : 'Created'}
                  </div>
                  <div className={OPS_HEAD_CELL}>
                    {vi ? 'Thao tác' : 'Action'}
                  </div>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center px-4 py-12 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : visibleOrders.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-slate-500">
                    {emptyMessage}
                  </div>
                ) : (
                  visibleOrders.map((order) => {
                    const grouped =
                      order.isConsolidated &&
                      Boolean(order.consolidatedGroupId)
                    const pickable = canStartPicking(order.status)
                    return (
                      <div
                        key={order.id}
                        className={`${OPS_GRID} border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80 dark:border-zinc-800/80 dark:hover:bg-zinc-800/40`}
                      >
                        <div className={`${OPS_BODY_CELL} whitespace-nowrap`}>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/60 bg-slate-50 text-slate-500 dark:border-zinc-700 dark:bg-zinc-800">
                              <Package
                                className="h-3.5 w-3.5"
                                strokeWidth={1.75}
                              />
                            </span>
                            <div className="min-w-0">
                              <button
                                type="button"
                                className="block max-w-full cursor-pointer truncate text-left font-mono text-[13px] font-semibold text-indigo-600 transition-colors hover:text-indigo-500 hover:underline dark:text-indigo-400"
                                onClick={() => onOpenDetail(order)}
                                title={
                                  vi
                                    ? 'Xem chi tiết đơn'
                                    : 'View order detail'
                                }
                              >
                                {displayOrderNumber(order)}
                              </button>
                              <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                                {order.shopId}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className={OPS_BODY_CELL}>
                          <PlatformPill platform={order.platform} />
                        </div>
                        <div className={OPS_BODY_CELL}>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {order.recipientName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {order.recipientCity}
                          </p>
                        </div>
                        <div
                          className={`${OPS_BODY_CELL} font-mono text-sm tabular-nums text-slate-700 dark:text-slate-300`}
                        >
                          {order.itemCount}
                        </div>
                        <div
                          className={`${OPS_BODY_CELL} font-mono text-sm tabular-nums text-slate-800 dark:text-slate-200`}
                        >
                          {formatCurrency(order.totalAmount, order.currency)}
                        </div>
                        <div className={OPS_BODY_CELL}>
                          <MarketplaceConsolidationBadge
                            grouped={grouped}
                            locale={locale}
                            onClick={
                              grouped && order.consolidatedGroupId
                                ? () =>
                                    onApplyGroupFilter(
                                      order.consolidatedGroupId ?? '',
                                    )
                                : undefined
                            }
                          />
                        </div>
                        <div className={OPS_BODY_CELL}>
                          <MarketplaceOrderStatusBadge
                            status={order.status}
                            locale={locale}
                          />
                        </div>
                        <div
                          className={`${OPS_BODY_CELL} font-mono text-[11px] text-slate-500`}
                        >
                          {formatDateTime(order.createdAt)}
                        </div>
                        <div className={`${OPS_BODY_CELL} whitespace-nowrap`}>
                          <Button
                            type="button"
                            variant="primary"
                            disabled={!pickable}
                            title={
                              pickable
                                ? vi
                                  ? 'Chuyển sang M2 · Lấy hàng'
                                  : 'Go to M2 · Picking'
                                : vi
                                  ? 'Đơn đã hủy / hoàn / giao — không lấy hàng'
                                  : 'Terminal status — picking unavailable'
                            }
                            onClick={() => onPickOrder(order.id)}
                            className="h-8 min-h-8 bg-indigo-600 px-3.5 text-xs font-semibold shadow-sm hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-60 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                          >
                            {vi ? 'Lấy hàng' : 'Pick'}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              <Table className="min-w-[920px] text-left text-sm">
                <TableHeader>
                  <TableRow className="border-hairline hover:bg-transparent">
                    <TableHead>{vi ? 'Mã đơn' : 'Order'}</TableHead>
                    <TableHead>{vi ? 'Người nhận' : 'Recipient'}</TableHead>
                    <TableHead>{vi ? 'SP' : 'Items'}</TableHead>
                    <TableHead>{vi ? 'Tổng' : 'Total'}</TableHead>
                    <TableHead>{vi ? 'Gộp' : 'Group'}</TableHead>
                    <TableHead>{vi ? 'Trạng thái' : 'Status'}</TableHead>
                    <TableHead>{vi ? 'Ghi nhận' : 'Created'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={colSpan}
                        className="px-4 py-12 text-center text-slate-400"
                      >
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : visibleOrders.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={colSpan}
                        className="px-4 py-12 text-center text-sm text-slate-500"
                      >
                        {emptyMessage}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleOrders.map((order) => {
                      const grouped =
                        order.isConsolidated &&
                        Boolean(order.consolidatedGroupId)
                      return (
                        <TableRow
                          key={order.id}
                          className={`cursor-pointer border-hairline/70 last:border-0 hover:bg-surface-2/60 ${
                            grouped
                              ? 'border-l-2 border-l-primary/70 bg-primary/5'
                              : ''
                          }`}
                          onClick={() => onOpenDetail(order)}
                        >
                          <TableCell>
                            <p className="font-medium text-ink">
                              {displayOrderNumber(order)}
                            </p>
                            <p className="font-mono text-[11px] text-ink-tertiary">
                              {order.platform} · {order.shopId}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-ink">{order.recipientName}</p>
                            <p className="text-[11px] text-slate-500">
                              {order.recipientCity}
                            </p>
                          </TableCell>
                          <TableCell className="text-ink-muted">
                            {order.itemCount}
                          </TableCell>
                          <TableCell className="font-mono text-ink-muted">
                            {formatCurrency(
                              order.totalAmount,
                              order.currency,
                            )}
                          </TableCell>
                          <TableCell>
                            <MarketplaceConsolidationBadge
                              grouped={grouped}
                              locale={locale}
                              onClick={
                                grouped && order.consolidatedGroupId
                                  ? () =>
                                      onApplyGroupFilter(
                                        order.consolidatedGroupId ?? '',
                                      )
                                  : undefined
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <MarketplaceOrderStatusBadge
                              status={order.status}
                              locale={locale}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-ink-subtle">
                            {formatDateTime(order.createdAt)}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            )}
            {nextCursor ? (
              <div
                className={
                  ops
                    ? 'border-t border-slate-200 px-4 py-3 dark:border-slate-800'
                    : 'border-t border-hairline px-4 py-3'
                }
              >
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 min-h-9 text-xs"
                  disabled={loadingMore}
                  onClick={onLoadMore}
                >
                  {loadingMore ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {vi ? 'Xem thêm' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      {ops ? (
        <OrderDetailDrawer
          orderId={selectedOrderId}
          locale={locale}
          onClose={onCloseDetail}
          onOpenOrder={onOpenOrderId}
          onFilterGroup={onApplyGroupFilter}
        />
      ) : null}

      {toast && !ops ? (
        <div className="fixed right-4 bottom-4 z-50 max-w-sm rounded-xl border border-success/30 bg-surface-1 px-4 py-3 text-sm font-medium text-ink shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  )
}
