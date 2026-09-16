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
  canceled: 'default',
  returned: 'default',
  failed: 'default',
}

const EXTRA_CLASS_BY_STATUS: Partial<Record<MarketplaceOrderStatus, string>> = {
  canceled:
    'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  returned:
    'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400',
  failed:
    'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400',
}

export function MarketplaceOrderStatusBadge({
  status,
  locale = 'vi',
}: {
  status: MarketplaceOrderStatus
  locale?: 'vi' | 'en'
}) {
  return (
    <Badge tone={TONE_BY_STATUS[status]} className={EXTRA_CLASS_BY_STATUS[status]}>
      {ORDER_STATUS_LABELS[status][locale]}
    </Badge>
  )
}
