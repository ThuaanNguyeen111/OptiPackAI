import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageX,
  Printer,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react'
import {
  approveReturn,
  cancelReturn,
  createReplacementReturn,
  listReturns,
  rejectReturn,
} from '../api/returns.api'
import { CreateReturnForm } from '../components/returns/CreateReturnForm'
import { useAuth } from '../context/use-auth'
import { UserRole } from '../types/auth'
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

const STATUS_FILTERS = [
  'requested',
  'awaiting_receipt',
  'received',
  'closed',
  'rejected',
  'canceled',
  'all',
] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function openPrintDocument(title: string, body: string): boolean {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    return false
  }
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;color:#152d35;padding:24px}
  h1{font-size:20px;margin:0 0 4px}
  p{margin:0 0 8px;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border:1px solid #d5dde0;padding:6px 8px;font-size:12px;text-align:left}
</style></head><body>${body}</body></html>`)
  doc.close()
  const win = frame.contentWindow
  if (!win) {
    frame.remove()
    return false
  }
  win.focus()
  win.print()
  window.setTimeout(() => frame.remove(), 1000)
  return true
}

function slipMatchesQuery(row: ReturnRequest, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const parts = [
    row.rmaCode,
    row.id,
    row.orderGroupId,
    ...row.items.flatMap((item) => [item.sellerSku, item.reasonLabel]),
    ...row.exchangeItems.map((item) => item.sellerSku),
  ]
  return parts.some((part) => part.toLowerCase().includes(q))
}

export function ReturnsPage({
  shell = 'portal',
}: {
  shell?: 'portal' | 'admin'
} = {}) {
  const { locale } = usePortal()
  const { session } = useAuth()
  const vi = locale === 'vi'
  const isAdmin = session?.role === UserRole.ADMIN
  const canCancelSlip =
    session?.role === UserRole.ADMIN || session?.role === UserRole.STORE_OWNER

  const [items, setItems] = useState<ReturnRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('requested')
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listReturns({
        status: statusFilter === 'all' ? undefined : statusFilter,
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
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  const visibleItems = useMemo(
    () => items.filter((row) => slipMatchesQuery(row, query)),
    [items, query],
  )

  const selected = useMemo(
    () =>
      visibleItems.find((row) => row.id === selectedId) ??
      visibleItems[0] ??
      null,
    [visibleItems, selectedId],
  )

  const queuePaging = useLocalQueuePagination(visibleItems)

  function printCurrentSlip(kind: 'slip' | 'label'): void {
    if (!selected) return
    const typeLabel = RETURN_TYPE_LABELS[selected.type]
    const statusLabel = RETURN_STATUS_LABELS[selected.status]
    const typeText = typeLabel ? (vi ? typeLabel.vi : typeLabel.en) : selected.type
    const statusText = statusLabel
      ? vi
        ? statusLabel.vi
        : statusLabel.en
      : selected.status
    const rows = selected.items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.sellerSku)}</td><td>${String(item.quantity)}</td><td>${escapeHtml(item.reasonLabel || item.reasonCode)}</td></tr>`,
      )
      .join('')
    const printed =
      kind === 'slip'
        ? openPrintDocument(
            selected.rmaCode,
            `<h1>${escapeHtml(selected.rmaCode)}</h1>
             <p>${escapeHtml(vi ? 'Phiếu hoàn hàng' : 'Return slip')}</p>
             <p>${escapeHtml(vi ? 'Trạng thái' : 'Status')}: ${escapeHtml(statusText)}</p>
             <p>${escapeHtml(vi ? 'Loại' : 'Type')}: ${escapeHtml(typeText)}</p>
             <p>${escapeHtml(vi ? 'Nhóm đơn' : 'Group')}: ${escapeHtml(selected.orderGroupId)}</p>
             <table><thead><tr><th>SKU</th><th>${escapeHtml(vi ? 'Số lượng' : 'Qty')}</th><th>${escapeHtml(vi ? 'Lý do' : 'Reason')}</th></tr></thead><tbody>${rows}</tbody></table>`,
          )
        : openPrintDocument(
            selected.rmaCode,
            `<h1>${escapeHtml(selected.rmaCode)}</h1>
             <p>${escapeHtml(vi ? 'Nhãn hoàn hàng' : 'Return label')}</p>
             <p>${escapeHtml(statusText)} · ${escapeHtml(typeText)}</p>
             <table><thead><tr><th>SKU</th><th>${escapeHtml(vi ? 'Số lượng' : 'Qty')}</th></tr></thead><tbody>${selected.items
               .map(
                 (item) =>
                   `<tr><td>${escapeHtml(item.sellerSku)}</td><td>${String(item.quantity)}</td></tr>`,
               )
               .join('')}</tbody></table>`,
          )
    if (!printed) {
      setToast(vi ? 'Không mở được hộp thoại in.' : 'Could not open the print dialog.')
    }
  }

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

  async function onCancelSlip(): Promise<void> {
    if (!selected || selected.status !== 'awaiting_receipt') return
    const note = actionNote.trim()
    if (!note) {
      setToast(vi ? 'Hủy phiếu phải ghi lý do.' : 'Cancel requires a reason.')
      return
    }
    setBusy(true)
    try {
      await cancelReturn(selected.id, {
        expected_version: selected.version,
        note,
      })
      setToast(vi ? 'Đã hủy phiếu.' : 'Slip canceled.')
      setActionNote('')
      await load()
    } catch (err: unknown) {
      setToast(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onRecreateReplacement(): Promise<void> {
    if (!selected) return
    setBusy(true)
    try {
      await createReplacementReturn(selected.id)
      setToast(
        vi
          ? 'Đã tạo lại đơn thay thế. Nhóm đơn mới đi luồng lấy hàng.'
          : 'Replacement order created. The new group enters picking.',
      )
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
        variant={shell === 'admin' ? 'admin' : 'ops'}
        breadcrumbs={
          shell === 'admin'
            ? [
                { label: 'OptiPackAI', to: '/app/admin' },
                { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
                { label: vi ? 'Trả hàng' : 'Returns' },
              ]
            : [
                { label: 'OptiPackAI', to: '/app' },
                { label: vi ? 'Trả hàng' : 'Returns' },
              ]
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-ink">
              {vi ? 'Phiếu hoàn hàng' : 'Return requests'}
            </h1>
            {isAdmin ? (
              <button
                type="button"
                className="rounded-lg bg-[#152d35] px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setCreateOpen((open) => !open)}
              >
                {vi ? '+ Tạo phiếu RMA' : '+ New RMA'}
              </button>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch">
          <section className="owner-panel flex h-full min-h-[550px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
            {isAdmin && createOpen ? (
              <CreateReturnForm
                vi={vi}
                onCreated={() => {
                  setCreateOpen(false)
                  setToast(
                    vi
                      ? 'Đã tạo phiếu, chờ Store Owner duyệt.'
                      : 'Request created, waiting for Store Owner.',
                  )
                  if (statusFilter === 'requested') void load()
                  else setStatusFilter('requested')
                }}
                onError={(message) => setToast(message)}
              />
            ) : null}
            <div className="flex w-full min-w-0 flex-nowrap items-center gap-3 overflow-hidden border-b border-hairline px-4 py-3">
              <div
                className="flex w-0 min-w-0 max-w-full flex-1 cursor-grab touch-pan-x flex-nowrap overflow-x-auto overflow-y-hidden rounded-lg bg-surface-2 p-0.5 [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
                onWheel={(event) => {
                  const row = event.currentTarget
                  if (row.scrollWidth <= row.clientWidth) return
                  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
                  row.scrollLeft += event.deltaY
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  const row = event.currentTarget
                  if (row.scrollWidth <= row.clientWidth) return
                  const startX = event.clientX
                  const startScroll = row.scrollLeft
                  let dragged = false
                  const move = (ev: PointerEvent) => {
                    const dx = ev.clientX - startX
                    if (Math.abs(dx) > 3) dragged = true
                    row.scrollLeft = startScroll - dx
                  }
                  const up = () => {
                    window.removeEventListener('pointermove', move)
                    window.removeEventListener('pointerup', up)
                    if (!dragged) return
                    const swallow = (ev: Event) => {
                      ev.preventDefault()
                      ev.stopPropagation()
                      row.removeEventListener('click', swallow, true)
                    }
                    row.addEventListener('click', swallow, true)
                  }
                  window.addEventListener('pointermove', move)
                  window.addEventListener('pointerup', up)
                }}
              >
                {STATUS_FILTERS.map((id) => {
                  const label =
                    id === 'all'
                      ? { vi: 'Tất cả', en: 'All' }
                      : RETURN_STATUS_LABELS[id]
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStatusFilter(id)}
                      className={cn(
                        'shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap',
                        statusFilter === id
                          ? 'bg-white text-ink shadow-xs dark:bg-zinc-800'
                          : 'text-ink-muted',
                      )}
                    >
                      {label ? (vi ? label.vi : label.en) : id}
                    </button>
                  )
                })}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="relative w-44 lg:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={vi ? 'Tìm mã RMA / SKU...' : 'Search RMA / SKU...'}
                    aria-label={vi ? 'Tìm mã RMA hoặc SKU' : 'Search RMA or SKU'}
                    className="h-9 w-full rounded-lg border border-hairline bg-canvas pr-3 pl-8 text-xs text-ink"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 shrink-0 gap-1.5 px-2.5 text-xs"
                  onClick={() => void load()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {vi ? 'Tải lại' : 'Refresh'}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {vi ? 'Đang tải…' : 'Loading…'}
                </div>
              ) : error ? (
                <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : visibleItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                  <PackageX className="h-8 w-8 text-ink-subtle" />
                  <p className="text-sm font-medium text-ink">
                    {query.trim()
                      ? vi
                        ? `Không có phiếu khớp «${query.trim()}».`
                        : `No slip matches “${query.trim()}”.`
                      : vi
                        ? 'Không có phiếu trả'
                        : 'No return requests'}
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
                      const selectedRow = selected?.id === row.id
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
            {!loading && visibleItems.length > 0 ? (
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

          <aside className="owner-panel flex h-full min-h-[550px] w-full shrink-0 flex-col overflow-hidden rounded-2xl lg:w-80">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-muted">
                {vi ? 'Chọn một phiếu để xem chi tiết.' : 'Select a slip to see details.'}
              </div>
            ) : (
              <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <div className="-mx-4 -mt-4 mb-4 rounded-t-xl border-b border-slate-200/60 bg-slate-50/60 p-4">
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

                {selected.exchangeItems.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-ink">
                      {vi ? 'Đổi sang' : 'Exchange for'}
                    </p>
                    <ul className="space-y-1">
                      {selected.exchangeItems.map((item) => (
                        <li key={item.sellerSku} className="text-xs">
                          <span className="font-mono font-semibold">{item.sellerSku}</span>
                          <span className="text-ink-muted"> × {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {selected.replacementStatus ? (
                  <p className="rounded-lg border border-hairline px-3 py-2 text-xs">
                    <span className="font-semibold">
                      {vi ? 'Đơn thay thế: ' : 'Replacement: '}
                    </span>
                    {selected.replacementStatus}
                    {selected.replacementGroupId
                      ? ` · ${shortId(selected.replacementGroupId)}`
                      : ''}
                    {selected.replacementError
                      ? ` — ${selected.replacementError}`
                      : ''}
                  </p>
                ) : null}

                {selected.type === 'exchange' &&
                selected.status === 'closed' &&
                selected.replacementStatus === 'failed' ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void onRecreateReplacement()}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {vi ? 'Tạo lại đơn thay thế' : 'Recreate replacement'}
                  </Button>
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

                {canCancelSlip && selected.status === 'awaiting_receipt' ? (
                  <div className="space-y-2 border-t border-hairline pt-3">
                    <label className="block text-xs font-medium text-ink">
                      {vi ? 'Lý do hủy phiếu' : 'Cancel reason'}
                    </label>
                    <textarea
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm dark:bg-zinc-900"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
                      disabled={busy}
                      onClick={() => void onCancelSlip()}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {vi ? 'Hủy phiếu' : 'Cancel slip'}
                    </Button>
                  </div>
                ) : null}

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
              <div className="flex flex-col gap-2 border-t border-hairline p-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full gap-1.5"
                  onClick={() => printCurrentSlip('slip')}
                >
                  <Printer className="h-3.5 w-3.5" />
                  {vi ? 'In phiếu RMA' : 'Print RMA slip'}
                </Button>
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#152d35] px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => printCurrentSlip('label')}
                >
                  <Printer className="h-3.5 w-3.5" />
                  {vi ? 'In nhãn hoàn hàng' : 'Print return label'}
                </button>
              </div>
              </>
            )}
          </aside>
          </div>
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
