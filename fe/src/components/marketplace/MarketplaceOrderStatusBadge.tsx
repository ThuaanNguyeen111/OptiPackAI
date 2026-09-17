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
  topack: 'primary',
  toship: 'primary',
  lost: 'default',
  lost_by_3pl: 'default',
  damaged_by_3pl: 'default',
  failed_delivery: 'default',
  shipped_back: 'warning',
  shipped_back_success: 'default',
  shipped_back_failed: 'default',
  package_scrapped: 'default',
}

const EXTRA_CLASS_BY_STATUS: Partial<Record<MarketplaceOrderStatus, string>> = {
  canceled: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  returned: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400',
  failed: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400',
  lost: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  lost_by_3pl: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  damaged_by_3pl:
    'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  failed_delivery:
    'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  shipped_back_failed:
    'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  package_scrapped:
    'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400',
}

export function MarketplaceOrderStatusBadge({
  status,
  locale = 'vi',
}: {
  status: MarketplaceOrderStatus
  locale?: 'vi' | 'en'
}) {
  const labels = ORDER_STATUS_LABELS[status]
  const tone = TONE_BY_STATUS[status] ?? 'default'
  return (
    <Badge tone={tone} className={EXTRA_CLASS_BY_STATUS[status]}>
      {labels ? labels[locale] : status}
    </Badge>
  )
}
