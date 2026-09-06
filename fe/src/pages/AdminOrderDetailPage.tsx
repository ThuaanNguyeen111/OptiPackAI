import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { MarketplaceOrderStatusBadge } from '../components/marketplace/MarketplaceOrderStatusBadge'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { getOrderById } from '../api/orders.api'
import { formatApiError, getApiErrorCode } from '../lib/api'
import {
  displayOrderNumber,
  type MarketplaceOrderDetail,
} from '../types/marketplace-orders'
import { formatCurrency, formatDateTime } from '../utils/format'

export function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [loaded, setLoaded] = useState<{
    id: string
    order: MarketplaceOrderDetail | null
    error: string | null
    errorCode: string | null
  } | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void getOrderById(id)
      .then((detail) => {
        if (!cancelled) {
          setLoaded({ id, order: detail, error: null, errorCode: null })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded({
            id,
            order: null,
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
  const error = matches ? loaded.error : null
  const errorCode = matches ? loaded.errorCode : null
  const loading = Boolean(id) && !matches

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Đơn hàng' : 'Orders', to: '/app/admin/orders' },
          { label: order ? displayOrderNumber(order) : id ?? '—' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Link
            to="/app/admin/orders"
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
                    {order.isConsolidated ? (
                      <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary-hover">
                        {vi ? 'Đơn gộp' : 'Grouped'}
                      </span>
                    ) : null}
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
                      <dt className="text-ink-subtle">{vi ? 'Điện thoại' : 'Phone'}</dt>
                      <dd className="mt-0.5 font-mono text-ink-muted">
                        {order.recipientPhone || '—'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-ink-subtle">{vi ? 'Địa chỉ' : 'Address'}</dt>
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
                    {order.consolidatedGroupId ? (
                      <div className="sm:col-span-2">
                        <dt className="text-ink-subtle">
                          {vi ? 'Nhóm gộp' : 'Consolidation group'}
                        </dt>
                        <dd className="mt-0.5 font-mono text-xs text-ink-muted">
                          {order.consolidatedGroupId}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>

                <div className="rounded-xl border border-hairline bg-surface-1 p-5">
                  <h2 className="text-sm font-medium text-ink">
                    {vi ? 'Sản phẩm' : 'Items'}
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
                          <td colSpan={5} className="pt-3 text-right text-ink-subtle">
                            {vi ? 'Tổng' : 'Total'} · {order.itemCount}{' '}
                            {vi ? 'dòng' : 'lines'}
                          </td>
                          <td className="pt-3 text-right font-mono font-medium text-ink">
                            {formatCurrency(order.totalAmount, order.currency)}
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
