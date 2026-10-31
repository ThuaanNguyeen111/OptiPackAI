import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  PackageOpen,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Layers,
  UserCheck,
  Users,
  Warehouse,
  X,
  Zap,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { WarehouseReturnsPanel } from '../components/warehouse/WarehouseReturnsPanel'
import { listQuarantine, listReturns } from '../api/returns.api'
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
  listLinkedOrderGroups,
  listWarehouseStaffQueue,
  pickOrderGroupItem,
  reportMissingOrderGroupItem,
  returnOrderGroup,
  searchOrderGroupStaff,
  type StaffSearchItem,
} from '../api/order-groups.api'
import {
  getWarehousePickingList,
  getWarehousePickingListForGroups,
  listWarehouses,
  openWarehouseDocument,
  pickingListDocumentPath,
  readStoredWarehouseId,
  writeStoredWarehouseId,
} from '../api/warehouse.api'
import { fetchMyProfile } from '../api/users.api'
import { ApiError, formatApiError, getApiErrorCode } from '../lib/api'
import { cn } from '../lib/cn'
import { recipientBorderClass, recipientChipClass } from '../lib/recipient-color'
import {
  GROUP_FULFILLMENT_STATUS_LABELS,
  hasPackableOrders,
  isFullyInactiveGroup,
  isPartiallyCanceledGroup,
  isWarehousePickableStatus,
  type OrderGroup,
  type PackableItem,
  type ScanMethod,
} from '../types/order-groups'
import type { WarehousePickingListItem, WarehouseRecord } from '../types/warehouse-admin'
import { formatDateTime, formatLotReceived } from '../utils/format'

type QueueTab =
  | 'to_pick'
  | 'review'
  | 'picked'
  | 'packed'
  | 'returns'
  | 'canceled'

type PickLine = {
  /** `${group_id}|${sku}` — duy nhất cả khi lấy chung nhiều nhóm. */
  key: string
  group_id: string
  sku: string
  quantity: number
  length_cm: number
  width_cm: number
  height_cm: number
  weight_kg: number
  is_fragile: boolean
  zone_code: string
  bin_code: string
  bin_location_id: string | null
  master_sku: string | null
  other_bins: WarehousePickingListItem['other_bins']
  oldest_lot: WarehousePickingListItem['oldest_lot']
  order_allocations: WarehousePickingListItem['order_allocations']
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
  { id: 'canceled', labelVi: 'Đã hủy', labelEn: 'Canceled' },
]

function matchesTab(row: OrderGroup, tab: QueueTab): boolean {
  const status = row.fulfillmentStatus
  if (tab === 'canceled') {
    return isWarehousePickableStatus(status) && isFullyInactiveGroup(row)
  }
  if (tab === 'to_pick') {
    return isWarehousePickableStatus(status) && hasPackableOrders(row)
  }
  if (tab === 'review') return status === 'partial_needs_review'
  if (tab === 'picked') return status === 'picked'
  if (tab === 'packed') return status === 'packed'
  return false
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

function persistLinesProgress(nextLines: PickLine[]): void {
  const byGroup = new Map<string, PickProgress>()
  for (const line of nextLines) {
    let progress = byGroup.get(line.group_id)
    if (!progress) {
      progress = {}
      byGroup.set(line.group_id, progress)
    }
    if (line.qtyPicked > 0 || line.remainingStock != null) {
      progress[line.sku] = {
        qtyPicked: line.qtyPicked,
        remainingStock: line.remainingStock,
      }
    }
  }
  for (const [groupId, progress] of byGroup) {
    writeProgress(groupId, progress)
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
  progressFor: (groupId: string) => PickProgress,
  fallbackGroupId: string,
): PickLine[] {
  const cache = new Map<string, PickProgress>()
  return items.map((item) => {
    const enriched = item as WarehousePickingListItem
    const groupId =
      typeof enriched.order_group_id === 'string' && enriched.order_group_id
        ? enriched.order_group_id
        : fallbackGroupId
    let progress = cache.get(groupId)
    if (!progress) {
      progress = progressFor(groupId)
      cache.set(groupId, progress)
    }
    const saved = progress[item.sku]
    return {
      key: `${groupId}|${item.sku}`,
      group_id: groupId,
      sku: item.sku,
      quantity: item.quantity,
      length_cm: item.length_cm,
      width_cm: item.width_cm,
      height_cm: item.height_cm,
      weight_kg: item.weight_kg,
      is_fragile: item.is_fragile,
      zone_code: typeof enriched.zone_code === 'string' ? enriched.zone_code : '',
      bin_code: typeof enriched.bin_code === 'string' ? enriched.bin_code : '',
      bin_location_id:
        typeof enriched.bin_location_id === 'string' ? enriched.bin_location_id : null,
      master_sku: typeof enriched.master_sku === 'string' ? enriched.master_sku : null,
      other_bins: Array.isArray(enriched.other_bins) ? enriched.other_bins : [],
      oldest_lot: enriched.oldest_lot ?? null,
      order_allocations: Array.isArray(enriched.order_allocations)
        ? enriched.order_allocations
        : [],
      qtyPicked: saved?.qtyPicked ?? 0,
      remainingStock: saved?.remainingStock ?? null,
    }
  })
}

/** Trạng thái đơn không còn phải lấy hàng (khớp NOT_PACKABLE mặc định của BE). */
const COMBINED_PICKABLE = new Set(['awaiting_packaging', 'picking'])

const INACTIVE_ORDER_STATUSES = new Set([
  'canceled',
  'failed',
  'lost',
  'lost_by_3pl',
  'damaged_by_3pl',
  'failed_delivery',
  'shipped_back_failed',
  'package_scrapped',
])

type PickTray = {
  /** `${groupId}|${orderId}` */
  key: string
  groupId: string
  orderId: string
  label: string
  recipientName: string
  orderCode: string
}

/** Khay theo đơn: A, B, C… — mỗi đơn còn hiệu lực một khay. */
function buildTrays(groups: OrderGroup[], lines: PickLine[]): PickTray[] {
  const trays: PickTray[] = []
  const seen = new Set<string>()
  const push = (groupId: string, orderId: string, name: string, code: string) => {
    const key = `${groupId}|${orderId}`
    if (seen.has(key)) return
    seen.add(key)
    trays.push({ key, groupId, orderId, label: '', recipientName: name, orderCode: code })
  }
  for (const group of groups) {
    for (const order of group.orders ?? []) {
      if (INACTIVE_ORDER_STATUSES.has(order.status)) continue
      push(group.id, order.id, order.recipientName ?? '', order.platformOrderId ?? '')
    }
  }
  for (const line of lines) {
    for (const row of line.order_allocations ?? []) {
      push(line.group_id, row.order_id, row.recipient_name, row.platform_order_id)
    }
  }
  return trays.map((tray, index) => ({
    ...tray,
    label: index < 26 ? String.fromCharCode(65 + index) : `K${index + 1}`,
  }))
}

function trayCountKey(line: PickLine, orderId: string): string {
  return `${line.group_id}|${line.sku}|${orderId}`
}

/** Khay thiếu nhiều nhất (tham lam) để điền sẵn khi một SKU chia nhiều đơn. */
function suggestTray(
  line: PickLine,
  counts: Record<string, number>,
): string | null {
  let best: string | null = null
  let bestMissing = 0
  for (const row of line.order_allocations ?? []) {
    const missing = row.quantity - (counts[trayCountKey(line, row.order_id)] ?? 0)
    if (missing > bestMissing) {
      bestMissing = missing
      best = row.order_id
    }
  }
  return best
}

function trayNeeded(tray: PickTray, nextLines: PickLine[]): number {
  let total = 0
  for (const line of nextLines) {
    if (line.group_id !== tray.groupId) continue
    for (const row of line.order_allocations ?? []) {
      if (row.order_id === tray.orderId) total += row.quantity
    }
  }
  return total
}

function trayPlaced(
  tray: PickTray,
  counts: Record<string, number>,
  nextLines: PickLine[],
): number {
  let total = 0
  for (const line of nextLines) {
    if (line.group_id !== tray.groupId) continue
    total += counts[trayCountKey(line, tray.orderId)] ?? 0
  }
  return total
}

function AllocationChips({
  line,
  trays,
  counts,
  combined,
}: {
  line: PickLine
  trays: PickTray[]
  counts: Record<string, number>
  combined: boolean
}) {
  const rows = line.order_allocations ?? []
  if (rows.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {rows.map((row) => {
        const tray = trays.find(
          (item) => item.groupId === line.group_id && item.orderId === row.order_id,
        )
        const placed = counts[trayCountKey(line, row.order_id)] ?? 0
        const done = placed >= row.quantity
        const prefix = combined ? `${shortId(line.group_id)}·` : ''
        return (
          <span
            key={row.order_id}
            title={`${row.recipient_name || '—'} · ${row.platform_order_id}`}
            className={cn(
              'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold',
              recipientChipClass(row.recipient_name),
            )}
          >
            {done ? '✓ ' : ''}
            {prefix}
            {tray?.label ?? '?'} ×{row.quantity}
          </span>
        )
      })}
    </div>
  )
}

function normalizeScan(value: string): string {
  return value.trim().toLowerCase()
}

function lineMatchesScan(line: PickLine, scanned: string): boolean {
  const needle = normalizeScan(scanned)
  if (!needle) return false
  if (normalizeScan(line.sku) === needle) return true
  if (line.master_sku && normalizeScan(line.master_sku) === needle) return true
  if (line.bin_code && normalizeScan(line.bin_code) === needle) return true
  if (line.other_bins.some((bin) => normalizeScan(bin.bin_code) === needle)) return true
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
      ? 'Nhóm này chưa ở bước lấy hàng nên chưa báo thiếu được. Tải lại rồi thử lại.'
      : 'This group is not in picking yet, so missing items cannot be reported. Refresh and try again.'
  }
  return vi
    ? 'Nhóm này chưa ở bước lấy hàng nên chưa hoàn tất được. Tải lại rồi thử lại.'
    : 'This group is not in picking yet, so it cannot be completed. Refresh and try again.'
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
  const [returnQueueCount, setReturnQueueCount] = useState(0)
  const [returnsRefresh, setReturnsRefresh] = useState(0)
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
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const groupPickerRef = useRef<HTMLDivElement>(null)

  const [activeKey, setActiveKey] = useState('')
  const [combinedIds, setCombinedIds] = useState<string[] | null>(null)
  const combinedIdsRef = useRef<string[] | null>(null)
  const [combinedGroups, setCombinedGroups] = useState<OrderGroup[]>([])
  const [trayCounts, setTrayCounts] = useState<Record<string, number>>({})
  const [trayPickOpen, setTrayPickOpen] = useState(false)
  const [pendingTray, setPendingTray] = useState<{
    lineKey: string
    qty: number
    suggestedOrderId: string | null
  } | null>(null)
  const [selectedTrayOrderId, setSelectedTrayOrderId] = useState('')

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
      void Promise.all([
        listReturns({ status: 'awaiting_receipt', limit: 100 }),
        listReturns({ status: 'received', limit: 100 }),
        listQuarantine(),
      ])
        .then(([receipt, received, held]) => {
          setReturnQueueCount(receipt.total + received.total + held.length)
        })
        .catch(() => setReturnQueueCount(0))
      void fetchMyProfile()
        .then((profile) => setMeId(profile.id))
        .catch(() => setMeId(''))
          void listWarehouses()
        .then((allRows) => {
          const rows = allRows.filter((row) => row.isActive)
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
    const next = {
      to_pick: 0,
      review: 0,
      picked: 0,
      packed: 0,
      returns: 0,
      canceled: 0,
    }
    for (const row of groups) {
      if (matchesTab(row, 'to_pick')) next.to_pick += 1
      else if (matchesTab(row, 'canceled')) next.canceled += 1
      else if (matchesTab(row, 'review')) next.review += 1
      else if (matchesTab(row, 'picked')) next.picked += 1
      else if (matchesTab(row, 'packed')) next.packed += 1
    }
    next.returns = returnQueueCount
    return next
  }, [groups, returnQueueCount])

  const tabGroups = useMemo(() => {
    return groups
      .filter((row) => matchesTab(row, tab))
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

  const filteredTabGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase()
    if (!q) return tabGroups
    return tabGroups.filter((row) => {
      const hay = [
        row.id,
        shortId(row.id),
        platformLabel(row.platform),
        row.platform,
        String(row.orderCount),
        String(row.activeOrderCount),
        String(row.canceledOrderCount),
        row.orderPriority,
        row.fulfillmentStatus,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [tabGroups, groupSearch])

  const selectedGroupLabel = useMemo(() => {
    const row = tabGroups.find((g) => g.id === selectedId)
    if (!row) {
      return vi ? 'Chọn nhóm đơn…' : 'Select order group…'
    }
    const cancelHint = isPartiallyCanceledGroup(row)
      ? vi
        ? ' · một phần hủy'
        : ' · partial cancel'
      : isFullyInactiveGroup(row)
        ? vi
          ? ' · đã hủy'
          : ' · canceled'
        : ''
    return `${row.stockShortage ? '⚠ ' : ''}${row.orderPriority === 'express' ? '⚡ ' : ''}${
      meId && row.assignedStaffId === meId ? '● ' : ''
    }${shortId(row.id)} · ${platformLabel(row.platform)} · ${row.activeOrderCount}/${row.orderCount} ${
      vi ? 'còn/tổng' : 'active/total'
    }${cancelHint}`
  }, [tabGroups, selectedId, meId, vi])

  useEffect(() => {
    if (!groupPickerOpen) return
    function onPointerDown(event: MouseEvent): void {
      if (!groupPickerRef.current?.contains(event.target as Node)) {
        setGroupPickerOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setGroupPickerOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [groupPickerOpen])

  useEffect(() => {
    setGroupSearch('')
    setGroupPickerOpen(false)
  }, [tab, queueFilter])

  useEffect(() => {
    if (listLoading) return
    if (!groupIdParam) return
    const found = groups.find((row) => row.id === groupIdParam)
    if (!found) return
    const nextTab = QUEUE_TABS.find((item) => matchesTab(found, item.id))
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
        const together =
          combinedIdsRef.current?.includes(id) && (combinedIdsRef.current?.length ?? 0) >= 2
            ? combinedIdsRef.current
            : null
        if (!together) {
          combinedIdsRef.current = null
          setCombinedIds(null)
          setCombinedGroups([latest])
          setTrayCounts({})
        }
        const progressFor = (groupId: string): PickProgress => readProgress(groupId)
        const pickWarehouseId = latest.warehouseId || currentWarehouseId
        if (latest.warehouseId && latest.warehouseId !== currentWarehouseId) {
          setWarehouseId(latest.warehouseId)
          setWarehouseDraft(latest.warehouseId)
          writeStoredWarehouseId(latest.warehouseId)
        }
        if (together && together.length >= 2) {
          if (!pickWarehouseId) {
            setLines([])
            setHasBinRoute(false)
            setDetailError(
              vi
                ? 'Chọn kho trước khi lấy chung nhiều nhóm.'
                : 'Choose a warehouse before combined picking.',
            )
            return
          }
          try {
            const enriched = await getWarehousePickingListForGroups(pickWarehouseId, together)
            setLines(mergeLines(enriched, progressFor, latest.id))
            setHasBinRoute(true)
            const extras = await Promise.all(
              together
                .filter((gid) => gid !== latest.id)
                .map((gid) => getOrderGroupById(gid).catch(() => null)),
            )
            setCombinedGroups([
              latest,
              ...extras.filter((row): row is OrderGroup => row != null),
            ])
            return
          } catch (err: unknown) {
            setLines([])
            setHasBinRoute(false)
            setDetailError(formatApiError(err))
            return
          }
        }
        if (pickWarehouseId) {
          try {
            const enriched = await getWarehousePickingList(pickWarehouseId, id)
            setLines(mergeLines(enriched, progressFor, latest.id))
            setHasBinRoute(true)
            return
          } catch (err: unknown) {
            // Không lùi về danh sách không có vị trí: mọi dòng sẽ hiện
            // "CHƯA GÁN VỊ TRÍ" và che mất lỗi thật (kho đã tắt, không có quyền...).
            setLines([])
            setHasBinRoute(false)
            setDetailError(formatApiError(err))
            return
          }
        }
        const packable = await getOrderGroupPickingList(id)
        setLines(mergeLines(packable, progressFor, id))
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
    [vi],
  )

  useEffect(() => {
    if (!selectedId) {
      const clearId = window.setTimeout(() => {
        setGroup(null)
        setLines([])
        setActiveSku('')
        setActiveKey('')
        combinedIdsRef.current = null
        setCombinedIds(null)
        setCombinedGroups([])
        setTrayCounts({})
      }, 0)
      return () => window.clearTimeout(clearId)
    }
    const timer = window.setTimeout(() => {
      void loadDetail(selectedId, warehouseId)
    }, 80)
    return () => window.clearTimeout(timer)
  }, [selectedId, warehouseId, loadDetail])

  const activeLine = useMemo(() => {
    return (
      lines.find((line) => line.key === activeKey) ??
      lines.find((line) => line.sku === activeSku) ??
      lines[0] ??
      null
    )
  }, [lines, activeKey, activeSku])

  const skuKey = useMemo(() => lines.map((line) => line.key).join('|'), [lines])

  const pickGroups = useMemo(() => {
    if (combinedIds && combinedIds.length >= 2 && combinedGroups.length > 0) {
      return combinedGroups
    }
    return group ? [group] : []
  }, [combinedIds, combinedGroups, group])

  const trays = useMemo(() => buildTrays(pickGroups, lines), [pickGroups, lines])
  const trayShortfalls = useMemo(
    () =>
      trays.filter((tray) => trayPlaced(tray, trayCounts, lines) < trayNeeded(tray, lines)),
    [trays, trayCounts, lines],
  )
  const namesDiffer = pickGroups.some((row) => row.recipientNamesDiffer)
  const linkedHint =
    (group?.linkedGroupCount ?? 0) > 0 || Boolean(group?.manualLink)
  const combinedMode = Boolean(combinedIds && combinedIds.length >= 2)
  const activeGroup =
    pickGroups.find((row) => row.id === activeLine?.group_id) ?? group
  const completeTargets = pickGroups.filter((row) =>
    canCompletePick(row.fulfillmentStatus),
  )

  useEffect(() => {
    if (!skuKey) {
      const clearId = window.setTimeout(() => {
        setActiveSku('')
        setActiveKey('')
        setScanInput('')
        setCurrentQty(1)
      }, 0)
      return () => window.clearTimeout(clearId)
    }
    const preferred =
      lines.find((line) => line.qtyPicked < line.quantity) ?? lines[0]
    const remaining = preferred
      ? Math.max(1, preferred.quantity - preferred.qtyPicked)
      : 1
    const syncId = window.setTimeout(() => {
      setActiveSku(preferred?.sku ?? '')
      setActiveKey(preferred?.key ?? '')
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
    activeGroup &&
      canPickItems(activeGroup.fulfillmentStatus) &&
      warehouseId &&
      activeLine &&
      isVerified &&
      currentQty > 0 &&
      currentQty <= remainingForActive &&
      remainingForActive > 0 &&
      Boolean(activeLine.bin_location_id) &&
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
    setActiveKey(line.key)
    setScanInput('')
    setScanMethod('barcode')
    setCurrentQty(Math.max(1, line.quantity - line.qtyPicked))
    setActionError(null)
  }

  const goToNextGroup = useCallback(() => {
    if (tabGroups.length === 0) return
    const idx = tabGroups.findIndex((row) => row.id === selectedId)
    const next =
      idx >= 0
        ? tabGroups[(idx + 1) % tabGroups.length]
        : tabGroups[0]
    if (!next) return
    if (next.id === selectedId && tabGroups.length === 1) {
      showToast(
        vi
          ? 'Đây là nhóm duy nhất trong tab hiện tại.'
          : 'This is the only group in the current tab.',
      )
      return
    }
    navigate(`/app/warehouse?groupId=${next.id}`)
  }, [tabGroups, selectedId, navigate, showToast, vi])

  function applyWarehouseId() {
    const next = warehouseDraft.trim()
    setWarehouseId(next)
    writeStoredWarehouseId(next)
    showToast(vi ? 'Đã gắn mã kho cho phiên lấy hàng.' : 'Warehouse id saved for picking.')
  }

  function applyPickedQtyToTrays(line: PickLine, qty: number) {
    const allocations = line.order_allocations ?? []
    if (allocations.length >= 2) {
      const suggested = suggestTray(line, trayCounts)
      setPendingTray({
        lineKey: line.key,
        qty,
        suggestedOrderId: suggested ?? allocations[0]?.order_id ?? '',
      })
      setSelectedTrayOrderId(suggested ?? allocations[0]?.order_id ?? '')
      setTrayPickOpen(true)
      return
    }
    const only = allocations[0]
    if (!only) return
    const key = trayCountKey(line, only.order_id)
    setTrayCounts((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + qty }))
  }

  function confirmTrayPick() {
    if (!pendingTray || !selectedTrayOrderId) {
      setTrayPickOpen(false)
      setPendingTray(null)
      return
    }
    const line = lines.find((row) => row.key === pendingTray.lineKey)
    if (line) {
      const key = trayCountKey(line, selectedTrayOrderId)
      setTrayCounts((prev) => ({
        ...prev,
        [key]: (prev[key] ?? 0) + pendingTray.qty,
      }))
    }
    setTrayPickOpen(false)
    setPendingTray(null)
  }

  async function startCombinedPick() {
    if (!group) return
    setBusy(true)
    setActionError(null)
    try {
      const linked = await listLinkedOrderGroups(group.id)
      const homeWarehouse = group.warehouseId ?? warehouseId
      const eligible = [group, ...linked].filter((row) => {
        if (!COMBINED_PICKABLE.has(row.fulfillmentStatus)) return false
        if (!row.warehouseId || !homeWarehouse) return true
        return row.warehouseId === homeWarehouse
      })
      const unique = [...new Map(eligible.map((row) => [row.id, row])).values()]
      if (unique.length < 2) {
        setActionError(
          vi
            ? 'Chưa có nhóm liên kết nào cùng đang lấy hàng (và cùng kho).'
            : 'No other linked group is still picking in this warehouse.',
        )
        return
      }
      const ids = unique.map((row) => row.id)
      combinedIdsRef.current = ids
      setCombinedIds(ids)
      setCombinedGroups(unique)
      setTrayCounts({})
      await loadDetail(group.id, warehouseId)
      showToast(
        vi
          ? `Đã mở lấy chung ${unique.length} nhóm.`
          : `Combined picking for ${unique.length} groups.`,
      )
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  async function stopCombinedPick() {
    combinedIdsRef.current = null
    setCombinedIds(null)
    setCombinedGroups(group ? [group] : [])
    setTrayCounts({})
    if (group) await loadDetail(group.id, warehouseId)
  }

  async function handlePickItem() {
    if (!activeLine || !warehouseId) return
    if (!activeLine.bin_location_id) {
      setActionError(
        vi
          ? 'SKU chưa được gán ô — liên hệ Admin.'
          : 'This SKU has no bin. Ask an admin to assign it.',
      )
      return
    }
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
      const result = await pickOrderGroupItem(activeLine.group_id, {
        sku: activeLine.sku,
        scanned_quantity: currentQty,
        scan_method: scanMethod,
        warehouse_id: warehouseId,
        ...(activeLine.bin_location_id
          ? { bin_location_id: activeLine.bin_location_id }
          : {}),
        client_event_id: newClientEventId(),
      })
      const nextLines = lines.map((line) =>
        line.key === activeLine.key
          ? {
              ...line,
              qtyPicked: line.qtyPicked + result.decrementedBy,
              remainingStock: result.remainingStock,
            }
          : line,
      )
      setLines(nextLines)
      persistLinesProgress(nextLines)
      applyPickedQtyToTrays(activeLine, result.decrementedBy)
      const updated = nextLines.find((line) => line.key === activeLine.key)
      const nextPending = nextLines.find(
        (line) => line.key !== activeLine.key && line.qtyPicked < line.quantity,
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
      } else if (code === 'ORD_GROUP_WRONG_WAREHOUSE') {
        setActionError(
          vi ? 'Nhóm đang lấy ở kho khác.' : 'This group is being picked in another warehouse.',
        )
        if (combinedIds?.includes(activeLine.group_id)) {
          const nextIds = combinedIds.filter((id) => id !== activeLine.group_id)
          combinedIdsRef.current = nextIds.length >= 2 ? nextIds : null
          setCombinedIds(combinedIdsRef.current)
          setCombinedGroups((prev) =>
            prev.filter((row) => row.id !== activeLine.group_id),
          )
          if (group) await loadDetail(group.id, warehouseId)
        } else if (group?.warehouseId) {
          setWarehouseId(group.warehouseId)
          setWarehouseDraft(group.warehouseId)
          writeStoredWarehouseId(group.warehouseId)
        }
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
    if (!activeLine || !warehouseId) return
    const target = pickGroups.find((row) => row.id === activeLine.group_id) ?? group
    if (!target) return
    setBusy(true)
    setActionError(null)
    try {
      const latest = await reportMissingOrderGroupItem(target.id, {
        sku: activeLine.sku,
        missing_quantity: missingQty,
        warehouse_id: warehouseId,
        note: missingNote.trim() || undefined,
        expected_version: target.version,
      })
      setGroup((current) => (current?.id === latest.id ? latest : current))
      setGroups((prev) => prev.map((row) => (row.id === latest.id ? latest : row)))
      setCombinedGroups((prev) =>
        prev.map((row) => (row.id === latest.id ? latest : row)),
      )
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
        await refreshGroupAfterWrite(target.id)
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
    if (completeTargets.length === 0) return
    setBusy(true)
    setActionError(null)
    try {
      let last: OrderGroup | null = null
      for (const target of completeTargets) {
        last = await completeOrderGroupPick(target.id, {
          expected_version: target.version,
        })
        clearProgress(target.id)
        setGroups((prev) => prev.map((row) => (row.id === last!.id ? last! : row)))
        setCombinedGroups((prev) =>
          prev.map((row) => (row.id === last!.id ? last! : row)),
        )
        if (group?.id === last.id) setGroup(last)
      }
      setCompleteOpen(false)
      showToast(
        vi
          ? completeTargets.length > 1
            ? `Đã xác nhận lấy xong ${completeTargets.length} nhóm. Đưa khay sang bàn đóng gói.`
            : 'Đã xác nhận lấy xong cả nhóm. Đưa khay sang bàn đóng gói.'
          : completeTargets.length > 1
            ? `Marked ${completeTargets.length} groups as picked. Hand off to packing.`
            : 'Group marked as picked. Hand off to packing.',
      )
      if (last) navigate(`/app/warehouse?groupId=${last.id}`)
      await loadGroups()
    } catch (err: unknown) {
      const first = completeTargets[0]
      if (first && getApiErrorCode(err) === 'ORD_GROUP_STATE_CONFLICT') {
        await refreshGroupAfterWrite(first.id)
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
                        if (!matchesTab(row, item.id)) return false
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

              {tab === 'returns' ? null : (
              <>
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

              <div className="relative min-w-[14rem] max-w-[22rem] flex-1 sm:flex-none" ref={groupPickerRef}>
                <button
                  type="button"
                  disabled={tabGroups.length === 0}
                  onClick={() => setGroupPickerOpen((open) => !open)}
                  className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-left shadow-2xs disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-surface-2"
                >
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                    {tabGroups.length === 0
                      ? vi
                        ? 'Không có nhóm trong tab này'
                        : 'No groups in this tab'
                      : selectedGroupLabel}
        </span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {tabGroups.length}
        </span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                      groupPickerOpen && 'rotate-180',
                    )}
                  />
                </button>

                {groupPickerOpen && tabGroups.length > 0 ? (
                  <div className="absolute top-[calc(100%+6px)] left-0 z-40 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-surface-1">
                    <div className="border-b border-slate-100 p-2 dark:border-slate-800">
                      <label className="relative block">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          autoFocus
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                          placeholder={
                            vi
                              ? 'Tìm mã nhóm, sàn, số đơn…'
                              : 'Search group id, platform…'
                          }
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-8 font-mono text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                        />
                      </label>
                      <p className="mt-1.5 px-0.5 text-[10px] text-slate-500">
                        {vi
                          ? `${filteredTabGroups.length}/${tabGroups.length} nhóm`
                          : `${filteredTabGroups.length}/${tabGroups.length} groups`}
          </p>
        </div>
                    <ul className="max-h-64 overflow-y-auto p-1">
                      {filteredTabGroups.length === 0 ? (
                        <li className="px-3 py-4 text-center text-xs text-slate-500">
                          {vi ? 'Không khớp từ khóa' : 'No matches'}
                        </li>
                      ) : (
                        filteredTabGroups.map((row) => {
                          const active = row.id === selectedId
                          return (
                            <li key={row.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  navigate(`/app/warehouse?groupId=${row.id}`)
                                  setGroupPickerOpen(false)
                                  setGroupSearch('')
                                }}
                                className={cn(
                                  'flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                                  active
                                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                                )}
                              >
                                <span className="min-w-0 flex-1">
        <span
                                    className={cn(
                                      'block truncate font-mono text-xs font-bold',
                                      !active && 'text-slate-800 dark:text-slate-100',
                                    )}
        >
                                    {row.stockShortage ? '⚠ ' : ''}
                                    {row.orderPriority === 'express' ? '⚡ ' : ''}
                                    {meId && row.assignedStaffId === meId ? '● ' : ''}
                                    {shortId(row.id)}
        </span>
                                  <span
                                    className={cn(
                                      'mt-0.5 block text-[10px]',
                                      active
                                        ? 'opacity-80'
                                        : 'text-slate-500 dark:text-slate-400',
                                    )}
                                  >
                                    {platformLabel(row.platform)} ·{' '}
                                    {row.activeOrderCount}/{row.orderCount}{' '}
                                    {vi ? 'còn/tổng' : 'active/total'}
                                    {isPartiallyCanceledGroup(row) ? (
                                      <span
                                        className={cn(
                                          'ml-1 font-semibold',
                                          active
                                            ? 'text-amber-100'
                                            : 'text-amber-700 dark:text-amber-300',
                                        )}
                                      >
                                        {vi ? '· một phần hủy' : '· partial cancel'}
          </span>
        ) : null}
                                    {isFullyInactiveGroup(row) ? (
                                      <span
                                        className={cn(
                                          'ml-1 font-semibold',
                                          active
                                            ? 'text-rose-100'
                                            : 'text-rose-600 dark:text-rose-300',
                                        )}
                                      >
                                        {vi ? '· đã hủy' : '· canceled'}
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                                {active ? (
                                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                ) : null}
                              </button>
                            </li>
                          )
                        })
                      )}
                    </ul>
      </div>
        ) : null}
      </div>
              </>
              )}

              <div className="relative flex min-w-[10.5rem] max-w-[16rem] items-center gap-1.5">
                <Warehouse className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                {warehouses.length > 0 ? (
                  <select
                    value={warehouseId}
                    onChange={(e) => {
                      setWarehouseId(e.target.value)
                      setWarehouseDraft(e.target.value)
                      writeStoredWarehouseId(e.target.value)
                    }}
                    title={vi ? 'Kho đang lấy hàng' : 'Active warehouse'}
                    className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-1 pr-7 pl-8 text-xs font-semibold text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200"
                  >
                    {warehouses.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.warehouseCode} · {row.warehouseName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={warehouseDraft}
                    onChange={(e) => setWarehouseDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyWarehouseId()
                    }}
                    placeholder={vi ? 'ObjectId kho…' : 'Warehouse id…'}
                    title={vi ? 'Kho đang lấy hàng' : 'Active warehouse'}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white py-1 pr-2 pl-8 font-mono text-xs text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200"
                  />
                )}
                {warehouses.length === 0 ? (
                  <button
                    type="button"
                    onClick={applyWarehouseId}
                    className="h-9 shrink-0 rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white cursor-pointer dark:bg-white dark:text-slate-900"
                  >
                    {vi ? 'Dùng' : 'Use'}
                  </button>
                ) : (
                  <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-400" />
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (tab === 'returns') setReturnsRefresh((n) => n + 1)
                  else void loadGroups()
                }}
                title={vi ? 'Tải lại hàng đợi' : 'Reload queue'}
                aria-label={vi ? 'Tải lại' : 'Reload'}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 cursor-pointer hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 dark:hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
        </div>
          </div>

          {warehouseListBlocked || !warehouseId ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {warehouseListBlocked
                ? vi
                  ? 'Không tải được danh sách kho. Nhờ Admin kiểm tra quyền của tài khoản này.'
                  : 'Could not load warehouses. Ask an Admin to check this account’s access.'
                : vi
                  ? 'Chưa chọn kho: vẫn xem SKU, nhưng quét trừ tồn / báo thiếu cần warehouse_id.'
                  : 'No warehouse selected: you can view SKUs, but pick/report-missing need warehouse_id.'}
            </p>
          ) : null}

          {tab === 'returns' ? (
            <WarehouseReturnsPanel
              vi={vi}
              warehouses={warehouses}
              warehouseId={warehouseId}
              refreshToken={returnsRefresh}
              onCounts={setReturnQueueCount}
            />
          ) : null}

          {tab !== 'returns' && listError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {listError}
          </div>
          ) : null}

          {tab === 'returns' ? null : listLoading ? (
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
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                        {shortId(group?.id ?? selectedId)}
        </span>
                      <span className="rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {platformLabel(group?.platform ?? '')}
        </span>
                      <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {statusLabel(status, vi)}
                      </span>
                      {group && isPartiallyCanceledGroup(group) ? (
                        <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          {vi
                            ? `Một phần đã hủy (${group.canceledOrderCount}/${group.orderCount})`
                            : `Partially canceled (${group.canceledOrderCount}/${group.orderCount})`}
                        </span>
                      ) : null}
                      {group && isFullyInactiveGroup(group) ? (
                        <span className="rounded-md bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          {vi
                            ? 'Không còn đơn để lấy'
                            : 'No packable orders left'}
                        </span>
                      ) : null}
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
                      {group?.stockShortage ? (
                        <span
                          className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300"
                          title={group.stockShortageItems
                            .map(
                              (item) =>
                                `${item.sku}: thiếu ${item.shortage} (cần ${item.needed}, giữ ${item.reserved})`,
                            )
                            .join('\n')}
                        >
                          {vi ? 'Thiếu hàng' : 'Short stock'}
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
                    {status === 'picked' ? (
                      <p className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {vi
                          ? 'Đã lấy xong — đưa khay sang bàn đóng gói (/app/packing).'
                          : 'Picking done — hand tote to packing (/app/packing).'}
                      </p>
                    ) : null}
                    {namesDiffer ? (
                      <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {vi
                          ? 'Nhóm có nhiều người nhận khác tên — chia hàng vào đúng khay A/B/C, không trộn khay.'
                          : 'This group has different recipient names — put items in the matching A/B/C tray.'}
                      </p>
                    ) : null}
                    {linkedHint && !combinedMode ? (
                      <p className="text-[11px] text-slate-500">
                        {vi
                          ? `Có ${group?.linkedGroupCount ?? 0} nhóm liên kết — có thể lấy chung một vòng kho.`
                          : `${group?.linkedGroupCount ?? 0} linked groups — you can pick them in one warehouse walk.`}
                      </p>
                    ) : null}
                    {canPickItems(status) &&
                    (status === 'awaiting_packaging' || status === 'pending_approval') ? (
                      <p className="flex items-start gap-1.5 text-xs text-sky-800 dark:text-sky-200">
                        <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {vi
                          ? 'Đơn mới: quét SKU/mã kệ để trừ tồn ngay.'
                          : 'New group: scan SKU/bin to decrement stock now.'}
                      </p>
                    ) : null}
                    {status === 'partial_needs_review' ? (
                      <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {vi
                          ? 'Đang chờ duyệt phần thiếu — kho không tiếp tục được.'
                          : 'Waiting on shortage review — warehouse cannot continue.'}
                      </p>
        ) : null}
      </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <div className="flex min-w-[12rem] flex-1 items-center gap-2.5 rounded-xl bg-slate-50/80 px-3 py-2 dark:bg-surface-2/50 sm:flex-none">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                          {assignedName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {vi ? 'Nhân viên lấy hàng' : 'Assigned picker'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
              onClick={() => {
                        setAssignMode(group?.assignedStaffId ? 'manual' : 'auto')
                        setAssignOpen(true)
                      }}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs cursor-pointer',
                        group?.assignedStaffId
                          ? 'border border-slate-200 bg-white font-semibold hover:bg-slate-50 dark:border-slate-600 dark:bg-surface-1'
                          : 'bg-indigo-600 font-semibold text-white shadow-sm hover:bg-indigo-700',
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
                    {linkedHint && canPickItems(status) ? (
                      <button
                        type="button"
                        onClick={() => {
                          void (combinedMode ? stopCombinedPick() : startCombinedPick())
                        }}
                        disabled={busy}
                        className={cn(
                          'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold cursor-pointer',
                          combinedMode
                            ? 'border border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
                            : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-surface-1',
                        )}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        {combinedMode
                          ? vi
                            ? `Đang lấy chung ${combinedIds?.length} nhóm`
                            : `Combined ${combinedIds?.length} groups`
                          : vi
                            ? 'Lấy chung nhóm liên kết'
                            : 'Pick linked groups together'}
                      </button>
                    ) : null}
                    {canPickItems(status) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMissingQty(Math.max(1, remainingForActive || 1))
                          setMissingOpen(true)
                        }}
                        disabled={!activeLine || !warehouseId || busy}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 cursor-pointer hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        <Flag className="h-3.5 w-3.5" />
                        {vi ? 'Báo thiếu hàng' : 'Report missing'}
                      </button>
                    ) : null}
                    {group && canReturn(status) ? (
                      <button
                        type="button"
                        onClick={() => setReturnOpen(true)}
            disabled={busy}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 cursor-pointer hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
                        {vi ? 'Ghi nhận hoàn hàng' : 'Record return'}
                      </button>
                    ) : null}
        </div>
                </div>
          </div>

              {trays.length >= 2 ? (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {vi ? 'Khay của nhóm' : 'Group trays'}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {vi
                      ? 'Mỗi đơn còn hiệu lực một khay. Số đã xếp là đếm tay trên phiên này, không lưu lên máy chủ.'
                      : 'One tray per active order. Counts stay on this session only.'}
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="pb-1.5 pr-3 font-semibold">{vi ? 'Khay' : 'Tray'}</th>
                          <th className="pb-1.5 pr-3 font-semibold">{vi ? 'Người nhận' : 'Recipient'}</th>
                          <th className="pb-1.5 pr-3 font-semibold">{vi ? 'Đơn' : 'Order'}</th>
                          <th className="pb-1.5 text-right font-semibold">{vi ? 'Đã xếp / cần' : 'Placed / need'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trays.map((tray) => {
                          const needed = trayNeeded(tray, lines)
                          const placed = trayPlaced(tray, trayCounts, lines)
                          return (
                            <tr
                              key={tray.key}
                              className={cn(
                                'border-t border-l-4 border-slate-100 dark:border-slate-800',
                                recipientBorderClass(tray.recipientName),
                              )}
                            >
                              <td className="py-1.5 pr-3">
                                <span
                                  className={cn(
                                    'inline-flex min-w-6 justify-center rounded border px-1.5 py-0.5 font-bold',
                                    recipientChipClass(tray.recipientName),
                                  )}
                                >
                                  {tray.label}
                                </span>
                              </td>
                              <td className="py-1.5 pr-3 font-medium text-slate-800 dark:text-slate-100">
                                {tray.recipientName || '—'}
                              </td>
                              <td className="py-1.5 pr-3 font-mono text-slate-600 dark:text-slate-300">
                                {combinedMode ? `${shortId(tray.groupId)} · ` : ''}
                                {tray.orderCode || shortId(tray.orderId)}
                              </td>
                              <td
                                className={cn(
                                  'py-1.5 text-right font-mono font-semibold',
                                  placed < needed ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300',
                                )}
                              >
                                {placed}/{needed}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
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
              ) : lines.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-surface-1">
                  <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <PackageOpen className="h-7 w-7" strokeWidth={1.75} />
                  </div>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {vi
                      ? 'Nhóm đơn này không còn SKU cần lấy'
                      : 'No SKUs left to pick in this group'}
                  </p>
                  <p className="mt-1.5 max-w-md text-sm text-slate-500">
                    {vi
                      ? 'Đơn có thể đã hủy / sự cố logistics, hoặc đã lấy xong. Chuyển sang nhóm tiếp theo trong hàng đợi.'
                      : 'Orders may be canceled / logistics-blocked, or already picked. Move to the next group in the queue.'}
                  </p>
                  <button
                    type="button"
                    onClick={goToNextGroup}
                    className="mt-6 inline-flex h-11 items-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white cursor-pointer hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                  >
                    {vi ? 'Chuyển đơn tiếp theo' : 'Next order'}
                  </button>
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
                              {activeLine.oldest_lot ? (
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {formatLotReceived(
                                    activeLine.oldest_lot.lot_code,
                                    activeLine.oldest_lot.received_at,
                                    vi,
                                  )}
                                </p>
                              ) : null}
                              <AllocationChips
                                line={activeLine}
                                trays={trays}
                                counts={trayCounts}
                                combined={combinedMode}
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

                        {activeLine.bin_location_id && isBinAssigned(activeLine.bin_code) ? (
                          <div className="mt-5">
                            <BarcodeGraphic code={activeLine.bin_code} />
                          </div>
                        ) : (
                          <div className="mt-5 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2.5 text-center text-[11px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                            {vi
                              ? 'SKU chưa được gán ô — liên hệ Admin. Nút quét đang khóa.'
                              : 'This SKU has no bin. Scanning is locked until an admin assigns one.'}
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
                                placeholder={activeLine.bin_location_id ? activeLine.bin_code || activeLine.sku : ''}
                                disabled={!canPickItems(status) || !activeLine.bin_location_id}
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
                                  disabled={!canPickItems(status) || !activeLine.bin_location_id}
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
                        {vi
                          ? 'Chọn một SKU trong danh sách bên phải để bắt đầu quét.'
                          : 'Select a SKU from the list to start scanning.'}
                      </div>
                    )}
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
                          const selected = line.key === activeLine?.key
                          return (
                            <button
                              key={line.key}
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
                                {line.master_sku ? (
                                  <p className="truncate text-[10px] font-medium text-blue-700 dark:text-blue-300">
                                    {vi ? 'Tồn chung' : 'Pooled'} {line.master_sku}
                                  </p>
                                ) : null}
                                <div className="mt-1 truncate">
                                  <LocationBadge
                                    binCode={line.bin_code}
                                    zoneCode={line.zone_code}
                                  />
                                </div>
                                {line.oldest_lot ? (
                                  <p className="mt-0.5 truncate text-[10px] text-slate-500">
                                    {formatLotReceived(
                                      line.oldest_lot.lot_code,
                                      line.oldest_lot.received_at,
                                      vi,
                                    )}
                                  </p>
                                ) : null}
                                <AllocationChips
                                  line={line}
                                  trays={trays}
                                  counts={trayCounts}
                                  combined={combinedMode}
                                />
                                {line.other_bins.length > 0 ? (
                                  <p className="mt-0.5 truncate text-[10px] text-slate-500">
                                    {vi ? 'Ô khác' : 'Also at'}{' '}
                                    {line.other_bins
                                      .map((bin) => `${bin.bin_code} (${bin.quantity_on_hand})`)
                                      .join(', ')}
                                  </p>
                                ) : null}
              </div>
                              <span className="shrink-0 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                                {line.qtyPicked}/{line.quantity}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      {group && warehouseId ? (
                        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              const ids = combinedMode
                                ? (combinedIds ?? [group.id])
                                : [group.id]
                              void (async () => {
                                try {
                                  for (const id of ids) {
                                    await openWarehouseDocument(
                                      pickingListDocumentPath(warehouseId, id),
                                    )
                                  }
                                } catch (err: unknown) {
                                  setActionError(formatApiError(err))
                                }
                              })()
                            }}
                            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 cursor-pointer hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                          >
                            <Printer className="h-4 w-4 shrink-0" />
                            {combinedMode
                              ? vi
                                ? `In lần lượt ${combinedIds?.length} nhóm`
                                : `Print ${combinedIds?.length} lists`
                              : vi
                                ? 'In danh sách lấy hàng'
                                : 'Print picking list'}
                          </button>
                        </div>
                      ) : null}
                      {completeTargets.length > 0 ? (
                        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setCompleteOpen(true)}
                            disabled={
                              busy ||
                              lines.length === 0 ||
                              completeTargets.some((row) => !row.assignedStaffId) ||
                              (completeTargets.some((row) => row.fulfillmentStatus === 'picking') &&
                                !allScanned)
                            }
                            title={
                              completeTargets.some((row) => !row.assignedStaffId)
                                ? vi
                                  ? 'Nhận việc trước khi hoàn tất lấy hàng'
                                  : 'Claim the batch before completing pick'
                                : undefined
                            }
                            className={cn(
                              'flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold shadow-xs',
                              completeTargets.every((row) => row.assignedStaffId)
                                ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
                                : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500',
                            )}
                          >
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            {completeTargets.length > 1
                              ? vi
                                ? `Hoàn tất ${completeTargets.length} nhóm`
                                : `Complete ${completeTargets.length} groups`
                              : vi
                                ? 'Hoàn tất lấy hàng'
                                : 'Complete picking'}
                          </button>
                          <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">
                            {completeTargets.some((row) => !row.assignedStaffId)
                              ? vi
                                ? 'Nhận việc trước, rồi bấm nút này để chuyển đơn sang đóng gói.'
                                : 'Claim the batch, then use this button to hand the order to packing.'
                              : allScanned
                                ? vi
                                  ? 'Đã quét đủ. Bấm để chuyển đơn sang bàn đóng gói.'
                                  : 'Every SKU is scanned. Hand this order to packing.'
                                : vi
                                  ? `Quét đủ ${lines.length} SKU rồi bấm nút này. Hiện còn ${lines.length - pickedCount} SKU.`
                                  : `Scan all ${lines.length} SKUs, then use this button. ${lines.length - pickedCount} left.`}
                          </p>
                        </div>
                      ) : null}
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
          {trayShortfalls.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              {vi
                ? `Còn ${trayShortfalls.length} khay chưa xếp đủ (${trayShortfalls
                    .map((tray) => tray.label)
                    .join(', ')}). Đây chỉ là đếm tay trên phiên — vẫn có thể hoàn tất.`
                : `${trayShortfalls.length} tray(s) still short (${trayShortfalls
                    .map((tray) => tray.label)
                    .join(', ')}). Session-only counts — you can still complete.`}
            </div>
          ) : null}
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

      <Dialog
        open={trayPickOpen}
        onOpenChange={(open) => {
          setTrayPickOpen(open)
          if (!open) setPendingTray(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{vi ? 'Xếp vào khay nào?' : 'Which tray?'}</DialogTitle>
            <DialogDescription>
              {vi
                ? 'SKU này thuộc nhiều đơn. Chọn khay (đơn) vừa lấy, rồi đếm sẽ cộng vào khay đó. Không gửi lên máy chủ.'
                : 'This SKU belongs to more than one order. Pick the tray you just filled. Counts stay on this session.'}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const line = lines.find((row) => row.key === pendingTray?.lineKey)
            const allocations = line?.order_allocations ?? []
            return (
              <div className="space-y-2">
                <p className="font-mono text-sm font-semibold">{line?.sku}</p>
                <p className="text-xs text-slate-500">
                  {vi
                    ? `Vừa quét ${pendingTray?.qty ?? 0} cái.`
                    : `Just scanned ${pendingTray?.qty ?? 0}.`}
                </p>
                {allocations.map((row) => {
                  const tray = trays.find(
                    (item) =>
                      item.groupId === line?.group_id && item.orderId === row.order_id,
                  )
                  const placed = line
                    ? (trayCounts[trayCountKey(line, row.order_id)] ?? 0)
                    : 0
                  const selected = selectedTrayOrderId === row.order_id
                  return (
                    <button
                      key={row.order_id}
                      type="button"
                      onClick={() => setSelectedTrayOrderId(row.order_id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm cursor-pointer',
                        selected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                        recipientChipClass(row.recipient_name),
                      )}
                    >
                      <span>
                        <span className="font-bold">{tray?.label ?? '?'}</span>
                        {' · '}
                        {row.recipient_name || '—'}
                        <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                          {combinedMode && line ? `${shortId(line.group_id)} · ` : ''}
                          {row.platform_order_id}
                        </span>
                      </span>
                      <span className="font-mono text-xs font-semibold">
                        {placed}/{row.quantity}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })()}
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setTrayPickOpen(false)
                setPendingTray(null)
              }}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold cursor-pointer dark:border-slate-700"
            >
              {vi ? 'Bỏ qua' : 'Skip'}
            </button>
            <button
              type="button"
              onClick={confirmTrayPick}
              disabled={!selectedTrayOrderId}
              className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white cursor-pointer hover:bg-blue-700 disabled:opacity-50"
            >
              {vi ? 'Xếp vào khay' : 'Assign tray'}
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
