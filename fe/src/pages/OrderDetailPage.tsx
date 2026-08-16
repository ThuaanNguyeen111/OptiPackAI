import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Header } from '../components/layout/Header'
import {
  ConsolidationTypeBadge,
  OrderStatusBadge,
  PipelineBadge,
} from '../components/orders/OrderBadges'
import { SyncTimeline } from '../components/orders/SyncTimeline'
import { Badge } from '../components/ui/Badge'
import { mockOrders } from '../data/mock-orders'
import {
  marketplaceLabels,
  paymentLabels,
  shippingLabels,
} from '../types/orders'
import { formatCurrency, formatDate } from '../utils/format'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const order = mockOrders.find((o) => o.id === id)

  if (!order) {
    return (
      <>
        <Header title="Không tìm thấy đơn" />
        <main className="flex flex-1 items-center justify-center p-6">
          <Link to="/app/orders" className="text-sm text-primary-hover hover:underline">
            ← Quay lại danh sách
          </Link>
        </main>
      </>
    )
  }

  return (
    <>
      <Header
        title={order.id}
        description={`${marketplaceLabels[order.marketplace]} · ${order.external_id}`}
      />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          <Link
            to="/app/orders"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-subtle hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Danh sách đơn hàng
          </Link>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <section className="rounded-lg border border-hairline bg-surface-1 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <OrderStatusBadge status={order.status} />
                  <PipelineBadge status={order.pipeline_status} />
                  <ConsolidationTypeBadge type={order.consolidation_type} />
                  {order.priority === 'urgent' ? (
                    <Badge tone="warning">Ưu tiên</Badge>
                  ) : null}
                  {order.is_duplicate ? (
                    <Badge tone="warning">Trùng lặp</Badge>
                  ) : null}
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-subtle">Khách hàng</dt>
                    <dd className="mt-0.5 font-medium text-ink">
                      {order.customer.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Số điện thoại</dt>
                    <dd className="mt-0.5 font-mono text-ink-muted">
                      {order.customer.phone}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-ink-subtle">Địa chỉ giao</dt>
                    <dd className="mt-0.5 text-ink">{order.customer.address}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Thanh toán</dt>
                    <dd className="mt-0.5 text-ink">
                      {paymentLabels[order.payment_status]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Vận chuyển</dt>
                    <dd className="mt-0.5 text-ink">
                      {shippingLabels[order.shipping_status]}
                    </dd>
                  </div>
                  {order.consolidation_group_id ? (
                    <div>
                      <dt className="text-ink-subtle">Nhóm gộp</dt>
                      <dd className="mt-0.5 font-mono text-ink-muted">
                        {order.consolidation_group_id}
                      </dd>
                    </div>
                  ) : null}
                  {order.matched_by ? (
                    <div>
                      <dt className="text-ink-subtle">Khớp theo</dt>
                      <dd className="mt-0.5 text-ink capitalize">
                        {order.matched_by}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              <section className="rounded-lg border border-hairline bg-surface-1 p-6">
                <h2 className="text-sm font-medium text-ink">Sản phẩm</h2>
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-ink-subtle">
                      <th className="pb-2 text-left font-medium">SKU</th>
                      <th className="pb-2 text-left font-medium">Tên</th>
                      <th className="pb-2 text-right font-medium">SL</th>
                      <th className="pb-2 text-right font-medium">Giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr
                        key={item.sku}
                        className="border-b border-hairline/50 last:border-0"
                      >
                        <td className="py-2 font-mono text-xs text-ink-tertiary">
                          {item.sku}
                        </td>
                        <td className="py-2 text-ink">{item.name}</td>
                        <td className="py-2 text-right text-ink-muted">
                          {item.qty}
                        </td>
                        <td className="py-2 text-right font-mono text-ink-muted">
                          {formatCurrency(item.price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="pt-3 text-right text-ink-subtle">
                        Tổng
                      </td>
                      <td className="pt-3 text-right font-mono font-medium text-ink">
                        {formatCurrency(order.total_amount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            </div>

            <section className="rounded-lg border border-hairline bg-surface-1 p-6">
              <h2 className="text-sm font-medium text-ink">Timeline xử lý</h2>
              <p className="mt-1 text-xs text-ink-subtle">
                Flow 1 · Webhook → Queue → Normalize → Gộp/Lẻ → MongoDB
              </p>
              <div className="mt-4">
                <SyncTimeline events={order.sync_events} />
              </div>
              <p className="mt-2 text-xs text-ink-tertiary">
                Tạo lúc {formatDate(order.created_at)}
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
