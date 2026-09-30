import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Truck,
  CheckCircle2,
  ChevronDown,
  Printer,
  Download,
  MapPin,
  Eye,
  Check,
  ShieldCheck,
  X,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { listOrderGroups } from '../api/order-groups.api'
import { getPackagingRecommendation } from '../api/packaging.api'
import {
  deliverShipment,
  failShipment,
  listFailureReasonCodes,
  listShipmentEvents,
  listShipments,
  retryShipment,
  startShipment,
} from '../api/shipments.api'
import { OWN_FLEET_ACCOUNT } from '../data/shipping-mock'
import { formatApiError } from '../lib/api'
import { useLocalQueuePagination } from '../hooks/useLocalQueuePagination'
import { QueuePaginationBar } from '../components/ui/QueuePaginationBar'
import type { OrderGroup } from '../types/order-groups'
import type { PackagingRecommendation } from '../types/packaging'
import type {
  DeliveryFailureReason,
  FailureReasonOption,
  Shipment,
  ShipmentEvent,
  ShipmentStatus,
} from '../types/shipments'
import { isShipmentDeliveryOverdue, SHIPMENT_STATUS_LABELS } from '../types/shipments'
import { formatDateTime } from '../utils/format'

type QueueTab = 'packed' | ShipmentStatus
type ModalMode = 'start' | 'deliver' | 'fail' | 'retry' | null

type QueueRow =
  | { key: string; kind: 'packed'; group: OrderGroup }
  | { key: string; kind: 'shipment'; shipment: Shipment }

const TABS: { id: QueueTab; vi: string; en: string }[] = [
  { id: 'packed', vi: 'Chờ giao', en: 'Ready to ship' },
  { id: 'out_for_delivery', vi: 'Đang giao', en: 'Out for delivery' },
  { id: 'delivery_failed', vi: 'Giao thất bại', en: 'Failed' },
  { id: 'returning_to_warehouse', vi: 'Đang hoàn về', en: 'Returning' },
  { id: 'delivered', vi: 'Đã giao', en: 'Delivered' },
  { id: 'returned_to_warehouse', vi: 'Đã về kho', en: 'Back at WH' },
]

function statusLabel(status: string, vi: boolean): string {
  const known = SHIPMENT_STATUS_LABELS[status]
  if (!known) return status
  return vi ? known.vi : known.en
}

function BarcodeLineIcon({ className = 'text-slate-700 dark:text-slate-300' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[2.5px] shrink-0 ${className}`} aria-hidden="true">
      <span className="h-4 w-[2.5px] rounded-xs bg-current" />
      <span className="h-4 w-[1.5px] rounded-xs bg-current" />
      <span className="h-4 w-[3px] rounded-xs bg-current" />
      <span className="h-4 w-[1.5px] rounded-xs bg-current" />
    </span>
  )
}

function StylusSignatureGraphic() {
  return (
    <div className="relative flex items-center justify-center py-0.5">
      <svg
        width="135"
        height="36"
        viewBox="0 0 150 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-[var(--ls-cta)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--ls-cta)_45%,transparent)]"
      >
        <path
          d="M12 28L42 12L105 18L138 24L105 30L42 36L12 28Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M42 12L68 24L42 36"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.8"
        />
        <path d="M68 24H122" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="100" cy="24" r="2.5" fill="currentColor" />
        <path d="M122 24L138 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M26 18L26 34" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      </svg>
    </div>
  )
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id
}

function boxVolumeCbm(rec: PackagingRecommendation | null): number {
  if (!rec) return 0
  const { lengthCm, widthCm, heightCm } = rec.boxSize
  return (lengthCm * widthCm * heightCm) / 1_000_000
}

function boxWeightKg(rec: PackagingRecommendation | null): number {
  if (!rec) return 0
  return rec.actualMeasuredWeightKg ?? 0
}

function rowGroupId(row: QueueRow): string {
  return row.kind === 'packed' ? row.group.id : row.shipment.orderGroupId
}

export function ShippingPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<QueueTab>('packed')
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false)
  const [scanInput, setScanInput] = useState('')
  const [filterQuery, setFilterQuery] = useState('')
  const [autoScanActive, setAutoScanActive] = useState(false)

  const [packedGroups, setPackedGroups] = useState<OrderGroup[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [reasonCodes, setReasonCodes] = useState<FailureReasonOption[]>([])
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [events, setEvents] = useState<ShipmentEvent[]>([])
  const [packRecByGroupId, setPackRecByGroupId] = useState<
    Record<string, PackagingRecommendation | null>
  >({})

  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [failReason, setFailReason] = useState<string>('customer_unreachable')
  const [actionNote, setActionNote] = useState('')

  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3500)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [groups, shipmentPage, reasons] = await Promise.all([
        listOrderGroups({ fulfillment_status: 'packed' }),
        listShipments({ page: 1, limit: 100 }),
        listFailureReasonCodes(),
      ])
      setPackedGroups(groups)
      setShipments(shipmentPage.items)
      setReasonCodes(reasons)
    } catch (err: unknown) {
      setLoadError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { packed: packedGroups.length }
    for (const shipment of shipments) {
      byStatus[shipment.status] = (byStatus[shipment.status] ?? 0) + 1
    }
    return byStatus
  }, [packedGroups, shipments])

  const rows = useMemo<QueueRow[]>(() => {
    if (tab === 'packed') {
      return packedGroups.map((group) => ({
        key: `packed:${group.id}`,
        kind: 'packed' as const,
        group,
      }))
    }
    return shipments
      .filter((shipment) => shipment.status === tab)
      .map((shipment) => ({
        key: `shp:${shipment.id}`,
        kind: 'shipment' as const,
        shipment,
      }))
  }, [tab, packedGroups, shipments])

  const visibleRows = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      if (row.kind === 'packed') {
        return row.group.id.toLowerCase().includes(q)
      }
      return (
        row.shipment.shipmentCode.toLowerCase().includes(q) ||
        row.shipment.orderGroupId.toLowerCase().includes(q)
      )
    })
  }, [rows, filterQuery])

  const queuePaging = useLocalQueuePagination(visibleRows)

  const selected = useMemo(
    () => visibleRows.find((row) => row.key === selectedKey) ?? visibleRows[0] ?? null,
    [visibleRows, selectedKey],
  )

  useEffect(() => {
    const groupId = searchParams.get('groupId')
    if (!groupId || packedGroups.length === 0) return
    const match = packedGroups.find((group) => group.id === groupId)
    if (match) {
      setTab('packed')
      setSelectedKey(`packed:${match.id}`)
    }
  }, [searchParams, packedGroups])

  useEffect(() => {
    const ids = [...new Set(visibleRows.map(rowGroupId))]
    const missing = ids.filter((id) => !(id in packRecByGroupId))
    if (missing.length === 0) return
    let cancelled = false
    void (async () => {
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            return [id, await getPackagingRecommendation(id)] as const
          } catch {
            return [id, null] as const
          }
        }),
      )
      if (cancelled) return
      setPackRecByGroupId((prev) => {
        const next = { ...prev }
        for (const [id, rec] of results) next[id] = rec
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [visibleRows, packRecByGroupId])

  useEffect(() => {
    if (!selected || selected.kind !== 'shipment') {
      setEvents([])
      return
    }
    const shipmentId = selected.shipment.id
    let cancelled = false
    void (async () => {
      try {
        const nextEvents = await listShipmentEvents(shipmentId)
        if (!cancelled) setEvents(nextEvents)
      } catch {
        if (!cancelled) setEvents([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected])

  const packRec = selected ? (packRecByGroupId[rowGroupId(selected)] ?? null) : null

  const sessionTotalWeight = useMemo(() => boxWeightKg(packRec).toFixed(1), [packRec])
  const sessionVolume = useMemo(() => boxVolumeCbm(packRec), [packRec])

  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = scanInput.trim()
    if (!query) return
    setFilterQuery(query)
    const upper = query.toUpperCase()
    const packedHit = packedGroups.find((group) => group.id.toUpperCase().includes(upper))
    if (packedHit) {
      setTab('packed')
      setSelectedKey(`packed:${packedHit.id}`)
      showToast(vi ? `Đã tìm nhóm ${shortId(packedHit.id)}` : `Found group ${shortId(packedHit.id)}`)
      setScanInput('')
      return
    }
    const shipmentHit = shipments.find(
      (shipment) =>
        shipment.shipmentCode.toUpperCase() === upper ||
        shipment.shipmentCode.toUpperCase().includes(upper) ||
        shipment.orderGroupId.toUpperCase().includes(upper),
    )
    if (shipmentHit) {
      setTab(shipmentHit.status as QueueTab)
      setSelectedKey(`shp:${shipmentHit.id}`)
      showToast(
        vi
          ? `Đã tìm vận đơn ${shipmentHit.shipmentCode}`
          : `Found shipment ${shipmentHit.shipmentCode}`,
      )
    } else {
      showToast(vi ? 'Không thấy mã này trong hàng đợi đã tải.' : 'Code not in the loaded queue.')
    }
    setScanInput('')
  }

  const handleExportManifest = () => {
    const lines = [
      ['kind', 'shipment_code', 'order_group_id', 'status', 'attempts'].join(','),
      ...visibleRows.map((row) => {
        if (row.kind === 'packed') {
          return ['packed', '', row.group.id, row.group.fulfillmentStatus, ''].join(',')
        }
        return [
          'shipment',
          row.shipment.shipmentCode,
          row.shipment.orderGroupId,
          row.shipment.status,
          `${String(row.shipment.attemptCount)}/${String(row.shipment.maxAttempts)}`,
        ].join(',')
      }),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shipping-queue-${tab}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast(vi ? 'Đã tải CSV hàng đợi hiện tại.' : 'Downloaded current queue as CSV.')
  }

  const handlePrintHandover = () => {
    window.print()
  }

  const primaryAction = useMemo((): ModalMode => {
    if (!selected) return null
    if (selected.kind === 'packed') return 'start'
    if (selected.shipment.status === 'out_for_delivery') return 'deliver'
    if (selected.shipment.status === 'delivery_failed') return 'retry'
    return null
  }, [selected])

  const runAction = async () => {
    if (!selected || !modalMode) return
    setActionBusy(true)
    try {
      if (modalMode === 'start' && selected.kind === 'packed') {
        const created = await startShipment(selected.group.id, actionNote)
        showToast(
          vi
            ? `Đã tạo vận đơn ${created.shipmentCode}`
            : `Started shipment ${created.shipmentCode}`,
        )
        setTab('out_for_delivery')
        setSelectedKey(`shp:${created.id}`)
        setSearchParams({}, { replace: true })
      } else if (selected.kind === 'shipment') {
        const id = selected.shipment.id
        const version = selected.shipment.version
        if (modalMode === 'deliver') {
          const next = await deliverShipment(id, version, actionNote)
          setTab('delivered')
          setSelectedKey(`shp:${next.id}`)
          showToast(vi ? 'Đã ghi nhận giao thành công.' : 'Marked delivered.')
        } else if (modalMode === 'fail') {
          const next = await failShipment(
            id,
            version,
            failReason as DeliveryFailureReason,
            actionNote,
          )
          setTab(next.status as QueueTab)
          setSelectedKey(`shp:${next.id}`)
          showToast(vi ? 'Đã ghi nhận giao thất bại.' : 'Marked delivery failed.')
        } else if (modalMode === 'retry') {
          const next = await retryShipment(id, version, actionNote)
          setTab('out_for_delivery')
          setSelectedKey(`shp:${next.id}`)
          showToast(vi ? 'Đã mở lượt giao lại.' : 'Retry started.')
        }
      }
      setModalMode(null)
      setActionNote('')
      await reload()
    } catch (err: unknown) {
      showToast(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        handleExportManifest()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        handlePrintHandover()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && primaryAction) {
        e.preventDefault()
        setModalMode(primaryAction)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [primaryAction, visibleRows, tab, vi])

  const attemptText =
    selected?.kind === 'shipment'
      ? `${String(selected.shipment.attemptCount)} / ${String(selected.shipment.maxAttempts)}`
      : '0 / 2'
  const lastReason =
    selected?.kind === 'shipment'
      ? reasonCodes.find((r) => r.code === selected.shipment.lastFailureReason)?.label ??
        selected.shipment.lastFailureReason
      : null

  const selectedDueOverdue =
    selected?.kind === 'shipment'
      ? isShipmentDeliveryOverdue(selected.shipment)
      : false
  const selectedDueAt =
    selected?.kind === 'shipment' ? selected.shipment.dueAt : null

  const panelCode =
    selected?.kind === 'shipment'
      ? selected.shipment.shipmentCode
      : selected
        ? shortId(selected.group.id)
        : '—'

  const progressPct = selected ? 100 : 0

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Vận chuyển' : 'Shipping & Handover' },
        ]}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="owner-hero">
            <div>
              <p className="owner-hero-kicker">
                {vi ? 'Điều phối vận chuyển' : 'Shipping Coordinator'}
              </p>
              <h1>{vi ? 'Vận chuyển & bàn giao' : 'Shipping & handover'}</h1>
              <p className="owner-hero-lead">
                {vi
                  ? 'Shop tự giao: tạo vận đơn, ghi nhận giao / thất bại, hoàn về kho. Tối đa 2 lượt giao.'
                  : 'Own fleet: create shipments, mark delivered or failed, return to warehouse. Max 2 attempts.'}
              </p>
              <div className="owner-hero-ctas">
                <button
                  type="button"
                  onClick={() => void reload()}
                  className="owner-btn-primary inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {vi ? 'Tải lại' : 'Refresh'}
                </button>
              </div>
            </div>
            <ol className="owner-steps">
              {TABS.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTab(item.id)
                      setSelectedKey(null)
                    }}
                    aria-current={tab === item.id ? 'true' : undefined}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {vi ? item.vi : item.en} ({String(counts[item.id] ?? 0)})
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {toastMessage && (
            <div className="owner-panel flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs font-semibold text-[var(--ls-ink)] sm:text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ls-cta)]" />
                <span>{toastMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="rounded p-1 text-[var(--ls-muted)] hover:text-[var(--ls-ink)] cursor-pointer"
                aria-label="Dismiss toast"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {loadError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {loadError}
            </div>
          )}

          <div className="ship-bench">
            <div className="ship-bench-main space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                  <div className="flex min-w-0 flex-col">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      {vi ? 'Hình thức giao hàng' : 'Delivery model'}
                    </label>
                    <div className="relative flex-1">
                      <button
                        type="button"
                        onClick={() => setCarrierDropdownOpen((o) => !o)}
                        className="flex h-12 w-full cursor-pointer items-center justify-between rounded-xl border border-[var(--ls-card-border)] bg-[var(--ls-panel)] px-3.5 text-left text-sm font-semibold text-[var(--ls-ink)] shadow-2xs transition-colors hover:border-[var(--ls-cta)]"
                      >
                        <div className="flex min-w-0 items-center gap-2.5 pr-2">
                          <Truck className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                          <span className="truncate">{OWN_FLEET_ACCOUNT.name}</span>
                          <span className="hidden sm:inline shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            SOF
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>

                      {carrierDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30 dark:border-slate-800 dark:bg-surface-1">
                          <button
                            type="button"
                            onClick={() => setCarrierDropdownOpen(false)}
                            className="flex w-full items-center justify-between rounded-lg bg-[color-mix(in_srgb,var(--ls-cta)_12%,transparent)] px-3 py-2 text-left text-xs font-bold text-[var(--ls-cta)] transition-colors"
                          >
                            <span>
                              {OWN_FLEET_ACCOUNT.name} ({OWN_FLEET_ACCOUNT.hub})
                            </span>
                            <Check className="h-3.5 w-3.5 text-[var(--ls-cta)]" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col">
                    <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      {vi ? 'Lượt giao / giới hạn' : 'Attempt / max'}
                    </span>
                    <div className="flex h-12 items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 text-sm font-semibold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400 select-none">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-mono tabular-nums tracking-tight">{attemptText}</span>
                      <span className="text-xs font-medium text-emerald-700/80 dark:text-emerald-400/80">
                        {vi ? 'lần' : 'tries'}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {vi
                    ? 'Tối đa 2 lượt. Lần 2 thất bại hoặc khách từ chối thì hệ thống tự hoàn về kho.'
                    : 'Max 2 attempts. A second fail or customer refusal returns the package to the warehouse.'}
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    {vi ? 'Tìm mã vận đơn / mã nhóm kiện' : 'Find waybill / group code'}
                  </label>
                  <form onSubmit={handleScanSubmit} className="relative">
                    <div className="flex items-center rounded-xl border-2 border-[var(--ls-cta)] bg-[var(--ls-panel)] px-3.5 py-2 shadow-sm transition-all focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--ls-cta)_35%,transparent)]">
                      <BarcodeLineIcon className="text-slate-700 dark:text-slate-300" />
                      <input
                        type="text"
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        placeholder={
                          vi
                            ? 'Quét hoặc nhập SHP-… / mã nhóm kiện …'
                            : 'Scan or enter SHP-… / group id …'
                        }
                        className="ml-3 flex-1 bg-transparent font-mono text-xs tabular-nums text-[var(--ls-ink)] placeholder:text-[var(--ls-muted)] focus:outline-hidden sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAutoScanActive((v) => !v)
                          showToast(
                            !autoScanActive
                              ? vi
                                ? 'Ô tìm sẽ lọc bảng khi gõ xong (Enter).'
                                : 'Search filters the table on Enter.'
                              : vi
                                ? 'Đã tắt gợi ý lọc nhanh.'
                                : 'Quick filter hint off.',
                          )
                        }}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold select-none transition-colors ${
                          autoScanActive
                            ? 'bg-[var(--ls-cta)] text-white'
                            : 'bg-[color-mix(in_srgb,var(--ls-cta)_16%,transparent)] text-[var(--ls-cta)]'
                        }`}
                      >
                        <span>AUTO</span>
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </form>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {vi ? 'Hàng đợi phiên làm việc' : 'Session queue'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {vi ? 'Khối lượng kiện đang chọn: ' : 'Selected package weight: '}
                    <span className="font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                      {sessionTotalWeight} kg
                    </span>
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:bg-surface-2/50 dark:text-slate-400">
                        <th className="py-3 px-3.5">{vi ? 'MÃ VẬN ĐƠN' : 'WAYBILL'}</th>
                        <th className="py-3 px-3.5">{vi ? 'MÃ NHÓM KIỆN' : 'GROUP ID'}</th>
                        <th className="py-3 px-3.5">{vi ? 'TRỌNG LƯỢNG' : 'WEIGHT'}</th>
                        <th className="py-3 px-3.5">{vi ? 'ĐIỂM ĐẾN' : 'DESTINATION'}</th>
                        <th className="py-3 px-3.5 text-right sm:text-left">
                          {vi ? 'TRẠNG THÁI' : 'STATUS'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                            {vi ? 'Đang tải hàng đợi…' : 'Loading queue…'}
                          </td>
                        </tr>
                      ) : visibleRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            {tab === 'packed'
                              ? vi
                                ? 'Chưa có nhóm packed. Packaging cần bấm «Xác nhận đã đóng gói» trước.'
                                : 'No packed groups. Packaging must confirm packed first.'
                              : vi
                                ? 'Không có vận đơn ở trạng thái này.'
                                : 'No shipments in this status.'}
                          </td>
                        </tr>
                      ) : (
                        queuePaging.pagedItems.map((row) => {
                          const active = selected?.key === row.key
                          const waybill =
                            row.kind === 'shipment' ? row.shipment.shipmentCode.trim() : ''
                          const groupId = row.kind === 'packed' ? row.group.id : row.shipment.orderGroupId
                          const rowStatus =
                            row.kind === 'packed' ? 'packed' : row.shipment.status
                          const isDone =
                            rowStatus === 'delivered' || rowStatus === 'out_for_delivery'
                          return (
                            <tr
                              key={row.key}
                              onClick={() => setSelectedKey(row.key)}
                              className={`cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--ls-cta)_7%,transparent)] ${
                                active
                                  ? 'bg-[color-mix(in_srgb,var(--ls-cta)_12%,transparent)] shadow-[inset_3px_0_0_var(--ls-cta)]'
                                  : ''
                              }`}
                              title={vi ? 'Nhấp để chọn kiện này' : 'Click to select this package'}
                            >
                              <td className="py-3 px-3.5">
                                <div className="flex items-center gap-2">
                                  <BarcodeLineIcon className="text-slate-400" />
                                  {waybill ? (
                                    <span className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                                      {waybill}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                      {vi ? 'Chờ gán mã' : 'Awaiting code'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3.5 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                {shortId(groupId)}
                              </td>
                              <td className="py-3 px-3.5 font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                                {groupId in packRecByGroupId
                                  ? `${boxWeightKg(packRecByGroupId[groupId] ?? null).toFixed(2)} kg`
                                  : '…'}
                              </td>
                              <td className="py-3 px-3.5">
                                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">
                                    {vi ? 'Shop tự giao' : 'Own fleet'}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-3.5 text-right sm:text-left">
                                <div className="flex flex-col items-end gap-1 sm:items-start">
                                {isDone && rowStatus === 'delivered' ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white tracking-wider uppercase shadow-2xs select-none">
                                    <Check className="h-3 w-3 stroke-[3]" />
                                    <span>{statusLabel(rowStatus, vi)}</span>
                                  </span>
                                ) : rowStatus === 'packed' || rowStatus === 'delivery_failed' ? (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 tracking-wider uppercase dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 select-none">
                                    <span>{statusLabel(rowStatus, vi)}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex select-none items-center gap-1 rounded-md bg-[var(--ls-cta)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-2xs">
                                    <span>{statusLabel(rowStatus, vi)}</span>
                                  </span>
                                )}
                                {row.kind === 'shipment' &&
                                isShipmentDeliveryOverdue(row.shipment) ? (
                                  <span className="inline-flex rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
                                    {vi ? 'Quá hạn' : 'Overdue'}
                                  </span>
                                ) : null}
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {!loading && visibleRows.length > 0 ? (
                  <QueuePaginationBar
                    vi={vi}
                    variant="ops"
                    className="border-0 px-0 pt-3"
                    rangeStart={queuePaging.rangeStart}
                    rangeEnd={queuePaging.rangeEnd}
                    total={queuePaging.total}
                    page={queuePaging.page}
                    totalPages={queuePaging.totalPages}
                    onPrev={() =>
                      queuePaging.setPage((p) => Math.max(1, p - 1))
                    }
                    onNext={() =>
                      queuePaging.setPage((p) =>
                        Math.min(queuePaging.totalPages, p + 1),
                      )
                    }
                  />
                ) : null}
            </div>

            <aside className="ship-bench-side select-none">
              <div className="pack-bench-head">
                <div>
                  <p className="pack-bench-kicker">
                    {vi ? 'Tổng hợp kiện đang chọn' : 'Selected package'}
                  </p>
                  <h2 className="font-mono tabular-nums">{panelCode}</h2>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-[var(--ls-muted)]">
                      {vi ? 'Lượt giao' : 'Delivery attempts'}
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums text-[var(--ls-ink)]">
                      {attemptText} {vi ? 'lần' : 'tries'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ls-cta)_14%,transparent)]">
                    <div
                      className="h-full rounded-full bg-[var(--ls-cta)] transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] leading-tight text-[var(--ls-muted)]">
                    {lastReason
                      ? `${vi ? 'Lý do gần nhất: ' : 'Last reason: '}${lastReason}`
                      : vi
                        ? 'Chưa có lần thất bại. Coordinator bấm nút dưới để đổi trạng thái.'
                        : 'No failure yet. Use the footer actions to update status.'}
                  </p>
                  {selectedDueAt ? (
                    <p
                      className={
                        selectedDueOverdue
                          ? 'rounded-lg border border-rose-300/80 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                          : 'text-[11px] font-medium text-[var(--ls-ink)]'
                      }
                    >
                      {selectedDueOverdue
                        ? vi
                          ? `Quá hạn giao · ${formatDateTime(selectedDueAt)}`
                          : `Delivery overdue · ${formatDateTime(selectedDueAt)}`
                        : vi
                          ? `Hạn giao: ${formatDateTime(selectedDueAt)}`
                          : `Due: ${formatDateTime(selectedDueAt)}`}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                  <div className="rounded-xl border border-[var(--ls-card-border)] bg-[color-mix(in_srgb,var(--ls-cta)_8%,transparent)] p-2.5 sm:p-3">
                    <span className="text-[11px] font-medium text-[var(--ls-muted)]">
                      {vi ? 'Tổng trọng lượng' : 'Total weight'}
                    </span>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-tight tabular-nums text-[var(--ls-ink)]">
                      {sessionTotalWeight} kg
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--ls-card-border)] bg-[color-mix(in_srgb,var(--ls-cta)_8%,transparent)] p-2.5 sm:p-3">
                    <span className="text-[11px] font-medium text-[var(--ls-muted)]">
                      {vi ? 'Thể tích ước tính' : 'Estimated volume'}
                    </span>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-tight tabular-nums text-[var(--ls-ink)]">
                      {sessionVolume.toFixed(2)} CBM
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-[var(--ls-card-border)] pt-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--ls-cta)] sm:text-[11px]">
                    {vi ? 'Dòng thời gian vận đơn' : 'Shipment timeline'}
                  </span>
                  <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1 text-xs">
                    {events.length === 0 ? (
                      <p className="text-[var(--ls-muted)]">
                        {selected?.kind === 'packed'
                          ? vi
                            ? 'Chưa có vận đơn — bấm bắt đầu giao.'
                            : 'No shipment yet — start delivery.'
                          : vi
                            ? 'Chưa có sự kiện.'
                            : 'No events yet.'}
                      </p>
                    ) : (
                      events.map((event) => (
                        <div key={event.id} className="flex items-start justify-between gap-2">
                          <span className="min-w-0 text-[var(--ls-ink)]">
                            {event.actorId === 'system'
                              ? vi
                                ? 'Hệ thống'
                                : 'System'
                              : event.eventType}
                            {event.reasonLabel ? ` · ${event.reasonLabel}` : ''}
                          </span>
                          <span className="shrink-0 font-mono text-[var(--ls-muted)]">
                            {event.occurredAt ? formatDateTime(event.occurredAt) : ''}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2 border-t border-[var(--ls-card-border)] pt-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--ls-cta)] sm:text-[11px]">
                    {vi ? 'Xác nhận trên hệ thống' : 'System confirmation'}
                  </span>
                  <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--ls-card-border)] bg-[var(--ls-panel)] px-3 py-2.5 text-center">
                    <StylusSignatureGraphic />
                    <p className="mt-1 text-[10.5px] text-[var(--ls-muted)]">
                      {vi
                        ? 'Shop tự giao — không có chữ ký tài xế 3PL'
                        : 'Own fleet — no 3PL driver signature'}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <footer className="ship-foot sticky bottom-0 z-20 px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportManifest}
              className="flex h-auto min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--ls-card-border)] bg-[var(--ls-panel)] px-3.5 py-2 text-xs font-semibold text-[var(--ls-ink)] shadow-xs transition-colors hover:border-[var(--ls-cta)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--ls-cta)]"
            >
              <Download className="h-4 w-4 shrink-0 text-slate-700 dark:text-slate-300" />
              <span className="leading-snug">
                {vi ? 'Xuất biên bản (CSV)' : 'Export queue (CSV)'}
              </span>
              <kbd className="hidden sm:inline-block shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-700 border border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 shadow-2xs">
                Ctrl+E
              </kbd>
            </button>

            <button
              type="button"
              onClick={handlePrintHandover}
              className="flex h-auto min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--ls-card-border)] bg-[var(--ls-panel)] px-3.5 py-2 text-xs font-semibold text-[var(--ls-ink)] shadow-xs transition-colors hover:border-[var(--ls-cta)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--ls-cta)]"
            >
              <Printer className="h-4 w-4 shrink-0 text-slate-700 dark:text-slate-300" />
              <span className="leading-snug">
                {vi ? 'In phiếu bàn giao' : 'Print handover slip'}
              </span>
              <kbd className="hidden sm:inline-block shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-700 border border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 shadow-2xs">
                Ctrl+P
              </kbd>
            </button>

            {selected?.kind === 'shipment' && selected.shipment.status === 'out_for_delivery' ? (
              <button
                type="button"
                onClick={() => {
                  setFailReason(reasonCodes[0]?.code ?? 'customer_unreachable')
                  setModalMode('fail')
                }}
                className="min-h-10 h-auto rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 font-semibold text-xs text-amber-900 shadow-xs hover:bg-amber-100 transition-colors cursor-pointer dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              >
                {vi ? 'Giao thất bại' : 'Mark failed'}
              </button>
            ) : null}
          </div>

          <div className="w-full sm:w-auto">
            <button
              type="button"
              disabled={!primaryAction || actionBusy}
              onClick={() => primaryAction && setModalMode(primaryAction)}
              className={`flex h-auto min-h-10 w-full items-start gap-2.5 rounded-xl px-4 py-2 text-xs transition-all sm:w-auto sm:items-center sm:px-5 sm:text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 ${
                !selected || boxWeightKg(packRec) <= 0 || !primaryAction
                  ? 'cursor-not-allowed bg-slate-200 font-semibold text-slate-400 shadow-none'
                  : 'owner-btn-primary cursor-pointer font-bold shadow-md'
              }`}
            >
              {actionBusy ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin sm:mt-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
              )}
              <span className="text-left leading-snug">
                {primaryAction === 'start'
                  ? vi
                    ? 'Bắt đầu giao'
                    : 'Start delivery'
                  : primaryAction === 'deliver'
                    ? vi
                      ? 'Giao thành công'
                      : 'Mark delivered'
                    : primaryAction === 'retry'
                      ? vi
                        ? 'Giao lại'
                        : 'Retry delivery'
                      : vi
                        ? 'Không có thao tác ở trạng thái này'
                        : 'No action for this status'}
              </span>
              {primaryAction ? (
                <kbd className="hidden sm:inline-block shrink-0 rounded-md bg-white/25 px-2 py-0.5 text-[11px] font-mono font-bold text-white border border-white/30 tracking-wide">
                  Ctrl+Enter
                </kbd>
              ) : null}
            </button>
          </div>
        </div>
      </footer>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-[var(--ls-cta)]" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {modalMode === 'start'
                    ? vi
                      ? 'Xác nhận bắt đầu giao'
                      : 'Confirm start delivery'
                    : modalMode === 'deliver'
                      ? vi
                        ? 'Xác nhận đã giao'
                        : 'Confirm delivered'
                      : modalMode === 'fail'
                        ? vi
                          ? 'Ghi nhận giao thất bại'
                          : 'Record delivery failure'
                        : vi
                          ? 'Xác nhận giao lại'
                          : 'Confirm retry'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <p>
                {modalMode === 'start'
                  ? vi
                    ? 'Tạo vận đơn cho nhóm đã đóng gói. Shop tự giao — không gọi hãng 3PL.'
                    : 'Create a shipment for this packed group. Own fleet — no 3PL.'
                  : modalMode === 'fail'
                    ? vi
                      ? 'Chọn lý do. Khách từ chối hoặc hết 2 lần → hệ thống tự chuyển hoàn về kho.'
                      : 'Pick a reason. Customer refused or 2 attempts → auto return.'
                    : vi
                      ? 'Thao tác ghi lên vận đơn (có kiểm tra version để tránh ghi đè).'
                      : 'This writes the shipment (version-checked).'}
              </p>

              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/80 space-y-1.5 dark:bg-surface-2 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-400">{vi ? 'Mã:' : 'Code:'}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{panelCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{vi ? 'Hình thức:' : 'Model:'}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {OWN_FLEET_ACCOUNT.name}
                  </span>
                </div>
              </div>

              {modalMode === 'fail' ? (
                <label className="block space-y-1.5">
                  <span className="text-slate-500">{vi ? 'Lý do thất bại' : 'Failure reason'}</span>
                  <select
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-surface-1"
                  >
                    {reasonCodes.map((reason) => (
                      <option key={reason.code} value={reason.code}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block space-y-1.5">
                <span className="text-slate-500">
                  {vi
                    ? failReason === 'other' && modalMode === 'fail'
                      ? 'Ghi chú (bắt buộc với lý do khác)'
                      : 'Ghi chú (tuỳ chọn)'
                    : failReason === 'other' && modalMode === 'fail'
                      ? 'Note (required for Other)'
                      : 'Note (optional)'}
                </span>
                <textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-surface-1"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                {vi ? 'Hủy' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void runAction()}
                className="owner-btn-primary cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {actionBusy
                  ? vi
                    ? 'Đang gửi…'
                    : 'Sending…'
                  : vi
                    ? 'Xác nhận'
                    : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
