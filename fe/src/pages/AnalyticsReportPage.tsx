import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import {
  consolidatedSummary,
  formatVnd,
  platformCostBreakdown,
  staffEfficiency,
  type AnalyticsRange,
} from '../data/analytics-mock'

export function AnalyticsReportPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [range, setRange] = useState<AnalyticsRange>('7d')
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)

  const totals = useMemo(() => {
    const cost = platformCostBreakdown.reduce(
      (s, r) => s + r.material_cost_vnd,
      0,
    )
    const savings = platformCostBreakdown.reduce(
      (s, r) => s + r.savings_vnd,
      0,
    )
    return { cost, savings, pct: Math.round((savings / cost) * 1000) / 10 }
  }, [])

  const avgOph = useMemo(() => {
    const sum = staffEfficiency.reduce((s, r) => s + r.orders_per_hour, 0)
    return Math.round((sum / staffEfficiency.length) * 10) / 10
  }, [])

  async function exportPdf() {
    setExportingPdf(true)
    await new Promise((r) => setTimeout(r, 1200))
    setExportingPdf(false)
  }

  async function exportCsv() {
    setExportingCsv(true)
    await new Promise((r) => setTimeout(r, 800))
    const header =
      'date,platform,packages,material_cost_vnd,ai_savings_vnd,avg_fill_pct,courier'
    const rows = consolidatedSummary.map(
      (r) =>
        `${r.date},${r.platform},${r.packages},${r.material_cost_vnd},${r.ai_savings_vnd},${r.avg_fill_pct},${r.courier}`,
    )
    const blob = new Blob([[header, ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `optipack-analytics-${range}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExportingCsv(false)
  }

  const rangeTabs: Array<{ key: AnalyticsRange; label: string }> = [
    { key: '7d', label: vi ? '7 ngày qua' : 'Last 7 days' },
    { key: 'month', label: vi ? 'Tháng này' : 'This month' },
    { key: 'custom', label: vi ? 'Tùy chỉnh' : 'Custom' },
  ]

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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi
                  ? 'Báo cáo Vận hành & Chi phí AI'
                  : 'Operational Analytics & AI Cost Reports'}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {vi
                  ? 'Chi phí bao bì · tiết kiệm AI · hiệu suất kho'
                  : 'Material cost · AI savings · warehouse efficiency'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface-1 p-1">
              {rangeTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setRange(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    range === t.key
                      ? 'bg-primary/15 text-primary-hover'
                      : 'text-ink-subtle hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={exportingPdf}
              onClick={() => void exportPdf()}
            >
              {exportingPdf ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}
              {vi ? 'Xuất Báo Cáo PDF' : 'Export PDF Report'}
            </Button>
            <Button
              variant="ghost"
              disabled={exportingCsv}
              onClick={() => void exportCsv()}
            >
              {exportingCsv ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              )}
              {vi ? 'Xuất Dữ Liệu CSV / Excel' : 'Export CSV / Excel'}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-hairline bg-surface-1 p-4">
              <p className="text-xs text-ink-subtle">
                {vi ? 'Tổng chi phí vật liệu' : 'Total material cost'}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                {formatVnd(totals.cost)}
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-surface-1 p-4">
              <p className="text-xs text-ink-subtle">
                {vi ? 'Tiết kiệm nhờ AI' : 'AI packaging savings'}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-[#10B981]">
                {formatVnd(totals.savings)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-ink-tertiary">
                −{totals.pct}%
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-surface-1 p-4">
              <p className="text-xs text-ink-subtle">
                {vi ? 'Hiệu suất kho (TB)' : 'Warehouse efficiency (avg)'}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                {avgOph}
              </p>
              <p className="mt-0.5 text-xs text-ink-tertiary">
                orders / hour / operator
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-hairline bg-surface-1 p-4">
              <h2 className="mb-3 text-sm font-medium text-ink">
                {vi
                  ? 'Chi phí vs Savings theo sàn'
                  : 'Cost vs Savings by platform'}
              </h2>
              <ul className="space-y-3">
                {platformCostBreakdown.map((row) => (
                  <li
                    key={row.platform}
                    className="rounded-lg border border-hairline bg-canvas px-3 py-3"
                    style={{ borderLeftWidth: 3, borderLeftColor: row.accent }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: row.accent }}
                      >
                        {row.platform}
                      </p>
                      <span className="font-mono text-[11px] text-ink-subtle">
                        {row.orders} orders
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs">
                      <span className="text-ink-muted">
                        Cost:{' '}
                        <span className="font-mono text-ink">
                          {formatVnd(row.material_cost_vnd)}
                        </span>
                      </span>
                      <span className="text-[#10B981]">
                        Saved:{' '}
                        <span className="font-mono">
                          {formatVnd(row.savings_vnd)}
                        </span>{' '}
                        <span className="font-mono">({row.savings_pct}%)</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-hairline bg-surface-1 p-4">
              <h2 className="mb-3 text-sm font-medium text-ink">
                {vi
                  ? 'Hiệu suất nhân viên kho'
                  : 'Warehouse staff efficiency'}
              </h2>
              <ul className="space-y-2">
                {staffEfficiency.map((op) => (
                  <li
                    key={op.operator}
                    className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {op.operator}
                      </p>
                      <p className="text-[11px] text-ink-subtle">{op.role}</p>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <p className="text-ink">
                        {op.orders_per_hour}{' '}
                        <span className="text-ink-tertiary">oph</span>
                      </p>
                      <p className="text-ink-muted">
                        {op.packed_today} today · {op.accuracy_pct}%
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <h2 className="text-sm font-medium text-ink">
                {vi
                  ? 'Consolidated Summary'
                  : 'Consolidated Summary'}
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-subtle">
                <Download className="h-3 w-3" />
                print / export ready
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-ink-subtle">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Platform</th>
                    <th className="px-4 py-3 font-medium">Packages</th>
                    <th className="px-4 py-3 font-medium">Material Cost</th>
                    <th className="px-4 py-3 font-medium">AI Savings</th>
                    <th className="px-4 py-3 font-medium">Avg Fill</th>
                    <th className="px-4 py-3 font-medium">Courier</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidatedSummary.map((row, i) => (
                    <tr
                      key={`${row.date}-${row.platform}-${i}`}
                      className="border-b border-hairline/70 last:border-0"
                    >
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {row.date}
                      </td>
                      <td className="px-4 py-3 text-ink">{row.platform}</td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {row.packages}
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {formatVnd(row.material_cost_vnd)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#10B981]">
                        {formatVnd(row.ai_savings_vnd)}
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-muted">
                        {row.avg_fill_pct}%
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{row.courier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
