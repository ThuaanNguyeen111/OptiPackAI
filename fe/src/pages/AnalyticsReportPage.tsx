import { useEffect, useState } from 'react'
import {
  getPackagingMaterialsSavings,
  type PackagingMaterialsSavings,
} from '../api/packaging-materials.api'
import { getPackingReport } from '../api/packing-plan.api'
import { PackingReportsPanel, PackingSettingsForm } from '../components/packing/PackingSettingsReports'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import type { PackingReport } from '../types/packing-plan'

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function AnalyticsReportPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [report, setReport] = useState<PackingReport | null>(null)
  const [savings, setSavings] = useState<PackagingMaterialsSavings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([getPackingReport(), getPackagingMaterialsSavings()])
        .then(([summary, saved]) => {
          setReport(summary)
          setSavings(saved)
        })
        .catch((err: unknown) => setError(formatApiError(err)))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Báo cáo & Xuất file' : 'Analytics & Export' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <PackingReportsPanel vi={vi} />
          <PackingSettingsForm vi={vi} canEdit />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Báo cáo đóng gói' : 'Packing report'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? 'Số liệu 30 ngày gần nhất từ báo cáo đóng gói và sổ tiết kiệm bao bì. Không còn bảng theo sàn.'
                : 'Last 30 days from the packing report and packaging savings. No per-channel table.'}
            </p>
          </div>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-hairline bg-surface-1 p-4">
              <p className="text-xs text-ink-subtle">
                {vi ? 'Chi phí đóng gói' : 'Packaging cost'}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                {report ? formatVnd(report.packagingCostVnd) : '…'}
              </p>
              <p className="mt-0.5 text-xs text-ink-tertiary">
                {report
                  ? vi
                    ? `${report.groups} nhóm · ${report.parcels} kiện`
                    : `${report.groups} groups · ${report.parcels} parcels`
                  : null}
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-surface-1 p-4">
              <p className="text-xs text-ink-subtle">
                {vi ? 'Tiết kiệm bao bì' : 'Packaging savings'}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-[#10B981]">
                {savings ? formatVnd(savings.totalSavingVnd) : '…'}
              </p>
              <p className="mt-0.5 font-mono text-xs text-ink-tertiary">
                {savings
                  ? vi
                    ? `Tái sử dụng ${Math.round(savings.reuseRate * 100)}%`
                    : `Reuse ${Math.round(savings.reuseRate * 100)}%`
                  : null}
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-surface-1 p-4">
              <p className="text-xs text-ink-subtle">
                {vi ? 'Thời gian đóng trung bình' : 'Average pack time'}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                {report?.avgPackMinutes != null
                  ? `${Math.round(report.avgPackMinutes)}`
                  : '—'}
              </p>
              <p className="mt-0.5 text-xs text-ink-tertiary">
                {vi ? 'phút / nhóm' : 'minutes / group'}
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-hairline bg-surface-1 p-4">
            <h2 className="mb-3 text-sm font-medium text-ink">
              {vi ? 'Theo nhân viên đóng gói' : 'By packer'}
            </h2>
            {report && report.byStaff.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {vi ? 'Chưa có nhóm đã đóng trong 30 ngày.' : 'No packed groups in the last 30 days.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {(report?.byStaff ?? []).map((row) => (
                  <li
                    key={row.staffId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas px-3 py-2.5"
                  >
                    <p className="truncate text-sm font-medium text-ink">
                      {row.name ?? row.staffId}
                    </p>
                    <p className="text-right font-mono text-xs text-ink-muted">
                      {vi
                        ? `${row.groups} nhóm · ${row.parcels} kiện`
                        : `${row.groups} groups · ${row.parcels} parcels`}
                      {row.avgPackMinutes != null
                        ? ` · ${Math.round(row.avgPackMinutes)} ${vi ? 'phút' : 'min'}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
