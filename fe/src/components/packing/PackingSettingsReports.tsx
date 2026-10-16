import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  getPackingFeedback,
  getPackingReport,
  getPackingSettings,
  updatePackingSettings,
} from '../../api/packing-plan.api'
import { formatApiError } from '../../lib/api'
import type { PackingFeedbackReport, PackingReport, PackingSettings } from '../../types/packing-plan'

function pct(value: number | null): string {
  if (value == null) return '—'
  return `${Math.round(value * 1000) / 10}%`
}

export function PackingSettingsForm({
  vi,
  canEdit,
}: {
  vi: boolean
  canEdit: boolean
}) {
  const [settings, setSettings] = useState<PackingSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void getPackingSettings()
        .then(setSettings)
        .catch((err: unknown) => setError(formatApiError(err)))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function save() {
    if (!settings || !canEdit) return
    setBusy(true)
    setError(null)
    try {
      const next = await updatePackingSettings({
        ...(settings.version != null ? { expected_version: settings.version } : {}),
        abnormal_weight_threshold: settings.abnormalWeightThreshold,
        fragile_cushion_mm: settings.fragileCushionMm,
        default_prefer: settings.defaultPrefer,
        max_parcels_per_order: settings.maxParcelsPerOrder,
        allow_reused_box_for_fragile: settings.allowReusedBoxForFragile,
        require_scan: settings.requireScan,
      })
      setSettings(next)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="owner-panel space-y-3 rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-ink">
        {vi ? 'Cài đặt đóng gói' : 'Packing settings'}
      </h2>
      {!settings ? (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {vi ? 'Đang tải…' : 'Loading…'}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-ink-muted">
            {vi ? 'Ngưỡng lệch cân' : 'Weight deviation'}
            <input
              type="number"
              min={0.01}
              max={1}
              step={0.01}
              disabled={!canEdit}
              value={settings.abnormalWeightThreshold}
              onChange={(e) =>
                setSettings({ ...settings, abnormalWeightThreshold: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="text-xs text-ink-muted">
            {vi ? 'Đệm dễ vỡ (mm)' : 'Fragile cushion (mm)'}
            <input
              type="number"
              min={0}
              max={50}
              disabled={!canEdit}
              value={settings.fragileCushionMm}
              onChange={(e) =>
                setSettings({ ...settings, fragileCushionMm: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="text-xs text-ink-muted">
            {vi ? 'Mục tiêu' : 'Preference'}
            <select
              disabled={!canEdit}
              value={settings.defaultPrefer}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultPrefer: e.target.value === 'cheapest' ? 'cheapest' : 'fewest_parcels',
                })
              }
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="fewest_parcels">{vi ? 'Ít kiện' : 'Fewest parcels'}</option>
              <option value="cheapest">{vi ? 'Rẻ nhất' : 'Cheapest'}</option>
            </select>
          </label>
          <label className="text-xs text-ink-muted">
            {vi ? 'Số kiện tối đa / đơn (trống = không giới hạn)' : 'Max parcels / order'}
            <input
              type="number"
              min={1}
              disabled={!canEdit}
              value={settings.maxParcelsPerOrder ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxParcelsPerOrder: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.allowReusedBoxForFragile}
              onChange={(e) =>
                setSettings({ ...settings, allowReusedBoxForFragile: e.target.checked })
              }
            />
            {vi ? 'Hàng dễ vỡ được dùng thùng tái sử dụng' : 'Reused box for fragile'}
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.requireScan}
              onChange={(e) => setSettings({ ...settings, requireScan: e.target.checked })}
            />
            {vi ? 'Bắt buộc quét từng món' : 'Require scan'}
          </label>
        </div>
      )}
      {canEdit ? (
        <button
          type="button"
          disabled={busy || !settings}
          onClick={() => void save()}
          className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-canvas disabled:opacity-50"
        >
          {vi ? 'Lưu cài đặt' : 'Save settings'}
        </button>
      ) : (
        <p className="text-[11px] text-ink-subtle">
          {vi ? 'Chỉ xem. Chủ shop hoặc Admin mới lưu được.' : 'View only. Owner or Admin can save.'}
        </p>
      )}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </section>
  )
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
