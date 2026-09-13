import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import type { PlatformIntegration } from '../../types/orders'
import { marketplaceLabels } from '../../types/orders'
import { formatRelativeTime } from '../../utils/format'

type PlatformConnectionCardProps = {
  integration: PlatformIntegration
}

export function PlatformConnectionCard({ integration }: PlatformConnectionCardProps) {
  const { marketplace, connected, webhook_active, last_sync_at, orders_today } =
    integration

  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-ink">
            {marketplaceLabels[marketplace]}
          </h3>
          <p className="mt-1 text-sm text-ink-subtle">
            Webhook · đồng bộ đơn tự động
          </p>
        </div>
        <Badge tone={connected ? 'success' : 'warning'}>
          {connected ? 'Đã kết nối' : 'Chưa kết nối'}
        </Badge>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-subtle">Webhook</dt>
          <dd className="text-ink-muted">
            {webhook_active ? 'Hoạt động' : 'Tắt'}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-subtle">Đồng bộ lần cuối</dt>
          <dd className="text-ink-muted">{formatRelativeTime(last_sync_at)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-subtle">Đơn hôm nay</dt>
          <dd className="font-mono text-ink">{orders_today}</dd>
        </div>
      </dl>

      <div className="mt-4 flex gap-2">
        <Button variant="primary" className="flex-1">
          Đồng bộ ngay
        </Button>
        <Button variant="secondary" className="flex-1">
          Cấu hình
        </Button>
      </div>
    </div>
  )
}
