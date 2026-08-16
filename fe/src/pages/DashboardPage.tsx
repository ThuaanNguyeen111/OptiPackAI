import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import {
  channelLabels,
  channelVolume,
  kpiOverview,
  savingsTrend,
} from '../data/portal-mock'

function KpiCard({
  label,
  value,
  hint,
  mono,
}: {
  label: string
  value: string
  hint: string
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-5">
      <p className="text-sm text-ink-subtle">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold tracking-tight text-ink ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-tertiary">{hint}</p>
    </div>
  )
}

export function DashboardPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const totalChannel = channelVolume.reduce((s, c) => s + c.count, 0)
  const maxAfter = Math.max(...savingsTrend.map((t) => t.before))

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Tổng quan' : 'Dashboard Overview' },
        ]}
      />
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Tổng quan vận hành' : 'Operations Overview'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? 'KPI hôm nay · tiết kiệm đóng gói AI · tỷ lệ fulfillment'
                : 'Today KPIs · AI packaging savings · fulfillment rate'}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={vi ? 'Đơn hôm nay' : 'Total Orders Today'}
              value={kpiOverview.total_orders_today.toLocaleString('en-US')}
              hint={`+${kpiOverview.total_orders_delta}% ${vi ? 'so với hôm qua' : 'vs yesterday'}`}
              mono
            />
            <KpiCard
              label={vi ? 'Tiết kiệm đóng gói AI' : 'AI Packaging Savings'}
              value={`${kpiOverview.ai_savings_pct}%`}
              hint={vi ? 'Giảm chi phí thể tích' : 'Volumetric cost reduced'}
              mono
            />
            <KpiCard
              label={vi ? 'Chờ đóng gói' : 'Orders Pending Packing'}
              value={String(kpiOverview.pending_packing)}
              hint={vi ? 'Cần xử lý trong ca' : 'Need packing this shift'}
              mono
            />
            <KpiCard
              label={vi ? 'Tỷ lệ fulfillment' : 'Fulfillment Rate'}
              value={`${kpiOverview.fulfillment_rate}%`}
              hint={vi ? 'Hoàn tất đúng hạn' : 'On-time completion'}
              mono
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Channel volume */}
            <section className="rounded-xl border border-hairline bg-surface-1 p-5">
              <h2 className="text-sm font-medium text-ink">
                {vi ? 'Đơn theo kênh' : 'Order Volume by Channel'}
              </h2>
              <div className="mt-5 space-y-4">
                {channelVolume.map((row) => {
                  const pct = Math.round((row.count / totalChannel) * 100)
                  return (
                    <div key={row.channel}>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span className="text-ink-muted">
                          {channelLabels[row.channel]}
                        </span>
                        <span className="font-mono text-ink">
                          {row.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Savings trend */}
            <section className="rounded-xl border border-hairline bg-surface-1 p-5">
              <h2 className="text-sm font-medium text-ink">
                {vi
                  ? 'Xu hướng tiết kiệm đóng gói'
                  : 'Packaging Cost Savings Trend'}
              </h2>
              <p className="mt-1 text-xs text-ink-subtle">
                {vi ? 'Trước AI vs Sau AI (chỉ số chuẩn hóa)' : 'Before AI vs After AI (indexed)'}
              </p>
              <div className="mt-5 flex h-44 items-end gap-2">
                {savingsTrend.map((point) => (
                  <div
                    key={point.week}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div className="flex h-36 w-full items-end justify-center gap-0.5">
                      <div
                        className="w-2 rounded-t bg-ink-tertiary/50"
                        style={{
                          height: `${(point.before / maxAfter) * 100}%`,
                        }}
                        title={`Before ${point.before}`}
                      />
                      <div
                        className="w-2 rounded-t bg-primary"
                        style={{
                          height: `${(point.after / maxAfter) * 100}%`,
                        }}
                        title={`After ${point.after}`}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-ink-subtle">
                      {point.week}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-[11px] text-ink-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-ink-tertiary/50" />
                  {vi ? 'Trước AI' : 'Before AI'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-primary" />
                  {vi ? 'Sau AI' : 'After AI'}
                </span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
