import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, Store } from 'lucide-react'
import { fetchStorefrontConnection, type StorefrontConnection } from '../api/storefront.api'
import { LazadaConnectPanel } from '../components/marketplace/LazadaConnectPanel'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { useLazadaConnection } from '../hooks/useLazadaConnection'
import { usePortal } from '../context/use-portal'

export function AdminMarketplacePage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const connection = useLazadaConnection()
  const [storefront, setStorefront] = useState<StorefrontConnection | null>(null)

  useEffect(() => {
    void fetchStorefrontConnection()
      .then(setStorefront)
      .catch(() => setStorefront(null))
  }, [])

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

          <section className="rounded-xl border border-success/25 bg-success/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
                  <Store className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {storefront?.store_name ?? 'AURELLE'}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {vi
                      ? 'Storefront Website · Kênh nội bộ'
                      : 'Storefront Website · Internal channel'}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">
                    shopId {storefront?.shop_id ?? 'storefront-main'}
                  </p>
                </div>
              </div>
              <span className="rounded-md border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
                {vi ? 'Đang hoạt động' : 'Active'}
              </span>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              {vi
                ? 'Đơn hàng từ store được đẩy realtime về hệ thống, không cần kết nối OAuth.'
                : 'Orders from this store flow into the system in real time; no OAuth connection is required.'}
            </p>
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
