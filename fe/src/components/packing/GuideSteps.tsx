import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { PackingGuide } from '../../types/packing-plan'

/** Mã món trong lời hướng dẫn (vd DEMO3D-QUAN-DAI#1) — tách ra để in đậm, dễ dò khi cầm hàng. */
const CODE = /([A-Z0-9]+(?:-[A-Z0-9]+)+(?:#\d+)?)/g

function withCodes(text: string): ReactNode[] {
  return text.split(CODE).map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.86em] font-medium whitespace-nowrap text-ink">
        {part}
      </code>
    ) : (
      part
    ),
  )
}

/** Tóm tắt + các bước đóng gói; dùng chung cho tab Hướng dẫn và hộp chi tiết. */
export function GuideSteps({
  guide,
  vi,
  busy,
  onWrite,
}: {
  guide: PackingGuide | null | undefined
  vi: boolean
  busy: boolean
  onWrite?: () => void
}): ReactNode {
  const steps = guide?.steps ?? []
  return (
    <section className="text-ink">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">
          {vi ? 'Các bước' : 'Steps'}
          {steps.length > 0 ? <span className="ml-1 font-normal text-ink-subtle tabular-nums">({steps.length})</span> : null}
        </h4>
        {onWrite ? (
          <button
            type="button"
            disabled={busy}
            onClick={onWrite}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden />
            {guide ? (vi ? 'Viết lại' : 'Rewrite') : vi ? 'Viết hướng dẫn' : 'Write guide'}
          </button>
        ) : null}
      </div>

      {guide?.summary ? (
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed">{withCodes(guide.summary)}</p>
      ) : null}

      {steps.length > 0 ? (
        <ol className="mt-3">
          {steps.map((step, i) => (
            <li key={step.step} className="relative flex gap-3 pb-3 last:pb-0">
              {i < steps.length - 1 ? (
                <span className="absolute top-7 bottom-0 left-[0.8125rem] w-px bg-hairline" aria-hidden />
              ) : null}
              <span className="relative flex h-[1.625rem] w-[1.625rem] shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white tabular-nums">
                {step.step}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[13px] leading-relaxed">{withCodes(step.instruction)}</p>
                {step.tip ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    <span className="font-semibold">{vi ? 'Lưu ý: ' : 'Note: '}</span>
                    {withCodes(step.tip)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-subtle">
          {vi ? 'Chưa có hướng dẫn từng bước.' : 'No step-by-step guide yet.'}
        </p>
      )}
    </section>
  )
}
