import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getPackingFeedback, getPackingReport } from '../../api/packing-plan.api'
import { formatApiError } from '../../lib/api'
import {
  BOX_SOURCE_REASON_LABELS,
  type BoxSourceReason,
  type PackingFeedbackReport,
  type PackingReport,
} from '../../types/packing-plan'

function boxSourceReasonLabel(reason: string, vi: boolean): string {
  if (reason in BOX_SOURCE_REASON_LABELS) {
    const label = BOX_SOURCE_REASON_LABELS[reason as BoxSourceReason]
    return vi ? label.vi : label.en
  }
  return reason
}

function pct(value: number | null): string {
  if (value == null) return '—'
  return `${Math.round(value * 1000) / 10}%`
}

export function PackingReportsPanel({ vi }: { vi: boolean }) {
  const [report, setReport] = useState<PackingReport | null>(null)
  const [feedback, setFeedback] = useState<PackingFeedbackReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([getPackingReport(), getPackingFeedback()])
        .then(([summary, notes]) => {
          setReport(summary)
          setFeedback(notes)
        })
        .catch((err: unknown) => setError(formatApiError(err)))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <section className="owner-panel space-y-3 rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-ink">
        {vi ? 'Báo cáo đóng gói (30 ngày)' : 'Packing report (30 days)'}
      </h2>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {!report ? (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {vi ? 'Đang tải…' : 'Loading…'}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-ink-subtle">{vi ? 'Nhóm' : 'Groups'}</dt>
            <dd className="font-semibold text-ink">{report.groups}</dd>
          </div>
          <div>
            <dt className="text-ink-subtle">{vi ? 'Kiện' : 'Parcels'}</dt>
            <dd className="font-semibold text-ink">{report.parcels}</dd>
          </div>
          <div>
            <dt className="text-ink-subtle">{vi ? 'Lệch cân' : 'Held'}</dt>
            <dd className="font-semibold text-ink">{pct(report.heldRate)}</dd>
          </div>
          <div>
            <dt className="text-ink-subtle">{vi ? 'Chi phí' : 'Cost'}</dt>
            <dd className="font-semibold text-ink">{report.packagingCostVnd.toLocaleString('vi-VN')} đ</dd>
          </div>
        </dl>
      )}
      {feedback ? (
        <p className="text-xs text-ink-muted">
          {vi
            ? `Làm theo gợi ý ${pct(feedback.followedRate)} · chỉnh ${String(feedback.adjustedPlans)} · từ chối ${String(feedback.rejectedPlans)} · hao hụt ${feedback.waste.costVnd.toLocaleString('vi-VN')} đ`
            : `Followed ${pct(feedback.followedRate)} · adjusted ${String(feedback.adjustedPlans)} · rejected ${String(feedback.rejectedPlans)}`}
        </p>
      ) : null}
      {feedback?.boxSource ? (
        <div className="space-y-2 rounded-xl border border-[var(--ls-card-border)] px-3 py-2">
          <p className="text-xs font-semibold text-ink">
            {vi ? 'Thùng tái sử dụng bị thay' : 'Reused boxes swapped'}
          </p>
          <p className="text-xs text-ink-muted">
            {vi
              ? `${String(feedback.boxSource.overrides)} lần chọn nguồn thùng khác gợi ý`
              : `${String(feedback.boxSource.overrides)} times a box source differed from the suggestion`}
          </p>
          {feedback.boxSource.byReason.length > 0 ? (
            <ul className="space-y-1 text-xs text-ink">
              {feedback.boxSource.byReason.map((row) => (
                <li key={row.reason} className="flex justify-between gap-3">
                  <span>{boxSourceReasonLabel(row.reason, vi)}</span>
                  <span className="font-semibold">{row.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {feedback.boxSource.byBox.length > 0 ? (
            <ul className="space-y-1 text-xs text-ink">
              {feedback.boxSource.byBox.map((row) => (
                <li key={`${row.boxCode}-${row.reason}`} className="flex justify-between gap-3">
                  <span>
                    {row.boxCode}
                    {' · '}
                    {boxSourceReasonLabel(row.reason, vi)}
                  </span>
                  <span className="font-semibold">{row.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {feedback && feedback.suggestions.length > 0 ? (
        <ul className="space-y-1 text-xs text-ink">
          {feedback.suggestions.slice(0, 5).map((item) => (
            <li key={`${item.reason}-${item.message}`}>{item.message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
