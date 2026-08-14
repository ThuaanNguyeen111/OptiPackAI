import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { OrderTable } from '../components/orders/OrderTable'
import { Button } from '../components/ui/Button'
import { mockOrders } from '../data/mock-orders'
import type { Order } from '../types/orders'

type OrderFilter =
  | 'all'
  | 'pending'
  | 'pending_merge'
  | 'consolidated'
  | 'standalone'
  | 'sync_error'

const filters: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xử lý' },
  { key: 'pending_merge', label: 'Chờ gộp' },
  { key: 'consolidated', label: 'Đã gộp' },
  { key: 'standalone', label: 'Đơn lẻ' },
  { key: 'sync_error', label: 'Lỗi đồng bộ' },
]

function matchesFilter(order: Order, filter: OrderFilter): boolean {
  switch (filter) {
    case 'pending':
      return order.status === 'pending'
    case 'pending_merge':
      return order.consolidation_type === 'pending_merge'
    case 'consolidated':
      return order.consolidation_type === 'consolidated'
    case 'standalone':
      return order.consolidation_type === 'standalone'
    case 'sync_error':
      return order.pipeline_status === 'sync_error'
    default:
      return true
  }
}

export function OrdersPage() {
  const [filter, setFilter] = useState<OrderFilter>('all')

  const filteredOrders = useMemo(
    () => mockOrders.filter((o) => matchesFilter(o, filter)),
    [filter],
  )

  return (
    <>
      <Header
        title="Đơn hàng"
        description="Đồng bộ từ Shopee và TikTok Shop · Gộp đơn trùng"
      />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {filters.map(({ key, label }) => (
                <Button
                  key={key}
                  variant={filter === key ? 'primary' : 'secondary'}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm text-ink-subtle">
              <span>
                {filteredOrders.length}/{mockOrders.length} đơn
              </span>
              <Link to="/orders/consolidation" className="text-primary-hover hover:underline">
                Gộp đơn →
              </Link>
            </div>
          </div>

          <OrderTable orders={filteredOrders} />
        </div>
      </main>
    </>
  )
}
