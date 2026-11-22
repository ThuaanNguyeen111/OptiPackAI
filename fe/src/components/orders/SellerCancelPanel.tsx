import { useState } from 'react'
import { sellerCancelOrder } from '../../api/order-groups.api'
import { useAuth } from '../../context/use-auth'
import { formatApiError } from '../../lib/api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import {
  canSellerCancelOrder,
  type MarketplaceOrderDetail,
} from '../../types/marketplace-orders'

export function SellerCancelPanel({
  order,
  vi,
  onDone,
}: {
  order: MarketplaceOrderDetail
  vi: boolean
  onDone: () => Promise<void>
}) {
  const { session } = useAuth()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)

  if (order.sellerCanceled) {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900 dark:bg-rose-950/40">
        <span className="inline-flex rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:border-rose-700 dark:bg-rose-900 dark:text-rose-100">
          {vi ? 'Người bán hủy' : 'Seller canceled'}
        </span>
        <p className="text-xs text-rose-900 dark:text-rose-100">
          {vi
            ? 'Người bán đã hủy đơn này trên AURELLE.'
            : 'The seller already canceled this AURELLE order.'}
        </p>
        {done ? (
          <p role="status" className="text-xs font-medium text-rose-900 dark:text-rose-100">
            {vi ? 'Đã hủy đơn, đã xếp lịch báo website' : 'Order canceled, website update scheduled'}
          </p>
        ) : null}
      </div>
    )
  }

  if (!canSellerCancelOrder(order, session?.role ?? null)) return null

  const quickReasons = vi
    ? ['Sản phẩm đã hết hàng', 'Không liên hệ được người nhận', 'Sai thông tin địa chỉ']
    : ['Product is out of stock', 'Cannot reach the recipient', 'Recipient address is incorrect']

  const confirm = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await sellerCancelOrder(order.id, reason)
      setReason('')
      setOpen(false)
      setDone(true)
      await onDone()
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2.5">
      <p className="text-xs font-semibold text-ink">
        {vi ? 'Hủy đơn phía người bán (AURELLE)' : 'Seller cancel (AURELLE)'}
      </p>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-medium text-white"
      >
        {vi ? 'Hủy đơn' : 'Cancel order'}
      </button>
      <ConfirmDialog
        open={open}
        danger
        title={vi ? 'Hủy đơn và báo khách?' : 'Cancel and notify the customer?'}
        description={
          vi
            ? 'Đơn sẽ bị hủy và khách thấy lý do trên website. Nếu đơn đã vào kiện, kiện sẽ chuyển sang Cần tháo. Không hoàn tác được.'
            : 'The order will be canceled and the customer sees the reason on the website. If it is already in a parcel, the parcel moves to To unpack. This cannot be undone.'
        }
        confirmLabel={vi ? 'Hủy đơn và báo khách' : 'Cancel and notify customer'}
        cancelLabel={vi ? 'Quay lại' : 'Back'}
        loading={busy}
        confirmDisabled={!reason.trim()}
        onCancel={() => setOpen(false)}
        onConfirm={() => void confirm()}
      >
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {quickReasons.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setReason(quick)}
                className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-muted hover:text-ink"
              >
                {quick}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            rows={2}
            aria-label={vi ? 'Lý do hủy' : 'Cancel reason'}
            placeholder={vi ? 'Lý do khách sẽ thấy trên website' : 'Reason shown to the customer'}
            className="w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-xs text-ink"
          />
          {error ? <p className="text-[11px] text-rose-700">{error}</p> : null}
        </div>
      </ConfirmDialog>
    </div>
  )
}
