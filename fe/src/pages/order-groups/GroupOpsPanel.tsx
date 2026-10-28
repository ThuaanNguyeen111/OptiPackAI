import { useEffect, useState } from 'react'
import { Link2, Loader2, Unlink } from 'lucide-react'
import {
  getStockAvailability,
  linkOrderGroups,
  listLinkedOrderGroups,
  listOrderGroups,
  listStockReservation,
  mergeOrderGroups,
  recheckStockReservation,
  releaseStockReservation,
  splitOrderFromGroup,
  unlinkOrderGroup,
} from '../../api/order-groups.api'
import { Button } from '../../components/ui/Button'
import { formatApiError, getApiErrorCode } from '../../lib/api'
import {
  canManuallyLinkGroup,
  canRegroup,
  type OrderGroup,
  type StockAvailability,
  type StockReservationLine,
} from '../../types/order-groups'

type GroupOpsPanelProps = {
  detail: OrderGroup
  vi: boolean
  canLink: boolean
  canRegroup: boolean
  canSeeStock: boolean
  canRecheck: boolean
  canRelease: boolean
  onChanged: () => Promise<void>
  onOpenGroup?: (groupId: string) => void
}

export function GroupOpsPanel({
  detail,
  vi,
  canLink,
  canRegroup: canRegroupGroups,
  canSeeStock,
  canRecheck,
  canRelease,
  onChanged,
  onOpenGroup,
}: GroupOpsPanelProps) {
  const [linked, setLinked] = useState<OrderGroup[]>([])
  const [candidates, setCandidates] = useState<OrderGroup[]>([])
  const [reservations, setReservations] = useState<StockReservationLine[]>([])
  const [targetId, setTargetId] = useState('')
  const [note, setNote] = useState('')
  const [mergeSourceId, setMergeSourceId] = useState('')
  const [mergeNote, setMergeNote] = useState('')
  const [splitNote, setSplitNote] = useState('')
  const [splitCreated, setSplitCreated] = useState<OrderGroup | null>(null)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeHits, setMergeHits] = useState<OrderGroup[]>([])
  const [skuQuery, setSkuQuery] = useState('')
  const [availability, setAvailability] = useState<StockAvailability | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void listLinkedOrderGroups(detail.id)
      .then((groups) => {
        if (!cancelled) setLinked(groups)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
    if (canSeeStock) {
      void listStockReservation(detail.id)
        .then((lines) => {
          if (!cancelled) setReservations(lines)
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(formatApiError(err))
        })
    }
    if (canLink || canRegroupGroups) {
      void listOrderGroups()
        .then((rows) => {
          if (!cancelled) setCandidates(rows)
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [canLink, canRegroupGroups, canSeeStock, detail.id, detail.version, detail.manualLink?.linkId])

  useEffect(() => {
    const clear = window.setTimeout(() => setSplitCreated(null), 0)
    return () => window.clearTimeout(clear)
  }, [detail.id])

  useEffect(() => {
    const q = mergeQuery.trim()
    if (!canRegroupGroups || q.length < 4) {
      const clear = window.setTimeout(() => setMergeHits([]), 0)
      return () => window.clearTimeout(clear)
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void listOrderGroups({ q, limit: 30 })
        .then((rows) => {
          if (!cancelled) setMergeHits(rows)
        })
        .catch(() => {
          if (!cancelled) setMergeHits([])
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mergeQuery, canRegroupGroups])

  const linkable = candidates.filter(
    (group) =>
      group.id !== detail.id && canManuallyLinkGroup(group.fulfillmentStatus),
  )
  const regroupable = (() => {
    const byId = new Map<string, OrderGroup>()
    for (const group of [...candidates, ...linked, ...mergeHits]) {
      if (group.id === detail.id) continue
      if (group.platform !== detail.platform || group.shopId !== detail.shopId) continue
      if (!canRegroup(group.fulfillmentStatus)) continue
      byId.set(group.id, group)
    }
    return [...byId.values()]
  })()
  const locked = !canManuallyLinkGroup(detail.fulfillmentStatus)
  const regroupOpen = canRegroupGroups && canRegroup(detail.fulfillmentStatus)

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await work()
      await onChanged()
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-hairline bg-canvas/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Link2 className="h-3.5 w-3.5" />
            {vi ? 'Đi cùng' : 'Ships with'}
            <span className="font-mono text-ink-muted">
              {detail.linkedGroupCount || linked.length}
            </span>
          </p>
          {detail.manualLink ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary-hover">
              {vi ? 'Liên kết tay' : 'Manual link'}
            </span>
          ) : null}
        </div>
        {detail.manualLink?.note ? (
          <p className="mt-1 text-[11px] text-ink-subtle">
            {detail.manualLink.note}
          </p>
        ) : null}
        {linked.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {linked.map((group) => (
              <li
                key={group.id}
                className="flex items-center justify-between gap-2 text-[11px] text-ink"
              >
                <span className="truncate font-mono">
                  {group.platform} · {group.id.slice(-6)}
                </span>
                <span className="text-ink-muted">{group.fulfillmentStatus}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-ink-subtle">
            {vi
              ? 'Chưa có nhóm khác cùng người nhận.'
              : 'No other group for this recipient.'}
          </p>
        )}

        {canLink && detail.manualLink && !locked ? (
          <Button
            type="button"
            variant="ghost"
            className="mt-2 h-8 min-h-8 text-xs"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  vi
                    ? 'Bỏ liên kết tay của nhóm này?'
                    : 'Remove the manual link from this group?',
                )
              ) {
                return
              }
              void run(async () => {
                await unlinkOrderGroup(detail.id)
              })
            }}
          >
            <Unlink className="mr-1 h-3.5 w-3.5" />
            {vi ? 'Bỏ liên kết' : 'Unlink'}
          </Button>
        ) : null}

        {canLink && !locked ? (
          <div className="mt-3 space-y-2 border-t border-hairline pt-3">
            <label className="block text-[11px] font-medium text-ink-subtle">
              {vi
                ? 'Liên kết với nhóm khác (Lazada bị che + AURELLE)'
                : 'Link another group'}
            </label>
            <select
              id="manual-link-target"
              className="h-9 w-full rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">{vi ? 'Chọn nhóm…' : 'Choose a group…'}</option>
              {linkable.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.platform} · {group.shopId} · {group.id.slice(-8)} ·{' '}
                  {group.fulfillmentStatus}
                </option>
              ))}
            </select>
            <input
              className="h-9 w-full rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
              placeholder={vi ? 'Ghi chú (tuỳ chọn)' : 'Note (optional)'}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              className="h-8 min-h-8 text-xs"
              disabled={busy || !targetId}
              onClick={() =>
                void run(async () => {
                  await linkOrderGroups(detail.id, targetId, note)
                  setNote('')
                  setTargetId('')
                })
              }
            >
              {vi ? 'Liên kết' : 'Link'}
            </Button>
          </div>
        ) : null}
        {canLink && locked ? (
          <p className="mt-2 text-[11px] text-ink-subtle">
            {vi
              ? 'Nhóm đã giao hoặc đã hủy — không liên kết tay được.'
              : 'This group is already shipped or closed.'}
          </p>
        ) : null}

        {regroupOpen ? (
          <div className="mt-3 space-y-2 border-t border-hairline pt-3">
            <p className="text-[11px] font-medium text-ink-subtle">
              {vi ? 'Gộp nhóm (cùng sàn + shop)' : 'Merge groups (same platform + shop)'}
            </p>
            <input
              className="h-9 w-full rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
              placeholder={
                vi
                  ? 'Tìm nhóm (mã đơn, tên, từ 4 ký tự)'
                  : 'Search groups (order id or name, 4+ chars)'
              }
              value={mergeQuery}
              onChange={(event) => setMergeQuery(event.target.value)}
            />
            <select
              className="h-9 w-full rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
              value={mergeSourceId}
              onChange={(event) => setMergeSourceId(event.target.value)}
            >
              <option value="">{vi ? 'Chọn nhóm nguồn…' : 'Choose source group…'}</option>
              {regroupable.map((group) => {
                const names =
                  group.recipientNames.filter((name) => name.trim().length > 0).join(', ') ||
                  '—'
                return (
                  <option key={group.id} value={group.id}>
                    {group.id.slice(-8)} · {group.orderCount}{' '}
                    {vi ? 'đơn' : 'orders'} · {names} · {group.fulfillmentStatus}
                  </option>
                )
              })}
            </select>
            <input
              className="h-9 w-full rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
              placeholder={vi ? 'Lý do (3–300 ký tự)' : 'Note (3–300 chars)'}
              value={mergeNote}
              onChange={(event) => setMergeNote(event.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              className="h-8 min-h-8 text-xs"
              disabled={busy || !mergeSourceId || mergeNote.trim().length < 3}
              onClick={() => {
                void (async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    await mergeOrderGroups(detail.id, {
                      source_group_id: mergeSourceId,
                      expected_version: detail.version,
                      note: mergeNote,
                    })
                    setMergeSourceId('')
                    setMergeNote('')
                    await onChanged()
                  } catch (err: unknown) {
                    const code = getApiErrorCode(err)
                    if (code === 'ORD_GROUP_MERGE_RECIPIENT_MISMATCH') {
                      setError(
                        canLink
                          ? vi
                            ? 'Hai nhóm khác số điện thoại — không gộp được. Có thể liên kết tay nếu cùng người nhận.'
                            : 'Phone numbers differ — cannot merge. You can still link them manually if they are the same recipient.'
                          : vi
                            ? 'Hai nhóm khác số điện thoại — không gộp được. Nhờ Coordinator liên kết tay nếu cùng người nhận.'
                            : 'Phone numbers differ — cannot merge. Ask a coordinator to link them manually if they are the same recipient.',
                      )
                      if (canLink) setTargetId(mergeSourceId)
                    } else {
                      setError(formatApiError(err))
                    }
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              {vi ? 'Gộp vào nhóm này' : 'Merge into this group'}
            </Button>
          </div>
        ) : null}
      </section>

      {canSeeStock ? (
      <section className="rounded-lg border border-hairline bg-canvas/60 p-3">
        <p className="text-xs font-semibold text-ink">
          {vi ? 'Giữ chỗ tồn' : 'Stock reservation'}
        </p>
        {reservations.length > 0 ? (
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-ink">
            {reservations.map((line) => (
              <li key={`${line.stockKey}-${line.sellerSku}`}>
                {line.sellerSku}
                {line.masterSku ? ` → ${line.masterSku}` : ''}:{' '}
                {vi ? 'cần' : 'need'} {line.quantityNeeded},{' '}
                {vi ? 'giữ' : 'held'} {line.quantityReserved},{' '}
                {vi ? 'đã lấy' : 'picked'} {line.quantityPicked}
                {line.shortage > 0
                  ? ` · ${vi ? 'thiếu' : 'short'} ${line.shortage}`
                  : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-ink-subtle">
            {vi ? 'Chưa có dòng giữ chỗ.' : 'No reservation rows.'}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {canRecheck ? (
            <Button
              type="button"
              variant="secondary"
              className="h-8 min-h-8 text-xs"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await recheckStockReservation(detail.id)
                })
              }
            >
              {vi ? 'Tính lại giữ chỗ' : 'Recheck'}
            </Button>
          ) : null}
          {canRelease ? (
            <Button
              type="button"
              variant="ghost"
              className="h-8 min-h-8 text-xs"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    vi
                      ? 'Nhả toàn bộ giữ chỗ của nhóm này?'
                      : 'Release every reservation on this group?',
                  )
                ) {
                  return
                }
                void run(async () => {
                  await releaseStockReservation(detail.id)
                })
              }}
            >
              {vi ? 'Nhả giữ chỗ' : 'Release'}
            </Button>
          ) : null}
        </div>
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-hairline pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            const sku = skuQuery.trim()
            if (!sku) return
            setBusy(true)
            setError(null)
            void getStockAvailability({
              platform: detail.platform,
              shop_id: detail.shopId,
              seller_sku: sku,
            })
              .then((row) => setAvailability(row))
              .catch((err: unknown) => setError(formatApiError(err)))
              .finally(() => setBusy(false))
          }}
        >
          <label className="min-w-[10rem] flex-1 text-[11px] text-ink-subtle">
            {vi ? 'Tra tồn khả dụng theo SKU sàn' : 'Sellable stock by seller SKU'}
            <input
              className="mt-1 h-9 w-full rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
              value={skuQuery}
              onChange={(event) => setSkuQuery(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            variant="secondary"
            className="h-9 min-h-9 text-xs"
            disabled={busy || !skuQuery.trim()}
          >
            {vi ? 'Tra' : 'Look up'}
          </Button>
        </form>
        {availability ? (
          <p className="mt-2 font-mono text-[11px] text-ink">
            {vi ? 'Thực' : 'On hand'} {availability.onHand} ·{' '}
            {vi ? 'giữ' : 'reserved'} {availability.reserved} ·{' '}
            {vi ? 'khả dụng' : 'available'} {availability.available}
            {availability.masterSku ? ` · ${availability.masterSku}` : ''}
          </p>
        ) : null}
      </section>
      ) : null}

      {error ? (
        <div className="space-y-1.5">
          <p className="rounded-md border border-error/30 bg-error/5 px-2 py-1.5 text-[11px] text-error">
            {error}
          </p>
          {canLink && targetId && targetId === mergeSourceId ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                const linkField = document.getElementById('manual-link-target')
                linkField?.scrollIntoView({ block: 'nearest' })
              }}
            >
              {vi ? 'Liên kết thay thế' : 'Link instead'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {busy ? (
        <p className="inline-flex items-center gap-1 text-[11px] text-ink-subtle">
          <Loader2 className="h-3 w-3 animate-spin" />
          {vi ? 'Đang xử lý…' : 'Working…'}
        </p>
      ) : null}

      {detail.orders.length > 0 ? (
        <section className="rounded-lg border border-hairline bg-canvas/60 p-3">
          <p className="text-xs font-semibold text-ink">
            {vi ? 'Đơn trong nhóm' : 'Orders in this group'}
          </p>
          {splitCreated ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface px-2 py-1.5 text-[11px] text-ink">
              <span>
                {vi ? 'Đã tách — nhóm mới' : 'Split — new group'}{' '}
                <span className="font-mono">{splitCreated.id.slice(-6)}</span>
              </span>
              {onOpenGroup ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 min-h-7 text-[11px]"
                  onClick={() => onOpenGroup(splitCreated.id)}
                >
                  {vi ? 'Mở nhóm mới' : 'Open new group'}
                </Button>
              ) : null}
            </div>
          ) : null}
          <ul className="mt-2 space-y-2">
            {detail.orders.map((order) => (
              <li key={order.id} className="text-[11px] text-ink">
                <p className="font-medium">
                  {order.platformOrderId || order.id.slice(-8)} · {order.status}
                </p>
                <p className="text-ink-muted">
                  {order.recipientName || '—'} · {order.recipientPhone || '—'} ·{' '}
                  {order.recipientCity || '—'}
                </p>
                {order.items.length > 0 ? (
                  <p className="font-mono text-ink-subtle">
                    {order.items
                      .map((line) => `${line.sku}×${line.quantity}`)
                      .join(', ')}
                  </p>
                ) : null}
                {regroupOpen && detail.orders.length > 1 ? (
                  <div className="mt-1 space-y-1">
                    <input
                      className="h-8 w-full rounded-md border border-hairline bg-surface px-2 text-[11px] text-ink"
                      placeholder={vi ? 'Lý do tách (3–300 ký tự)' : 'Split note (3–300 chars)'}
                      value={splitNote}
                      onChange={(event) => setSplitNote(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 min-h-7 text-[11px]"
                      disabled={busy || splitNote.trim().length < 3}
                      onClick={() => {
                        void (async () => {
                          setBusy(true)
                          setError(null)
                          try {
                            const res = await splitOrderFromGroup(detail.id, order.id, {
                              expected_version: detail.version,
                              note: splitNote,
                            })
                            setSplitNote('')
                            setSplitCreated(res.newGroup)
                            await onChanged()
                          } catch (err: unknown) {
                            setError(formatApiError(err))
                          } finally {
                            setBusy(false)
                          }
                        })()
                      }}
                    >
                      {vi ? 'Tách đơn này' : 'Split this order'}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
