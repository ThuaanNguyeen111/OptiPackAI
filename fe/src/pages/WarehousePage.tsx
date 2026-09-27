import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Flag,
  Loader2,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { usePortal } from '../context/use-portal'
import {
  assignOrderGroup,
  completeOrderGroupPick,
  getOrderGroupById,
  getOrderGroupPickingList,
  listWarehouseStaffQueue,
  pickOrderGroupItem,
  reportMissingOrderGroupItem,
  returnOrderGroup,
  searchOrderGroupStaff,
  type StaffSearchItem,
} from '../api/order-groups.api'
import {
  getWarehousePickingList,
  listWarehouses,
  readStoredWarehouseId,
  writeStoredWarehouseId,
} from '../api/warehouse.api'
import { fetchMyProfile } from '../api/users.api'
import { ApiError, formatApiError, getApiErrorCode } from '../lib/api'
import { cn } from '../lib/cn'
import {
  GROUP_FULFILLMENT_STATUS_LABELS,
  isWarehousePickableStatus,
  type OrderGroup,
  type PackableItem,
  type ScanMethod,
} from '../types/order-groups'
import type { WarehousePickingListItem, WarehouseRecord } from '../types/warehouse-admin'
import { formatDateTime } from '../utils/format'

type QueueTab = 'to_pick' | 'review' | 'picked' | 'packed' | 'returns'

type PickLine = {
  sku: string
  quantity: number
  length_cm: number
  width_cm: number
  height_cm: number
  weight_kg: number
  is_fragile: boolean
  zone_code: string
  bin_code: string
  qtyPicked: number
  remainingStock: number | null
}

type PickProgress = Record<
  string,
  { qtyPicked: number; remainingStock: number | null }
>

const PICK_PROGRESS_PREFIX = 'optipack.pickProgress.'
const UNASSIGNED_BIN = 'CHƯA GÁN VỊ TRÍ'

/** True when bin_code is a real shelf location (not empty / unassigned placeholder). */
function isBinAssigned(binCode: string): boolean {
  const code = binCode.trim()
  if (!code) return false
  const normalized = code.toLocaleLowerCase('vi')
  if (normalized.includes('chưa gán') || normalized.includes('chua gan')) return false
  return true
}

function formatLocationLabel(binCode: string, zoneCode: string): string {
  const bin = isBinAssigned(binCode) ? binCode.trim() : UNASSIGNED_BIN
  if (zoneCode.trim()) return `${bin} · ${zoneCode.trim()}`
  return bin
}

function LocationBadge({
  binCode,
  zoneCode,
}: {
  binCode: string
  zoneCode: string
}) {
  const assigned = isBinAssigned(binCode)
  const label = formatLocationLabel(binCode, zoneCode)
  if (assigned) {
  return (
      <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-sm px-3 py-1 rounded-md shadow-sm">
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
        </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 font-medium text-xs px-2.5 py-1 rounded-md">
      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}

const QUEUE_TABS: Array<{ id: QueueTab; labelVi: string; labelEn: string }> = [
  { id: 'to_pick', labelVi: 'Cần lấy', labelEn: 'To pick' },
  { id: 'review', labelVi: 'Thiếu hàng', labelEn: 'Missing' },
  { id: 'picked', labelVi: 'Đã lấy — giao gói', labelEn: 'Picked — to pack' },
  { id: 'packed', labelVi: 'Đã đóng', labelEn: 'Packed' },
  { id: 'returns', labelVi: 'Hoàn hàng', labelEn: 'Returns' },
]

function matchesTab(status: string, tab: QueueTab): boolean {
  if (tab === 'to_pick') {
    return isWarehousePickableStatus(status)
  }
  if (tab === 'review') return status === 'partial_needs_review'
  if (tab === 'picked') return status === 'picked'
  if (tab === 'packed') return status === 'packed'
  return status === 'shipped' || status === 'delivered' || status === 'returned'
}

function statusLabel(status: string, vi: boolean): string {
  const known = GROUP_FULFILLMENT_STATUS_LABELS[status]
  if (!known) return status
  return vi ? known.vi : known.en
}

function shortId(id: string): string {
  return id.length > 10 ? id.slice(-10) : id
}

function platformLabel(platform: string): string {
  const p = platform.toLowerCase()
  if (p === 'lazada') return 'Lazada'
  if (p === 'tiktok') return 'TikTok'
  if (p === 'tiki') return 'Tiki'
  return platform
}

function newClientEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `pick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readProgress(groupId: string): PickProgress {
  try {
    const raw = sessionStorage.getItem(PICK_PROGRESS_PREFIX + groupId)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    const out: PickProgress = {}
    for (const [sku, value] of Object.entries(parsed)) {
      if (typeof value !== 'object' || value === null) continue
      const row = value as { qtyPicked?: unknown; remainingStock?: unknown }
      const qtyPicked =
        typeof row.qtyPicked === 'number' && Number.isFinite(row.qtyPicked)
          ? row.qtyPicked
          : 0
      const remainingStock =
        typeof row.remainingStock === 'number' && Number.isFinite(row.remainingStock)
          ? row.remainingStock
          : null
      out[sku] = { qtyPicked, remainingStock }
    }
    return out
  } catch {
    return {}
  }
}

function writeProgress(groupId: string, progress: PickProgress): void {
  try {
    sessionStorage.setItem(PICK_PROGRESS_PREFIX + groupId, JSON.stringify(progress))
  } catch {
    // ignore
  }
}

function clearProgress(groupId: string): void {
  try {
    sessionStorage.removeItem(PICK_PROGRESS_PREFIX + groupId)
  } catch {
    // ignore
  }
}

function mergeLines(
  items: Array<PackableItem | WarehousePickingListItem>,
  progress: PickProgress,
): PickLine[] {
  return items.map((item) => {
    const enriched = item as WarehousePickingListItem
    const saved = progress[item.sku]
    return {
      sku: item.sku,
      quantity: item.quantity,
      length_cm: item.length_cm,
      width_cm: item.width_cm,
      height_cm: item.height_cm,
      weight_kg: item.weight_kg,
      is_fragile: item.is_fragile,
      zone_code: typeof enriched.zone_code === 'string' ? enriched.zone_code : '',
      bin_code: typeof enriched.bin_code === 'string' ? enriched.bin_code : '',
      qtyPicked: saved?.qtyPicked ?? 0,
      remainingStock: saved?.remainingStock ?? null,
    }
  })
}

function normalizeScan(value: string): string {
  return value.trim().toLowerCase()
}

function lineMatchesScan(line: PickLine, scanned: string): boolean {
  const needle = normalizeScan(scanned)
  if (!needle) return false
  if (normalizeScan(line.sku) === needle) return true
  if (line.bin_code && normalizeScan(line.bin_code) === needle) return true
  const combined = `${normalizeScan(line.bin_code)} ${normalizeScan(line.sku)}`
  return combined === needle
}

function BarcodeGraphic({ code }: { code: string }) {
  const bars = [
    3, 1, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 1, 3, 2, 4, 1, 1, 3, 1, 2, 4, 2, 1, 3,
    1, 4, 2, 1, 2, 3, 1, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 1, 3, 2,
    4, 1,
  ]
  const label = code.length > 0 ? code : '—'
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-[#f8fafc] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
      <svg
        className="h-12 w-full max-w-[280px]"
        viewBox="0 0 280 50"
        fill="currentColor"
        aria-hidden="true"
      >
        {bars.map((bar, i) => {
          const x = i * 5.2 + 8
          if (i % 2 !== 0) return null
          return (
            <rect
              key={i}
              x={x}
              y={2}
              width={bar * 0.95}
              height={46}
              rx={0.5}
              className="fill-slate-900 dark:fill-slate-100"
            />
          )
        })}
      </svg>
      <p className="mt-1 font-mono text-xs font-semibold tracking-[0.18em] text-slate-700 dark:text-slate-300">
        * {label} *
      </p>
        </div>
  )
}

function SkuThumb({ sku }: { sku: string }) {
  const letters = sku.slice(0, 2).toUpperCase() || '?'
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 font-mono text-sm font-bold text-slate-600 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300">
      {letters}
    </div>
  )
}

function canPickItems(status: string): boolean {
  return isWarehousePickableStatus(status)
}

function canCompletePick(status: string): boolean {
  return isWarehousePickableStatus(status)
}

function canReturn(status: string): boolean {
  return status === 'shipped' || status === 'delivered'
}

function bePickGateMessage(vi: boolean, action: 'complete' | 'missing'): string {
  if (action === 'missing') {
    return vi
      ? 'BE chưa cho báo thiếu từ đơn mới. Cần mở transition awaiting_packaging / pending_approval → partial_needs_review (hiện chỉ từ approved_for_packing / picking).'
      : 'BE still blocks report-missing on new groups. Allow awaiting_packaging / pending_approval → partial_needs_review (today only approved_for_packing / picking).'
  }
  return vi
    ? 'BE chưa cho «Hoàn tất lấy hàng» từ đơn mới. pick-item (trừ tồn) đã chạy được. Cần mở awaiting_packaging / pending_approval / picking → picked.'
    : 'BE still blocks Complete pick on new groups. pick-item (stock decrement) already works. Allow awaiting_packaging / pending_approval / picking → picked.'
}

export function WarehousePage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupIdParam = searchParams.get('groupId') ?? ''

  const [meId, setMeId] = useState('')
  const [tab, setTab] = useState<QueueTab>('to_pick')
  const [groups, setGroups] = useState<OrderGroup[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([])
  const [warehouseId, setWarehouseId] = useState(() => readStoredWarehouseId())
  const [warehouseDraft, setWarehouseDraft] = useState(() => readStoredWarehouseId())
  const [warehouseListBlocked, setWarehouseListBlocked] = useState(false)

  const [group, setGroup] = useState<OrderGroup | null>(null)
  const [lines, setLines] = useState<PickLine[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [hasBinRoute, setHasBinRoute] = useState(false)

  const [activeSku, setActiveSku] = useState('')
  const [scanInput, setScanInput] = useState('')
  const [scanMethod, setScanMethod] = useState<ScanMethod>('barcode')
  const [currentQty, setCurrentQty] = useState(1)

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [missingOpen, setMissingOpen] = useState(false)
  const [missingQty, setMissingQty] = useState(1)
  const [missingNote, setMissingNote] = useState('')

  const [completeOpen, setCompleteOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMode, setAssignMode] = useState<'auto' | 'manual'>('auto')
  const [staffQuery, setStaffQuery] = useState('')
  const [staffList, setStaffList] = useState<StaffSearchItem[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [queueFilter, setQueueFilter] = useState<'all' | 'mine' | 'express'>('all')

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 3600)
  }, [])

  const loadGroups = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const rows = await listWarehouseStaffQueue()
      setGroups(rows)
    } catch (err: unknown) {
      setListError(formatApiError(err))
      setGroups([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadGroups()
      void fetchMyProfile()
        .then((profile) => setMeId(profile.id))
        .catch(() => setMeId(''))
          void listWarehouses()
        .then((rows) => {
          setWarehouses(rows)
          setWarehouseListBlocked(false)
          setWarehouseId((current) => {
            if (current && rows.some((row) => row.id === current)) return current
            const next = rows[0]?.id ?? current
            if (next) writeStoredWarehouseId(next)
            return next
          })
        })
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 403) {
            setWarehouseListBlocked(true)
          }
        })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [loadGroups])

  const counts = useMemo(() => {
    const next = { to_pick: 0, review: 0, picked: 0, packed: 0, returns: 0 }
    for (const row of groups) {
      const status = row.fulfillmentStatus
      if (matchesTab(status, 'to_pick')) next.to_pick += 1
      else if (matchesTab(status, 'review')) next.review += 1
      else if (matchesTab(status, 'picked')) next.picked += 1
      else if (matchesTab(status, 'packed')) next.packed += 1
      else if (matchesTab(status, 'returns')) next.returns += 1
    }
    return next
  }, [groups])

  const tabGroups = useMemo(() => {
    return groups
      .filter((row) => matchesTab(row.fulfillmentStatus, tab))
      .filter((row) => {
        if (queueFilter === 'mine') {
          return Boolean(meId && row.assignedStaffId === meId)
        }
        if (queueFilter === 'express') return row.orderPriority === 'express'
        return true
      })
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
        const aExpress = a.orderPriority === 'express' ? 1 : 0
        const bExpress = b.orderPriority === 'express' ? 1 : 0
        if (aExpress !== bExpress) return bExpress - aExpress
        const aMine = meId && a.assignedStaffId === meId ? 1 : 0
        const bMine = meId && b.assignedStaffId === meId ? 1 : 0
        if (aMine !== bMine) return bMine - aMine
        return 0
      })
  }, [groups, tab, meId, queueFilter])

  const selectedId = useMemo(() => {
    if (groupIdParam && tabGroups.some((row) => row.id === groupIdParam)) {
      return groupIdParam
    }
    return tabGroups[0]?.id ?? ''
  }, [groupIdParam, tabGroups])

  useEffect(() => {
    if (listLoading) return
    if (!groupIdParam) return
    const found = groups.find((row) => row.id === groupIdParam)
    if (!found) return
    const nextTab = QUEUE_TABS.find((item) =>
      matchesTab(found.fulfillmentStatus, item.id),
    )
    if (nextTab && nextTab.id !== tab) {
      const id = window.setTimeout(() => setTab(nextTab.id), 0)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [listLoading, groupIdParam, groups, tab])

  const loadDetail = useCallback(
    async (id: string, currentWarehouseId: string) => {
      setDetailLoading(true)
      setDetailError(null)
      setActionError(null)
      try {
        const latest = await getOrderGroupById(id)
        setGroup(latest)
        setGroups((prev) =>
          prev.map((row) => (row.id === latest.id ? latest : row)),
        )
        const progress = readProgress(id)
        if (currentWarehouseId) {
          try {
            const enriched = await getWarehousePickingList(currentWarehouseId, id)
            setLines(mergeLines(enriched, progress))
            setHasBinRoute(true)
            return
          } catch (err: unknown) {
            const code = getApiErrorCode(err)
            if (code === 'ORD_GROUP_ALL_ORDERS_CANCELED') {
              setLines([])
              setHasBinRoute(false)
              setDetailError(formatApiError(err))
              return
            }
          }
        }
        const packable = await getOrderGroupPickingList(id)
        setLines(mergeLines(packable, progress))
        setHasBinRoute(false)
      } catch (err: unknown) {
        setGroup(null)
        setLines([])
        setHasBinRoute(false)
        setDetailError(formatApiError(err))
      } finally {
        setDetailLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!selectedId) {
      const clearId = window.setTimeout(() => {
        setGroup(null)
        setLines([])
        setActiveSku('')
      }, 0)
      return () => window.clearTimeout(clearId)
    }
    const timer = window.setTimeout(() => {
      void loadDetail(selectedId, warehouseId)
    }, 80)
    return () => window.clearTimeout(timer)
  }, [selectedId, warehouseId, loadDetail])

  const activeLine = useMemo(() => {
    return lines.find((line) => line.sku === activeSku) ?? lines[0] ?? null
  }, [lines, activeSku])

  const skuKey = useMemo(() => lines.map((line) => line.sku).join('|'), [lines])

  useEffect(() => {
    if (!skuKey) {
      const clearId = window.setTimeout(() => {
        setActiveSku('')
        setScanInput('')
        setCurrentQty(1)
      }, 0)
      return () => window.clearTimeout(clearId)
    }
    const preferred =
      lines.find((line) => line.qtyPicked < line.quantity) ?? lines[0]
    const nextSku = preferred?.sku ?? ''
    const remaining = preferred
      ? Math.max(1, preferred.quantity - preferred.qtyPicked)
      : 1
    const syncId = window.setTimeout(() => {
      setActiveSku(nextSku)
      setScanInput('')
      setScanMethod('barcode')
      setCurrentQty(remaining)
    }, 0)
    return () => window.clearTimeout(syncId)
    // skuKey đổi = nhóm/SKU mới. Không phụ thuộc `lines` để tránh reset sau mỗi lần pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, skuKey])

  const isVerified = Boolean(activeLine && lineMatchesScan(activeLine, scanInput))
  const remainingForActive = activeLine
    ? Math.max(0, activeLine.quantity - activeLine.qtyPicked)
    : 0
  const canConfirmItem = Boolean(
    group &&
      canPickItems(group.fulfillmentStatus) &&
      warehouseId &&
      activeLine &&
      isVerified &&
      currentQty > 0 &&
      currentQty <= remainingForActive &&
      remainingForActive > 0 &&
      !busy,
  )

  const pickedCount = lines.filter((line) => line.qtyPicked >= line.quantity).length
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0)
  const pickedUnits = lines.reduce((sum, line) => sum + line.qtyPicked, 0)
  const allScanned = lines.length > 0 && pickedCount === lines.length
  const assignedName = useMemo(() => {
    if (!group?.assignedStaffId) return vi ? 'Chưa phân công' : 'Unassigned'
    if (meId && group.assignedStaffId === meId) return vi ? 'Bạn' : 'You'
    const hit = staffList.find((row) => row.staffId === group.assignedStaffId)
    return hit?.fullName ?? shortId(group.assignedStaffId)
  }, [group, meId, staffList, vi])

  function selectLine(line: PickLine) {
    setActiveSku(line.sku)
    setScanInput('')
    setScanMethod('barcode')
    setCurrentQty(Math.max(1, line.quantity - line.qtyPicked))
    setActionError(null)
  }

  function applyWarehouseId() {
    const next = warehouseDraft.trim()
    setWarehouseId(next)
    writeStoredWarehouseId(next)
    showToast(vi ? 'Đã gắn mã kho cho phiên lấy hàng.' : 'Warehouse id saved for picking.')
  }

  async function handlePickItem() {
    if (!group || !activeLine || !warehouseId) return
    if (!lineMatchesScan(activeLine, scanInput)) {
      setActionError(
        vi
          ? 'Mã quét phải khớp SKU hoặc mã kệ của dòng đang chọn.'
          : 'Scan must match the selected SKU or bin code.',
      )
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const result = await pickOrderGroupItem(group.id, {
        sku: activeLine.sku,
        scanned_quantity: currentQty,
        scan_method: scanMethod,
        warehouse_id: warehouseId,
        client_event_id: newClientEventId(),
      })
      const nextLines = lines.map((line) =>
        line.sku === result.sku
          ? {
              ...line,
              qtyPicked: line.qtyPicked + result.decrementedBy,
              remainingStock: result.remainingStock,
            }
          : line,
      )
      setLines(nextLines)
      const progress: PickProgress = {}
      for (const line of nextLines) {
        if (line.qtyPicked > 0 || line.remainingStock != null) {
          progress[line.sku] = {
            qtyPicked: line.qtyPicked,
            remainingStock: line.remainingStock,
          }
        }
      }
      writeProgress(group.id, progress)
      const updated = nextLines.find((line) => line.sku === result.sku)
      const nextPending = nextLines.find(
        (line) => line.sku !== result.sku && line.qtyPicked < line.quantity,
      )
      if (updated && updated.qtyPicked >= updated.quantity && nextPending) {
        selectLine(nextPending)
      } else if (updated) {
        setCurrentQty(Math.max(1, updated.quantity - updated.qtyPicked))
        setScanInput('')
      }
      showToast(
        vi
          ? `Đã trừ ${result.decrementedBy} × ${result.sku}. Tồn kệ còn ${result.remainingStock}.`
          : `Picked ${result.decrementedBy} × ${result.sku}. Bin stock now ${result.remainingStock}.`,
      )
    } catch (err: unknown) {
      const code = getApiErrorCode(err)
      if (code === 'ORD_GROUP_INSUFFICIENT_STOCK') {
        setActionError(
          vi
            ? 'Không đủ tồn kho. Dùng «Báo thiếu hàng» để dừng đơn và báo chủ shop.'
            : 'Insufficient stock. Use Report missing to stop this group.',
        )
        setMissingQty(Math.max(1, remainingForActive))
        setMissingOpen(true)
      } else if (code === 'ORD_GROUP_ITEM_NOT_IN_GROUP') {
        setActionError(
          vi
            ? 'Mã này không thuộc nhóm đơn đang lấy. Kiểm tra lại kệ/SKU.'
            : 'This code is not in the current order group. Check the bin or SKU.',
        )
      } else {
        setActionError(formatApiError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  async function refreshGroupAfterWrite(id: string): Promise<OrderGroup | null> {
    try {
      const latest = await getOrderGroupById(id)
      setGroup(latest)
      setGroups((prev) => prev.map((row) => (row.id === latest.id ? latest : row)))
      return latest
    } catch {
      return null
    }
  }

  async function handleReportMissing() {
    if (!group || !activeLine || !warehouseId) return
    setBusy(true)
    setActionError(null)
    try {
      const latest = await reportMissingOrderGroupItem(group.id, {
        sku: activeLine.sku,
        missing_quantity: missingQty,
        warehouse_id: warehouseId,
        note: missingNote.trim() || undefined,
        expected_version: group.version,
      })
      setGroup(latest)
      setGroups((prev) => prev.map((row) => (row.id === latest.id ? latest : row)))
      setMissingOpen(false)
      setMissingNote('')
      showToast(
        vi
          ? 'Đã báo thiếu hàng. Đơn dừng lại, chờ Packaging Staff duyệt.'
          : 'Missing item reported. Group paused for packaging review.',
      )
      navigate(`/app/warehouse?groupId=${latest.id}`)
      await loadGroups()
    } catch (err: unknown) {
      if (getApiErrorCode(err) === 'ORD_GROUP_STATE_CONFLICT') {
        await refreshGroupAfterWrite(group.id)
      }
      if (getApiErrorCode(err) === 'ORD_GROUP_INVALID_TRANSITION') {
        setMissingOpen(false)
        setActionError(bePickGateMessage(vi, 'missing'))
      } else {
        setActionError(formatApiError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleCompletePick() {
    if (!group) return
    setBusy(true)
    setActionError(null)
    try {
      const latest = await completeOrderGroupPick(group.id, {
        expected_version: group.version,
      })
      clearProgress(group.id)
      setGroup(latest)
      setGroups((prev) => prev.map((row) => (row.id === latest.id ? latest : row)))
      setCompleteOpen(false)
      showToast(vi ? 'Đã xác nhận lấy xong cả nhóm. Đưa khay sang bàn đóng gói.' : 'Group marked as picked. Hand off to packing.')
      navigate(`/app/warehouse?groupId=${latest.id}`)
      await loadGroups()
    } catch (err: unknown) {
      if (getApiErrorCode(err) === 'ORD_GROUP_STATE_CONFLICT') {
        await refreshGroupAfterWrite(group.id)
      }
      if (getApiErrorCode(err) === 'ORD_GROUP_INVALID_TRANSITION') {
        setCompleteOpen(false)
        setActionError(bePickGateMessage(vi, 'complete'))
      } else {
        setActionError(formatApiError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleReturn() {
    if (!group) return
    setBusy(true)
    setActionError(null)
    try {
      const latest = await returnOrderGroup(group.id, {
        expected_version: group.version,
      })
      setGroup(latest)
      setGroups((prev) => prev.map((row) => (row.id === latest.id ? latest : row)))
      setReturnOpen(false)
      showToast(vi ? 'Đã ghi nhận hoàn hàng.' : 'Return recorded.')
      navigate(`/app/warehouse?groupId=${latest.id}`)
      await loadGroups()
    } catch (err: unknown) {
      if (getApiErrorCode(err) === 'ORD_GROUP_STATE_CONFLICT') {
        await refreshGroupAfterWrite(group.id)
      }
      setActionError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!assignOpen) return
    const timer = window.setTimeout(() => {
      setStaffLoading(true)
      void searchOrderGroupStaff(staffQuery)
        .then((rows) => {
          setStaffList(rows)
          setSelectedStaffId((current) => {
            if (current && rows.some((row) => row.staffId === current)) return current
            return rows[0]?.staffId ?? ''
          })
        })
        .catch((err: unknown) => setActionError(formatApiError(err)))
        .finally(() => setStaffLoading(false))
    }, 220)
    return () => window.clearTimeout(timer)
  }, [assignOpen, staffQuery])

  async function handleAssign() {
    if (!group) return
    setBusy(true)
    setActionError(null)
    try {
      const assigned = await assignOrderGroup(
        group.id,
        assignMode === 'manual' ? selectedStaffId : undefined,
      )
      const latest = (await refreshGroupAfterWrite(assigned.id)) ?? assigned
      setGroup(latest)
      setGroups((prev) => prev.map((row) => (row.id === latest.id ? latest : row)))
      setAssignOpen(false)
      setStaffQuery('')
      showToast(
        assignMode === 'auto'
          ? vi
            ? 'Đã gán tự động người đang ít việc nhất.'
            : 'Auto-assigned the least-busy staff.'
          : vi
            ? 'Đã đổi người phụ trách.'
            : 'Assignee updated.',
      )
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const status = group?.fulfillmentStatus ?? ''

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Lấy hàng trong kho' : 'Warehouse picking' },
        ]}
      />

      <div className="flex-1 overflow-auto bg-[#F9FAFB] p-4 sm:p-6 dark:bg-[#0B0E14]">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs sm:px-4 sm:py-3 dark:border-slate-800 dark:bg-surface-1 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-50 p-1 dark:bg-surface-2">
                {QUEUE_TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
              onClick={() => {
                      setTab(item.id)
                      const first = groups.find((row) => {
                        if (!matchesTab(row.fulfillmentStatus, item.id)) return false
                        if (queueFilter === 'mine') {
                          return Boolean(meId && row.assignedStaffId === meId)
                        }
                        if (queueFilter === 'express') {
                          return row.orderPriority === 'express'
                        }
                        return true
                      })
                      if (first) {
                        navigate(`/app/warehouse?groupId=${first.id}`)
                      } else {
                        navigate('/app/warehouse')
                      }
                    }}
                    className={cn(
                      'inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-semibold cursor-pointer',
                      tab === item.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    {vi ? item.labelVi : item.labelEn}
                    <span className="ml-1 opacity-70">{counts[item.id]}</span>
                  </button>
                ))}
          </div>

              <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-50 p-1 dark:bg-surface-2">
                {(
                  [
                    { id: 'all', vi: 'Tất cả', en: 'All' },
                    { id: 'mine', vi: 'Của tôi', en: 'Mine' },
                    { id: 'express', vi: 'Hỏa tốc', en: 'Express' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setQueueFilter(item.id)}
                    className={cn(
                      'inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-semibold cursor-pointer',
                      queueFilter === item.id
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    {vi ? item.vi : item.en}
                  </button>
                ))}
            </div>

              <div className="relative">
                <select
                  value={selectedId}
                  onChange={(e) => {
                    if (e.target.value) {
                      navigate(`/app/warehouse?groupId=${e.target.value}`)
                    }
                  }}
                  disabled={tabGroups.length === 0}
                  className="h-9 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-2.5 pr-7 font-mono text-xs font-bold text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200"
                >
                  {tabGroups.length === 0 ? (
                    <option value="">
                      {vi ? 'Không có nhóm trong tab này' : 'No groups in this tab'}
                    </option>
                  ) : (
                    tabGroups.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.orderPriority === 'express' ? '⚡ ' : ''}
                        {meId && row.assignedStaffId === meId ? '● ' : ''}
                        {shortId(row.id)} · {platformLabel(row.platform)} · {row.orderCount}{' '}
                        {vi ? 'đơn' : 'orders'}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-end text-xs lg:self-auto">
              <button
                type="button"
                onClick={() => void loadGroups()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 font-semibold text-slate-600 cursor-pointer hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {vi ? 'Tải lại' : 'Reload'}
              </button>
              {group && canCompletePick(status) ? (
                <button
                  type="button"
                  onClick={() => setCompleteOpen(true)}
                  disabled={busy || lines.length === 0 || !group.assignedStaffId}
                  title={
                    !group.assignedStaffId
                      ? vi
                        ? 'Nhận việc trước khi hoàn tất lấy hàng'
                        : 'Claim the batch before completing pick'
                      : undefined
                  }
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 font-bold shadow-xs',
                    group.assignedStaffId
                      ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
                      : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500',
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {vi ? 'Hoàn tất lấy hàng' : 'Complete picking'}
                </button>
          ) : null}
              {group && canReturn(status) ? (
                <button
                  type="button"
                  onClick={() => setReturnOpen(true)}
                  disabled={busy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 font-bold text-amber-900 cursor-pointer hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  {vi ? 'Ghi nhận hoàn hàng' : 'Record return'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-surface-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                {vi ? 'Kho đang lấy hàng' : 'Active warehouse'}
                {warehouses.length > 0 ? (
                  <select
                    value={warehouseId}
                    onChange={(e) => {
                      setWarehouseId(e.target.value)
                      setWarehouseDraft(e.target.value)
                      writeStoredWarehouseId(e.target.value)
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold dark:border-slate-700 dark:bg-surface-2"
                  >
                    {warehouses.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.warehouseName} ({row.warehouseCode})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={warehouseDraft}
                    onChange={(e) => setWarehouseDraft(e.target.value)}
                    placeholder={vi ? 'Dán ObjectId kho từ trang Admin' : 'Paste warehouse ObjectId from Admin'}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs dark:border-slate-700 dark:bg-surface-2"
                  />
                )}
              </label>
              {warehouses.length === 0 ? (
                <button
                  type="button"
                  onClick={applyWarehouseId}
                  className="h-9 shrink-0 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white cursor-pointer dark:bg-white dark:text-slate-900"
                >
                  {vi ? 'Dùng mã này' : 'Use this id'}
                </button>
              ) : null}
            </div>
            {warehouseListBlocked ? (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                {vi
                  ? 'Không lấy được danh sách kho (403). Dán ObjectId kho, hoặc kiểm tra BE đã mở GET /warehouse/warehouses cho Warehouse Staff.'
                  : 'Could not list warehouses (403). Paste a warehouse ObjectId, or confirm BE allows GET /warehouse/warehouses for warehouse staff.'}
              </p>
            ) : null}
            {!warehouseId ? (
              <p className="mt-2 text-[11px] text-slate-500">
                {vi
                  ? 'Chưa có mã kho: vẫn xem được danh sách SKU, nhưng quét trừ tồn / báo thiếu hàng cần warehouse_id.'
                  : 'Without a warehouse id you can view SKUs, but pick-item and report-missing require warehouse_id.'}
              </p>
            ) : null}
              </div>

          {listError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {listError}
          </div>
          ) : null}

          {listLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-surface-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              {vi ? 'Đang tải hàng đợi lấy hàng…' : 'Loading pick queue…'}
            </div>
          ) : !selectedId ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-surface-1">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                {vi ? 'Chưa có nhóm đơn' : 'No groups in this step'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {vi
                  ? 'Đơn mới hiện ngay khi có nhóm (không đợi duyệt thùng). Nếu trống: Admin sync Lazada và chờ cron backfill order_groups.'
                  : 'New groups show as soon as they exist (no packing-plan gate). Empty? Admin syncs Lazada and wait for order-group backfill.'}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600">
                        {shortId(group?.id ?? selectedId)}
                      </span>
                      <span className="rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {platformLabel(group?.platform ?? '')}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {statusLabel(status, vi)}
                      </span>
                      {group?.orderPriority === 'express' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          <Zap className="h-3 w-3" />
                          {vi ? 'Hỏa tốc' : 'Express'}
                        </span>
                      ) : null}
                      {group?.isOverdue ? (
                        <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          {vi ? 'Quá hạn' : 'Overdue'}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">
                      {group?.orderCount ?? 0} {vi ? 'đơn trong nhóm' : 'orders in group'}
                      {group?.packagingDeadline
                        ? ` · ${vi ? 'Hạn đóng' : 'Deadline'} ${formatDateTime(group.packagingDeadline)}`
                        : ''}
                      {hasBinRoute
                        ? vi
                          ? ' · Đã sắp theo lộ trình kệ'
                          : ' · Sorted by bin route'
                        : vi
                          ? ' · Chưa có vị trí kệ'
                          : ' · No bin route yet'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-surface-2/40">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {assignedName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {vi ? 'Nhân viên lấy hàng' : 'Assigned picker'}
                      </p>
                    </div>
              <button
                type="button"
                      onClick={() => {
                        setAssignMode(group?.assignedStaffId ? 'manual' : 'auto')
                        setAssignOpen(true)
                      }}
                      className={cn(
                        'ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs cursor-pointer',
                        group?.assignedStaffId
                          ? 'border border-slate-200 bg-white font-semibold hover:bg-slate-50 dark:border-slate-600 dark:bg-surface-1'
                          : 'bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700',
                      )}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      {group?.assignedStaffId
                        ? vi
                          ? 'Đổi người'
                          : 'Reassign'
                        : vi
                          ? 'Nhận việc'
                          : 'Claim'}
              </button>
                  </div>
                </div>
          </div>

              {status === 'picked' ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {vi
                      ? 'Đã lấy xong. Đưa khay sang bàn đóng gói — Packaging Staff xác nhận gói trên /app/packing. Kho không bấm đóng gói.'
                      : 'Picking finished. Hand the tote to packing — Packaging Staff confirms pack on /app/packing. Warehouse does not pack.'}
                  </p>
                </div>
              ) : null}

              {canPickItems(status) &&
              (status === 'awaiting_packaging' || status === 'pending_approval') ? (
                <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {vi
                      ? 'Đơn mới: quét SKU/mã kệ để trừ tồn ngay.'
                      : 'New group: scan SKU/bin to decrement stock now. Complete pick and Report missing may still be blocked by the old BE packing-plan gate — that is a backend change, not this screen.'}
                  </p>
                </div>
              ) : null}

              {status === 'partial_needs_review' ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {vi
                      ? 'Đơn đang chờ được duyệt phần thiếu...'
                      : 'This group is waiting for packaging staff to decide the shortage. Warehouse staff cannot continue it.'}
                  </p>
                </div>
              ) : null}

              {actionError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  {actionError}
                </div>
              ) : null}

              {detailError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  {detailError}
                </div>
              ) : null}

              {detailLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-surface-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {vi ? 'Đang tải danh sách lấy hàng…' : 'Loading picking list…'}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className="space-y-3 lg:col-span-7">
                    {activeLine ? (
                      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-surface-1 sm:p-6">
                        <div className="flex items-start gap-3">
                          <SkuThumb sku={activeLine.sku} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                                {activeLine.sku}
                              </h2>
                              {activeLine.is_fragile ? (
                                <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                  Fragile
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2">
                              <LocationBadge
                                binCode={activeLine.bin_code}
                                zoneCode={activeLine.zone_code}
                              />
                            </div>
                            <p className="mt-1.5 text-[11px] text-slate-500">
                              {activeLine.length_cm}×{activeLine.width_cm}×{activeLine.height_cm} cm
                              {' · '}
                              {activeLine.weight_kg} kg
                              {activeLine.remainingStock != null
                                ? ` · ${vi ? 'Tồn kệ còn' : 'Bin left'} ${activeLine.remainingStock}`
                                : ''}
                            </p>
                          </div>
                        </div>

                        {isBinAssigned(activeLine.bin_code) ? (
                          <div className="mt-5">
                            <BarcodeGraphic code={activeLine.bin_code} />
                          </div>
                        ) : (
                          <div className="mt-5 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2.5 text-center text-[11px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                            {vi
                              ? 'Chưa có mã kệ — quét hoặc nhập tay Seller SKU bên dưới.'
                              : 'No bin barcode — scan or type the seller SKU below.'}
                          </div>
                        )}

                        <div className="mt-5 space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-surface-2/20 sm:p-4">
                          <div>
                            <label
                              htmlFor="barcode-input"
                              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                            >
                              {vi
                                ? 'Quét mã kệ/SKU'
                                : 'Scan bin code or SKU (type if the label is unreadable)'}
                            </label>
                            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-2.5 py-2 shadow-2xs dark:border-blue-800 dark:bg-surface-2">
                              <input
                                id="barcode-input"
                                type="text"
                                value={scanInput}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setScanInput(value)
                                  const match = lines.find((line) => lineMatchesScan(line, value))
                                  if (match && match.sku !== activeSku) {
                                    selectLine(match)
                                    setScanInput(value)
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (canConfirmItem) void handlePickItem()
                                  }
                                }}
                                placeholder={activeLine.bin_code || activeLine.sku}
                                disabled={!canPickItems(status)}
                                className="min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold text-slate-800 focus:outline-none dark:text-slate-100"
                              />
                              {isVerified ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                  <Check className="h-3 w-3 stroke-[3]" />
                                  {vi ? 'Đã khớp' : 'Matched'}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setScanInput(activeLine.sku)
                                    setScanMethod('manual')
                                  }}
                                  disabled={!canPickItems(status)}
                                  className="inline-flex shrink-0 items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 cursor-pointer hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                >
                                  {vi ? 'Nhập SKU' : 'Type SKU'}
                                </button>
                              )}
          </div>
        </div>

                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                            <div className="flex items-center justify-center gap-1 sm:justify-start">
                              <button
                                type="button"
                                onClick={() => setCurrentQty((prev) => Math.max(1, prev - 1))}
                                disabled={currentQty <= 1 || !canPickItems(status)}
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white cursor-pointer disabled:opacity-40 dark:border-slate-700 dark:bg-surface-1"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <div className="flex h-10 min-w-[84px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm font-bold dark:border-slate-700 dark:bg-surface-1">
                                {currentQty}/{remainingForActive}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setCurrentQty((prev) => Math.min(remainingForActive, prev + 1))
                                }
                                disabled={
                                  currentQty >= remainingForActive || !canPickItems(status)
                                }
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white cursor-pointer disabled:opacity-40 dark:border-slate-700 dark:bg-surface-1"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={!canConfirmItem}
                              onClick={() => void handlePickItem()}
                              className={cn(
                                'flex h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold',
                                canConfirmItem
                                  ? 'bg-[#2563eb] text-white cursor-pointer hover:bg-[#1d4ed8]'
                                  : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800',
                              )}
                            >
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              {vi ? 'Xác nhận lấy' : 'Confirm SKU pick'}
                            </button>
                          </div>
                        </div>

                        {!canConfirmItem && canPickItems(status) ? (
                          <p className="mt-2 text-[11px] text-slate-400">
                            {!warehouseId
                              ? vi
                                ? 'Cần mã kho trước khi trừ tồn.'
                                : 'A warehouse id is required before decrementing stock.'
                              : !isVerified
                                ? vi
                                  ? 'Quét đúng mã kệ hoặc SKU.'
                                  : 'Scan the bin code or seller SKU — Lazada does not provide product barcodes.'
                                : remainingForActive <= 0
                                  ? vi
                                    ? 'SKU này đã lấy đủ số lượng trên phiên hiện tại.'
                                    : 'This SKU is already fully picked in this session.'
                                  : null}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-surface-1">
                        {vi ? 'Nhóm đơn này không còn SKU cần lấy.' : 'No SKUs left to pick in this group.'}
                      </div>
                    )}

                    {canPickItems(status) ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3.5 text-xs dark:border-amber-900/40 dark:bg-amber-950/20">
                        <span className="font-medium text-amber-900 dark:text-amber-300">
                          {vi
                            ? 'Không đủ hàng/Hàng lỗi?'
                            : 'Bin empty or item damaged?'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMissingQty(Math.max(1, remainingForActive))
                            setMissingOpen(true)
                          }}
                          disabled={!activeLine || !warehouseId || busy}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 font-semibold text-amber-900 cursor-pointer hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:bg-surface-1 dark:text-amber-300"
                        >
                          <Flag className="h-3.5 w-3.5" />
                          {vi ? 'Báo thiếu hàng' : 'Report missing'}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="lg:col-span-5">
                    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-surface-1 sm:p-6">
                      <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                        <h3 className="font-bold text-slate-900 dark:text-slate-100">
                          {vi ? 'Danh sách lấy hàng' : 'Picking list'}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {pickedCount}/{lines.length} SKU · {pickedUnits}/{totalUnits}{' '}
                          {vi ? 'sản phẩm' : 'units'}
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {lines.map((line) => {
                          const done = line.qtyPicked >= line.quantity
                          const selected = line.sku === activeLine?.sku
                          return (
                            <button
                              key={line.sku}
                              type="button"
                              onClick={() => selectLine(line)}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left cursor-pointer',
                                selected
                                  ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30'
                                  : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2',
                              )}
                            >
                              {done ? (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16a34a] text-white">
                                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                                </div>
                              ) : (
                                <div className="h-6 w-6 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                  {line.sku}
                                </p>
                                <div className="mt-1 truncate">
                                  <LocationBadge
                                    binCode={line.bin_code}
                                    zoneCode={line.zone_code}
                                  />
                                </div>
                              </div>
                              <span className="shrink-0 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                                {line.qtyPicked}/{line.quantity}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
          {toast}
        </div>
      ) : null}

      <Dialog open={missingOpen} onOpenChange={setMissingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{vi ? 'Báo thiếu hàng' : 'Report missing item'}</DialogTitle>
            <DialogDescription>
              {vi
                ? 'Đơn sẽ chuyển sang «Thiếu hàng — cần duyệt». Chủ shop nhận thông báo ngay. Bạn không tự quyết định giao thiếu.'
                : 'The group moves to partial review. Store Owner is notified. You cannot ship short on your own.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-mono font-semibold">{activeLine?.sku}</p>
            <label className="block text-xs font-medium">
              {vi ? 'Số lượng còn thiếu' : 'Missing quantity'}
              <input
                type="number"
                min={1}
                value={missingQty}
                onChange={(e) => setMissingQty(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 dark:border-slate-700 dark:bg-surface-2"
              />
            </label>
            <label className="block text-xs font-medium">
              {vi ? 'Ghi chú (không bắt buộc)' : 'Note (optional)'}
              <textarea
                value={missingNote}
                onChange={(e) => setMissingNote(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700 dark:bg-surface-2"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setMissingOpen(false)}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold cursor-pointer dark:border-slate-700"
            >
              {vi ? 'Hủy' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => void handleReportMissing()}
              disabled={busy || !warehouseId}
              className="h-9 rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white cursor-pointer hover:bg-amber-700 disabled:opacity-50"
            >
              {vi ? 'Gửi báo cáo' : 'Submit'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{vi ? 'Hoàn tất lấy hàng' : 'Complete picking'}</DialogTitle>
            <DialogDescription>
              {allScanned
                ? vi
                  ? 'Đã quét đủ mọi SKU trên phiên này. Xác nhận chuyển nhóm sang «Đã lấy xong».'
                  : 'Every SKU is scanned in this session. Confirm moving the group to picked.'
                : vi
                  ? `Mới quét ${pickedCount}/${lines.length} SKU. Vẫn có thể xác nhận cả nhóm (Cách B — không theo dõi từng món).`
                  : `${pickedCount}/${lines.length} SKUs scanned. You can still complete the whole group (simple path).`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCompleteOpen(false)}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold cursor-pointer dark:border-slate-700"
            >
              {vi ? 'Hủy' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => void handleCompletePick()}
              disabled={busy}
              className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white cursor-pointer hover:bg-blue-700 disabled:opacity-50"
            >
              {vi ? 'Xác nhận đã lấy xong' : 'Mark picked'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{vi ? 'Ghi nhận hoàn hàng' : 'Record return'}</DialogTitle>
            <DialogDescription>
              {vi
                ? 'Dùng khi hàng hoàn về kho (sau shipped/delivered). Không dùng lúc đang lấy hàng — lúc đó hãy báo thiếu hàng.'
                : 'For goods returning after ship/deliver. During picking, report missing instead.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setReturnOpen(false)}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold cursor-pointer dark:border-slate-700"
            >
              {vi ? 'Hủy' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => void handleReturn()}
              disabled={busy}
              className="h-9 rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white cursor-pointer hover:bg-amber-700 disabled:opacity-50"
            >
              {vi ? 'Xác nhận hoàn' : 'Confirm return'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assignOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-surface-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {vi ? 'Phân công nhân viên kho' : 'Assign warehouse staff'}
              </h3>
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="rounded-md p-1 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setAssignMode('auto')}
                className={cn(
                  'h-8 rounded-lg px-3 text-xs font-semibold cursor-pointer',
                  assignMode === 'auto'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800',
                )}
              >
                {vi ? 'Tự động (ít việc nhất)' : 'Auto (least busy)'}
              </button>
              <button
                type="button"
                onClick={() => setAssignMode('manual')}
                className={cn(
                  'h-8 rounded-lg px-3 text-xs font-semibold cursor-pointer',
                  assignMode === 'manual'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800',
                )}
              >
                {vi ? 'Chọn tay' : 'Manual'}
              </button>
            </div>
            {assignMode === 'manual' ? (
              <div className="mt-3 space-y-2">
                <input
                  value={staffQuery}
                  onChange={(e) => setStaffQuery(e.target.value)}
                  placeholder={vi ? 'Tìm tên hoặc email' : 'Search name or email'}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm dark:border-slate-700 dark:bg-surface-2"
                />
                <div className="max-h-56 space-y-1 overflow-auto">
                  {staffLoading ? (
                    <p className="p-3 text-xs text-slate-500">{vi ? 'Đang tìm…' : 'Searching…'}</p>
                  ) : staffList.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400">
                      {vi ? 'Không tìm thấy nhân viên kho.' : 'No warehouse staff found.'}
                    </p>
                  ) : (
                    staffList.map((staff) => (
                      <label
                        key={staff.staffId}
                        className={cn(
                          'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs',
                          selectedStaffId === staff.staffId
                            ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-700',
                        )}
                      >
                        <span>
                          <span className="font-semibold">{staff.fullName}</span>
                          <span className="ml-2 text-slate-500">{staff.email}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-500">
                            {staff.activeWorkload} {vi ? 'việc' : 'jobs'}
                          </span>
                          <input
                            type="radio"
                            name="staff"
                            checked={selectedStaffId === staff.staffId}
                            onChange={() => setSelectedStaffId(staff.staffId)}
                          />
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                {vi
                  ? 'Hệ thống chọn Warehouse Staff đang ít việc nhất (hòa điểm thì ưu tiên người được gán lâu nhất).'
                  : 'The backend picks the least-busy warehouse staff (oldest assignment as tie-break).'}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="h-9 rounded-lg px-3 text-xs font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {vi ? 'Hủy' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void handleAssign()}
                disabled={busy || (assignMode === 'manual' && !selectedStaffId)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 text-xs font-semibold text-white cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-50"
              >
                <UserCheck className="h-3.5 w-3.5" />
                {vi ? 'Xác nhận phân công' : 'Confirm assignment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
