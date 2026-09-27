import { useEffect, useState } from 'react'
import {
  Clock,
  Layers,
  Loader2,
  MapPin,
  Package,
  Phone,
  User,
  X,
} from 'lucide-react'
import { getOrderById, listOrders } from '../../api/orders.api'
import { formatApiError } from '../../lib/api'
import {
  displayOrderNumber,
  ORDER_STATUS_LABELS,
  type MarketplaceOrderDetail,
  type MarketplaceOrderListItem,
  type MarketplaceOrderStatus,
} from '../../types/marketplace-orders'
import { formatCurrency, formatDateTime } from '../../utils/format'
import { MarketplaceConsolidationBadge } from '../marketplace/MarketplaceConsolidationBadge'
import { MarketplaceOrderStatusBadge } from '../marketplace/MarketplaceOrderStatusBadge'

type OrderDetailDrawerProps = {
  orderId: string | null
  onClose: () => void
  onOpenOrder?: (orderId: string) => void
  onFilterGroup?: (groupId: string) => void
  locale?: 'vi' | 'en'
}

function platformLabel(platform: string): string {
  if (platform === 'lazada') return 'Lazada'
  if (platform === 'tiktok') return 'TikTok Shop'
  if (platform === 'tiki') return 'Tiki'
  return platform
}

function ChannelBadge({ platform }: { platform: string }) {
  const label = platformLabel(platform)
  if (platform === 'lazada') {
    return (
      <span className="inline-flex items-center rounded-md border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
        {label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200">
      {label}
    </span>
  )
}

function statusToneClass(status: MarketplaceOrderStatus): string {
  if (status === 'canceled' || status === 'failed' || status === 'returned') {
    return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400'
  }
  if (status === 'delivered' || status === 'shipped') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
  }
  if (status === 'pending' || status === 'unpaid') {
    return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
  }
  return 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400'
}

export function OrderDetailDrawer({
  orderId,
  onClose,
  onOpenOrder,
  onFilterGroup,
  locale = 'vi',
}: OrderDetailDrawerProps) {
  const vi = locale === 'vi'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<MarketplaceOrderDetail | null>(null)
  const [siblings, setSiblings] = useState<MarketplaceOrderListItem[]>([])

  useEffect(() => {
    if (!orderId) {
      setOrder(null)
      setSiblings([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void getOrderById(orderId)
      .then(async (detail) => {
        let nextSiblings: MarketplaceOrderListItem[] = []
        if (detail.isConsolidated && detail.consolidatedGroupId) {
          try {
            const res = await listOrders({
              consolidated_group_id: detail.consolidatedGroupId,
              limit: 100,
            })
            nextSiblings = [...res.orders].sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            )
          } catch {
            /* siblings optional */
          }
        }
        if (!cancelled) {
          setOrder(detail)
          setSiblings(nextSiblings)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOrder(null)
          setSiblings([])
          setError(formatApiError(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (!orderId) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/50 backdrop-blur-[2px] transition-opacity"
        aria-label={vi ? 'Đóng' : 'Close'}
        onClick={onClose}
      />

      <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-slate-200/60 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/60 px-5 dark:border-zinc-800">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Package className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-mono text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  {order ? displayOrderNumber(order) : orderId}
                </h2>
                {order ? (
                  <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusToneClass(order.status)}`}
                  >
                    {ORDER_STATUS_LABELS[order.status][locale]}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {vi ? 'Chi tiết đơn · chỉ xem' : 'Order detail · view only'}
                {order ? ` · ${platformLabel(order.platform)}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : error || !order ? (
            <div className="rounded-xl border border-rose-200/80 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
              {error ??
                (vi ? 'Không tải được đơn hàng.' : 'Could not load order.')}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                    {vi ? 'Tóm tắt' : 'Summary'}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                    {order.itemCount} {vi ? 'SP' : 'items'} ·{' '}
                    {formatCurrency(order.totalAmount, order.currency)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-slate-500">
                  <ChannelBadge platform={order.platform} />
                  <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    {formatDateTime(order.createdAt)}
                  </span>
                  <MarketplaceConsolidationBadge
                    grouped={order.isConsolidated}
                    locale={locale}
                  />
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      {vi ? 'Người nhận' : 'Recipient'}
                    </h3>
                  </div>
                  {order.isConsolidated && siblings.length > 1 ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                      <Layers className="h-3 w-3" />
                      {vi
                        ? `Gộp · ${siblings.length}`
                        : `Group · ${siblings.length}`}
                    </span>
                  ) : null}
                </div>

                <div className="mb-4 rounded-xl border border-indigo-200/60 bg-indigo-50/40 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 pb-2.5 dark:border-indigo-900/40">
                    <div>
                      <span className="text-[10px] font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
                        {vi ? 'Người nhận' : 'Recipient'}
                      </span>
                      <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {order.recipientName}
                      </h4>
                    </div>
                    <ChannelBadge platform={order.platform} />
                  </div>
                  <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                    <div className="flex items-start gap-2">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <div>
                        <span className="block text-[10px] text-slate-500">
                          {vi ? 'SĐT' : 'Phone'}
                        </span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {order.recipientPhone || '—'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <div>
                        <span className="block text-[10px] text-slate-500">
                          {vi ? 'Địa chỉ' : 'Address'}
                        </span>
                        <span className="leading-relaxed font-medium text-slate-800 dark:text-slate-200">
                          {[
                            order.recipientAddressLine1,
                            order.recipientAddressLine2,
                            order.recipientCity,
                            order.recipientPostalCode,
                            order.recipientCountry,
                          ]
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {order.isConsolidated &&
                order.consolidatedGroupId &&
                siblings.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold tracking-wider text-slate-700 uppercase dark:text-slate-300">
                        {vi
                          ? `Đơn trong cùng nhóm gộp (${siblings.length}):`
                          : `Orders in this group (${siblings.length}):`}
                      </p>
                      {onFilterGroup && order.consolidatedGroupId ? (
                        <button
                          type="button"
                          className="cursor-pointer text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                          onClick={() => {
                            const gid = order.consolidatedGroupId
                            if (!gid) return
                            onFilterGroup(gid)
                            onClose()
                          }}
                        >
                          {vi ? 'Lọc nhóm trên bảng' : 'Filter group in list'}
                        </button>
                      ) : null}
                    </div>
                    {siblings.map((sibling, idx) => {
                      const current = sibling.id === order.id
                      return (
                        <button
                          key={sibling.id}
                          type="button"
                          disabled={current || !onOpenOrder}
                          onClick={() => onOpenOrder?.(sibling.id)}
                          className={`w-full rounded-xl border p-4 text-left shadow-xs transition-colors ${
                            current
                              ? 'border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30'
                              : 'cursor-pointer border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-surface-1 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {idx + 1}
                              </span>
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-slate-100">
                                  {displayOrderNumber(sibling)}
                                  {current
                                    ? vi
                                      ? ' (đang xem)'
                                      : ' (viewing)'
                                    : ''}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {sibling.itemCount} {vi ? 'SP' : 'items'} ·{' '}
                                  {formatDateTime(sibling.createdAt)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <MarketplaceOrderStatusBadge
                                status={sibling.status}
                                locale={locale}
                              />
                              <span className="font-mono text-xs text-slate-600">
                                {formatCurrency(
                                  sibling.totalAmount,
                                  sibling.currency,
                                )}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-surface-2/40 dark:text-slate-400">
                    {vi
                      ? 'Đơn lẻ — chưa gộp với đơn khác cùng người nhận / điểm giao.'
                      : 'Standalone — not consolidated with another order.'}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-3 font-semibold tracking-wider text-slate-900 uppercase dark:text-slate-100">
                  {vi ? 'Sản phẩm' : 'Products'}
                </h3>
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-surface-2">
                        <th className="px-3 py-2.5 text-left font-semibold">
                          SKU
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold">
                          {vi ? 'Tên' : 'Name'}
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold">
                          {vi ? 'TT' : 'Status'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold">
                          {vi ? 'SL' : 'Qty'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold">
                          {vi ? 'Thành tiền' : 'Line'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {order.items.map((item) => (
                        <tr
                          key={`${item.sku}::${item.status}::${item.platformOrderItemIds.join(',')}`}
                        >
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                            {item.sku}
                          </td>
                          <td className="px-3 py-2.5 text-slate-800 dark:text-slate-100">
                            {item.name}
                            {item.variation ? (
                              <span className="mt-0.5 block text-[10px] text-slate-500">
                                {item.variation}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5">
                            <MarketplaceOrderStatusBadge
                              status={item.status}
                              locale={locale}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-600">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                            {formatCurrency(item.lineTotal, order.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-surface-2">
                        <td
                          colSpan={4}
                          className="px-3 py-2.5 text-right text-slate-500"
                        >
                          {vi ? 'Tổng đơn' : 'Order total'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatCurrency(order.totalAmount, order.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-surface-1">
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
                  {vi ? 'Thông tin hệ thống' : 'System info'}
                </h3>
                <dl className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">platformOrderId</dt>
                    <dd className="font-mono text-slate-700 dark:text-slate-300">
                      {order.platformOrderId}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">shopId</dt>
                    <dd className="font-mono text-slate-700 dark:text-slate-300">
                      {order.shopId}
                    </dd>
                  </div>
                  {order.consolidatedGroupId ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">consolidatedGroupId</dt>
                      <dd className="truncate font-mono text-slate-700 dark:text-slate-300">
                        {order.consolidatedGroupId}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
