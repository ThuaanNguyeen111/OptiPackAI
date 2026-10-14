import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { listOrderGroups } from '../../api/order-groups.api'
import { createReturn, listReturnReasonCodes } from '../../api/returns.api'
import { Button } from '../ui/Button'
import { formatApiError } from '../../lib/api'
import { RETURN_TYPE_LABELS } from '../../types/returns'

type ItemDraft = { sellerSku: string; quantity: string; reasonCode: string }
type ExchangeDraft = { sellerSku: string; quantity: string }

const CUSTOMER_TYPES = ['return_refund', 'refund_only', 'exchange'] as const

function blankItem(reasonCode: string): ItemDraft {
  return { sellerSku: '', quantity: '1', reasonCode }
}

export function CreateReturnForm({
  vi,
  onCreated,
  onError,
}: {
  vi: boolean
  onCreated: () => void
  onError: (message: string) => void
}) {
  const [groups, setGroups] = useState<{ id: string }[]>([])
  const [reasons, setReasons] = useState<{ code: string; label: string }[]>([])
  const [orderGroupId, setOrderGroupId] = useState('')
  const [type, setType] = useState<(typeof CUSTOMER_TYPES)[number]>('return_refund')
  const [items, setItems] = useState<ItemDraft[]>([blankItem('changed_mind')])
  const [exchangeItems, setExchangeItems] = useState<ExchangeDraft[]>([
    { sellerSku: '', quantity: '1' },
  ])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      listOrderGroups({ fulfillment_status: 'delivered' }),
      listReturnReasonCodes(),
    ])
      .then(([delivered, reasonRows]) => {
        if (cancelled) return
        setGroups(delivered.map((row) => ({ id: row.id })))
        setReasons(reasonRows)
        const firstReason = reasonRows[0]?.code ?? 'changed_mind'
        setItems([blankItem(firstReason)])
        setOrderGroupId((current) => current || delivered[0]?.id || '')
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(): Promise<void> {
    const parsedItems = items
      .map((row) => ({
        seller_sku: row.sellerSku.trim(),
        quantity: Number(row.quantity),
        reason_code: row.reasonCode,
      }))
      .filter((row) => row.seller_sku.length > 0)
    if (!orderGroupId || parsedItems.length === 0) {
      onError(
        vi
          ? 'Chọn nhóm đơn đã giao và ít nhất một SKU.'
          : 'Pick a delivered group and at least one SKU.',
      )
      return
    }
    if (parsedItems.some((row) => !Number.isInteger(row.quantity) || row.quantity < 1)) {
      onError(vi ? 'Số lượng phải là số nguyên ≥ 1.' : 'Quantity must be an integer ≥ 1.')
      return
    }
    const parsedExchange = exchangeItems
      .map((row) => ({
        seller_sku: row.sellerSku.trim(),
        quantity: Number(row.quantity),
      }))
      .filter((row) => row.seller_sku.length > 0)
    if (type === 'exchange' && parsedExchange.length === 0) {
      onError(
        vi
          ? 'Đổi hàng phải khai SKU khách muốn nhận.'
          : 'Exchange requires the SKU the customer wants.',
      )
      return
    }
    setBusy(true)
    try {
      await createReturn({
        order_group_id: orderGroupId,
        type,
        items: parsedItems,
        ...(type === 'exchange' ? { exchange_items: parsedExchange } : {}),
        ...(note.trim() ? { customer_note: note.trim() } : {}),
      })
      onCreated()
    } catch (err: unknown) {
      onError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-3 border-b border-hairline px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      {loadError ? (
        <p className="text-xs text-rose-700">{loadError}</p>
      ) : null}
      <p className="text-xs font-semibold text-ink">
        {vi
          ? 'Admin đóng vai khách. Chỉ nhóm đơn đã giao, trong 15 ngày.'
          : 'Admin acts as the customer. Delivered groups only, within 15 days.'}
      </p>
      <label className="block text-xs">
        <span className="text-ink-muted">{vi ? 'Nhóm đơn đã giao' : 'Delivered group'}</span>
        {groups.length > 0 ? (
          <select
            value={orderGroupId}
            onChange={(event) => setOrderGroupId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm dark:bg-zinc-900"
          >
            {groups.map((row) => (
              <option key={row.id} value={row.id}>
                {row.id}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={orderGroupId}
            onChange={(event) => setOrderGroupId(event.target.value)}
            placeholder="order group id"
            className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900"
          />
        )}
      </label>
      <label className="block text-xs">
        <span className="text-ink-muted">{vi ? 'Loại' : 'Type'}</span>
        <select
          value={type}
          onChange={(event) =>
            setType(event.target.value as (typeof CUSTOMER_TYPES)[number])
          }
          className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm dark:bg-zinc-900"
        >
          {CUSTOMER_TYPES.map((value) => (
            <option key={value} value={value}>
              {vi ? RETURN_TYPE_LABELS[value]?.vi : RETURN_TYPE_LABELS[value]?.en}
            </option>
          ))}
        </select>
      </label>
      {items.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-3">
          <input
            value={row.sellerSku}
            onChange={(event) =>
              setItems((current) =>
                current.map((item, i) =>
                  i === index ? { ...item, sellerSku: event.target.value } : item,
                ),
              )
            }
            placeholder="seller SKU"
            className="rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900"
          />
          <input
            value={row.quantity}
            onChange={(event) =>
              setItems((current) =>
                current.map((item, i) =>
                  i === index ? { ...item, quantity: event.target.value } : item,
                ),
              )
            }
            inputMode="numeric"
            className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm dark:bg-zinc-900"
          />
          <select
            value={row.reasonCode}
            onChange={(event) =>
              setItems((current) =>
                current.map((item, i) =>
                  i === index ? { ...item, reasonCode: event.target.value } : item,
                ),
              )
            }
            className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm dark:bg-zinc-900"
          >
            {reasons.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button
        type="button"
        className="text-xs font-semibold text-primary"
        onClick={() =>
          setItems((current) => [
            ...current,
            blankItem(reasons[0]?.code ?? 'changed_mind'),
          ])
        }
      >
        {vi ? 'Thêm SKU' : 'Add SKU'}
      </button>
      {type === 'exchange'
        ? exchangeItems.map((row, index) => (
            <div key={`ex-${index}`} className="grid gap-2 sm:grid-cols-2">
              <input
                value={row.sellerSku}
                onChange={(event) =>
                  setExchangeItems((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, sellerSku: event.target.value } : item,
                    ),
                  )
                }
                placeholder={vi ? 'SKU đổi sang' : 'Replacement SKU'}
                className="rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900"
              />
              <input
                value={row.quantity}
                onChange={(event) =>
                  setExchangeItems((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, quantity: event.target.value } : item,
                    ),
                  )
                }
                inputMode="numeric"
                className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm dark:bg-zinc-900"
              />
            </div>
          ))
        : null}
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        placeholder={vi ? 'Ghi chú khách (tuỳ chọn)' : 'Customer note (optional)'}
        className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm dark:bg-zinc-900"
      />
      <Button type="submit" disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {vi ? 'Gửi phiếu' : 'Submit request'}
      </Button>
    </form>
  )
}
