import { useEffect, useRef, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { PackingGuide, PackingItemProfile, PackingPlanParcel } from '../../types/packing-plan'
import { actionNote, packStepsForParcel, stepLabel } from '../../utils/packing-layout'
import { bubbleWrapFor } from '../../utils/packing-materials'

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

type Row = {
  key: string
  title: string
  body: string | null
  tip: string | null
  /** Mã món cho các thao tác tiếp theo của cùng một món (lời đầy đủ nằm ở thao tác đầu). */
  sku: string | null
}

/**
 * Các bước đóng gói; dùng chung cho tab Hướng dẫn và hộp chi tiết.
 * Có `parcel` thì đánh số theo từng thao tác — cùng nguồn `packStepsForParcel` với hoạt ảnh 3D,
 * nên "Bước 4/9" ở hai bên luôn là một. Không có tọa độ xếp (kiện nhập tay) thì hiện lời theo món như cũ.
 */
export function GuideSteps({
  guide,
  vi,
  busy,
  onWrite,
  parcel,
  profiles,
  activeIndex,
  onSelect,
  showHeader = true,
}: {
  guide: PackingGuide | null | undefined
  vi: boolean
  busy: boolean
  onWrite?: () => void
  parcel?: PackingPlanParcel | null
  profiles?: PackingItemProfile[]
  /** Bước hoạt ảnh 3D đang phát (0-based). */
  activeIndex?: number
  /** Bấm một bước để hoạt ảnh nhảy tới đó. */
  onSelect?: (index: number) => void
  /** false: nơi gọi đã có tiêu đề + nút Viết lại (cột 3D) — bỏ hàng tiêu đề để nhường chỗ cho bước. */
  showHeader?: boolean
}): ReactNode {
  const pack = parcel?.placements?.length ? packStepsForParcel(parcel, profiles, bubbleWrapFor(parcel.materials)) : null
  const rows: Row[] = pack
    ? pack.steps.map((step, i) => {
        const placement = step.item != null ? pack.placements[step.item] : undefined
        const firstOfItem = placement != null && pack.steps.findIndex((s) => s.item === step.item) === i
        const text = placement ? guide?.steps.find((s) => s.step === placement.step) : undefined
        return {
          key: `${step.kind}-${String(i)}`,
          title: stepLabel(step.kind, vi, pack.mailer),
          body: step.kind === 'prepare' ? (guide?.summary ?? null) : firstOfItem ? (text?.instruction ?? null) : actionNote(step.kind, vi),
          tip: firstOfItem ? (text?.tip || null) : null,
          sku: placement && !firstOfItem ? placement.sku : null,
        }
      })
    : (guide?.steps ?? []).map((step) => ({
        key: String(step.step),
        title: '',
        body: step.instruction,
        tip: step.tip || null,
        sku: null,
      }))

  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (activeIndex == null || !onSelect) return
    const el = listRef.current?.children[activeIndex]
    // Chỉ cuộn khung danh sách — scrollIntoView sẽ cuộn cả cột và đẩy khung 3D ra khỏi màn hình.
    const box = el instanceof HTMLElement ? el.closest<HTMLElement>('[data-guide-scroll]') : null
    if (!(el instanceof HTMLElement) || !box) return
    // Bước 1: về đầu danh sách (giữ tiêu đề "Các bước"); bước khác: chỉ cuộn khi bước ra ngoài khung, căn theo mép trên.
    if (activeIndex === 0) {
      box.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    const bottom = top + el.offsetHeight
    if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight)
      box.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' })
  }, [activeIndex, onSelect])

  return (
    <section className="text-ink">
      {showHeader ? (
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {vi ? 'Các bước' : 'Steps'}
          {rows.length > 0 ? <span className="ml-1 font-normal text-ink-subtle tabular-nums">({rows.length})</span> : null}
        </h3>
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
      ) : null}

      {!pack && guide?.summary ? (
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed">{withCodes(guide.summary)}</p>
      ) : null}

      {rows.length > 0 ? (
        <ol ref={listRef} className={showHeader ? 'mt-2' : ''}>
          {rows.map((row, i) => {
            const active = pack != null && activeIndex === i
            const done = pack != null && activeIndex != null && i < activeIndex
            const content = (
              <>
                {i < rows.length - 1 ? (
                  <span className="absolute top-8 bottom-0 left-[1.3125rem] w-px bg-hairline" aria-hidden />
                ) : null}
                <span
                  className={`relative flex h-[1.625rem] w-[1.625rem] shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors ${
                    active
                      ? 'bg-primary text-white ring-4 ring-primary/20'
                      : done
                        ? 'bg-primary/15 text-primary'
                        : pack
                          ? 'border border-hairline bg-canvas text-ink-muted'
                          : 'bg-primary text-white'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  {row.title ? (
                    <p className={`text-[13px] font-semibold ${active ? 'text-primary' : 'text-ink'}`}>
                      {row.title}
                      {row.sku ? <span className="ml-1.5 font-mono text-xs font-normal text-ink-subtle">{row.sku}</span> : null}
                    </p>
                  ) : null}
                  {row.body ? (
                    <p className={`text-[13px] leading-relaxed ${row.title ? 'mt-0.5 text-ink-muted' : ''}`}>{withCodes(row.body)}</p>
                  ) : null}
                  {row.tip ? (
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                      <span className="font-semibold">{vi ? 'Lưu ý: ' : 'Note: '}</span>
                      {withCodes(row.tip)}
                    </p>
                  ) : null}
                </div>
              </>
            )
            return (
              <li key={row.key} aria-current={active ? 'step' : undefined}>
                {pack && onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className={`relative flex w-full gap-3 rounded-lg px-2 pt-1.5 pb-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary ${
                      active ? 'bg-primary/5' : ''
                    }`}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="relative flex gap-3 px-2 pt-1.5 pb-3">{content}</div>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-subtle">
          {vi ? 'Chưa có hướng dẫn từng bước.' : 'No step-by-step guide yet.'}
        </p>
      )}
    </section>
  )
}
