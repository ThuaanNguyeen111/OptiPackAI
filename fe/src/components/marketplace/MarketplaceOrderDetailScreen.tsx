import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Layers, Loader2 } from 'lucide-react'
import { MarketplaceConsolidationBadge } from './MarketplaceConsolidationBadge'
import { MarketplaceOrderStatusBadge } from './MarketplaceOrderStatusBadge'
import { PortalTopBar } from '../portal/PortalTopBar'
import { usePortal } from '../../context/use-portal'
import { getOrderById, listOrders } from '../../api/orders.api'
import { formatApiError, getApiErrorCode } from '../../lib/api'
import {
  displayOrderNumber,
  type MarketplaceOrderDetail,
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
    groupError: string | null
    error: string | null
    errorCode: string | null
  } | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void getOrderById(id)
      .then(async (detail) => {
        let siblings: MarketplaceOrderListItem[] = []
        let groupError: string | null = null
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
        if (!cancelled) {
          setLoaded({
            id,
            order: detail,
            siblings,
            groupError,
            error: null,
            errorCode: null,
          })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded({
            id,
            order: null,
            siblings: [],
            groupError: null,
            error: formatApiError(err),
            errorCode: getApiErrorCode(err),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const matches = loaded !== null && loaded.id === id
  const order = matches ? loaded.order : null
  const siblings = matches ? loaded.siblings : []
  const groupError = matches ? loaded.groupError : null
  const error = matches ? loaded.error : null
  const errorCode = matches ? loaded.errorCode : null
  const loading = Boolean(id) && !matches
  const orderLabel = order ? displayOrderNumber(order) : (id ?? '—')

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
                      grouped={order.isConsolidated}
                      locale={locale}
                    />
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-ink-tertiary">
                    {order.platform} · shop {order.shopId} · id {order.id}
                  </p>

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
                          {vi
                            ? `Gói hàng đã gộp · ${siblings.length || '—'} đơn`
                            : `Consolidated pack · ${siblings.length || '—'} orders`}
                        </div>
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

                    {groupError ? (
                      <p className="mt-3 text-xs text-error">{groupError}</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {siblings.map((sibling, index) => {
                          const current = sibling.id === order.id
                          return (
                            <li key={sibling.id}>
                              <Link
                                to={detailPath(sibling.id)}
                                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                                  current
                                    ? 'border-primary/40 bg-surface-1 ring-1 ring-primary/20'
                                    : 'border-hairline bg-surface-1 hover:border-primary/30 hover:bg-surface-2/60'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-ink">
                                    {vi ? 'Đơn' : 'Order'} {index + 1} ·{' '}
                                    {displayOrderNumber(sibling)}
                                    {current
                                      ? vi
                                        ? ' (đang xem)'
                                        : ' (this order)'
                                      : ''}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-ink-subtle">
                                    {sibling.itemCount} {vi ? 'SP' : 'items'} ·{' '}
                                    {formatDateTime(sibling.createdAt)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
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
                                </div>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3">
                    <p className="text-xs text-ink-subtle">
                      {vi
                        ? 'Đơn lẻ — chưa có đơn nào khác cùng người nhận / điểm giao để gộp.'
                        : 'Standalone — no other unfulfilled order shares this recipient/delivery point.'}
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-hairline bg-surface-1 p-5">
                  <h2 className="text-sm font-medium text-ink">
                    {vi ? 'Sản phẩm của đơn này' : 'Items on this order'}
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
    </>
  )
}
