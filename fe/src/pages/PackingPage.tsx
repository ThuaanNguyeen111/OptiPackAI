import { Box, Sparkles } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { portalOrders } from '../data/portal-mock'

export function PackingPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const demo = portalOrders[0]

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'AI 3D Packing' : 'AI 3D Packing Engine' },
        ]}
      />
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-hairline bg-surface-1 p-6">
            <div className="flex items-center gap-2 text-sm text-primary-hover">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              {vi ? 'Engine gợi ý hộp' : 'Box recommendation engine'}
            </div>
            <h1 className="mt-2 text-xl font-semibold text-ink">
              {vi ? 'AI 3D Bin Packing' : 'AI 3D Bin Packing'}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {vi
                ? 'Tính volumetric weight, fill ratio và vật liệu chèn lót cho từng kiện.'
                : 'Compute volumetric weight, fill ratio and cushioning per package.'}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                { label: vi ? 'Mã hộp' : 'Box', value: demo.ai_box },
                { label: vi ? 'Kích thước' : 'Dimensions', value: demo.ai_dimensions },
                {
                  label: 'Fill ratio',
                  value: `${Math.round(demo.fill_ratio * 100)}%`,
                },
                {
                  label: vi ? 'Trọng lượng TT' : 'Vol. weight',
                  value: `${demo.volumetric_weight_g}g`,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="rounded-lg border border-hairline bg-canvas p-3"
                >
                  <p className="text-xs text-ink-subtle">{row.label}</p>
                  <p className="mt-1 font-mono text-sm font-medium text-ink">
                    {row.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="primary">
                {vi ? 'Chạy packing cho đơn đã chọn' : 'Run packing for selection'}
              </Button>
              <Button variant="ghost">
                {vi ? 'Xuất kế hoạch PDF' : 'Export plan PDF'}
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-surface-1 p-6">
            <div className="mb-4 flex items-center gap-2 text-sm text-ink-muted">
              <Box className="h-4 w-4 text-tiktok" strokeWidth={1.75} />
              {vi ? 'Preview 3D (mock)' : '3D preview (mock)'}
            </div>
            <div className="relative mx-auto aspect-square max-w-sm rounded-xl border border-hairline bg-canvas p-6">
              <div
                className="absolute inset-6 rounded-lg opacity-40 blur-2xl"
                style={{
                  background:
                    'radial-gradient(circle, color-mix(in srgb, var(--app-primary) 40%, transparent), transparent)',
                }}
              />
              <div className="relative grid h-full grid-cols-3 grid-rows-3 gap-2">
                <div className="col-span-2 row-span-2 rounded-lg bg-primary/80" />
                <div className="rounded-lg bg-tiktok/70" />
                <div className="rounded-lg bg-shopee/80" />
                <div className="col-span-2 rounded-lg bg-primary/40" />
                <div className="rounded-lg border border-dashed border-hairline-strong" />
              </div>
            </div>
            <p className="mt-4 text-center font-mono text-xs text-ink-subtle">
              unused_space={demo.unused_space}% · fragile_safe=true
            </p>
          </section>
        </div>
      </main>
    </>
  )
}
