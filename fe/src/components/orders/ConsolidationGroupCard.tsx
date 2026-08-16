import { Link } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { ConsolidationGroup, Order } from '../../types/orders'
import { marketplaceLabels } from '../../types/orders'
import { formatCurrency } from '../../utils/format'

type ConsolidationGroupCardProps = {
  group: ConsolidationGroup
  orders: Order[]
  selected?: boolean
  onSelect?: () => void
  onMerge?: () => void
  onKeepSeparate?: () => void
}

export function ConsolidationGroupCard({
  group,
  orders,
  selected,
  onSelect,
  onMerge,
  onKeepSeparate,
}: ConsolidationGroupCardProps) {
  const totalAmount = orders.reduce((sum, o) => sum + o.total_amount, 0)
  const totalItems = orders.reduce((sum, o) => sum + o.item_count, 0)
  const marketplaces = [...new Set(orders.map((o) => o.marketplace))]

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        selected
          ? 'border-primary/50 bg-surface-2'
          : 'border-hairline bg-surface-1 hover:border-hairline-strong'
      }`}
    >
      <button type="button" className="w-full text-left" onClick={onSelect}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-ink">{group.customer.name}</p>
            <p className="mt-0.5 text-sm text-ink-subtle">{group.customer.phone}</p>
            <p className="mt-1 text-xs text-ink-tertiary">{group.customer.address}</p>
          </div>
          <Badge tone={group.status === 'merged' ? 'primary' : 'warning'}>
            {group.status === 'merged' ? 'Đã gộp' : 'Chờ duyệt'}
          </Badge>
        </div>

        <p className="mt-3 text-sm text-ink-muted">{group.match_reason}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="default">
            {orders.length} đơn · {totalItems} SP
          </Badge>
          {marketplaces.map((m) => (
            <Badge key={m} tone="default">
              {marketplaceLabels[m]}
            </Badge>
          ))}
          <Badge tone="default">{formatCurrency(totalAmount)}</Badge>
        </div>
      </button>

      {group.status === 'pending_review' && onMerge && onKeepSeparate ? (
        <div className="mt-4 flex gap-2 border-t border-hairline pt-4">
          <Button variant="primary" className="flex-1" onClick={onMerge}>
            Gộp thành 1 kiện
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onKeepSeparate}>
            Giữ riêng
          </Button>
        </div>
      ) : null}

      {group.status === 'merged' ? (
        <p className="mt-3 text-xs text-ink-tertiary">
          Nhóm: <span className="font-mono text-ink-muted">{group.id}</span>
        </p>
      ) : null}
    </div>
  )
}

type ConsolidationPreviewProps = {
  group: ConsolidationGroup
  orders: Order[]
}

export function ConsolidationPreview({ group, orders }: ConsolidationPreviewProps) {
  const totalAmount = orders.reduce((sum, o) => sum + o.total_amount, 0)

  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-6">
      <h3 className="text-sm font-medium text-ink">Preview sau gộp</h3>
      <p className="mt-1 text-xs text-ink-subtle">
        {group.status === 'merged' ? group.id : 'PKG mới (sau khi gộp)'}
      </p>

      <div className="mt-4 space-y-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            to={`/app/orders/${order.id}`}
            className="block rounded-md border border-hairline bg-surface-2/50 p-3 transition-colors hover:bg-surface-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink">{order.id}</p>
                <p className="text-xs text-ink-subtle">
                  {marketplaceLabels[order.marketplace]} · {order.external_id}
                </p>
              </div>
              <p className="font-mono text-sm text-ink-muted">
                {formatCurrency(order.total_amount)}
              </p>
            </div>
            <ul className="mt-2 space-y-1">
              {order.items.map((item) => (
                <li key={item.sku} className="text-xs text-ink-tertiary">
                  {item.qty}x {item.name}
                </li>
              ))}
            </ul>
          </Link>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4 text-sm">
        <span className="text-ink-subtle">Tổng cộng</span>
        <span className="font-mono font-medium text-ink">
          {formatCurrency(totalAmount)}
        </span>
      </div>
    </div>
  )
}
