import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageX,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import {
  approveReturn,
  listReturns,
  rejectReturn,
} from '../api/returns.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { useLocalQueuePagination } from '../hooks/useLocalQueuePagination'
import { QueuePaginationBar } from '../components/ui/QueuePaginationBar'
import {
  RETURN_STATUS_LABELS,
  RETURN_TYPE_LABELS,
  type ReturnRequest,
} from '../types/returns'
import { formatDateTime } from '../utils/format'

function shortId(id: string): string {
  return id.length > 10 ? id.slice(-10) : id
}

function statusTone(
  status: string,
): 'default' | 'primary' | 'success' | 'warning' {
  if (status === 'closed') return 'success'
  if (status === 'rejected') return 'warning'
  if (status === 'requested') return 'primary'
  return 'default'
}

export function ReturnsPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  const [items, setItems] = useState<ReturnRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'requested' | 'all'>(
    'requested',
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listReturns({
        status: statusFilter === 'requested' ? 'requested' : undefined,
        limit: 100,
      })
      setItems(res.items)
      setSelectedId((prev) => {
        if (prev && res.items.some((r) => r.id === prev)) return prev
        return res.items[0]?.id ?? null
      })
    } catch (err: unknown) {
      setError(formatApiError(err))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  const selected = useMemo(
    () => items.find((r) => r.id === selectedId) ?? null,
    [items, selectedId],
  )

  const queuePaging = useLocalQueuePagination(items, {
    resetKey: statusFilter,
  })

  async function onApprove(): Promise<void> {
    if (!selected || selected.status !== 'requested') return
    setBusy(true)
    try {
      await approveReturn(selected.id, {
        expected_version: selected.version,
        note: actionNote.trim() || undefined,
      })
      setToast(vi ? 'Đã duyệt phiếu trả hàng.' : 'Return request approved.')
      setActionNote('')
      await load()
    } catch (err: unknown) {
      setToast(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onReject(): Promise<void> {
    if (!selected || selected.status !== 'requested') return
    const note = actionNote.trim()
    if (note.length < 3) {
      setToast(
        vi
          ? 'Từ chối cần ghi lý do (tối thiểu 3 ký tự).'
          : 'Reject requires a note (min 3 characters).',
      )
      return
    }
    setBusy(true)
    try {
      await rejectReturn(selected.id, {
        expected_version: selected.version,
        note,
      })
      setToast(vi ? 'Đã từ chối phiếu trả hàng.' : 'Return request rejected.')
      setActionNote('')
      await load()
    } catch (err: unknown) {
      setToast(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Trả hàng' : 'Returns' },
        ]}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-start">
          <section className="owner-panel min-w-0 flex-1 overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
              <div>
                <h1 className="text-base font-bold text-ink">
                  {vi ? 'Phiếu trả / hoàn hàng' : 'Return requests'}
                </h1>
                <p className="text-xs text-ink-muted">
                  {vi
                    ? 'Store Owner duyệt hoặc từ chối yêu cầu trả hàng (G3).'
                    : 'Store Owner approves or rejects return requests (G3).'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg bg-surface-2 p-0.5">
                  {(
                    [
                      { id: 'requested' as const, vi: 'Chờ duyệt', en: 'Pending' },
                      { id: 'all' as const, vi: 'Tất cả', en: 'All' },
                    ] as const
                  ).map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setStatusFilter(chip.id)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer',
                        statusFilter === chip.id
                          ? 'bg-white text-ink shadow-xs dark:bg-zinc-800'
                          : 'text-ink-muted',
                      )}
                    >
                      {vi ? chip.vi : chip.en}
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 gap-1.5 px-2.5 text-xs"
                  onClick={() => void load()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {vi ? 'Tải lại' : 'Refresh'}
                </Button>
              </div>
            </div>

            <div className="min-h-0 max-h-[min(70vh,640px)] overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {vi ? 'Đang tải…' : 'Loading…'}
                </div>
              ) : error ? (
                <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                  <PackageX className="h-8 w-8 text-ink-subtle" />
                  <p className="text-sm font-medium text-ink">
                    {vi ? 'Không có phiếu trả' : 'No return requests'}
                  </p>
                  <p className="max-w-sm text-xs text-ink-subtle">
                    {vi
                      ? 'Admin giả lập khách tạo phiếu qua POST /returns. Owner duyệt tại đây.'
                      : 'Admin simulates a customer via POST /returns. Owner approves here.'}
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-hairline bg-surface-2/95">
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">RMA</th>
                      <th className="px-3 py-3">{vi ? 'Loại' : 'Type'}</th>
                      <th className="px-3 py-3">{vi ? 'Trạng thái' : 'Status'}</th>
                      <th className="px-3 py-3">{vi ? 'Nhóm đơn' : 'Group'}</th>
                      <th className="px-4 py-3">{vi ? 'Tạo lúc' : 'Created'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {queuePaging.pagedItems.map((row) => {
                      const selectedRow = selectedId === row.id
                      const typeLabel = RETURN_TYPE_LABELS[row.type]
                      const statusLabel = RETURN_STATUS_LABELS[row.status]
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedId(row.id)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            selectedRow
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/30'
                              : 'hover:bg-surface-2/80',
                          )}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold">
                            {row.rmaCode || shortId(row.id)}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {typeLabel
                              ? vi
                                ? typeLabel.vi
                                : typeLabel.en
                              : row.type}
                          </td>
                          <td className="px-3 py-3">
                            <Badge tone={statusTone(row.status)}>
                              {statusLabel
                                ? vi
                                  ? statusLabel.vi
                                  : statusLabel.en
                                : row.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-ink-muted">
                            {shortId(row.orderGroupId)}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-muted">
                            {row.createdAt
                              ? formatDateTime(row.createdAt)
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {!loading && items.length > 0 ? (
              <QueuePaginationBar
                vi={vi}
                className="border-t border-hairline px-4 py-2"
                rangeStart={queuePaging.rangeStart}
                rangeEnd={queuePaging.rangeEnd}
                total={queuePaging.total}
                page={queuePaging.page}
                totalPages={queuePaging.totalPages}
                onPrev={() => queuePaging.setPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  queuePaging.setPage((p) =>
                    Math.min(queuePaging.totalPages, p + 1),
                  )
                }
              />
            ) : null}
          </section>

          <aside className="owner-panel w-full shrink-0 rounded-2xl p-4 lg:w-80">
            {!selected ? (
              <p className="text-sm text-ink-muted">
                {vi
                  ? 'Chọn một phiếu bên trái để duyệt hoặc từ chối.'
                  : 'Select a request on the left to approve or reject.'}
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ls-cta)]">
                    {vi ? 'Chi tiết phiếu' : 'Request detail'}
                  </p>
                  <h2 className="mt-1 font-mono text-lg font-bold text-ink">
                    {selected.rmaCode}
                  </h2>
                </div>

                <dl className="space-y-2 rounded-lg border border-hairline bg-canvas/50 p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-subtle">{vi ? 'Trạng thái' : 'Status'}</dt>
                    <dd>
                      <Badge tone={statusTone(selected.status)}>
                        {RETURN_STATUS_LABELS[selected.status]
                          ? vi
                            ? RETURN_STATUS_LABELS[selected.status]!.vi
                            : RETURN_STATUS_LABELS[selected.status]!.en
                          : selected.status}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-subtle">{vi ? 'Loại' : 'Type'}</dt>
                    <dd className="text-right text-xs font-medium">
                      {RETURN_TYPE_LABELS[selected.type]
                        ? vi
                          ? RETURN_TYPE_LABELS[selected.type]!.vi
                          : RETURN_TYPE_LABELS[selected.type]!.en
                        : selected.type}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-subtle">{vi ? 'Nhóm đơn' : 'Group'}</dt>
                    <dd className="font-mono text-xs">{shortId(selected.orderGroupId)}</dd>
                  </div>
                </dl>

                {selected.customerNote ? (
                  <p className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-2 text-xs text-ink">
                    <span className="font-semibold">
                      {vi ? 'Ghi chú khách: ' : 'Customer note: '}
                    </span>
                    {selected.customerNote}
                  </p>
                ) : null}

                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ink">
                    {vi ? 'Sản phẩm' : 'Items'}
                  </p>
                  <ul className="space-y-1.5">
                    {selected.items.map((item) => (
                      <li
                        key={`${item.sellerSku}-${item.reasonCode}`}
                        className="rounded-lg border border-hairline px-2.5 py-2 text-xs"
                      >
                        <span className="font-mono font-semibold">{item.sellerSku}</span>
                        <span className="text-ink-muted"> × {item.quantity}</span>
                        {item.reasonLabel ? (
                          <p className="mt-0.5 text-ink-subtle">{item.reasonLabel}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                {selected.status === 'requested' ? (
                  <div className="space-y-2 border-t border-hairline pt-3">
                    <label className="block text-xs font-medium text-ink">
                      {vi ? 'Ghi chú duyệt / lý do từ chối' : 'Approve note / reject reason'}
                    </label>
                    <textarea
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm dark:bg-zinc-900"
                      placeholder={
                        vi
                          ? 'Từ chối: bắt buộc ghi lý do'
                          : 'Reject: reason required'
                      }
                    />
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        className="w-full gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={busy}
                        onClick={() => void onApprove()}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {vi ? 'Duyệt' : 'Approve'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
                        disabled={busy}
                        onClick={() => void onReject()}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {vi ? 'Từ chối' : 'Reject'}
                      </Button>
                    </div>
                    <p className="flex items-start gap-1.5 text-[11px] text-ink-subtle">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {vi
                        ? 'Người tạo phiếu không được tự duyệt (RMA_SELF_APPROVAL).'
                        : 'Creator cannot self-approve (RMA_SELF_APPROVAL).'}
                    </p>
                  </div>
                ) : selected.decisionNote ? (
                  <p className="rounded-lg border border-hairline px-3 py-2 text-xs">
                    <span className="font-semibold">
                      {vi ? 'Quyết định: ' : 'Decision: '}
                    </span>
                    {selected.decisionNote}
                  </p>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
