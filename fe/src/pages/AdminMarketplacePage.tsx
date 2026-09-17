import { Link } from 'react-router-dom'
import { Package, Store } from 'lucide-react'
import { LazadaConnectPanel } from '../components/marketplace/LazadaConnectPanel'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { useLazadaConnection } from '../hooks/useLazadaConnection'
import { usePortal } from '../context/use-portal'

export function AdminMarketplacePage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const connection = useLazadaConnection()

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Kết nối sàn' : 'Marketplace' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi ? 'Kết nối sàn' : 'Marketplace connection'}
              </h1>
            </div>
            <Link
              to="/app/admin/orders"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-surface-2"
            >
              <Package className="h-3.5 w-3.5" />
              {vi ? 'Xem đơn hàng' : 'View orders'}
            </Link>
          </div>

          <section className="rounded-xl border border-hairline bg-surface-1 p-4">
            <LazadaConnectPanel api={connection} locale={locale} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {(['TikTok Shop', 'Tiki'] as const).map((name) => (
              <div
                key={name}
                className="rounded-xl border border-dashed border-hairline bg-surface-1/60 p-4 opacity-70"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-ink-muted">
                  <Store className="h-4 w-4" strokeWidth={1.75} />
                  {name}
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>
    </>
  )
}
