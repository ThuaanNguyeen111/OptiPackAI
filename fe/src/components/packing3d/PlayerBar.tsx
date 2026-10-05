import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import type { PackTimeline } from './timeline'
import type { PackingPlayer } from './usePackingPlayer'

/**
 * Thanh điều khiển từng bước (05/10/2026): thanh tiến trình chia đoạn theo
 * từng món (bấm đoạn để nhảy tới món đó), Trước / Phát / Sau, tốc độ.
 */
export function PlayerBar({
  timeline,
  player,
  vi,
  compact = false,
}: {
  timeline: PackTimeline
  player: PackingPlayer
  vi: boolean
  compact?: boolean
}) {
  const { actions } = timeline
  const segments: { start: number; end: number; label: string }[] = []
  actions.forEach((a, i) => {
    const last = segments[segments.length - 1]
    if (last && actions[last.start]?.itemIndex === a.itemIndex) last.end = i
    else
      segments.push({
        start: i,
        end: i,
        label:
          a.itemIndex < 0
            ? vi
              ? 'Đóng thùng'
              : 'Close box'
            : (timeline.items[a.itemIndex]?.placement.sku ?? ''),
      })
  })
  const action = actions[player.index]
  const btn =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-primary'

  return (
    <div className="pointer-events-auto rounded-xl border border-hairline bg-surface-1/92 px-3 pt-2.5 pb-2 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.35)] backdrop-blur">
      {/* Thanh tiến trình chia đoạn */}
      <div className="flex gap-1" role="group" aria-label={vi ? 'Tiến trình đóng gói' : 'Packing progress'}>
        {segments.map((seg) => {
          const len = seg.end - seg.start + 1
          const doneCount = Math.min(len, Math.max(0, player.index - seg.start + 1))
          const current = player.index >= seg.start && player.index <= seg.end
          return (
            <button
              key={seg.start}
              type="button"
              onClick={() => player.goTo(seg.start)}
              title={seg.label}
              aria-label={seg.label}
              aria-current={current ? 'step' : undefined}
              className="group relative h-5 min-w-3 flex-1 py-2 focus-visible:outline-2 focus-visible:outline-primary"
              style={{ flexGrow: len }}
            >
              <span className={`block h-1.5 overflow-hidden rounded-full ${current ? 'bg-primary/20' : 'bg-surface-2'} transition-colors group-hover:bg-primary/25`}>
                <span
                  className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${String((doneCount / len) * 100)}%` }}
                />
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-1 flex items-center gap-1.5">
        <button type="button" className={btn} onClick={player.prev} disabled={player.index === 0} aria-label={vi ? 'Bước trước' : 'Previous step'}>
          <ChevronLeft className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          onClick={player.togglePlay}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={player.playing ? (vi ? 'Tạm dừng' : 'Pause') : vi ? 'Phát' : 'Play'}
        >
          {player.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
        </button>
        <button
          type="button"
          className={btn}
          onClick={player.next}
          disabled={player.index >= player.count - 1}
          aria-label={vi ? 'Bước sau' : 'Next step'}
        >
          <ChevronRight className="h-4.5 w-4.5" />
        </button>
        <div className="ml-1.5 min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            <span className="tabular-nums text-ink-subtle">
              {player.index + 1}/{player.count}
            </span>
            <span className="mx-1.5 text-ink-subtle">·</span>
            {action?.title}
          </p>
          {!compact && action && action.itemIndex >= 0 && (
            <p className="truncate font-mono text-xs text-ink-muted">{timeline.items[action.itemIndex]?.placement.sku}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => player.setSpeed(player.speed === 1 ? 2 : player.speed === 2 ? 0.5 : 1)}
          className="inline-flex h-8 min-w-11 items-center justify-center rounded-md px-2 text-xs font-semibold tabular-nums text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          title={vi ? 'Tốc độ phát' : 'Playback speed'}
        >
          ×{player.speed === 0.5 ? '0,5' : String(player.speed)}
        </button>
      </div>
    </div>
  )
}
