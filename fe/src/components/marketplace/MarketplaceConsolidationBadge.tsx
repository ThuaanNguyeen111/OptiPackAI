import { Badge } from '../ui/Badge'

type MarketplaceConsolidationBadgeProps = {
  grouped: boolean
  locale?: 'vi' | 'en'
  onClick?: () => void
}

export function MarketplaceConsolidationBadge({
  grouped,
  locale = 'vi',
  onClick,
}: MarketplaceConsolidationBadgeProps) {
  const label = grouped
    ? locale === 'vi'
      ? 'Đơn gộp'
      : 'Grouped'
    : locale === 'vi'
      ? 'Đơn lẻ'
      : 'Standalone'

  const badge = (
    <Badge tone={grouped ? 'primary' : 'default'}>{label}</Badge>
  )

  if (!onClick) return badge

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      title={
        grouped
          ? locale === 'vi'
            ? 'Xem các đơn cùng nhóm gộp'
            : 'View orders in this group'
          : undefined
      }
    >
      {badge}
    </button>
  )
}
