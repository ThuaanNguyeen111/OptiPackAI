import { Printer, QrCode, Truck } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { portalOrders } from '../data/portal-mock'

export function ShippingPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const ready = portalOrders.filter(
    (o) => o.status === 'ready' || o.status === 'processing',
  )

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Vận chuyển & Fulfillment' : 'Shipping & Fulfillment' },
        ]}
      />
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-ink">
                {vi ? 'Vận chuyển & Fulfillment' : 'Shipping & Fulfillment'}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {vi
                  ? 'Courier · in nhãn hàng loạt · QR/Barcode'
                  : 'Couriers · batch label printing · QR/Barcode'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="primary">
                <Printer className="mr-1.5 h-4 w-4" />
                {vi ? 'In nhãn hàng loạt' : 'Batch print labels'}
              </Button>
              <Button variant="ghost">
                <QrCode className="mr-1.5 h-4 w-4" />
                QR Pack
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: vi ? 'Sẵn sàng ship' : 'Ready to ship',
                value: ready.length,
                icon: Truck,
              },
              {
                label: vi ? 'Nhãn chờ in' : 'Labels queued',
                value: 28,
                icon: Printer,
              },
              {
                label: 'QR scans hôm nay',
                value: 156,
                icon: QrCode,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-hairline bg-surface-1 p-5"
              >
                <card.icon className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
                <p className="mt-3 text-sm text-ink-subtle">{card.label}</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-ink-subtle">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Box</th>
                  <th className="px-4 py-3 font-medium">Weight</th>
                  <th className="px-4 py-3 font-medium">Courier</th>
                  <th className="px-4 py-3 font-medium">{vi ? 'Thao tác' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {ready.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-hairline/70 last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-ink">{order.id}</td>
                    <td className="px-4 py-3 font-mono text-ink-muted">
                      {order.ai_box}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink-muted">
                      {order.volumetric_weight_g}g
                    </td>
                    <td className="px-4 py-3 text-ink-muted">GHN Express</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-xs text-primary-hover hover:underline"
                      >
                        {vi ? 'In nhãn' : 'Print label'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    </>
  )
}
