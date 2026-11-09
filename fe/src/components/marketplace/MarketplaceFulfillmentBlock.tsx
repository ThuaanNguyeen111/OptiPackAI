import { useState } from 'react'
import { Loader2, Printer, Tag } from 'lucide-react'
import { getMarketplaceLabels } from '../../api/orders.api'
import { getApiErrorCode, formatApiError } from '../../lib/api'
import type { MarketplaceFulfillmentInfo } from '../../types/marketplace-orders'
import { formatDateTime } from '../../utils/format'
import { Button } from '../ui/Button'

const STATUS_LABEL: Record<MarketplaceFulfillmentInfo['confirmationStatus'], { vi: string; en: string; tone: string }> = {
  pending: { vi: 'Chờ xác nhận đủ hàng', en: 'Waiting for stock confirmation', tone: 'text-amber-700' },
  confirmed: { vi: 'Đã xác nhận đủ hàng', en: 'Stock confirmed', tone: 'text-emerald-700' },
  canceled: { vi: 'Sàn đã hủy', en: 'Canceled by marketplace', tone: 'text-rose-700' },
  not_required: { vi: 'Không cần xác nhận', en: 'No confirmation needed', tone: 'text-ink-muted' },
}

/** Nút in nhãn do sàn cấp cho 1 đơn (Tiki dropship). Dùng được ở nhiều màn. */
export function MarketplaceLabelButtons({
  orderId,
  vi,
  compact,
}: {
  orderId: string
  vi: boolean
  compact?: boolean
}) {
  const [busy, setBusy] = useState<'label' | 'stamp' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function open(kind: 'label' | 'stamp') {
    setBusy(kind)
    setError(null)
    void getMarketplaceLabels(orderId)
      .then((labels) => {
        const url = kind === 'label' ? labels.shippingLabelUrl : labels.shippingStampUrl
        if (!url) {
          setError(vi ? 'Sàn chưa cấp nhãn cho đơn này.' : 'The marketplace has not issued this label yet.')
          return
        }
        window.open(url, '_blank', 'noopener')
      })
      .catch((err: unknown) => {
        setError(
          getApiErrorCode(err) === 'ORD_MARKETPLACE_LABEL_UNAVAILABLE'
            ? vi
              ? 'Chưa có nhãn: đơn chưa được xác nhận đủ hàng trên sàn.'
              : 'No label yet: the order is not confirmed on the marketplace.'
            : formatApiError(err),
        )
      })
      .finally(() => setBusy(null))
  }

  const size = compact ? 'h-8 text-xs' : 'h-9 text-xs'
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className={size} disabled={busy !== null} onClick={() => open('label')}>
          {busy === 'label' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Printer className="mr-1.5 h-3.5 w-3.5" />}
          {vi ? 'In nhãn Tiki (dán ngoài kiện)' : 'Print Tiki label (outside)'}
        </Button>
        <Button type="button" variant="secondary" className={size} disabled={busy !== null} onClick={() => open('stamp')}>
          {busy === 'stamp' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Tag className="mr-1.5 h-3.5 w-3.5" />}
          {vi ? 'In tem Tiki (bỏ trong kiện)' : 'Print Tiki stamp (inside)'}
        </Button>
      </div>
      {error ? <p className="text-[11px] text-error">{error}</p> : null}
    </div>
  )
}

export function MarketplaceFulfillmentBlock({
  orderId,
  info,
  vi,
}: {
  orderId: string
  info: MarketplaceFulfillmentInfo
  vi: boolean
}) {
  const status = STATUS_LABEL[info.confirmationStatus]
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2.5 text-[12px]">
      <p className="font-semibold text-ink">
        {vi ? 'Giao qua sàn (dropship)' : 'Marketplace dropship'}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-ink-muted">{vi ? 'Trạng thái' : 'Status'}</dt>
        <dd className={`font-medium ${status.tone}`}>{vi ? status.vi : status.en}</dd>
        {info.fulfillmentType ? (
          <>
            <dt className="text-ink-muted">{vi ? 'Hình thức' : 'Type'}</dt>
            <dd>{info.fulfillmentType}</dd>
          </>
        ) : null}
        {info.warehouseCode ? (
          <>
            <dt className="text-ink-muted">{vi ? 'Kho sàn' : 'Marketplace warehouse'}</dt>
            <dd>{info.warehouseCode}</dd>
          </>
        ) : null}
        {info.confirmSlaAt && info.confirmationStatus === 'pending' ? (
          <>
            <dt className="text-ink-muted">{vi ? 'Hạn xác nhận' : 'Confirm by'}</dt>
            <dd>{formatDateTime(info.confirmSlaAt)}</dd>
          </>
        ) : null}
      </dl>
      {info.confirmError ? (
        <p className="rounded-md border border-error/30 bg-error/5 px-2 py-1.5 text-error">
          {vi ? 'Lần tự xác nhận gần nhất lỗi: ' : 'Last auto-confirm failed: '}
          {info.confirmError}
        </p>
      ) : null}
      {info.confirmationStatus === 'confirmed' ? (
        <MarketplaceLabelButtons orderId={orderId} vi={vi} />
      ) : null}
    </div>
  )
}
