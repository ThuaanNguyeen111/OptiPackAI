import type { ReactNode } from 'react'
import { parcelOrderLines } from '../../lib/parcel-order-display'
import type { PackingPlan, PackingPlanParcel } from '../../types/packing-plan'

/** Kiện gộp nhiều đơn: liệt kê món của từng đơn. Kiện 1 đơn không hiện gì. */
export function SharedParcelOrders({
  parcel,
  orders,
  vi,
}: {
  parcel: PackingPlanParcel
  orders: PackingPlan['orders']
  vi: boolean
}): ReactNode {
  const lines = parcelOrderLines(parcel, orders)
  if (lines.length === 0) return null
  return (
    <ul className="mt-1.5 space-y-1 rounded-md bg-surface-2 px-2 py-1.5 text-xs text-ink">
      {lines.map((line) => (
        <li key={line.orderId}>
          <span className="font-medium">
            {vi ? 'Đơn' : 'Order'} {line.platformOrderId ?? line.orderId.slice(-8)}
          </span>
          {line.recipientName ? <span className="text-ink-muted"> · {line.recipientName}</span> : null}
          <span className="font-mono text-ink-muted">
            {' — '}
            {line.items.map((item) => `${item.sku} ×${String(item.quantity)}`).join(', ') || '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Nhãn lớp ngoài của kiện. Thùng là mặc định nên không hiện. */
export function MailerBadge({ parcel, vi }: { parcel: PackingPlanParcel; vi: boolean }): ReactNode {
  if (parcel.box.kind !== 'mailer') return null
  return (
    <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink">
      {vi ? 'Túi niêm phong' : 'Mailer'}
    </span>
  )
}
