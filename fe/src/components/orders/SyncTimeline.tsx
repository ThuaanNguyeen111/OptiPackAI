import type { SyncEvent } from '../../types/orders'
import { formatDate } from '../../utils/format'

type SyncTimelineProps = {
  events: SyncEvent[]
}

export function SyncTimeline({ events }: SyncTimelineProps) {
  return (
    <ol className="space-y-0">
      {events.map((event, index) => {
        const isLast = index === events.length - 1
        const isError = event.step.toLowerCase().includes('lỗi')

        return (
          <li key={`${event.step}-${event.at}`} className="relative flex gap-4 pb-6">
            {!isLast ? (
              <span
                className="absolute top-3 left-[7px] h-full w-px bg-hairline"
                aria-hidden
              />
            ) : null}
            <span
              className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                isError
                  ? 'border-amber-400 bg-amber-400/20'
                  : isLast
                    ? 'border-primary bg-primary/20'
                    : 'border-hairline-strong bg-surface-2'
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{event.step}</p>
              {event.detail ? (
                <p className="mt-0.5 text-sm text-ink-subtle">{event.detail}</p>
              ) : null}
              <p className="mt-1 font-mono text-xs text-ink-tertiary">
                {formatDate(event.at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
