import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type QueuePaginationBarProps = {
  vi: boolean
  rangeStart: number
  rangeEnd: number
  total: number
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
  /** `ops` = bảng đơn/giao hàng; `pack` = cột hàng đợi đóng gói; `plain` = trang Owner thường */
  variant?: 'ops' | 'pack' | 'plain'
  className?: string
}

export function QueuePaginationBar({
  vi,
  rangeStart,
  rangeEnd,
  total,
  page,
  totalPages,
  onPrev,
  onNext,
  variant = 'ops',
  className,
}: QueuePaginationBarProps): ReactNode {
  if (total <= 0) return null

  const btnClass =
    variant === 'pack'
      ? 'cursor-pointer rounded-md border border-[var(--ls-card-border)] bg-[var(--ls-panel)] px-2 py-1 text-[11px] font-medium text-[var(--ls-ink)] transition-colors hover:border-[var(--ls-cta)] disabled:cursor-not-allowed disabled:opacity-40'
      : variant === 'ops'
        ? 'cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 transition-colors hover:border-[var(--ls-cta)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-slate-200'
        : 'cursor-pointer rounded-lg border border-hairline bg-surface px-2.5 py-1.5 font-medium text-ink transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 text-xs',
        variant === 'pack' &&
          'border-t border-[var(--ls-card-border)] px-3 py-2 text-[var(--ls-muted)]',
        variant === 'ops' &&
          'border-t border-slate-200 px-4 py-3 text-slate-600 dark:border-slate-800 dark:text-slate-300',
        variant === 'plain' &&
          'border-t border-hairline px-4 py-3 text-ink-subtle',
        className,
      )}
    >
      <span>
        {vi
          ? `Hiển thị ${rangeStart}–${rangeEnd} / ${total} dòng`
          : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className={btnClass}
        >
          ← {vi ? 'Trước' : 'Prev'}
        </button>
        <span className="min-w-[5.5rem] text-center font-medium tabular-nums text-inherit">
          {vi ? 'Trang' : 'Page'} {page}/{totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={onNext}
          className={btnClass}
        >
          {vi ? 'Sau' : 'Next'} →
        </button>
      </div>
    </div>
  )
}
