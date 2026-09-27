import { KeyRound, Package, Plug } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'

const marketplaces = [
  { name: 'Shopee', status: 'connected' as const, accent: 'text-[#FF6B00]' },
  { name: 'TikTok Shop', status: 'connected' as const, accent: 'text-[#00E5FF]' },
  { name: 'Lazada', status: 'pending' as const, accent: 'text-[#818CF8]' },
  { name: 'Facebook', status: 'pending' as const, accent: 'text-[#1877F2]' },
]

export function SettingsPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Cài đặt hệ thống' : 'System Settings' },
        ]}
      />
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">
              {vi ? 'Cài đặt hệ thống' : 'System Settings'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? 'API keys OAuth · quy tắc đóng gói'
                : 'Marketplace API OAuth · packaging rules'}
            </p>
          </div>

          <section className="rounded-xl border border-hairline bg-surface-1 p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
              <Plug className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
              {vi ? 'Kết nối marketplace' : 'Marketplace connections'}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {marketplaces.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between rounded-lg border border-hairline bg-canvas px-4 py-3"
                >
                  <div>
                    <p className={`text-sm font-medium ${m.accent}`}>{m.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-tertiary">
                      OAuth · webhook
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={m.status === 'connected' ? 'success' : 'default'}
                    >
                      {m.status === 'connected'
                        ? vi
                          ? 'Đã kết nối'
                          : 'Connected'
                        : vi
                          ? 'Chưa kết nối'
                          : 'Pending'}
                    </Badge>
                    <Button variant="ghost" className="h-8 min-h-8 px-2 text-xs">
                      <KeyRound className="mr-1 h-3.5 w-3.5" />
                      {vi ? 'Cấu hình' : 'Configure'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-surface-1 p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
              <Package className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
              {vi ? 'Quy tắc đóng gói' : 'Packaging rules'}
            </div>
            <div className="space-y-3 text-sm">
              {[
                {
                  title: vi ? 'Ưu tiên giảm khoảng trống' : 'Minimize unused space',
                  value: 'Max unused ≤ 12%',
                },
                {
                  title: vi ? 'Bảo vệ hàng fragile' : 'Fragile protection',
                  value: 'Auto bubble wrap',
                },
                {
                  title: vi ? 'Gộp đơn cùng khách' : 'Consolidate same customer',
                  value: 'Phone + address match',
                },
              ].map((rule) => (
                <div
                  key={rule.title}
                  className="flex items-center justify-between rounded-lg border border-hairline bg-canvas px-4 py-3"
                >
                  <p className="text-ink">{rule.title}</p>
                  <p className="font-mono text-xs text-ink-muted">{rule.value}</p>
                </div>
              ))}
            </div>
            <Button variant="primary" className="mt-4">
              {vi ? 'Lưu quy tắc' : 'Save rules'}
            </Button>
          </section>
        </div>
      </main>
    </>
  )
}
