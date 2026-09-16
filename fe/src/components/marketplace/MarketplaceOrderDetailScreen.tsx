import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Layers, Loader2 } from 'lucide-react'
import { MarketplaceConsolidationBadge } from './MarketplaceConsolidationBadge'
import { MarketplaceOrderStatusBadge } from './MarketplaceOrderStatusBadge'
import { PortalTopBar } from '../portal/PortalTopBar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { usePortal } from '../../context/use-portal'
import { getOrderById, listOrders } from '../../api/orders.api'
import { formatApiError, getApiErrorCode } from '../../lib/api'
import {
  getDemoOrderDetail,
  getDemoSiblingsForGroup,
  isDemoOrderId,
} from '../../data/demo-multi-platform-orders'
import {
  detachOrderFromGroup,
  filterActiveGroupMembers,
  formatPlatformOrderIds,
  isMultiPlatformGroup,
  shortGroupCode,
} from '../../lib/consolidation-display'
import {
  displayOrderNumber,
  type MarketplaceOrderDetail,
  type MarketplaceOrderItem,
  type MarketplaceOrderListItem,
} from '../../types/marketplace-orders'
import { formatCurrency, formatDateTime } from '../../utils/format'

function recipientSummary(order: MarketplaceOrderDetail, vi: boolean): string {
  const parts = [
    order.recipientName,
    order.recipientPhone,
    order.recipientAddressLine1,
    order.recipientAddressLine2,
    order.recipientCity,
    order.recipientCountry,
  ].filter(Boolean)
  return parts.length > 0
    ? parts.join(' · ')
    : vi
      ? 'Không có thông tin người nhận'
      : 'No recipient info'
}

export type MarketplaceOrderDetailScreenProps = {
  listPath: string
  detailPath: (orderId: string) => string
  groupFilterPath: (groupId: string) => string
  topBarVariant?: 'ops' | 'admin'
  breadcrumbs: (orderLabel: string) => { label: string; to?: string }[]
}

export function MarketplaceOrderDetailScreen({
  listPath,
  detailPath,
  groupFilterPath,
  topBarVariant = 'ops',
  breadcrumbs,
}: MarketplaceOrderDetailScreenProps) {
  const { id } = useParams<{ id: string }>()
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [loaded, setLoaded] = useState<{
    id: string
    order: MarketplaceOrderDetail | null
    siblings: MarketplaceOrderListItem[]
    groupItems: Array<{
      platform: string
      orderNumber: string
      orderId: string
      item: MarketplaceOrderItem
      currency: string
    }>
    groupError: string | null
    error: string | null
    errorCode: string | null
    isDemo: boolean
  } | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load(): Promise<void> {
      if (isDemoOrderId(id)) {
        const detail = getDemoOrderDetail(id)
        if (!detail) {
          if (!cancelled) {
            setLoaded({
              id,
              order: null,
              siblings: [],
              groupItems: [],
              groupError: null,
              error: vi ? 'Không tìm thấy đơn demo.' : 'Demo order not found.',
              errorCode: 'ORD_ORDER_NOT_FOUND',
              isDemo: true,
            })
          }
          return
        }
        const siblings = getDemoSiblingsForGroup(
          detail.consolidatedGroupId ?? '',
        )
        const groupItems: Array<{
          platform: string
          orderNumber: string
          orderId: string
          item: MarketplaceOrderItem
          currency: string
        }> = []
        for (const sib of siblings) {
          const full = getDemoOrderDetail(sib.id)
          if (!full) continue
          for (const item of full.items) {
            groupItems.push({
              platform: full.platform,
              orderNumber: displayOrderNumber(full),
              orderId: full.id,
              item,
              currency: full.currency,
            })
          }
        }
        if (!cancelled) {
          setLoaded({
            id,
            order: detail,
            siblings,
            groupItems,
            groupError: null,
            error: null,
            errorCode: null,
            isDemo: true,
          })
        }
        return
      }

      try {
        const detail = await getOrderById(id)
        let siblings: MarketplaceOrderListItem[] = []
        let groupError: string | null = null
        const groupItems: Array<{
          platform: string
          orderNumber: string
          orderId: string
          item: MarketplaceOrderItem
          currency: string
        }> = []

        if (detail.isConsolidated && detail.consolidatedGroupId) {
          try {
            const res = await listOrders({
              consolidated_group_id: detail.consolidatedGroupId,
              limit: 100,
            })
            siblings = [...res.orders].sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            )
          } catch (err: unknown) {
            groupError = formatApiError(err)
          }
        }

        const siblingIds =
          siblings.length > 0
            ? siblings.map((s) => s.id)
            : [detail.id]
        await Promise.all(
          siblingIds.map(async (sibId) => {
            try {
              const full =
                sibId === detail.id ? detail : await getOrderById(sibId)
              for (const item of full.items) {
                groupItems.push({
                  platform: full.platform,
                  orderNumber: displayOrderNumber(full),
                  orderId: full.id,
                  item,
                  currency: full.currency,
                })
              }
            } catch {
              // bỏ qua sibling lỗi — vẫn hiện SP đơn đang xem
            }
          }),
        )

        if (groupItems.length === 0) {
          for (const item of detail.items) {
            groupItems.push({
              platform: detail.platform,
              orderNumber: displayOrderNumber(detail),
              orderId: detail.id,
              item,
              currency: detail.currency,
            })
          }
        }

        if (!cancelled) {
          setLoaded({
            id,
            order: detail,
            siblings:
              siblings.length > 0
                ? siblings
                : [
                    {
                      id: detail.id,
                      platform: detail.platform,
                      shopId: detail.shopId,
                      platformOrderId: detail.platformOrderId,
                      platformOrderNumber: detail.platformOrderNumber,
                      status: detail.status,
                      recipientName: detail.recipientName,
                      recipientCity: detail.recipientCity,
                      isConsolidated: detail.isConsolidated,
                      consolidatedGroupId: detail.consolidatedGroupId,
                      totalAmount: detail.totalAmount,
                      currency: detail.currency,
                      itemCount: detail.itemCount,
                      createdAt: detail.createdAt,
                    },
                  ],
            groupItems,
            groupError,
            error: null,
            errorCode: null,
            isDemo: false,
          })
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setLoaded({
            id,
            order: null,
            siblings: [],
            groupItems: [],
            groupError: null,
            error: formatApiError(err),
            errorCode: getApiErrorCode(err),
            isDemo: false,
          })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [id, vi])

  const [detachTarget, setDetachTarget] =
    useState<MarketplaceOrderListItem | null>(null)
  const [detachTick, setDetachTick] = useState(0)
  const [platformTab, setPlatformTab] = useState<string>('all')

  const matches = loaded !== null && loaded.id === id
  const order = matches ? loaded.order : null
  const rawSiblings = matches ? loaded.siblings : []
  const groupItems = matches ? loaded.groupItems : []
  const groupError = matches ? loaded.groupError : null
  const error = matches ? loaded.error : null
  const errorCode = matches ? loaded.errorCode : null
  const isDemo = matches ? loaded.isDemo : false
  const loading = Boolean(id) && !matches
  const orderLabel = order ? displayOrderNumber(order) : (id ?? '—')

  const groupKey = order?.consolidatedGroupId ?? ''
  const siblings = useMemo(() => {
    void detachTick
    if (!groupKey) return rawSiblings
    return filterActiveGroupMembers(groupKey, rawSiblings)
  }, [detachTick, groupKey, rawSiblings])

  const multiPlatform = isMultiPlatformGroup(siblings)
  const groupCode = groupKey ? shortGroupCode(groupKey) : null
  const platformIdsText = formatPlatformOrderIds(
    siblings.map((s) => ({
      id: s.id,
      platform: s.platform,
      platformOrderId: s.platformOrderId,
      platformOrderNumber: s.platformOrderNumber,
      status: s.status,
    })),
    locale,
  )
  const platformsInGroup = useMemo(
    () => [...new Set(siblings.map((s) => s.platform.toLowerCase()))],
    [siblings],
  )
  const visibleSiblings =
    platformTab === 'all'
      ? siblings
      : siblings.filter((s) => s.platform.toLowerCase() === platformTab)

  const visibleGroupItems =
    platformTab === 'all'
      ? groupItems.filter((row) =>
          siblings.some((s) => s.id === row.orderId),
        )
      : groupItems.filter(
          (row) =>
            row.platform.toLowerCase() === platformTab &&
            siblings.some((s) => s.id === row.orderId),
        )

  const handleConfirmDetach = () => {
    if (!detachTarget || !groupKey) return
    detachOrderFromGroup(groupKey, detachTarget.id)
    setDetachTarget(null)
    setDetachTick((t) => t + 1)
    setPlatformTab('all')
  }

  return (
    <>
      <PortalTopBar
        variant={topBarVariant}
        breadcrumbs={breadcrumbs(orderLabel)}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Link
            to={listPath}
            className="inline-flex items-center gap-1.5 text-sm text-ink-subtle hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            {vi ? 'Danh sách đơn hàng' : 'Back to orders'}
          </Link>

          {!id ? (
            <div className="rounded-xl border border-hairline bg-surface-1 p-6 text-sm text-ink-subtle">
              {vi ? 'Thiếu mã đơn.' : 'Missing order id.'}
            </div>
          ) : loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-ink-subtle" />
            </div>
          ) : error || !order ? (
            <div className="rounded-xl border border-hairline bg-surface-1 p-6 text-sm text-ink-subtle">
              {error ?? (vi ? 'Không tải được đơn.' : 'Could not load order.')}
              {errorCode === 'ORD_INVALID_ORDER_ID' ||
              errorCode === 'ORD_ORDER_NOT_FOUND' ? (
                <p className="mt-2 text-[11px] text-ink-tertiary">{errorCode}</p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="space-y-4 lg:col-span-2">
                <div className="rounded-xl border border-hairline bg-surface-1 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-lg font-semibold text-ink">
                      {displayOrderNumber(order)}
                    </h1>
                    <MarketplaceOrderStatusBadge
                      status={order.status}
                      locale={locale}
                    />
                    <MarketplaceConsolidationBadge
                      grouped={order.isConsolidated && siblings.length > 1}
                      multiPlatform={
                        order.isConsolidated ? multiPlatform : false
                      }
                      orderCount={siblings.length || 1}
                      platformOrderIdsText={
                        siblings.length > 1 ? platformIdsText : undefined
                      }
                      compact={false}
                      showOrderIds={false}
                      locale={locale}
                    />
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-ink-tertiary">
                    {order.platform} · shop {order.shopId}
                    {isDemo
                      ? vi
                        ? ' · DEMO FE'
                        : ' · FE DEMO'
                      : ''}
                  </p>
                  {siblings.length > 1 ? (
                    <div className="mt-3 space-y-2">
                      {groupCode ? (
                        <p className="text-xs text-ink-muted">
                          {vi ? 'Mã nhóm nội bộ: ' : 'Internal group: '}
                          <span className="font-mono font-semibold text-ink">
                            {groupCode}
                          </span>
                        </p>
                      ) : null}
                      <div>
                        <p className="mb-1.5 text-xs text-ink-subtle">
                          {vi ? 'Mã đơn từng sàn' : 'Order IDs by platform'}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {siblings.map((s) => (
                            <Link
                              key={s.id}
                              to={detailPath(s.id)}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[11px] transition-colors ${
                                s.id === order.id
                                  ? 'border-indigo-400 bg-indigo-50 font-semibold text-indigo-900 dark:border-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-100'
                                  : 'border-hairline bg-surface-2 text-ink-muted hover:border-primary/40'
                              }`}
                            >
                              <span className="capitalize">{s.platform}</span>
                              <span>#{displayOrderNumber(s)}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {isDemo ? (
                    <p className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
                      {vi
                        ? 'Đây là đơn demo FE: Lazada (giày + áo) gộp với TikTok (quần) cùng khách — không phải dữ liệu sync Lazada live.'
                        : 'FE demo order: Lazada (shoes + shirt) consolidated with TikTok (pants) for the same customer — not live Lazada sync data.'}
                    </p>
                  ) : null}

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-subtle">
                        {vi ? 'Người nhận' : 'Recipient'}
                      </dt>
                      <dd className="mt-0.5 font-medium text-ink">
                        {order.recipientName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-subtle">
                        {vi ? 'Điện thoại' : 'Phone'}
                      </dt>
                      <dd className="mt-0.5 font-mono text-ink-muted">
                        {order.recipientPhone || '—'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-ink-subtle">
                        {vi ? 'Địa chỉ' : 'Address'}
                      </dt>
                      <dd className="mt-0.5 text-ink">
                        {[
                          order.recipientAddressLine1,
                          order.recipientAddressLine2,
                          order.recipientCity,
                          order.recipientPostalCode,
                          order.recipientCountry,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </dd>
                    </div>
                  </dl>
                </div>

                {order.isConsolidated && order.consolidatedGroupId ? (
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-ink">
                          <Layers
                            className="h-4 w-4 text-primary-hover"
                            strokeWidth={1.75}
                          />
                          {multiPlatform
                            ? vi
                              ? `Gộp đa sàn · ${siblings.length} đơn`
                              : `Multi-platform · ${siblings.length} orders`
                            : vi
                              ? `Cùng địa chỉ · ${siblings.length || '—'} đơn (chưa đủ đa sàn)`
                              : `Same address · ${siblings.length || '—'} (not multi-platform yet)`}
                          {groupCode ? (
                            <span className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted dark:bg-surface-1">
                              {groupCode}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          {platformIdsText}
                        </p>
                      </div>
                      <Link
                        to={groupFilterPath(order.consolidatedGroupId)}
                        className="text-xs font-medium text-primary-hover hover:underline"
                      >
                        {vi
                          ? 'Lọc nhóm trên danh sách'
                          : 'Filter group in list'}
                      </Link>
                    </div>

                    <p className="mt-3 rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-xs text-ink">
                      {recipientSummary(order, vi)}
                    </p>

                    {/* Platform tabs — click to see that marketplace's order detail */}
                    {platformsInGroup.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPlatformTab('all')}
                          className={`inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                            platformTab === 'all'
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-surface-1 dark:text-slate-300 dark:ring-slate-700'
                          }`}
                        >
                          {vi ? 'Tất cả sàn' : 'All platforms'} ({siblings.length})
                        </button>
                        {platformsInGroup.map((ch) => {
                          const count = siblings.filter(
                            (s) => s.platform.toLowerCase() === ch,
                          ).length
                          return (
                            <button
                              key={ch}
                              type="button"
                              onClick={() => setPlatformTab(ch)}
                              className={`inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-semibold capitalize transition-colors cursor-pointer ${
                                platformTab === ch
                                  ? 'bg-blue-50 font-bold text-blue-700 ring-1 ring-blue-400 dark:bg-blue-950/60 dark:text-blue-300'
                                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-surface-1 dark:text-slate-300 dark:ring-slate-700'
                              }`}
                            >
                              {ch} ({count})
                            </button>
                          )
                        })}
                      </div>
                    ) : null}

                    {groupError ? (
                      <p className="mt-3 text-xs text-error">{groupError}</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {visibleSiblings.map((sibling, index) => {
                          const current = sibling.id === order.id
                          const canceled = sibling.status === 'canceled'
                          return (
                            <li key={sibling.id}>
                              <div
                                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                                  current
                                    ? 'border-primary/40 bg-surface-1 ring-1 ring-primary/20'
                                    : 'border-hairline bg-surface-1'
                                } ${canceled ? 'opacity-80' : ''}`}
                              >
                                <Link
                                  to={detailPath(sibling.id)}
                                  className="min-w-0 flex-1 hover:opacity-90"
                                >
                                  <p className="font-medium text-ink">
                                    <span className="capitalize">
                                      {sibling.platform}
                                    </span>
                                    {' · '}
                                    {displayOrderNumber(sibling)}
                                    {current
                                      ? vi
                                        ? ' (đang xem)'
                                        : ' (this order)'
                                      : ''}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-ink-subtle">
                                    {vi ? 'Đơn' : 'Order'} {index + 1} ·{' '}
                                    {sibling.itemCount}{' '}
                                    {vi ? 'SP' : 'items'} ·{' '}
                                    {formatDateTime(sibling.createdAt)}
                                  </p>
                                </Link>
                                <div className="flex flex-wrap items-center gap-2">
                                  <MarketplaceOrderStatusBadge
                                    status={sibling.status}
                                    locale={locale}
                                  />
                                  <span className="font-mono text-xs text-ink-muted">
                                    {formatCurrency(
                                      sibling.totalAmount,
                                      sibling.currency,
                                    )}
                                  </span>
                                  {canceled || siblings.length > 1 ? (
                                    <button
                                      type="button"
                                      onClick={() => setDetachTarget(sibling)}
                                      className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                                      title={
                                        vi
                                          ? 'Gỡ đơn này khỏi nhóm gộp (Hướng B: phần còn lại tiếp tục)'
                                          : 'Detach from group (keep remaining)'
                                      }
                                    >
                                      {vi ? 'Gỡ khỏi nhóm' : 'Detach'}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    <p className="mt-3 text-[11px] leading-snug text-ink-subtle">
                      {vi
                        ? 'Rule: chỉ gộp khi ≥2 nền tảng khác nhau · Hủy 1 đơn → gỡ khỏi nhóm, đơn sàn còn lại tiếp tục fulfillment (không hủy cả nhóm).'
                        : 'Rule: consolidate only across ≥2 platforms · Cancel one → detach it; remaining platform orders continue.'}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3">
                    <p className="text-xs text-ink-subtle">
                      {vi
                        ? 'Đơn lẻ — gộp chuẩn chỉ khi cùng khách đặt từ ≥2 nền tảng TMĐT khác nhau (không phải nhiều SKU trên 1 sàn).'
                        : 'Standalone — true consolidation needs the same customer on ≥2 marketplaces (not multiple SKUs on one platform).'}
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-hairline bg-surface-1 p-5">
                  <h2 className="text-sm font-medium text-ink">
                    {vi ? 'Sản phẩm của đơn này' : 'Items on this order'}
                    <span className="ml-2 font-mono text-[11px] font-normal text-ink-subtle">
                      ({order.platform} #{displayOrderNumber(order)})
                    </span>
                  </h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-hairline text-ink-subtle">
                          <th className="pb-2 text-left font-medium">SKU</th>
                          <th className="pb-2 text-left font-medium">
                            {vi ? 'Tên' : 'Name'}
                          </th>
                          <th className="pb-2 text-left font-medium">
                            {vi ? 'Trạng thái' : 'Status'}
                          </th>
                          <th className="pb-2 text-right font-medium">
                            {vi ? 'SL' : 'Qty'}
                          </th>
                          <th className="pb-2 text-right font-medium">
                            {vi ? 'Đơn giá' : 'Unit'}
                          </th>
                          <th className="pb-2 text-right font-medium">
                            {vi ? 'Thành tiền' : 'Line'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item) => (
                          <tr
                            key={`${item.sku}::${item.status}::${item.platformOrderItemIds.join(',')}`}
                            className="border-b border-hairline/50 last:border-0"
                          >
                            <td className="py-2 font-mono text-xs text-ink-tertiary">
                              {item.sku}
                            </td>
                            <td className="py-2 text-ink">
                              {item.name}
                              {item.variation ? (
                                <span className="mt-0.5 block text-[11px] text-ink-subtle">
                                  {item.variation}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2">
                              <MarketplaceOrderStatusBadge
                                status={item.status}
                                locale={locale}
                              />
                            </td>
                            <td className="py-2 text-right text-ink-muted">
                              {item.quantity}
                            </td>
                            <td className="py-2 text-right font-mono text-ink-muted">
                              {formatCurrency(item.unitPrice, order.currency)}
                            </td>
                            <td className="py-2 text-right font-mono text-ink-muted">
                              {formatCurrency(item.lineTotal, order.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td
                            colSpan={5}
                            className="pt-3 text-right text-ink-subtle"
                          >
                            {vi ? 'Tổng đơn này' : 'This order'} ·{' '}
                            {order.itemCount} {vi ? 'dòng' : 'lines'}
                          </td>
                          <td className="pt-3 text-right font-mono font-medium text-ink">
                            {formatCurrency(
                              order.totalAmount,
                              order.currency,
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {siblings.length > 1 ? (
                  <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                    <h2 className="text-sm font-medium text-ink">
                      {vi
                        ? 'Toàn bộ sản phẩm trong nhóm gộp'
                        : 'All items in consolidated group'}
                      {groupCode ? (
                        <span className="ml-2 font-mono text-[11px] font-normal text-ink-subtle">
                          {groupCode}
                        </span>
                      ) : null}
                    </h2>
                    <p className="mt-1 text-[11px] text-ink-subtle">
                      {vi
                        ? 'Mỗi dòng gắn nền tảng + mã đơn sàn tương ứng (VD giày/áo Lazada · quần TikTok).'
                        : 'Each row is tagged with marketplace + that platform order ID.'}
                    </p>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-hairline text-ink-subtle">
                            <th className="pb-2 text-left font-medium">
                              {vi ? 'Sàn' : 'Channel'}
                            </th>
                            <th className="pb-2 text-left font-medium">
                              {vi ? 'Mã đơn' : 'Order'}
                            </th>
                            <th className="pb-2 text-left font-medium">SKU</th>
                            <th className="pb-2 text-left font-medium">
                              {vi ? 'Tên' : 'Name'}
                            </th>
                            <th className="pb-2 text-right font-medium">
                              {vi ? 'SL' : 'Qty'}
                            </th>
                            <th className="pb-2 text-right font-medium">
                              {vi ? 'Thành tiền' : 'Line'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleGroupItems.map((row) => (
                            <tr
                              key={`${row.orderId}-${row.item.sku}-${row.item.platformOrderItemIds.join(',')}`}
                              className="border-b border-hairline/50 last:border-0"
                            >
                              <td className="py-2 capitalize text-ink-muted">
                                {row.platform}
                              </td>
                              <td className="py-2">
                                <Link
                                  to={detailPath(row.orderId)}
                                  className="font-mono text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                                >
                                  #{row.orderNumber}
                                </Link>
                              </td>
                              <td className="py-2 font-mono text-xs text-ink-tertiary">
                                {row.item.sku}
                              </td>
                              <td className="py-2 text-ink">
                                {row.item.name}
                                {row.item.variation ? (
                                  <span className="mt-0.5 block text-[11px] text-ink-subtle">
                                    {row.item.variation}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2 text-right text-ink-muted">
                                {row.item.quantity}
                              </td>
                              <td className="py-2 text-right font-mono text-ink-muted">
                                {formatCurrency(
                                  row.item.lineTotal,
                                  row.currency,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-hairline bg-surface-1 p-5">
                <h2 className="text-sm font-medium text-ink">
                  {vi ? 'Thông tin hệ thống' : 'System info'}
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-ink-subtle">platformOrderId</dt>
                    <dd className="font-mono text-xs text-ink-muted">
                      {order.platformOrderId}
                    </dd>
                  </div>
                  {order.consolidatedGroupId ? (
                    <div>
                      <dt className="text-ink-subtle">consolidatedGroupId</dt>
                      <dd className="font-mono text-xs text-ink-muted">
                        {order.consolidatedGroupId}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-ink-subtle">createdAt</dt>
                    <dd className="text-ink-muted">
                      {formatDateTime(order.createdAt)}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          )}
        </div>
      </main>

      <Dialog
        open={Boolean(detachTarget)}
        onOpenChange={(open) => {
          if (!open) setDetachTarget(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {vi ? 'Xác nhận gỡ đơn khỏi nhóm gộp' : 'Confirm detach from group'}
            </DialogTitle>
            <DialogDescription>
              {vi
                ? 'Hướng B: chỉ gỡ đơn này khỏi nhóm. Các đơn sàn còn lại tiếp tục lấy hàng / đóng gói / giao — không hủy cả nhóm.'
                : 'Option B: remove only this order. Remaining platform orders keep fulfilling — the whole group is not canceled.'}
            </DialogDescription>
          </DialogHeader>
          {detachTarget ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-surface-2">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                <span className="capitalize">{detachTarget.platform}</span>
                {' · '}
                {displayOrderNumber(detachTarget)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {vi ? 'Trạng thái:' : 'Status:'} {detachTarget.status}
                {detachTarget.status === 'canceled'
                  ? vi
                    ? ' (đã hủy trên sàn)'
                    : ' (canceled on marketplace)'
                  : ''}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDetachTarget(null)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer dark:border-slate-700 dark:text-slate-200"
            >
              {vi ? 'Hủy' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleConfirmDetach}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white hover:bg-amber-700 cursor-pointer"
            >
              {vi ? 'Gỡ khỏi nhóm' : 'Detach'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
