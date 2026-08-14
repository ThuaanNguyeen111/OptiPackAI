import { Link } from 'react-router-dom'
import type { Order } from '../../types/orders'
import { marketplaceLabels } from '../../types/orders'
import { formatCurrency, formatDate } from '../../utils/format'
import {
  ConsolidationTypeBadge,
  OrderStatusBadge,
  PipelineBadge,
} from './OrderBadges'
import { Badge } from '../ui/Badge'

type OrderTableProps = {
  orders: Order[]
}

export function OrderTable({ orders }: OrderTableProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-hairline bg-surface-1 p-12 text-center">
        <p className="text-sm text-ink-subtle">Không có đơn hàng phù hợp bộ lọc.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface-1">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-hairline text-ink-subtle">
            <th className="px-4 py-3 font-medium">Mã đơn</th>
            <th className="px-4 py-3 font-medium">Sàn</th>
            <th className="px-4 py-3 font-medium">Khách hàng</th>
            <th className="px-4 py-3 font-medium">SP</th>
            <th className="px-4 py-3 font-medium">Tổng tiền</th>
            <th className="px-4 py-3 font-medium">Pipeline</th>
            <th className="px-4 py-3 font-medium">Loại</th>
            <th className="px-4 py-3 font-medium">Trạng thái</th>
            <th className="px-4 py-3 font-medium">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              className="border-b border-hairline/70 transition-colors last:border-b-0 hover:bg-surface-2/60"
            >
              <td className="px-4 py-3">
                <Link to={`/orders/${order.id}`} className="group">
                  <p className="font-medium text-ink group-hover:text-primary-hover">
                    {order.id}
                  </p>
                  <p className="font-mono text-xs text-ink-tertiary">
                    {order.external_id}
                  </p>
                </Link>
                {order.is_duplicate ? (
                  <span className="mt-1 inline-flex">
                    <Badge tone="warning">Trùng lặp</Badge>
                  </span>
                ) : null}
                {order.priority === 'urgent' ? (
                  <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                    Ưu tiên
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {marketplaceLabels[order.marketplace]}
              </td>
              <td className="px-4 py-3">
                <p className="text-ink">{order.customer.name}</p>
                <p className="text-xs text-ink-tertiary">{order.customer.phone}</p>
              </td>
              <td className="px-4 py-3 text-ink-muted">{order.item_count}</td>
              <td className="px-4 py-3 font-mono text-ink-muted">
                {formatCurrency(order.total_amount)}
              </td>
              <td className="px-4 py-3">
                <PipelineBadge status={order.pipeline_status} />
              </td>
              <td className="px-4 py-3">
                <ConsolidationTypeBadge type={order.consolidation_type} />
                {order.consolidation_group_id ? (
                  <p className="mt-1 font-mono text-xs text-ink-tertiary">
                    {order.consolidation_group_id}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="px-4 py-3 text-ink-subtle">
                {formatDate(order.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
