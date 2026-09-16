import { Badge } from '../ui/Badge'
import { consolidationBadgeLabel } from '../../lib/consolidation-display'

type MarketplaceConsolidationBadgeProps = {
  grouped?: boolean
  orderCount?: number
  /** Số nền tảng khác nhau — dùng cho nhãn "Gộp 2 sàn" */
  platformCount?: number
  multiPlatform?: boolean
  /** Chỉ dùng cho tooltip — không hiện dòng chữ phụ trên list (tránh rối UI) */
  platformOrderIdsText?: string
  /** List = true (mặc định): nhãn ngắn, 1 dòng. Detail = false: nhãn đầy đủ + có thể hiện IDs */
  compact?: boolean
  showOrderIds?: boolean
  locale?: 'vi' | 'en'
  onClick?: () => void
}

export function MarketplaceConsolidationBadge({
  grouped = false,
  orderCount,
  platformCount,
  multiPlatform,
  platformOrderIdsText,
  compact = true,
  showOrderIds = false,
  locale = 'vi',
  onClick,
}: MarketplaceConsolidationBadgeProps) {
  let label: string
  let tone: 'primary' | 'default' | 'warning'

  if (multiPlatform !== undefined) {
    const resolved = consolidationBadgeLabel(
      multiPlatform,
      orderCount ?? (grouped ? 2 : 1),
      locale,
      compact,
      platformCount,
    )
    label = resolved.label
    tone = resolved.tone
  } else if (grouped) {
    label = locale === 'vi' ? 'Đơn gộp' : 'Grouped'
    tone = 'primary'
  } else {
    label = locale === 'vi' ? 'Đơn lẻ' : 'Standalone'
    tone = 'default'
  }

  const titleParts = [
    platformOrderIdsText,
    grouped
      ? locale === 'vi'
        ? 'Bấm để lọc các đơn cùng nhóm'
        : 'Click to filter this group'
      : undefined,
  ].filter(Boolean)
  const title = titleParts.length > 0 ? titleParts.join(' · ') : undefined

  const badgeClass =
    multiPlatform && grouped
      ? 'whitespace-nowrap rounded-full border border-indigo-200/50 bg-indigo-50 font-medium text-indigo-700 dark:border-indigo-800/50 dark:bg-indigo-950/40 dark:text-indigo-300'
      : 'whitespace-nowrap'

  const body = (
    <>
      <Badge tone={tone} className={badgeClass}>
        {label}
      </Badge>
      {showOrderIds && platformOrderIdsText ? (
        <span className="mt-0.5 max-w-[220px] truncate font-mono text-[10px] leading-snug text-slate-500 dark:text-slate-400">
          {platformOrderIdsText}
        </span>
      ) : null}
    </>
  )

  if (!onClick) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5" title={title}>
        {body}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="inline-flex max-w-full flex-col items-start rounded-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      title={title}
    >
      {body}
    </button>
  )
}
