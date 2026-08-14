import { Link } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { Badge } from '../components/ui/Badge'
import { mockConsolidationGroups } from '../data/mock-consolidation'
import { mockIntegrations } from '../data/mock-integrations'
import { mockOrders } from '../data/mock-orders'
import { marketplaceLabels } from '../types/orders'
import { formatCurrency, formatRelativeTime } from '../utils/format'

const marketplaceBarColor = {
  shopee: 'bg-shopee',
  tiktok: 'bg-tiktok',
} as const

export function DashboardPage() {
  const pendingMerge = mockOrders.filter(
    (o) => o.consolidation_type === 'pending_merge',
  ).length
  const consolidated = mockOrders.filter(
    (o) => o.consolidation_type === 'consolidated',
  ).length
  const standalone = mockOrders.filter(
    (o) => o.consolidation_type === 'standalone',
  ).length
  const syncErrors = mockOrders.filter(
    (o) => o.pipeline_status === 'sync_error',
  ).length

  const shopeeCount = mockOrders.filter((o) => o.marketplace === 'shopee').length
  const tiktokCount = mockOrders.filter((o) => o.marketplace === 'tiktok').length
  const total = mockOrders.length
  const consolidationRate =
    total > 0 ? Math.round((consolidated / total) * 100) : 0

  const pendingGroups = mockConsolidationGroups.filter(
    (g) => g.status === 'pending_review',
  ).length

  const stats = [
    {
      id: 'pending_merge',
      label: 'Chờ gộp đơn',
      value: pendingMerge,
      hint: 'Cùng khách · nhiều sàn',
      link: '/orders/consolidation',
    },
    {
      id: 'consolidated',
      label: 'Đã gộp',
      value: consolidated,
      hint: `${consolidationRate}% tổng đơn`,
      link: '/orders?filter=consolidated',
    },
    {
      id: 'standalone',
      label: 'Đơn lẻ',
      value: standalone,
      hint: 'Không khớp nhóm',
      link: '/orders',
    },
    {
      id: 'sync_error',
      label: 'Lỗi đồng bộ',
      value: syncErrors,
      hint: 'Cần xử lý metadata',
      link: '/integrations',
    },
  ]

  return (
    <>
      <Header
        title="Tổng quan"
        description="Flow 1 · Omnichannel sync & order consolidation"
      />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => {
              const isErrorAlert = stat.id === 'sync_error' && stat.value > 0
              return (
                <Link
                  key={stat.id}
                  to={stat.link}
                  className={`rounded-lg border bg-surface-1 p-6 transition-colors hover:bg-surface-2/50 ${
                    isErrorAlert
                      ? 'border-[rgba(239,68,68,0.2)] shadow-[0_0_0_1px_rgba(239,68,68,0.15)] hover:border-[rgba(239,68,68,0.35)]'
                      : 'border-hairline hover:border-hairline-strong'
                  }`}
                >
                  <p className="text-sm text-ink-subtle">{stat.label}</p>
                  <p
                    className={`mt-2 text-3xl font-semibold tracking-tight ${
                      isErrorAlert ? 'text-error' : 'text-ink'
                    }`}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-ink-tertiary">{stat.hint}</p>
                </Link>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-hairline bg-surface-1 p-6">
              <h2 className="text-sm font-medium text-ink">Đơn theo sàn</h2>
              <div className="mt-4 space-y-3">
                {(
                  [
                    ['shopee', shopeeCount],
                    ['tiktok', tiktokCount],
                  ] as const
                ).map(([marketplace, count]) => {
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  return (
                    <div key={marketplace}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-ink-muted">
                          {marketplaceLabels[marketplace]}
                        </span>
                        <span className="font-mono text-ink">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={`h-full rounded-full ${marketplaceBarColor[marketplace]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-lg border border-hairline bg-surface-1 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-ink">Sync health</h2>
                <Link
                  to="/integrations"
                  className="text-xs text-primary-hover hover:underline"
                >
                  Chi tiết →
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {mockIntegrations.map((integration) => (
                  <div
                    key={integration.marketplace}
                    className="flex items-center justify-between rounded-md border border-hairline bg-surface-2/40 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-ink">
                        {marketplaceLabels[integration.marketplace]}
                      </p>
                      <p className="text-xs text-ink-tertiary">
                        {formatRelativeTime(integration.last_sync_at)}
                      </p>
                    </div>
                    <Badge tone={integration.webhook_active ? 'success' : 'warning'}>
                      {integration.webhook_active ? 'Webhook OK' : 'Offline'}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {pendingGroups > 0 ? (
            <section className="rounded-lg border border-primary/40 bg-surface-1 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium text-ink">
                    {pendingGroups} nhóm chờ gộp đơn
                  </h2>
                  <p className="mt-1 text-sm text-ink-subtle">
                    Khách mua trên nhiều sàn — xem preview trước khi gộp kiện
                  </p>
                </div>
                <Link
                  to="/orders/consolidation"
                  className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-on-primary shadow-[0_0_0_1px_rgba(99,102,241,0.35)] transition-colors hover:bg-primary-hover"
                >
                  Duyệt gộp đơn
                </Link>
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-hairline bg-surface-1 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">Đơn hàng gần đây</h2>
              <Link
                to="/orders"
                className="text-xs text-primary-hover hover:underline"
              >
                Xem tất cả
              </Link>
            </div>
            <div className="divide-y divide-hairline">
              {mockOrders.slice(0, 4).map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="flex items-center justify-between py-3 text-sm transition-colors hover:bg-surface-2/30"
                >
                  <div>
                    <p className="font-medium text-ink">{order.id}</p>
                    <p className="text-ink-subtle">{order.customer.name}</p>
                  </div>
                  <p className="font-mono text-ink-muted">
                    {formatCurrency(order.total_amount)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
