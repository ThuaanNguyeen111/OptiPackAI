import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  X,
  Loader2,
  RefreshCw,
  Clock3,
  AlertTriangle,
  Folder,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { UserRole } from '../types/auth'
import { listOrderGroups } from '../api/order-groups.api'
import { listReturns } from '../api/returns.api'
import { RETURN_STATUS_LABELS } from '../types/returns'
import { getPackingPlan } from '../api/packing-plan.api'
import {
  bookCarrierShipment,
  cancelCarrierShipment,
  deliverShipment,
  failShipment,
  getCarrierLabel,
  listCarrierStatuses,
  listFailureReasonCodes,
  listShipmentEvents,
  listShipments,
  receiveReturnedShipment,
  retryShipment,
  scanOverdueShipments,
  scheduleShipmentPickup,
  simulateCarrierStatus,
  startShipment,
  syncCarrierShipment,
  updateShipmentLocation,
  createShipmentBatch,
  getShipmentByGroup,
} from '../api/shipments.api'
import {
  createShippingCarrier,
  getShippingSettings,
  listShippingCarriers,
  openShippingDocument,
  quotePackagingOptions,
  quoteShippingGroup,
  updateShippingCarrier,
  updateShippingSettings,
  type ShippingCarrier,
  type ShippingServiceQuote,
} from '../api/shipping.api'
import { OWN_FLEET_ACCOUNT } from '../data/shipping-mock'
import { formatApiError } from '../lib/api'
import { useLocalQueuePagination } from '../hooks/useLocalQueuePagination'
import { QueuePaginationBar } from '../components/ui/QueuePaginationBar'
import type { OrderGroup } from '../types/order-groups'
import type { PackingPlan } from '../types/packing-plan'
import { planVolumeCbm, planWeightKg } from '../types/packing-plan'
import type {
  DeliveryFailureReason,
  FailureReasonOption,
  Shipment,
  ShipmentEvent,
  ShipmentStatus,
} from '../types/shipments'
import { isShipmentDeliveryOverdue, SHIPMENT_STATUS_LABELS } from '../types/shipments'
import { formatCurrency, formatDateTime } from '../utils/format'

type QueueTab = 'packed' | ShipmentStatus
type ModalMode = 'start' | 'deliver' | 'fail' | 'retry' | null

type QueueRow =
  | { key: string; kind: 'packed'; group: OrderGroup }
  | { key: string; kind: 'shipment'; shipment: Shipment }

const TABS: { id: QueueTab; vi: string; en: string }[] = [
  { id: 'packed', vi: 'Chờ giao', en: 'Ready to ship' },
  { id: 'awaiting_pickup', vi: 'Chờ hãng lấy', en: 'Awaiting pickup' },
  { id: 'in_transit', vi: 'Trung chuyển', en: 'In transit' },
  { id: 'out_for_delivery', vi: 'Đang giao', en: 'Out for delivery' },
  { id: 'delivery_failed', vi: 'Giao thất bại', en: 'Failed' },
  { id: 'returning_to_warehouse', vi: 'Đang hoàn về', en: 'Returning' },
  { id: 'delivered', vi: 'Đã giao', en: 'Delivered' },
  { id: 'returned_to_warehouse', vi: 'Đã về kho', en: 'Back at WH' },
  { id: 'cancelled', vi: 'Đã huỷ', en: 'Cancelled' },
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

/** Nhãn SLA còn lại / quá hạn cạnh mã kiện (chỉ khi có dueAt). */
function deliverySlaBadge(
  dueAt: string | null,
  overdue: boolean,
  vi: boolean,
): { label: string; tone: 'ok' | 'soon' | 'overdue' } | null {
  if (!dueAt) return null
  if (overdue) {
    return { label: vi ? 'Quá hạn giao' : 'Overdue', tone: 'overdue' }
  }
  const ms = Date.parse(dueAt) - Date.now()
  if (!Number.isFinite(ms) || ms < 0) {
    return { label: vi ? 'Quá hạn giao' : 'Overdue', tone: 'overdue' }
  }
  const hours = Math.ceil(ms / 3_600_000)
  if (hours <= 4) {
    return {
      label: vi ? `Còn ~${String(hours)}h` : `~${String(hours)}h left`,
      tone: 'soon',
    }
  }
  const days = Math.ceil(hours / 24)
  if (hours >= 24) {
    return {
      label: vi ? `Còn ~${String(days)} ngày` : `~${String(days)}d left`,
      tone: 'ok',
    }
  }
  return {
    label: vi ? `Còn ~${String(hours)}h` : `~${String(hours)}h left`,
    tone: 'ok',
  }
}

function KbdHint({
  children,
  onPrimary = false,
}: {
  children: string
  onPrimary?: boolean
}) {
  return (
    <kbd
      className={
        onPrimary
          ? 'hidden sm:inline-flex shrink-0 items-center rounded-md border border-white/35 bg-white/20 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-white shadow-2xs'
          : 'hidden sm:inline-flex shrink-0 items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 shadow-2xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
      }
    >
      {children}
    </kbd>
  )
}

function boxVolumeCbm(plan: PackingPlan | null): number {
  return planVolumeCbm(plan)
}

function boxWeightKg(plan: PackingPlan | null): number {
  return planWeightKg(plan)
}

function rowGroupId(row: QueueRow): string {
  return row.kind === 'packed' ? row.group.id : row.shipment.orderGroupId
}

export function ShippingPage() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const vi = locale === 'vi'
  const isAdmin = session?.role === UserRole.ADMIN
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<QueueTab>('packed')
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false)
  const [scanInput, setScanInput] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)
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
    Record<string, PackingPlan | null>
  >({})

  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [failReason, setFailReason] = useState<string>('customer_unreachable')
  const [actionNote, setActionNote] = useState('')
  const [returnsByGroup, setReturnsByGroup] = useState<
    Record<string, { rmaCode: string; status: string }[]>
  >({})
  const [carriers, setCarriers] = useState<ShippingCarrier[]>([])
  const [carrierChoice, setCarrierChoice] = useState('own')
  const [serviceCode, setServiceCode] = useState('')
  const [quotes, setQuotes] = useState<ShippingServiceQuote[]>([])
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoteTick, setQuoteTick] = useState(0)
  const [addrStreet, setAddrStreet] = useState('')
  const [addrWard, setAddrWard] = useState('')
  const [addrProvince, setAddrProvince] = useState('')
  const [addrPhone, setAddrPhone] = useState('')
  const [ghnStatuses, setGhnStatuses] = useState<{ status: string; label: string }[]>([])
  const [simulateStatus, setSimulateStatus] = useState('')
  const [batchIds, setBatchIds] = useState<string[]>([])
  const [compareText, setCompareText] = useState<string | null>(null)
  const [shipStrategy, setShipStrategy] = useState<'cheapest' | 'fastest' | 'fixed'>('cheapest')
  const [pickupAt, setPickupAt] = useState('')
  const [sampleCode, setSampleCode] = useState('')
  const [sampleName, setSampleName] = useState('')

  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3500)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [groups, shipmentPage, reasons, returnPage] = await Promise.all([
        listOrderGroups({ fulfillment_status: 'packed' }),
        listShipments({ page: 1, limit: 100 }),
        listFailureReasonCodes(),
        listReturns({ limit: 100 }).catch(() => ({
          items: [],
          total: 0,
          page: 1,
          limit: 100,
        })),
      ])
      setPackedGroups(groups)
      setShipments(shipmentPage.items)
      setReasonCodes(reasons)
      const grouped: Record<string, { rmaCode: string; status: string }[]> = {}
      for (const slip of returnPage.items) {
        const bucket = grouped[slip.orderGroupId] ?? []
        bucket.push({ rmaCode: slip.rmaCode, status: slip.status })
        grouped[slip.orderGroupId] = bucket
      }
      setReturnsByGroup(grouped)
    } catch (err: unknown) {
      setLoadError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    scanInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void listShippingCarriers()
        .then(setCarriers)
        .catch(() => setCarriers([]))
      void listCarrierStatuses()
        .then((rows) => {
          setGhnStatuses(rows)
          setSimulateStatus((current) => current || rows[0]?.status || '')
        })
        .catch(() => setGhnStatuses([]))
      void getShippingSettings()
        .then((settings) => setShipStrategy(settings.strategy))
        .catch(() => undefined)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

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

  const packedGroupId = selected?.kind === 'packed' ? selected.group.id : null

  useEffect(() => {
    if (carrierChoice === 'own' || !packedGroupId) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      const location = {
        ...(addrStreet.trim() ? { street: addrStreet.trim() } : {}),
        ...(addrWard.trim() ? { ward_name: addrWard.trim() } : {}),
        ...(addrProvince.trim() ? { province_name: addrProvince.trim() } : {}),
        ...(addrPhone.trim() ? { phone: addrPhone.trim() } : {}),
      }
      void quoteShippingGroup(packedGroupId, location)
        .then((quote) => {
          if (cancelled) return
          const rows = quote.quotes.filter((row) => row.carrierCode === carrierChoice)
          setQuotes(rows)
          setQuoteError(null)
          const recommended = rows.find(
            (row) =>
              row.serviceCode === quote.recommended?.serviceCode && !row.unavailableReason,
          )
          const first = rows.find((row) => !row.unavailableReason)
          setServiceCode(recommended?.serviceCode ?? first?.serviceCode ?? '')
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setQuotes([])
          setQuoteError(formatApiError(err))
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // Địa chỉ chỉ gửi khi đổi hãng, đổi nhóm, hoặc bấm "Cập nhật báo giá".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierChoice, packedGroupId, quoteTick])

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
            return [id, await getPackingPlan(id)] as const
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
    if (selected.shipment.carrierManaged) return null
    if (selected.shipment.status === 'out_for_delivery') return 'deliver'
    if (selected.shipment.status === 'delivery_failed') return 'retry'
    return null
  }, [selected])

  const runAction = async () => {
    if (!selected || !modalMode) return
    setActionBusy(true)
    try {
      if (modalMode === 'start' && selected.kind === 'packed') {
        const chosen = carriers.find((carrier) => carrier.code === carrierChoice)
        const created = await startShipment(selected.group.id, actionNote, {
          ...(chosen
            ? {
                carrierCode: chosen.code,
                serviceCode,
                toLocation: {
                  ...(addrStreet.trim() ? { street: addrStreet.trim() } : {}),
                  ...(addrWard.trim() ? { ward_name: addrWard.trim() } : {}),
                  ...(addrProvince.trim() ? { province_name: addrProvince.trim() } : {}),
                  ...(addrPhone.trim() ? { phone: addrPhone.trim() } : {}),
                },
              }
            : {}),
        })
        showToast(
          vi
            ? `Đã tạo vận đơn ${created.shipmentCode}`
            : `Started shipment ${created.shipmentCode}`,
        )
        const nextTab = TABS.some((item) => item.id === created.status)
          ? (created.status as QueueTab)
          : 'out_for_delivery'
        setTab(nextTab)
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
  const selectedReturns = selected
    ? returnsByGroup[rowGroupId(selected)] ?? []
    : []
  const slaBadge = deliverySlaBadge(selectedDueAt, selectedDueOverdue, vi)

  const panelCode =
    selected?.kind === 'shipment'
      ? selected.shipment.shipmentCode
      : selected
        ? shortId(selected.group.id)
        : '—'

  const chosenCarrier = carriers.find((carrier) => carrier.code === carrierChoice) ?? null
  const chosenQuote = quotes.find((row) => row.serviceCode === serviceCode) ?? null
  const startBlocked =
    chosenCarrier !== null &&
    (!chosenQuote || Boolean(chosenQuote.unavailableReason))
  const carrierManaged = selected?.kind === 'shipment' && selected.shipment.carrierManaged === true
  const documentGroupId =
    selected?.kind === 'packed'
      ? selected.group.id
      : selected?.kind === 'shipment'
        ? selected.shipment.orderGroupId
        : null

  const locationBody = () => ({
    ...(addrStreet.trim() ? { street: addrStreet.trim() } : {}),
    ...(addrWard.trim() ? { ward_name: addrWard.trim() } : {}),
    ...(addrProvince.trim() ? { province_name: addrProvince.trim() } : {}),
    ...(addrPhone.trim() ? { phone: addrPhone.trim() } : {}),
  })

  const focusShipment = (next: Shipment) => {
    const nextTab = TABS.some((item) => item.id === next.status)
      ? (next.status as QueueTab)
      : tab
    setTab(nextTab)
    setSelectedKey(`shp:${next.id}`)
  }

  const currentLocation = () => locationBody()

  const runBatch = async () => {
    if (!chosenCarrier || !serviceCode) return
    setActionBusy(true)
    try {
      const location = currentLocation()
      const result = await createShipmentBatch({
        order_group_ids: batchIds,
        carrier_code: chosenCarrier.code,
        service_code: serviceCode,
        note: actionNote.trim() || undefined,
        pickup_at: pickupAt ? new Date(pickupAt).toISOString() : undefined,
        to_location: Object.keys(location).length > 0 ? location : undefined,
      })
      setBatchIds([])
      await reload()
      showToast(
        vi
          ? `Đã tạo chuyến ${result.tripCode || ''}.`
          : `Created trip ${result.tripCode || ''}.`,
      )
    } catch (err: unknown) {
      showToast(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  const runCompare = async () => {
    if (!packedGroupId || !chosenCarrier || !serviceCode) return
    setActionBusy(true)
    try {
      const view = await quotePackagingOptions(
        packedGroupId,
        chosenCarrier.code,
        serviceCode,
        currentLocation(),
      )
      setCompareText(
        [
          ...view.lines,
          `Tổng đang dùng ${view.totalCurrentVnd}đ · tốt nhất ${view.totalBestVnd}đ · chênh ${view.totalSavingVnd}đ`,
        ].join('\n'),
      )
    } catch (err: unknown) {
      setCompareText(null)
      showToast(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  const savePickup = async () => {
    if (selected?.kind !== 'shipment' || !pickupAt) return
    setActionBusy(true)
    try {
      const next = await scheduleShipmentPickup(
        selected.shipment.id,
        new Date(pickupAt).toISOString(),
      )
      focusShipment(next)
      await reload()
      showToast(vi ? 'Đã lưu lịch lấy hàng.' : 'Pickup time saved.')
    } catch (err: unknown) {
      showToast(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  const lookupGroup = async () => {
    const groupId = packedGroupId ?? (selected?.kind === 'shipment' ? selected.shipment.orderGroupId : null)
    if (!groupId) return
    setActionBusy(true)
    try {
      const found = await getShipmentByGroup(groupId)
      if (!found) {
        showToast(vi ? 'Nhóm chưa có vận đơn.' : 'This group has no shipment.')
        return
      }
      focusShipment(found)
    } catch (err: unknown) {
      showToast(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  const receiveAtWarehouse = async () => {
    if (selected?.kind !== 'shipment') return
    setActionBusy(true)
    try {
      const next = await receiveReturnedShipment(
        selected.shipment.id,
        selected.shipment.version,
        actionNote.trim() || undefined,
      )
      focusShipment(next)
      await reload()
      showToast(vi ? 'Kho đã nhận hàng hoàn.' : 'Warehouse received the return.')
    } catch (err: unknown) {
      showToast(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  const runCarrier = async (
    action: 'book' | 'sync' | 'cancel' | 'simulate' | 'label' | 'location',
  ) => {
    if (selected?.kind !== 'shipment') return
    setActionBusy(true)
    try {
      const id = selected.shipment.id
      if (action === 'label') {
        const label = await getCarrierLabel(id)
        if (label.url) window.open(label.url, '_blank', 'noopener')
        showToast(vi ? 'Đã mở nhãn hãng.' : 'Opened carrier label.')
      } else if (action === 'location') {
        const next = await updateShipmentLocation(id, locationBody())
        focusShipment(next)
        showToast(vi ? 'Đã gửi lại địa chỉ cho hãng.' : 'Address sent to the carrier.')
      } else if (action === 'book') {
        const next = await bookCarrierShipment(id)
        focusShipment(next)
        showToast(vi ? 'Đã đặt lại vận đơn ở hãng.' : 'Rebooked with the carrier.')
      } else if (action === 'sync') {
        const next = await syncCarrierShipment(id)
        focusShipment(next)
        showToast(vi ? 'Đã đồng bộ trạng thái hãng.' : 'Synced carrier status.')
      } else if (action === 'cancel') {
        const next = await cancelCarrierShipment(id, actionNote)
        focusShipment(next)
        showToast(vi ? 'Đã huỷ vận đơn ở hãng.' : 'Cancelled the carrier shipment.')
      } else if (simulateStatus) {
        const next = await simulateCarrierStatus(id, simulateStatus)
        focusShipment(next)
        showToast(vi ? 'Đã mô phỏng trạng thái GHN trên OptiPack.' : 'Simulated a GHN status in OptiPack.')
      }
      await reload()
    } catch (err: unknown) {
      showToast(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  const progressPct = selected ? 100 : 0

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-[#EAEEEC] dark:bg-transparent">
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Vận chuyển' : 'Shipping' },
        ]}
      />

      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        <div className="min-w-0 shrink-0 px-4 pt-4 pb-3 sm:px-6">
        <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2">
              <h1 className="shrink-0 text-xl font-semibold tracking-tight text-[var(--ls-ink)]">
                {vi ? 'Vận chuyển & bàn giao' : 'Shipping & handover'}
              </h1>
              <button
                type="button"
                onClick={() => void reload()}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-[var(--ls-ink)]"
                aria-label={vi ? 'Tải lại' : 'Refresh'}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <nav
              className="ship-status-bar ship-status-bar--seg min-w-0 flex-1 overflow-x-auto pr-2 [scrollbar-width:none]"
              aria-label={vi ? 'Lọc theo trạng thái' : 'Filter by status'}
              onWheel={(event) => {
                const nav = event.currentTarget
                if (nav.scrollWidth <= nav.clientWidth) return
                if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
                nav.scrollLeft += event.deltaY
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                const nav = event.currentTarget
                if (nav.scrollWidth <= nav.clientWidth) return
                const startX = event.clientX
                const startScroll = nav.scrollLeft
                let dragged = false
                const move = (ev: PointerEvent) => {
                  const dx = ev.clientX - startX
                  if (Math.abs(dx) > 3) dragged = true
                  nav.scrollLeft = startScroll - dx
                }
                const up = () => {
                  window.removeEventListener('pointermove', move)
                  window.removeEventListener('pointerup', up)
                  if (!dragged) return
                  const swallow = (ev: Event) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    nav.removeEventListener('click', swallow, true)
                  }
                  nav.addEventListener('click', swallow, true)
                }
                window.addEventListener('pointermove', move)
                window.addEventListener('pointerup', up)
              }}
            >
            {TABS.map((item) => {
              const count = counts[item.id] ?? 0
              return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id)
                  setSelectedKey(null)
                }}
                aria-current={tab === item.id ? 'true' : undefined}
                className={count === 0 ? 'px-2 py-1 text-xs' : undefined}
              >
                {vi ? item.vi : item.en}
                <span>{String(count)}</span>
              </button>
              )
            })}
            </nav>
          </div>

          <form onSubmit={handleScanSubmit} className="relative">
            <div className="flex h-12 w-full items-center rounded-xl border border-slate-300 bg-white px-4 transition-colors focus-within:border-[var(--app-teal-dark,#152d35)] focus-within:ring-2 focus-within:ring-[var(--app-teal-dark,#152d35)]/20 dark:border-slate-600 dark:bg-[var(--ls-panel)]">
              <BarcodeLineIcon className="text-slate-700 dark:text-slate-300" />
              <input
                ref={scanInputRef}
                type="text"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder={
                  vi
                    ? 'Quét hoặc nhập SHP-… / mã nhóm kiện …'
                    : 'Scan or enter SHP-… / group id …'
                }
                className="ml-3 min-w-0 flex-1 bg-transparent font-mono text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:outline-hidden dark:text-[var(--ls-ink)] dark:placeholder:text-[var(--ls-muted)]"
                autoComplete="off"
                spellCheck={false}
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-8 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-4">
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

          <div className="ship-bench grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="ship-bench-main space-y-3 lg:col-span-8">
                <div className="max-w-xs">
                  <div className="flex min-w-0 flex-col">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      {vi ? 'Hình thức giao hàng' : 'Delivery model'}
                    </label>
                    <div className="relative flex-1">
                      <button
                        type="button"
                        onClick={() => setCarrierDropdownOpen((o) => !o)}
                        className="flex h-12 w-full cursor-pointer items-center justify-between rounded-xl border border-black/[0.08] bg-white px-3.5 text-left text-sm font-semibold text-[var(--ls-ink)] shadow-sm shadow-black/5 transition-colors hover:border-slate-400 dark:border-[var(--ls-card-border)] dark:bg-[var(--ls-panel)] dark:shadow-none dark:hover:border-[var(--ls-cta)]"
                      >
                        <div className="flex min-w-0 items-center gap-2.5 pr-2">
                          <Truck className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                          <span className="truncate">
                            {chosenCarrier?.name ?? OWN_FLEET_ACCOUNT.name}
                          </span>
                          <span className="hidden sm:inline shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {chosenCarrier ? chosenCarrier.code : 'SOF'}
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>

                      {carrierDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30 dark:border-slate-800 dark:bg-surface-1">
                          <button
                            type="button"
                            onClick={() => {
                              setCarrierChoice('own')
                              setQuotes([])
                              setServiceCode('')
                              setCarrierDropdownOpen(false)
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--ls-ink)] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <span>
                              {OWN_FLEET_ACCOUNT.name} ({OWN_FLEET_ACCOUNT.hub})
                            </span>
                            {carrierChoice === 'own' ? (
                              <Check className="h-3.5 w-3.5 text-[var(--ls-cta)]" />
                            ) : null}
                          </button>
                          {carriers.map((carrier) => (
                            <button
                              key={carrier.code}
                              type="button"
                              onClick={() => {
                                setCarrierChoice(carrier.code)
                                setQuotes([])
                                setServiceCode('')
                                setCarrierDropdownOpen(false)
                              }}
                              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--ls-ink)] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <span>
                                {carrier.name}
                                {carrier.isSample ? (vi ? ' · cước mẫu' : ' · sample rate') : ''}
                              </span>
                              {carrierChoice === carrier.code ? (
                                <Check className="h-3.5 w-3.5 text-[var(--ls-cta)]" />
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {chosenCarrier && selected?.kind === 'packed' ? (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-[var(--ls-card-border)] dark:bg-[var(--ls-panel)]">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={addrProvince}
                        onChange={(e) => setAddrProvince(e.target.value)}
                        placeholder={vi ? 'Tỉnh / thành (nếu địa chỉ bị che)' : 'Province if masked'}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-transparent"
                      />
                      <input
                        value={addrWard}
                        onChange={(e) => setAddrWard(e.target.value)}
                        placeholder={vi ? 'Phường' : 'Ward'}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-transparent"
                      />
                      <input
                        value={addrStreet}
                        onChange={(e) => setAddrStreet(e.target.value)}
                        placeholder={vi ? 'Số nhà, đường' : 'Street'}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-transparent"
                      />
                      <input
                        value={addrPhone}
                        onChange={(e) => setAddrPhone(e.target.value)}
                        placeholder={vi ? 'SĐT 10–11 số, bắt đầu bằng 0' : 'Phone starting with 0'}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-transparent"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuoteTick((n) => n + 1)}
                      className="text-xs font-semibold text-[var(--ls-cta)]"
                    >
                      {vi ? 'Cập nhật báo giá' : 'Refresh quote'}
                    </button>
                    {quoteError ? (
                      <p className="text-xs text-red-600">{quoteError}</p>
                    ) : null}
                    <div className="space-y-2">
                      {quotes.map((quote) => (
                        <button
                          key={`${quote.carrierCode}-${quote.serviceCode}`}
                          type="button"
                          disabled={Boolean(quote.unavailableReason)}
                          onClick={() => setServiceCode(quote.serviceCode)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                            quote.unavailableReason
                              ? 'cursor-not-allowed border-slate-200 opacity-60'
                              : serviceCode === quote.serviceCode
                                ? 'border-[var(--ls-cta)]'
                                : 'border-slate-200'
                          }`}
                        >
                          <span className="font-semibold">
                            {quote.serviceName} · {formatCurrency(quote.totalCostVnd)}
                          </span>
                          <span className="mt-1 block text-[var(--ls-muted)]">
                            {quote.etaMinDays}–{quote.etaMaxDays} {vi ? 'ngày' : 'days'}
                            {quote.isSample ? (vi ? ' · cước mẫu' : ' · sample') : ''}
                            {quote.isLive ? (vi ? ' · giá hãng' : ' · live') : ''}
                          </span>
                          {quote.unavailableReason ? (
                            <span className="mt-1 block text-red-600">{quote.unavailableReason}</span>
                          ) : null}
                          {quote.assumptions.length > 0 ? (
                            <span className="mt-1 block text-amber-700">
                              {quote.assumptions.join(' · ')}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <details className="rounded-xl border border-black/[0.08] bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-transparent">
                    <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100">
                      {vi ? 'Cài đặt hãng và chiến lược' : 'Carrier and strategy settings'}
                    </summary>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-500">{vi ? 'Chiến lược' : 'Strategy'}</span>
                        <select
                          value={shipStrategy}
                          onChange={(event) =>
                            setShipStrategy(event.target.value as 'cheapest' | 'fastest' | 'fixed')
                          }
                          className="h-9 rounded-lg border border-slate-200 px-2 dark:border-slate-700 dark:bg-surface-2"
                        >
                          <option value="cheapest">{vi ? 'Rẻ nhất' : 'Cheapest'}</option>
                          <option value="fastest">{vi ? 'Nhanh nhất' : 'Fastest'}</option>
                          <option value="fixed">{vi ? 'Cố định' : 'Fixed'}</option>
                        </select>
                      </label>
                      {isAdmin ? (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => {
                            setActionBusy(true)
                            void updateShippingSettings({ strategy: shipStrategy })
                              .then((next) => {
                                setShipStrategy(next.strategy)
                                showToast(vi ? 'Đã lưu chiến lược.' : 'Strategy saved.')
                              })
                              .catch((err: unknown) => showToast(formatApiError(err)))
                              .finally(() => setActionBusy(false))
                          }}
                          className="h-9 rounded-lg bg-slate-900 px-3 font-semibold text-white dark:bg-white dark:text-slate-900"
                        >
                          {vi ? 'Lưu chiến lược' : 'Save strategy'}
                        </button>
                      ) : null}
                      {isAdmin && chosenCarrier && chosenCarrier.kind !== 'live' ? (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => {
                            setActionBusy(true)
                            void updateShippingCarrier(chosenCarrier.id, { is_active: false })
                              .then(() => listShippingCarriers())
                              .then((rows) => {
                                setCarriers(rows)
                                setCarrierChoice('own')
                                showToast(vi ? 'Đã tắt hãng.' : 'Carrier deactivated.')
                              })
                              .catch((err: unknown) => showToast(formatApiError(err)))
                              .finally(() => setActionBusy(false))
                          }}
                          className="h-9 rounded-lg border border-slate-300 px-3 font-semibold dark:border-slate-600"
                        >
                          {vi ? 'Tắt hãng đang chọn' : 'Deactivate selected carrier'}
                        </button>
                      ) : null}
                    </div>
                    {isAdmin ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <input
                          value={sampleCode}
                          onChange={(event) => setSampleCode(event.target.value.toUpperCase())}
                          placeholder="SAMPLE-CODE"
                          className="h-9 w-36 rounded-lg border border-slate-200 px-2 font-mono dark:border-slate-700 dark:bg-surface-2"
                        />
                        <input
                          value={sampleName}
                          onChange={(event) => setSampleName(event.target.value)}
                          placeholder={vi ? 'Tên hãng' : 'Carrier name'}
                          className="h-9 w-40 rounded-lg border border-slate-200 px-2 dark:border-slate-700 dark:bg-surface-2"
                        />
                        <button
                          type="button"
                          disabled={actionBusy || sampleCode.trim().length < 2 || sampleName.trim().length < 2}
                          onClick={() => {
                            setActionBusy(true)
                            void createShippingCarrier({
                              code: sampleCode.trim(),
                              name: sampleName.trim(),
                              is_sample: true,
                              services: [
                                {
                                  code: 'STANDARD',
                                  name: 'Standard',
                                  eta_min_days: 2,
                                  eta_max_days: 4,
                                  bands: [{ up_to_g: 1000, price_vnd: 20000 }],
                                },
                              ],
                            })
                              .then(() => listShippingCarriers())
                              .then((rows) => {
                                setCarriers(rows)
                                setSampleCode('')
                                setSampleName('')
                                showToast(vi ? 'Đã thêm hãng mẫu.' : 'Sample carrier added.')
                              })
                              .catch((err: unknown) => showToast(formatApiError(err)))
                              .finally(() => setActionBusy(false))
                          }}
                          className="h-9 rounded-lg border border-slate-300 px-3 font-semibold dark:border-slate-600"
                        >
                          {vi ? 'Thêm hãng mẫu' : 'Add sample carrier'}
                        </button>
                      </div>
                    ) : null}
                    {compareText ? (
                      <pre className="mt-2 whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-300">
                        {compareText}
                      </pre>
                    ) : null}
                </details>

                <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {vi ? 'Hàng đợi' : 'Queue'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {vi ? 'Kiện đang chọn: ' : 'Selected: '}
                    <span className="font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                      {sessionTotalWeight} kg
                    </span>
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200/80 bg-slate-50 text-[11px] font-bold tracking-wider text-slate-500 uppercase dark:border-slate-800 dark:bg-surface-2/50 dark:text-slate-400">
                        <th className="px-3.5 py-3">{vi ? 'MÃ VẬN ĐƠN' : 'WAYBILL'}</th>
                        <th className="px-3.5 py-3">{vi ? 'MÃ NHÓM KIỆN' : 'GROUP ID'}</th>
                        <th className="px-3.5 py-3">{vi ? 'TRỌNG LƯỢNG' : 'WEIGHT'}</th>
                        <th className="px-3.5 py-3">{vi ? 'ĐIỂM ĐẾN' : 'DESTINATION'}</th>
                        <th className="px-3.5 py-3 text-right sm:text-left">
                          {vi ? 'TRẠNG THÁI' : 'STATUS'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
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
                              className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-[color-mix(in_srgb,var(--ls-cta)_7%,transparent)] ${
                                active
                                  ? 'border-l-4 border-emerald-600 bg-emerald-50/60 dark:border-[var(--ls-cta)] dark:bg-[color-mix(in_srgb,var(--ls-cta)_12%,transparent)]'
                                  : 'border-l-4 border-transparent'
                              }`}
                              title={vi ? 'Nhấp để chọn kiện này' : 'Click to select this package'}
                            >
                              <td className="py-3 px-3.5">
                                <div className="flex items-center gap-2">
                                  {row.kind === 'packed' ? (
                                    <input
                                      type="checkbox"
                                      checked={batchIds.includes(row.group.id)}
                                      aria-label={vi ? 'Chọn giao chung chuyến' : 'Select for shared trip'}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={() => {
                                        const id = row.group.id
                                        setBatchIds((current) =>
                                          current.includes(id)
                                            ? current.filter((item) => item !== id)
                                            : [...current, id],
                                        )
                                      }}
                                    />
                                  ) : null}
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
                    className="border-0 px-3.5 pt-3"
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

            <aside className="ship-bench-side select-none lg:col-span-4">
              <div className="ship-summary-card rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-[var(--ls-card-border)] dark:bg-[var(--ls-panel)]">
              <div className="pack-bench-head -mx-5 -mt-5 mb-4 rounded-t-xl border-b border-slate-200/60 bg-slate-50/80 p-3">
                <div className="min-w-0 flex-1">
                  <p className="pack-bench-kicker">
                    {vi ? 'Tổng hợp kiện đang chọn' : 'Selected package'}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-base font-bold tabular-nums tracking-tight text-[var(--ls-ink)] sm:text-lg">
                      {panelCode}
                    </h2>
                    {slaBadge ? (
                      <span
                        className={
                          slaBadge.tone === 'overdue'
                            ? 'inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                            : slaBadge.tone === 'soon'
                              ? 'inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                              : 'inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                        }
                      >
                        {slaBadge.tone === 'overdue' ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <Clock3 className="h-3 w-3" />
                        )}
                        {slaBadge.label}
                      </span>
                    ) : null}
                  </div>
                  {selectedDueAt ? (
                    <p className="mt-1 text-[11px] text-[var(--ls-muted)]">
                      {vi ? 'Hạn giao' : 'Deadline'}:{' '}
                      <span className="font-medium text-[var(--ls-ink)]">
                        {formatDateTime(selectedDueAt)}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3.5">
                <div className="space-y-1.5 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-[var(--ls-card-border)] dark:bg-transparent dark:p-0">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-slate-500 dark:text-[var(--ls-muted)]">
                      {vi ? 'Lượt giao' : 'Delivery attempts'}
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-[var(--ls-ink)]">
                      {attemptText} {vi ? 'lần' : 'tries'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-[color-mix(in_srgb,var(--ls-cta)_14%,transparent)]">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all duration-300 dark:bg-[var(--ls-cta)]"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-[var(--ls-muted)]">
                    {lastReason
                      ? `${vi ? 'Lý do gần nhất: ' : 'Last reason: '}${lastReason}`
                      : vi
                        ? 'Chưa có lần thất bại. Coordinator bấm nút dưới để đổi trạng thái.'
                        : 'No failure yet. Use the footer actions to update status.'}
                  </p>
                  {selectedReturns.length > 0 ? (
                    <div className="space-y-1 pt-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {vi ? 'Phiếu trả hàng' : 'Return slips'}
                      </p>
                      {selectedReturns.map((slip) => {
                        const label = RETURN_STATUS_LABELS[slip.status]
                        return (
                          <p key={`${slip.rmaCode}-${slip.status}`} className="text-[11px] text-slate-700 dark:text-slate-200">
                            <span className="font-mono font-semibold">{slip.rmaCode}</span>
                            {' · '}
                            {label ? (vi ? label.vi : label.en) : slip.status}
                          </p>
                        )
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 sm:p-3.5 dark:border-[var(--ls-card-border)] dark:bg-[var(--ls-panel)]">
                    <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase dark:text-[var(--ls-muted)]">
                      {vi ? 'Tổng trọng lượng' : 'Total weight'}
                    </span>
                    <p className="mt-1.5 font-mono text-3xl font-extrabold leading-none tracking-tight tabular-nums text-slate-900 dark:text-[var(--ls-ink)]">
                      {sessionTotalWeight}
                      <span className="ml-1 text-sm font-bold text-slate-500 dark:text-[var(--ls-muted)]">
                        kg
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 sm:p-3.5 dark:border-[var(--ls-card-border)] dark:bg-[var(--ls-panel)]">
                    <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase dark:text-[var(--ls-muted)]">
                      {vi ? 'Thể tích ước tính' : 'Estimated volume'}
                    </span>
                    <p className="mt-1.5 font-mono text-3xl font-extrabold leading-none tracking-tight tabular-nums text-slate-900 dark:text-[var(--ls-ink)]">
                      {sessionVolume.toFixed(2)}
                      <span className="ml-1 text-sm font-bold text-slate-500 dark:text-[var(--ls-muted)]">
                        CBM
                      </span>
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-[var(--ls-card-border)] dark:bg-transparent dark:p-0">
                  <span className="block text-[10px] font-bold tracking-wider text-[var(--ls-cta)] uppercase sm:text-[11px]">
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

                <div className="space-y-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-[var(--ls-card-border)] dark:bg-transparent dark:p-0">
                  {carrierManaged && selected?.kind === 'shipment' ? (
                    <div className="mb-3 space-y-2">
                      <span className="block text-[10px] font-bold tracking-wider text-[var(--ls-cta)] uppercase">
                        {vi ? 'Hãng vận chuyển' : 'Carrier'}
                      </span>
                      <p className="text-xs text-[var(--ls-ink)]">
                        {selected.shipment.carrierName ?? selected.shipment.carrierCode} ·{' '}
                        {selected.shipment.carrierStatusLabel ?? selected.shipment.carrierStatus ?? '—'}
                        {selected.shipment.estimatedCostVnd != null
                          ? ` · ${formatCurrency(selected.shipment.estimatedCostVnd)}`
                          : ''}
                      </p>
                      {selected.shipment.carrierBookingError ? (
                        <p className="text-xs text-red-600">{selected.shipment.carrierBookingError}</p>
                      ) : null}
                      {(selected.shipment.carrierParcels ?? []).map((parcel) => (
                        <p key={parcel.parcelNo} className="font-mono text-[11px] text-[var(--ls-muted)]">
                          #{parcel.parcelNo} {parcel.carrierOrderCode ?? (vi ? 'chưa có mã' : 'no code')}
                          {parcel.sortCode ? ` · ${parcel.sortCode}` : ''}
                          {parcel.bookingError ? ` · ${parcel.bookingError}` : ''}
                        </p>
                      ))}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <select
                          value={simulateStatus}
                          onChange={(e) => setSimulateStatus(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-transparent"
                        >
                          {ghnStatuses.map((row) => (
                            <option key={row.status} value={row.status}>
                              {vi ? `Mô phỏng GHN: ${row.label}` : row.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={actionBusy || !simulateStatus}
                          onClick={() => void runCarrier('simulate')}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                        >
                          {vi ? 'Mô phỏng' : 'Simulate'}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void runCarrier('sync')}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                        >
                          {vi ? 'Đồng bộ' : 'Sync'}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void runCarrier('label')}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                        >
                          {vi ? 'Nhãn hãng' : 'Carrier label'}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void runCarrier('book')}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                        >
                          {vi ? 'Đặt lại' : 'Rebook'}
                        </button>
                        {selected.shipment.status === 'awaiting_pickup' ? (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void runCarrier('cancel')}
                            className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-600"
                          >
                            {vi ? 'Huỷ ở hãng' : 'Cancel at carrier'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void runCarrier('location')}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                        >
                          {vi ? 'Gửi địa chỉ' : 'Send address'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <span className="block text-[10px] font-bold tracking-wider text-[var(--ls-cta)] uppercase sm:text-[11px]">
                    {vi ? 'Xác nhận trên hệ thống' : 'System confirmation'}
                  </span>
                  <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-center dark:border-[var(--ls-card-border)] dark:bg-[var(--ls-panel)]">
                    <StylusSignatureGraphic />
                    <p className="mt-1 text-[10.5px] text-slate-500 dark:text-[var(--ls-muted)]">
                      {vi
                        ? 'Shop tự giao — không có chữ ký tài xế 3PL'
                        : 'Own fleet — no 3PL driver signature'}
                    </p>
                  </div>
                </div>
              </div>
              </div>
            </aside>
          </div>
        </div>
        </div>
      </div>

      <footer className="ship-foot relative z-30 flex w-full shrink-0 items-center border-t border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportManifest}
              className="ship-foot-btn"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="leading-snug">
                {vi ? 'Xuất biên bản (CSV)' : 'Export queue (CSV)'}
              </span>
              <KbdHint>Ctrl+E</KbdHint>
            </button>

            <button
              type="button"
              onClick={handlePrintHandover}
              className="ship-foot-btn"
            >
              <Printer className="h-3.5 w-3.5 shrink-0" />
              <span className="leading-snug">
                {vi ? 'In phiếu bàn giao' : 'Print handover slip'}
              </span>
              <KbdHint>Ctrl+P</KbdHint>
            </button>

            <button
              type="button"
              disabled={!documentGroupId || actionBusy}
              onClick={() => {
                if (!documentGroupId) return
                void openShippingDocument(
                  `/documents/packing-slip/${encodeURIComponent(documentGroupId)}`,
                ).catch((err: unknown) => showToast(formatApiError(err)))
              }}
              className="ship-foot-btn"
            >
              <Printer className="h-3.5 w-3.5 shrink-0" />
              {vi ? 'Phiếu đóng gói' : 'Packing slip'}
            </button>
            <button
              type="button"
              disabled={!documentGroupId || actionBusy}
              onClick={() => {
                if (!documentGroupId) return
                void openShippingDocument(
                  `/documents/shipping-label/${encodeURIComponent(documentGroupId)}`,
                ).catch((err: unknown) => showToast(formatApiError(err)))
              }}
              className="ship-foot-btn"
            >
              <Printer className="h-3.5 w-3.5 shrink-0" />
              {vi ? 'Nhãn PDF' : 'PDF label'}
            </button>
            {selected?.kind === 'shipment' && selected.shipment.tripCode ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => {
                  const trip = selected.kind === 'shipment' ? selected.shipment.tripCode : null
                  if (!trip) return
                  void openShippingDocument(`/documents/manifest/${encodeURIComponent(trip)}`).catch(
                    (err: unknown) => showToast(formatApiError(err)),
                  )
                }}
                className="ship-foot-btn"
              >
                <Printer className="h-4 w-4 shrink-0" />
                {vi ? 'Bảng kê chuyến' : 'Trip manifest'}
              </button>
            ) : null}
            {tab === 'packed' && batchIds.length > 0 && chosenCarrier && serviceCode ? (
              <button
                type="button"
                disabled={actionBusy || startBlocked}
                onClick={() => void runBatch()}
                className="ship-foot-btn"
              >
                {vi ? `Giao chung chuyến (${batchIds.length})` : `Shared trip (${batchIds.length})`}
              </button>
            ) : null}
            {packedGroupId && chosenCarrier && serviceCode ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void runCompare()}
                className="ship-foot-btn"
              >
                {vi ? 'So chi phí thùng' : 'Compare box cost'}
              </button>
            ) : null}
            {documentGroupId ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void lookupGroup()}
                className="ship-foot-btn"
              >
                <Folder className="h-3.5 w-3.5 shrink-0" />
                {vi ? 'Vận đơn của nhóm' : 'Group shipment'}
              </button>
            ) : null}
            {selected?.kind === 'shipment' ? (
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="datetime-local"
                  value={pickupAt}
                  onChange={(event) => setPickupAt(event.target.value)}
                  className="h-10 rounded-xl border border-slate-300 px-2 dark:border-slate-600 dark:bg-[var(--ls-panel)]"
                />
                <button
                  type="button"
                  disabled={actionBusy || !pickupAt}
                  onClick={() => void savePickup()}
                  className="ship-foot-btn"
                >
                  {vi ? 'Lưu lịch lấy' : 'Save pickup'}
                </button>
              </label>
            ) : null}
            {isAdmin ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => {
                  setActionBusy(true)
                  void scanOverdueShipments()
                    .then(async (flagged) => {
                      await reload()
                      showToast(
                        vi ? `Đã gắn quá hạn: ${flagged}.` : `Flagged overdue: ${flagged}.`,
                      )
                    })
                    .catch((err: unknown) => showToast(formatApiError(err)))
                    .finally(() => setActionBusy(false))
                }}
                className="ship-foot-btn"
              >
                {vi ? 'Quét quá hạn' : 'Scan overdue'}
              </button>
            ) : null}
            {isAdmin &&
            selected?.kind === 'shipment' &&
            selected.shipment.status === 'returning_to_warehouse' ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void receiveAtWarehouse()}
                className="ship-foot-btn"
              >
                {vi ? 'Nhận hàng hoàn' : 'Receive return'}
              </button>
            ) : null}

            {selected?.kind === 'shipment' &&
            !selected.shipment.carrierManaged &&
            selected.shipment.status === 'out_for_delivery' ? (
              <button
                type="button"
                onClick={() => {
                  setFailReason(reasonCodes[0]?.code ?? 'customer_unreachable')
                  setModalMode('fail')
                }}
                className="ship-foot-btn ship-foot-btn--danger"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {vi ? 'Giao thất bại' : 'Mark failed'}
              </button>
            ) : null}
          </div>

          <div className="shrink-0">
            <button
              type="button"
              disabled={
                !primaryAction ||
                actionBusy ||
                (primaryAction === 'start' && (boxWeightKg(packRec) <= 0 || startBlocked)) ||
                (primaryAction !== 'start' && boxWeightKg(packRec) <= 0)
              }
              onClick={() => primaryAction && setModalMode(primaryAction)}
              className={`flex h-auto min-h-11 w-full items-center justify-center gap-2.5 rounded-xl px-5 py-2.5 text-sm font-bold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto ${
                !selected ||
                boxWeightKg(packRec) <= 0 ||
                !primaryAction ||
                (primaryAction === 'start' && startBlocked)
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400 shadow-none dark:bg-slate-800 dark:text-slate-500'
                  : primaryAction === 'deliver'
                    ? 'cursor-pointer bg-emerald-600 text-white shadow-md hover:bg-emerald-700 active:scale-[0.98] focus-visible:ring-emerald-500'
                    : 'owner-btn-primary cursor-pointer shadow-md active:scale-[0.98] focus-visible:ring-primary/40'
              }`}
            >
              {actionBusy ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              )}
              <span className="leading-snug">
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
              {primaryAction ? <KbdHint onPrimary>Ctrl+Enter</KbdHint> : null}
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
                  ? chosenCarrier
                    ? vi
                      ? `Tạo vận đơn qua ${chosenCarrier.name}${chosenQuote ? ` · ${formatCurrency(chosenQuote.totalCostVnd)}` : ''}.`
                      : `Create a shipment with ${chosenCarrier.name}.`
                    : vi
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
                    {chosenCarrier?.name ?? OWN_FLEET_ACCOUNT.name}
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
