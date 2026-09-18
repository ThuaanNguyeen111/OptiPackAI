import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
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
import { getDemoOrderDetail } from '../../data/demo-multi-platform-orders'
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
  'h-9 cursor-pointer appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-slate-300'

/**
 * Ops list = CSS grid (không dùng <table>).
 * Cột Thao tác = max-content (ôm nút, sát mép phải); phần rộng thừa chia cho cột nội dung.
 */
const OPS_GRID =
  'grid w-full min-w-[1100px] grid-cols-[32px_minmax(190px,1.4fr)_130px_minmax(160px,1.4fr)_60px_minmax(110px,1fr)_100px_110px_minmax(120px,0.9fr)_max-content] items-stretch'

const OPS_HEAD_CELL =
  'px-3 py-3.5 text-center text-[10px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400'

const OPS_BODY_CELL = 'flex w-full items-center justify-center px-3 py-3.5 text-xs'

const OPS_COL = {
  expand: 'w-8 shrink-0 justify-start self-start pl-1.5 pr-0',
  order: 'min-w-[190px] justify-center text-center px-2',
  channel: 'w-[130px] justify-center text-center',
  recipient: 'min-w-[160px] justify-center text-center',
  items: 'w-[60px] justify-center text-center',
  total: 'min-w-[110px] justify-center text-center whitespace-nowrap',
  group: 'w-[120px] justify-center text-center',
  status: 'w-[110px] justify-center text-center',
  created:
    'min-w-[120px] justify-center text-center font-mono text-[11px] tabular-nums whitespace-nowrap',
  action: 'justify-end text-right whitespace-nowrap pl-3 pr-6',
} as const

function platformLabel(platform: string): string {
  if (platform === 'lazada') return 'Lazada'
  if (platform === 'tiktok') return 'TikTok'
  if (platform === 'tiki') return 'Tiki'
  if (platform === 'shopee') return 'Shopee'
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

function isCanceledStatus(status: string): boolean {
  return status === 'canceled'
}

const opsFilterInputClass =
  'border-slate-300 rounded-md shadow-sm text-xs font-medium bg-white focus-visible:border-indigo-500'

const opsTabTriggerClass =
  'gap-1.5 font-semibold data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white dark:data-[state=active]:bg-indigo-600 dark:data-[state=active]:text-white'

function PlatformPill({ platform }: { platform: string }) {
  const label = platformLabel(platform)
  const tone =
    platform === 'lazada'
      ? 'border-indigo-200/80 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300'
      : platform === 'tiktok'
        ? 'border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
        : platform === 'shopee'
          ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300'
          : 'border-slate-200/80 bg-slate-50 text-slate-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-slate-300'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${tone}`}
    >
      {label}
    </span>
  )
}

/** ≥2 nền tảng → xếp dọc trong cột Kênh (dễ đọc hơn xếp ngang). */
function PlatformPillsCell({
  platforms,
}: {
  platforms: string[]
}) {
  const unique = [...new Set(platforms.map((p) => p.toLowerCase()))]
  if (unique.length <= 1) {
    return <PlatformPill platform={unique[0] ?? platforms[0] ?? ''} />
  }
  return (
    <div className="flex flex-col items-center gap-1">
      {unique.map((p) => (
        <PlatformPill key={p} platform={p} />
      ))}
    </div>
  )
}

function memberItemSummary(member: MarketplaceOrderListItem): string {
  const detail = getDemoOrderDetail(member.id)
  if (!detail?.items.length) {
    return `${member.itemCount} SP`
  }
  const names = detail.items.map((i) => i.name).join(' + ')
  return `${member.itemCount} SP (${names})`
}

/** Cột Mã đơn — không chứa chevron (chevron ở cột riêng sát trái). */
function OrderIdCell({
  members,
  groupCode,
  multiPlatform,
  onOpen,
  vi,
}: {
  members: MarketplaceOrderListItem[]
  groupCode?: string
  multiPlatform: boolean
  onOpen: (order: MarketplaceOrderListItem) => void
  vi: boolean
}) {
  const primary = members[0]
  if (!primary) return null

  return (
    <div className="flex min-w-0 flex-col items-center justify-center text-center">
      {multiPlatform && groupCode ? (
        <span className="inline-flex items-center rounded border border-purple-200/60 bg-purple-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-purple-700 dark:border-purple-800/60 dark:bg-purple-950/40 dark:text-purple-300">
          {groupCode}
        </span>
      ) : (
        <button
          type="button"
          className="mx-auto block max-w-full cursor-pointer truncate text-center font-mono text-[13px] font-semibold tabular-nums text-indigo-600 transition-colors hover:text-indigo-500 hover:underline dark:text-indigo-400"
          onClick={() => onOpen(primary)}
          title={vi ? 'Xem chi tiết đơn' : 'View order detail'}
        >
          #{displayOrderNumber(primary)}
        </button>
      )}
      {members.length > 1 ? (
        <p className="mt-0.5 text-[10px] leading-tight text-slate-400 dark:text-slate-500">
          {vi
            ? `${members.length} mã đơn`
            : `${members.length} order IDs`}
        </p>
      ) : null}
    </div>
  )
}

/** Nút mở rộng — mọi dòng đều có, sát mép trái, neo theo dòng đầu. */
function RowExpandToggle({
  expanded,
  onToggle,
  vi,
}: {
  expanded: boolean
  onToggle: () => void
  vi: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-slate-100/80 dark:hover:bg-zinc-800/60"
      aria-expanded={expanded}
      aria-label={
        expanded
          ? vi
            ? 'Thu gọn'
            : 'Collapse'
          : vi
            ? 'Xem chi tiết dòng'
            : 'Expand row'
      }
    >
      <ChevronRight
        className={cn(
          'h-4 w-4 text-slate-400 transition-transform duration-200 hover:text-slate-600',
          expanded && 'rotate-90 text-slate-600',
        )}
      />
    </button>
  )
}

function OrderExpandPanel({
  members,
  onOpen,
  vi,
  accent = 'indigo',
}: {
  members: MarketplaceOrderListItem[]
  onOpen: (order: MarketplaceOrderListItem) => void
  vi: boolean
  accent?: 'indigo' | 'slate'
}) {
  const isIndigo = accent === 'indigo'
  return (
    <div
      className={cn(
        'border-b px-3 py-2.5',
        isIndigo
          ? 'border-indigo-100 border-l-[3px] border-l-indigo-400/90 bg-indigo-50/40 dark:border-indigo-900/50 dark:border-l-indigo-500 dark:bg-indigo-950/30'
          : 'border-slate-100 border-l-[3px] border-l-slate-300 bg-slate-50/60 dark:border-zinc-800 dark:border-l-zinc-600 dark:bg-zinc-900/40',
      )}
    >
      <p
        className={cn(
          'mb-2 pl-8 text-[10px] font-semibold uppercase tracking-wider',
          isIndigo
            ? 'text-indigo-500/80 dark:text-indigo-400/80'
            : 'text-slate-400 dark:text-slate-500',
        )}
      >
        {vi ? 'Sàn · mã đơn' : 'Channel · order ID'}
      </p>
      <div
        className={cn(
          'ml-8 overflow-hidden rounded-lg border bg-white dark:bg-zinc-900',
          isIndigo
            ? 'border-indigo-100/90 dark:border-indigo-900/60'
            : 'border-slate-200/80 dark:border-zinc-700',
        )}
      >
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem_7rem] gap-2 border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:border-zinc-800 dark:text-slate-500">
          <span>{vi ? 'Sàn' : 'Channel'}</span>
          <span>{vi ? 'Mã đơn / SP' : 'Order / Items'}</span>
          <span className="text-center">{vi ? 'SL' : 'Qty'}</span>
          <span className="text-right">{vi ? 'Tổng' : 'Total'}</span>
        </div>
        {members.map((m, idx) => {
          const isLast = idx === members.length - 1
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m)}
              className="grid w-full cursor-pointer grid-cols-[6.5rem_minmax(0,1fr)_3.5rem_7rem] gap-2 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50/80 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 shrink-0 select-none font-mono text-[11px] text-slate-300 dark:text-zinc-600"
                  aria-hidden
                >
                  {members.length > 1 ? (isLast ? '└' : '├') : '·'}
                </span>
                <PlatformPill platform={m.platform} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-mono text-[12px] font-semibold text-indigo-600 dark:text-indigo-400">
                  #{displayOrderNumber(m)}
                </span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {memberItemSummary(m)}
                </span>
              </span>
              <span className="text-center font-mono text-sm tabular-nums text-slate-700 dark:text-slate-300">
                {m.itemCount}
              </span>
              <span className="text-right font-mono text-[12px] tabular-nums text-slate-800 dark:text-slate-200">
                {formatCurrency(m.totalAmount, m.currency)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
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
  groupMetaById?: Map<
    string,
    {
      multiPlatform: boolean
      orderIdsText: string
      count: number
      groupCode?: string
      members?: MarketplaceOrderListItem[]
    }
  >
  showDemoBanner?: boolean
  loading: boolean
  loadingMore: boolean
  nextCursor: string | null
  emptyMessage: string
  colSpan: number
  onOpenDetail: (order: MarketplaceOrderListItem) => void
  /** Owner whitelist không có warehouse — ẩn CTA Lấy hàng */
  canPick?: boolean
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
  groupMetaById,
  showDemoBanner = false,
  loading,
  loadingMore,
  nextCursor,
  emptyMessage,
  colSpan,
  onOpenDetail,
  canPick = true,
  onPickOrder,
  onLoadMore,
  selectedOrderId,
  onCloseDetail,
  onOpenOrderId,
}: MarketplaceOrdersViewProps) {
  const vi = locale === 'vi'
  const selectClass = ops ? opsSelectClass : adminSelectClass
  /** UI-only: accordion mở/đóng cho hàng gộp đa sàn */
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  )

  function toggleGroupExpanded(groupId: string): void {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

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
                  <TabsList className="h-9 border border-slate-200 bg-slate-100 p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
                    <TabsTrigger
                      value="grouped"
                      className={opsTabTriggerClass}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      {vi
                        ? `Đơn gộp (${groupedCount})`
                        : `Grouped (${groupedCount})`}
                    </TabsTrigger>
                    <TabsTrigger
                      value="standalone"
                      className={opsTabTriggerClass}
                    >
                      <Package className="h-3.5 w-3.5" />
                      {vi
                        ? `Đơn lẻ (${standaloneCount})`
                        : `Standalone (${standaloneCount})`}
                    </TabsTrigger>
                    <TabsTrigger value="all" className={opsTabTriggerClass}>
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
                  className={cn(
                    'pl-9 font-mono placeholder:font-sans',
                    opsFilterInputClass,
                  )}
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
                    ? cn(
                        'pr-8 font-mono placeholder:font-sans',
                        opsFilterInputClass,
                      )
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
            </div>
          ) : null}

          {ops && showDemoBanner ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-3.5 py-2.5 text-xs text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
              <strong className="font-semibold">
                {vi ? 'Demo gộp đa sàn (FE): ' : 'Multi-platform demo (FE): '}
              </strong>
              {vi
                ? 'BE live chỉ gộp cùng sàn. Dòng Lazada + TikTok (Trần Văn An) là DEMO FE — mở chi tiết hoặc tab 「Đơn gộp」. Không phải dữ liệu sync thật.'
                : 'Live BE consolidates same-platform only. The Lazada + TikTok row is FE DEMO — open detail or the Grouped tab. Not from live sync.'}
            </div>
          ) : null}

          <Card
            className={
              ops
                ? 'overflow-hidden py-0 shadow-sm'
                : 'overflow-hidden rounded-xl border-hairline bg-surface-1 py-0 shadow-none'
            }
          >
            {ops ? (
              <div className="w-full overflow-x-auto">
                <div className="w-full min-w-[1100px]">
                <div
                  className={`${OPS_GRID} border-b border-slate-200/60 dark:border-zinc-800`}
                >
                  <div
                    className={cn(OPS_HEAD_CELL, OPS_COL.expand, 'px-0')}
                    aria-hidden
                  />
                  <div className={cn(OPS_HEAD_CELL, OPS_COL.order)}>
                    {vi ? 'Mã đơn' : 'Order'}
                  </div>
                  <div className={cn(OPS_HEAD_CELL, OPS_COL.channel)}>
                    {vi ? 'Kênh' : 'Channel'}
                  </div>
                  <div className={cn(OPS_HEAD_CELL, OPS_COL.recipient)}>
                    {vi ? 'Người nhận' : 'Recipient'}
                  </div>
                  <div className={cn(OPS_HEAD_CELL, OPS_COL.items)}>
                    {vi ? 'SP' : 'Items'}
                  </div>
                  <div className={cn(OPS_HEAD_CELL, OPS_COL.total)}>
                    {vi ? 'Tổng' : 'Total'}
                  </div>
                  <div className={cn(OPS_HEAD_CELL, OPS_COL.group)}>
                    {vi ? 'Loại đơn' : 'Order type'}
                  </div>
                  <div className={cn(OPS_HEAD_CELL, OPS_COL.status)}>
                    {vi ? 'Trạng thái' : 'Status'}
                  </div>
                  <div className={cn(OPS_HEAD_CELL, OPS_COL.created)}>
                    {vi ? 'Ghi nhận' : 'Created'}
                  </div>
                  <div
                    className={cn(
                      OPS_HEAD_CELL,
                      OPS_COL.action,
                      'flex items-center justify-end',
                    )}
                  >
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
                    const meta = order.consolidatedGroupId
                      ? groupMetaById?.get(order.consolidatedGroupId)
                      : undefined
                    const multiPlatformGroup =
                      Boolean(grouped && meta?.multiPlatform && meta.members)
                    const members =
                      multiPlatformGroup && meta?.members
                        ? meta.members
                        : [order]
                    const platformCount = new Set(
                      members.map((m) => m.platform.toLowerCase()),
                    ).size
                    const itemCount = members.reduce(
                      (sum, m) => sum + m.itemCount,
                      0,
                    )
                    const totalAmount = members.reduce(
                      (sum, m) => sum + m.totalAmount,
                      0,
                    )
                    const pickableMember =
                      members.find((m) => canStartPicking(m.status)) ?? order
                    const pickable = canStartPicking(pickableMember.status)
                    const isTerminal = !pickable
                    const statusOrder =
                      members.find((m) => m.status === 'pending') ??
                      pickableMember
                    const canceled = isCanceledStatus(statusOrder.status)
                    const rowKey = multiPlatformGroup
                      ? `group-${order.consolidatedGroupId}`
                      : order.id
                    const expandKey = rowKey
                    const expanded = expandedGroupIds.has(expandKey)

                    return (
                      <div key={rowKey}>
                        <div
                          className={cn(
                            OPS_GRID,
                            'border-b border-slate-100/90 transition-colors hover:bg-slate-50/70 dark:border-zinc-800/70 dark:hover:bg-zinc-800/30',
                            isTerminal && !canceled && 'opacity-90',
                            canceled &&
                              'bg-slate-50/50 text-slate-400 hover:bg-slate-50/80 dark:bg-zinc-900/40 dark:text-slate-500',
                            multiPlatformGroup &&
                              !canceled &&
                              'border-l-[3px] border-l-indigo-400/90 bg-indigo-50/25 dark:border-l-indigo-500 dark:bg-indigo-950/20',
                            grouped &&
                              !multiPlatformGroup &&
                              !canceled &&
                              'border-l-2 border-l-slate-200 dark:border-l-zinc-700',
                            expanded && 'border-b-0',
                          )}
                        >
                          <div
                            className={cn(
                              OPS_BODY_CELL,
                              OPS_COL.expand,
                              'items-start self-start py-3.5',
                            )}
                          >
                            <RowExpandToggle
                              expanded={expanded}
                              onToggle={() => toggleGroupExpanded(expandKey)}
                              vi={vi}
                            />
                          </div>
                          <div
                            className={cn(
                              OPS_BODY_CELL,
                              OPS_COL.order,
                              'min-w-0',
                            )}
                          >
                            <OrderIdCell
                              members={members}
                              groupCode={meta?.groupCode}
                              multiPlatform={multiPlatformGroup}
                              onOpen={onOpenDetail}
                              vi={vi}
                            />
                          </div>
                          <div className={cn(OPS_BODY_CELL, OPS_COL.channel)}>
                            <PlatformPillsCell
                              platforms={members.map((m) => m.platform)}
                            />
                          </div>
                          <div
                            className={cn(
                              OPS_BODY_CELL,
                              OPS_COL.recipient,
                              'min-w-0',
                            )}
                          >
                            <div className="min-w-0 text-center">
                              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                {order.recipientName}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                {order.recipientCity}
                              </p>
                            </div>
                          </div>
                          <div
                            className={cn(
                              OPS_BODY_CELL,
                              OPS_COL.items,
                              'font-mono text-sm tabular-nums text-slate-700 dark:text-slate-300',
                            )}
                          >
                            {itemCount}
                          </div>
                          <div
                            className={cn(
                              OPS_BODY_CELL,
                              OPS_COL.total,
                              'font-mono text-sm font-medium tabular-nums text-slate-800 dark:text-slate-200',
                              canceled && 'text-slate-400 dark:text-slate-500',
                            )}
                          >
                            {formatCurrency(totalAmount, order.currency)}
                          </div>
                          <div className={cn(OPS_BODY_CELL, OPS_COL.group)}>
                            <MarketplaceConsolidationBadge
                              grouped={grouped}
                              multiPlatform={
                                grouped
                                  ? (meta?.multiPlatform ?? false)
                                  : false
                              }
                              orderCount={meta?.count ?? (grouped ? 2 : 1)}
                              platformCount={
                                multiPlatformGroup ? platformCount : undefined
                              }
                              platformOrderIdsText={meta?.orderIdsText}
                              compact
                              showOrderIds={false}
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
                          <div className={cn(OPS_BODY_CELL, OPS_COL.status)}>
                            <MarketplaceOrderStatusBadge
                              status={statusOrder.status}
                              locale={locale}
                            />
                          </div>
                          <div
                            className={cn(
                              OPS_BODY_CELL,
                              OPS_COL.created,
                              'leading-tight text-slate-500',
                              canceled && 'text-slate-400',
                            )}
                          >
                            {formatDateTime(order.createdAt)}
                          </div>
                          <div
                            className={cn(
                              OPS_BODY_CELL,
                              OPS_COL.action,
                              'justify-end',
                            )}
                          >
                            {pickable && canPick ? (
                              <Button
                                type="button"
                                variant="primary"
                                title={
                                  vi
                                    ? 'Chuyển sang M2 · Lấy hàng'
                                    : 'Go to M2 · Picking'
                                }
                                onClick={() => onPickOrder(pickableMember.id)}
                                className="bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                              >
                                {vi ? 'Lấy hàng' : 'Pick'}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => onOpenDetail(order)}
                                className={cn(
                                  'h-8 min-h-8 border border-slate-300 bg-transparent px-2.5 text-xs font-medium text-slate-600 shadow-none hover:bg-slate-50 dark:border-zinc-600 dark:text-slate-300 dark:hover:bg-zinc-800',
                                  canceled &&
                                    'border-slate-200 text-slate-400 hover:bg-slate-50/80',
                                )}
                              >
                                {vi ? 'Chi tiết' : 'Detail'}
                              </Button>
                            )}
                          </div>
                        </div>
                        {expanded ? (
                          <OrderExpandPanel
                            members={members}
                            onOpen={onOpenDetail}
                            vi={vi}
                            accent={
                              multiPlatformGroup ? 'indigo' : 'slate'
                            }
                          />
                        ) : null}
                      </div>
                    )
                  })
                )}
                </div>
              </div>
            ) : (
              <Table className="min-w-[920px] text-center text-sm">
                <TableHeader>
                  <TableRow className="border-hairline hover:bg-transparent">
                    <TableHead className="text-center">{vi ? 'Mã đơn' : 'Order'}</TableHead>
                    <TableHead className="text-center">{vi ? 'Người nhận' : 'Recipient'}</TableHead>
                    <TableHead className="text-center">{vi ? 'SP' : 'Items'}</TableHead>
                    <TableHead className="text-center">{vi ? 'Tổng' : 'Total'}</TableHead>
                    <TableHead className="text-center">{vi ? 'Loại đơn' : 'Order type'}</TableHead>
                    <TableHead className="text-center">{vi ? 'Trạng thái' : 'Status'}</TableHead>
                    <TableHead className="text-center">{vi ? 'Ghi nhận' : 'Created'}</TableHead>
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
                      const meta = order.consolidatedGroupId
                        ? groupMetaById?.get(order.consolidatedGroupId)
                        : undefined
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
                          <TableCell className="text-center">
                            <p className="font-medium text-ink">
                              {displayOrderNumber(order)}
                            </p>
                            <p className="font-mono text-[11px] text-ink-tertiary">
                              {order.platform} · {order.shopId}
                            </p>
                          </TableCell>
                          <TableCell className="text-center">
                            <p className="text-ink">{order.recipientName}</p>
                            <p className="text-[11px] text-slate-500">
                              {order.recipientCity}
                            </p>
                          </TableCell>
                          <TableCell className="text-center text-ink-muted">
                            {order.itemCount}
                          </TableCell>
                          <TableCell className="text-center font-mono text-ink-muted">
                            {formatCurrency(
                              order.totalAmount,
                              order.currency,
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center">
                            <MarketplaceConsolidationBadge
                              grouped={grouped}
                              multiPlatform={
                                grouped
                                  ? (meta?.multiPlatform ?? false)
                                  : false
                              }
                              orderCount={meta?.count ?? (grouped ? 2 : 1)}
                              platformOrderIdsText={meta?.orderIdsText}
                              compact
                              showOrderIds={false}
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
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center">
                            <MarketplaceOrderStatusBadge
                              status={order.status}
                              locale={locale}
                            />
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-xs text-ink-subtle">
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
