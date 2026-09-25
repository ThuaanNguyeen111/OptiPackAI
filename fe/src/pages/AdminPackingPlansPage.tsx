import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Package, RefreshCw, Sparkles } from 'lucide-react'
import {
  getOrderGroupPickingList,
  listOrderGroups,
} from '../api/order-groups.api'
import { generatePackaging } from '../api/packaging.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import { AdminToast } from '../modules/admin/components/AdminToast'
import type { OrderGroup, PackableItem } from '../types/order-groups'
import {
  GROUP_FULFILLMENT_STATUS_LABELS,
} from '../types/order-groups'

/**
 * Trang Admin riêng — chốt kế hoạch đóng gói gửi NV đóng gói.
 * Không dùng `/app/packing` (bàn Packaging Staff).
 */
export function AdminPackingPlansPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  const [groups, setGroups] = useState<OrderGroup[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<PackableItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [view, setView] = useState<'picked' | 'sent'>('picked')

  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      // Lấy toàn bộ rồi lọc FE: «Chờ chốt» = fulfillmentStatus === picked
      // (kho đã xác nhận lấy xong). «Đã gửi NV» = pending_approval.
      const rows = await listOrderGroups({
        fulfillment_status: undefined,
      })
      setGroups(rows)
    } catch (err: unknown) {
      setListError(formatApiError(err))
      setGroups([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadList()
    }, 100)
    return () => window.clearTimeout(t)
  }, [loadList])

  const picked = useMemo(
    () => groups.filter((g) => g.fulfillmentStatus === 'picked'),
    [groups],
  )
  const sent = useMemo(
    () => groups.filter((g) => g.fulfillmentStatus === 'pending_approval'),
    [groups],
  )
  const queue = view === 'picked' ? picked : sent

  useEffect(() => {
    if (queue.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !queue.some((g) => g.id === selectedId)) {
      setSelectedId(queue[0]?.id ?? null)
    }
  }, [queue, selectedId])

  const selected = useMemo(
    () => queue.find((g) => g.id === selectedId) ?? null,
    [queue, selectedId],
  )

  useEffect(() => {
    if (!selectedId || view !== 'picked') {
      setItems([])
      setItemsError(null)
      return
    }
    let cancelled = false
    setItemsLoading(true)
    setItemsError(null)
    setActionError(null)
    const t = window.setTimeout(() => {
      void getOrderGroupPickingList(selectedId)
        .then((rows) => {
          if (!cancelled) {
            setItems(rows)
            setItemsError(null)
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setItems([])
            setItemsError(formatApiError(err))
          }
        })
        .finally(() => {
          if (!cancelled) setItemsLoading(false)
        })
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [selectedId, view])

  const canConfirm =
    Boolean(selected) &&
    selected?.fulfillmentStatus === 'picked' &&
    !itemsLoading &&
    !itemsError &&
    items.length > 0

  async function onConfirm(): Promise<void> {
    if (!selected || !canConfirm) return
    setActionBusy(true)
    setActionError(null)
    try {
      await generatePackaging(selected.id)
      setToast(
        vi
          ? 'Đã chốt kế hoạch — đã gửi thông báo cho nhân viên đóng gói.'
          : 'Plan confirmed — Packaging Staff notified.',
      )
      window.setTimeout(() => setToast(null), 3200)
      await loadList()
      setView('sent')
    } catch (err: unknown) {
      // generate đã fallback pick_events→đơn packable; nếu vẫn lỗi thì
      // hiện message BE (vd thật sự không còn đơn hiệu lực), không map
      // nhầm «không còn hàng» khi nguyên nhân khác.
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  function statusLabel(status: string): string {
    const known = GROUP_FULFILLMENT_STATUS_LABELS[status]
    if (!known) return status
    return vi ? known.vi : known.en
  }

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Chốt kế hoạch đóng gói' : 'Confirm packing plan' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {vi ? 'Chốt kế hoạch đóng gói' : 'Confirm packing plan'}
              </h1>
              <p className="mt-1 text-sm text-ink-subtle">
                {vi
                  ? 'Danh sách «Chờ chốt» = nhóm đơn kho đã xác nhận lấy xong (picked). Chọn nhóm còn hàng → Xác nhận → NV đóng gói nhận thông báo.'
                  : '«To confirm» = order groups warehouse marked picked. Pick a group that still has items → Confirm → staff notified.'}
              </p>
            </div>
            <Button
              variant="secondary"
              className="h-9 min-h-9"
              onClick={() => void loadList()}
              disabled={listLoading}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {vi ? 'Tải lại' : 'Refresh'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setView('picked')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'picked'
                  ? 'bg-primary text-white'
                  : 'border border-hairline bg-surface text-ink-muted hover:bg-surface-2'
              }`}
            >
              {vi ? 'Chờ chốt' : 'To confirm'} ({String(picked.length)})
            </button>
            <button
              type="button"
              onClick={() => setView('sent')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'sent'
                  ? 'bg-primary text-white'
                  : 'border border-hairline bg-surface text-ink-muted hover:bg-surface-2'
              }`}
            >
              {vi ? 'Đã gửi NV' : 'Sent to staff'} ({String(sent.length)})
            </button>
          </div>

          {listError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
              {listError}
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <section className="flex max-h-[28rem] flex-col overflow-hidden rounded-xl border border-hairline bg-surface">
              <div className="border-b border-hairline px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                {vi ? 'Nhóm đơn' : 'Order groups'}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {listLoading ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-ink-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {vi ? 'Đang tải…' : 'Loading…'}
                  </div>
                ) : queue.length === 0 ? (
                  <p className="p-3 text-sm text-ink-subtle">
                    {view === 'picked'
                      ? vi
                        ? 'Chưa có nhóm nào ở trạng thái đã lấy xong. Khi kho pick xong, nhóm hiện tại đây.'
                        : 'No picked groups yet. After warehouse finishes picking, they appear here.'
                      : vi
                        ? 'Chưa gửi kế hoạch nào cho nhân viên đóng gói.'
                        : 'No plans sent to Packaging Staff yet.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-hairline">
                    {queue.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(g.id)}
                          className={`w-full px-3 py-2.5 text-left transition-colors ${
                            selectedId === g.id
                              ? 'bg-primary/10'
                              : 'hover:bg-surface-2'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-medium text-ink">
                              {g.id.slice(-8)}
                            </span>
                            {g.orderPriority === 'express' ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                                Express
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-muted capitalize">
                            {g.platform} · {g.orderCount}{' '}
                            {vi ? 'đơn' : 'orders'}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-hairline bg-surface p-4 sm:p-5">
              {!selected ? (
                <p className="text-sm text-ink-subtle">
                  {vi
                    ? 'Chọn một nhóm bên trái để chốt kế hoạch.'
                    : 'Select a group on the left.'}
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <h2 className="font-mono text-sm font-semibold text-ink">
                      {selected.id}
                    </h2>
                  </div>

                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-subtle">
                        {vi ? 'Trạng thái' : 'Status'}
                      </dt>
                      <dd className="font-medium text-ink">
                        {statusLabel(selected.fulfillmentStatus)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-subtle">
                        {vi ? 'Sàn' : 'Platform'}
                      </dt>
                      <dd className="capitalize text-ink">{selected.platform}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-subtle">
                        {vi ? 'Số đơn' : 'Orders'}
                      </dt>
                      <dd className="text-ink">{selected.orderCount}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-subtle">Version</dt>
                      <dd className="font-mono text-ink">{selected.version}</dd>
                    </div>
                  </dl>

                  {view === 'picked' ? (
                    <>
                      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                        <p className="text-sm font-medium text-ink">
                          {vi
                            ? 'Xác nhận sẽ tạo kế hoạch đóng gói (tạm — theo SKU đã lấy) và gửi thông báo cho nhân viên đóng gói.'
                            : 'Confirm creates a packing plan (from picked SKUs) and notifies Packaging Staff.'}
                        </p>
                        <p className="mt-1 text-xs text-ink-subtle">
                          {vi
                            ? 'Chưa gắn AI đầy đủ — dùng thuật toán fallback; dữ liệu đơn/SKU lấy từ hệ thống thật.'
                            : 'Full AI not wired yet — fallback algorithm; order/SKU data stays accurate.'}
                        </p>
                        {(actionError ?? itemsError) ? (
                          <p className="mt-2 text-sm text-rose-600">
                            {actionError ?? itemsError}
                          </p>
                        ) : null}
                        <Button
                          variant="primary"
                          className="mt-3 h-9 min-h-9"
                          disabled={actionBusy || !canConfirm}
                          onClick={() => void onConfirm()}
                        >
                          {actionBusy ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1.5 h-4 w-4" />
                          )}
                          {vi ? 'Xác nhận thực hiện' : 'Confirm & notify staff'}
                        </Button>
                        {!canConfirm && !itemsLoading && !actionBusy ? (
                          <p className="mt-2 text-xs text-ink-subtle">
                            {vi
                              ? 'Chỉ chốt được khi nhóm còn SKU hợp lệ. Thử nhóm Storefront bên trái nếu nhóm Lazada đã hủy hết đơn.'
                              : 'Confirm only works when the group still has valid SKUs. Try a Storefront group if this Lazada group has all canceled orders.'}
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-ink">
                          {vi ? 'SKU trong nhóm (còn đóng gói được)' : 'Packable SKUs in group'}
                        </h3>
                        {itemsLoading ? (
                          <p className="mt-2 text-sm text-ink-muted">
                            {vi ? 'Đang tải…' : 'Loading…'}
                          </p>
                        ) : itemsError ? (
                          <p className="mt-2 text-sm text-rose-600">{itemsError}</p>
                        ) : items.length === 0 ? (
                          <p className="mt-2 text-sm text-ink-subtle">
                            {vi
                              ? 'Không có SKU hợp lệ trong nhóm này.'
                              : 'No valid SKUs in this group.'}
                          </p>
                        ) : (
                          <ul className="mt-2 divide-y divide-hairline rounded-lg border border-hairline">
                            {items.map((item) => (
                              <li
                                key={item.sku}
                                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                              >
                                <span className="font-mono text-ink">
                                  {item.sku}
                                </span>
                                <span className="text-ink-muted">
                                  × {item.quantity}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        {vi
                          ? 'Đã gửi kế hoạch — đang chờ nhân viên đóng gói chấp nhận hoặc từ chối. Nếu từ chối, nhóm quay lại «Chờ chốt» kèm lý do.'
                          : 'Plan sent — waiting for Packaging Staff to accept or reject. On reject, the group returns to «To confirm» with a reason.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <AdminToast message={toast} />
    </>
  )
}
