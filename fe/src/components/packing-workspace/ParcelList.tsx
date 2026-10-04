import { AlertTriangle, CheckCircle2, Package } from 'lucide-react'
import type { PackingPlan } from '../../types/packing-plan'
import { kg } from './format'

/**
 * Cột trái của màn làm việc: mọi kiện của mọi đơn trong nhóm, nhóm theo đơn.
 * Đơn chưa xếp hết món hiện cảnh báo ngay tại đây (chặn duyệt).
 */
export function ParcelList({
  plan,
  selected,
  onSelect,
  vi,
}: {
  plan: PackingPlan
  selected: number | null
  onSelect: (parcelNo: number) => void
  vi: boolean
}) {
  const total = plan.parcels.length
  return (
    <nav aria-label={vi ? 'Danh sách kiện' : 'Parcels'} className="space-y-4">
      {plan.orders.map((order) => {
        const parcels = plan.parcels.filter((p) => p.orderId === order.orderId)
        return (
          <div key={order.orderId}>
            <div className="mb-1.5 flex items-center gap-2 px-1 text-xs text-ink-subtle">
              <span className="font-medium uppercase tracking-wide">{vi ? 'Đơn' : 'Order'}</span>
              <span className="truncate font-mono text-ink-muted">{order.platformOrderId ?? `…${order.orderId.slice(-6)}`}</span>
            </div>
            {order.status !== 'ok' && (
              <div className="mb-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-200">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {vi
                    ? `${String(order.unplaced.length)} món chưa xếp được`
                    : `${String(order.unplaced.length)} item(s) not placed`}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {order.unplaced.slice(0, 4).map((u) => (
                    <li key={u.itemKey} className="truncate" title={u.reason}>
                      <span className="font-mono">{u.itemKey}</span> — {u.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="space-y-1">
              {parcels.map((parcel) => {
                const active = parcel.parcelNo === selected
                return (
                  <li key={parcel.parcelNo}>
                    <button
                      type="button"
                      onClick={() => onSelect(parcel.parcelNo)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent hover:border-hairline hover:bg-surface-2'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${
                          active ? 'bg-primary text-on-primary' : 'bg-surface-2 text-ink-muted'
                        }`}
                      >
                        {parcel.parcelNo}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                          <Package className="h-3.5 w-3.5 text-ink-subtle" />
                          <span className="truncate">{parcel.box.code}</span>
                          {parcel.actualWeightKg !== null &&
                            (parcel.isAbnormal ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label={vi ? 'Cân lệch' : 'Weight off'} />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label={vi ? 'Đã cân' : 'Weighed'} />
                            ))}
                        </span>
                        <span className="block text-xs tabular-nums text-ink-subtle">
                          {parcel.placements.length} {vi ? 'món' : 'items'} · {kg(parcel.estimatedWeightG, vi)} ·{' '}
                          {Math.round(parcel.fillRatio * 100)}%
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      <p className="px-1 text-xs text-ink-subtle">
        {vi ? `Tổng ${String(total)} kiện` : `${String(total)} parcel(s) in total`}
      </p>
    </nav>
  )
}
