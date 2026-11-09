import type { MarketplaceOrderStatus } from '../../types/marketplace-orders'
import { ORDER_STATUS_LABELS } from '../../types/marketplace-orders'
import { orderStatusTone } from '../../lib/stage-colors'
import { Badge } from '../ui/Badge'

export function MarketplaceOrderStatusBadge({
  status,
  locale = 'vi',
}: {
  status: MarketplaceOrderStatus
  locale?: 'vi' | 'en'
}) {
  const labels = ORDER_STATUS_LABELS[status]
  return <Badge tone={orderStatusTone(status)}>{labels ? labels[locale] : status}</Badge>
}
