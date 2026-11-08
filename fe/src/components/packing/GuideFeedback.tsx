import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { getParcelGuideTrace, rateParcelGuide } from '../../api/packing-plan.api'
import { formatApiError } from '../../lib/api'
import type { PackingGuide, PackingGuideTrace, PackingPlan } from '../../types/packing-plan'

function prettyJson(raw: string | null): string {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/** 👍/👎 dưới hướng dẫn. Hướng dẫn AI được chấm hữu ích sẽ thành ví dụ mẫu cho lần viết sau. */
export function GuideRating({
  groupId,
  parcelNo,
  guide,
  vi,
  onPlan,
  onToast,
}: {
  groupId: string
  parcelNo: number
  guide: PackingGuide
  vi: boolean
  onPlan: (plan: PackingPlan) => void
  onToast: (message: string) => void
}): ReactNode {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const current = guide.rating?.helpful

  async function rate(helpful: boolean): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await rateParcelGuide(groupId, parcelNo, { helpful, comment })
      onPlan(res.plan)
      if (res.savedAsExample) {
        onToast(vi ? 'Đã thêm làm ví dụ mẫu cho AI.' : 'Saved as an example for the AI.')
      } else {
        onToast(vi ? 'Đã ghi nhận đánh giá.' : 'Rating saved.')
      }
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const buttonClass = (helpful: boolean): string =>
    `inline-flex items-center gap-1 rounded-lg border px-2 py-1 disabled:opacity-50 ${
      current === helpful
        ? 'border-primary bg-primary/10 font-medium text-primary'
        : 'border-hairline text-ink'
    }`

  return (
    <div className="space-y-1.5 rounded-lg border border-hairline p-2">
      <p className="text-ink-muted">
        {guide.source === 'ai'
          ? vi
            ? 'Hướng dẫn này dễ làm theo không?'
            : 'Was this guide easy to follow?'
          : vi
            ? 'Hướng dẫn mẫu (không do AI viết).'
            : 'Template guide (not written by AI).'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void rate(true)}
          className={buttonClass(true)}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          {vi ? 'Dễ làm theo' : 'Helpful'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void rate(false)}
          className={buttonClass(false)}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          {vi ? 'Khó hiểu' : 'Confusing'}
        </button>
        {guide.examplesUsed ? (
          <span className="text-ink-subtle">
            {vi
              ? `AI đã tham khảo ${String(guide.examplesUsed)} ví dụ mẫu`
              : `AI used ${String(guide.examplesUsed)} example(s)`}
          </span>
        ) : null}
      </div>
      <input
        value={comment}
        maxLength={300}
        onChange={(event) => setComment(event.target.value)}
        placeholder={vi ? 'Góp ý thêm (tuỳ chọn)' : 'Optional comment'}
        className="w-full rounded-md border border-hairline bg-transparent px-2 py-1 text-ink"
      />
      {guide.rating?.comment ? (
        <p className="text-ink-subtle">
          {vi ? 'Góp ý đã gửi: ' : 'Last comment: '}
          {guide.rating.comment}
        </p>
      ) : null}
      {error ? <p className="text-rose-600">{error}</p> : null}
    </div>
  )
}

function TraceBlock({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h4>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-xs text-ink">
        {body}
      </pre>
    </section>
  )
}

/** Admin: xem đúng những gì đã gửi cho mô hình và mô hình trả về. */
export function GuideTraceButton({
  groupId,
  parcelNo,
  vi,
}: {
  groupId: string
  parcelNo: number
  vi: boolean
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trace, setTrace] = useState<PackingGuideTrace | null>(null)

  function openDialog(): void {
    setOpen(true)
    setLoading(true)
    setError(null)
    setTrace(null)
    getParcelGuideTrace(groupId, parcelNo)
      .then(setTrace)
      .catch((err: unknown) => setError(formatApiError(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-lg border border-hairline px-2 py-1 text-ink"
      >
        {vi ? 'Xem dữ liệu gửi AI' : 'View data sent to AI'}
      </button>
      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
              onClick={() => setOpen(false)}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-[var(--ls-card-solid,#fff)] shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                  <h3 className="text-base font-semibold text-ink">
                    {vi ? 'Dữ liệu đã gửi cho AI' : 'Data sent to the AI'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={vi ? 'Đóng' : 'Close'}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-4 overflow-y-auto p-5 text-sm">
                  {loading ? (
                    <p className="text-ink-muted">{vi ? 'Đang tải…' : 'Loading…'}</p>
                  ) : null}
                  {error ? <p className="text-rose-600">{error}</p> : null}
                  {!loading && !error && !trace ? (
                    <p className="text-ink-muted">
                      {vi
                        ? 'Không có dữ liệu. Nhật ký chỉ lưu 30 ngày, hoặc hướng dẫn chưa được viết.'
                        : 'No data. Logs are kept for 30 days, or the guide has not been written yet.'}
                    </p>
                  ) : null}
                  {trace ? (
                    <>
                      <p className="text-xs text-ink-muted">
                        {trace.source === 'ai'
                          ? `AI · ${trace.model ?? ''}`
                          : vi
                            ? `Câu mẫu${trace.fallbackReason ? ` (${trace.fallbackReason})` : ''}`
                            : `Template${trace.fallbackReason ? ` (${trace.fallbackReason})` : ''}`}
                        {trace.latencyMs != null ? ` · ${String(trace.latencyMs)} ms` : ''}
                        {' · '}
                        {vi ? 'ví dụ mẫu' : 'examples'} {trace.examplesUsed}
                      </p>
                      <TraceBlock
                        title={vi ? 'Luật viết (system prompt)' : 'System prompt'}
                        body={trace.systemPrompt}
                      />
                      <TraceBlock
                        title={vi ? 'Dữ kiện đã gửi (JSON)' : 'Facts sent (JSON)'}
                        body={prettyJson(trace.userPayload)}
                      />
                      {trace.rawResponse ? (
                        <TraceBlock
                          title={vi ? 'Phản hồi thô của mô hình' : 'Raw model response'}
                          body={prettyJson(trace.rawResponse)}
                        />
                      ) : (
                        <p className="text-xs text-ink-muted">
                          {vi
                            ? 'Không có phản hồi thô: hệ thống dùng câu mẫu hoặc lời gọi AI bị lỗi.'
                            : 'No raw response: the template was used or the AI call failed.'}
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
