import type { MarketplaceOrderStatus } from '../../types/marketplace-orders'
import { ORDER_STATUS_LABELS } from '../../types/marketplace-orders'
import { Badge } from '../ui/Badge'

const TONE_BY_STATUS: Record<
  MarketplaceOrderStatus,
  'default' | 'success' | 'warning' | 'primary'
> = {
  unpaid: 'warning',
  pending: 'primary',
  packed: 'primary',
  ready_to_ship: 'primary',
  shipped: 'success',
  delivered: 'success',
  canceled: 'warning',
  returned: 'warning',
  failed: 'warning',
}

export function MarketplaceOrderStatusBadge({
  status,
  locale = 'vi',
}: {
  status: MarketplaceOrderStatus
  locale?: 'vi' | 'en'
}) {
  return (
    <Badge tone={TONE_BY_STATUS[status]}>
      {ORDER_STATUS_LABELS[status][locale]}
    </Badge>
  )
}
