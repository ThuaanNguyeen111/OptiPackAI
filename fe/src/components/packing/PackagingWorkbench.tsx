import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/use-auth'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Shuffle,
  X,
  XCircle,
} from 'lucide-react'
import {
  approvePackingPlan,
  undoApprovePackingPlan,
  assignPacker,
  changeParcelBox,
  getPackingPlan,
  getPackingSettings,
  listPackingPlanSummaries,
  listPackingStaff,
  packPlan,
  rejectPackingPlan,
  requestParcelGuide,
  recomputePackingPlan,
  getPackingBoxSources,
} from '../../api/packing-plan.api'
import {
  decidePartialOrderGroup,
  getOrderGroupById,
  listOrderGroups,
} from '../../api/order-groups.api'
import { fetchMyProfile } from '../../api/users.api'
import {
  listPackagingMaterials,
  type PackagingMaterialStock,
} from '../../api/packaging-materials.api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { usePortal } from '../../context/use-portal'
import { UserRole } from '../../types/auth'
import { ApiError, formatApiError, getApiErrorCode } from '../../lib/api'
import { groupStatusTone } from '../../lib/stage-colors'
import {
  groupParcelsByOrder,
  parcelBorderClass,
  parcelOrderCaption,
  parcelOrderHeading,
} from '../../lib/parcel-order-display'
import { MailerBadge, SharedParcelOrders } from './SharedParcelOrders'
import { RejectedPlanPanel } from './RejectedPlanPanel'
import {
  GROUP_FULFILLMENT_STATUS_LABELS,
  hasPackableOrders,
  isPartiallyCanceledGroup,
  type GroupOrderView,
  type OrderGroup,
} from '../../types/order-groups'
import {
  ADJUSTMENT_REASONS,
  boxCutNote,
  outerCm,
  PACKING_REASON_LABELS,
  REJECT_REASONS,
  boxSourceBody,
  type AdjustmentReason,
  type BoxSourceInput,
  type PackingBoxSources,
  type PackingPlan,
  type PackingPlanSummary,
  type PackingStaffMember,
  type RejectReason,
} from '../../types/packing-plan'
import { formatCurrency, formatDateTime } from '../../utils/format'
import { formatDimsCm, formatGAsKg, parseDecimal } from '../../utils/units'
import { useLocalQueuePagination } from '../../hooks/useLocalQueuePagination'
import { Badge } from '../ui/Badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { QueuePaginationBar } from '../ui/QueuePaginationBar'
import { Packing3DBoxViewer } from './Packing3DBoxViewer'
import { selectParcel } from '../../utils/packing-layout'
import { PackingSessionPanel } from './PackingSessionPanel'
import { BoxSourceFields, boxSourceError } from './BoxSourceFields'
import { SealPhotoPicker } from './SealPhotoPicker'
import { BoxComparisonTable } from './BoxComparisonTable'
import { GuideRating, GuideTraceButton } from './GuideFeedback'
import { GuideSteps } from './GuideSteps'
import { MaterialTags } from './MaterialTags'
import { setVisibleInterval } from '../../utils/visible-interval'

/**
 * Bàn đóng gói (Packaging Staff + Admin) — duyệt / điều chỉnh / từ chối / đóng kiện.
 * BE tự tính và gán kế hoạch sau lấy hàng (không còn bước Admin chốt riêng).
 * Khung 3D dựng từ kế hoạch thật (placements + itemProfiles); chỉ xem, không ghi trạng thái lên BE.
 */

const AFTER_PACK_STATUSES = new Set([
  'packed',
  'shipped',
  'delivered',
  'returning',
  'returned',
])

type ExpressClock = {
  label: string
  tone: 'ok' | 'soon' | 'late'
}

function formatRemain(ms: number, vi: boolean): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  if (minutes < 60) return vi ? `${String(minutes)} phút` : `${String(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return vi ? `${String(hours)} giờ` : `${String(hours)}h`
  return vi
    ? `${String(hours)} giờ ${String(rest)} phút`
    : `${String(hours)}h ${String(rest)}m`
}

/** Trước khi đóng xong đếm tới hạn đóng; sau đó đếm tới hạn giao khách. */
function expressClock(
  group: OrderGroup,
  nowMs: number,
  vi: boolean,
): ExpressClock | null {
  if (group.orderPriority !== 'express') return null
  if (group.fulfillmentStatus === 'canceled') return null
  const afterPack = AFTER_PACK_STATUSES.has(group.fulfillmentStatus)
  const iso = afterPack ? group.deliveryDeadline : group.packagingDeadline
  if (!iso) return null
  const remainMs = new Date(iso).getTime() - nowMs
  if (!Number.isFinite(remainMs)) return null
  const late = remainMs <= 0
  const soon = !late && remainMs <= 15 * 60 * 1000
  const amount = formatRemain(Math.abs(remainMs), vi)
  const what = afterPack
    ? vi
      ? 'giao khách'
      : 'deliver'
    : vi
      ? 'đóng gói'
      : 'pack'
  const label = late
    ? vi
      ? `Quá hạn ${what} ${amount}`
      : `${amount} past the ${what} deadline`
    : vi
      ? `Còn ${amount} để ${what}`
      : `${amount} left to ${what}`
  return { label, tone: late ? 'late' : soon ? 'soon' : 'ok' }
}

function expressRemainClass(tone: ExpressClock['tone']): string {
  if (tone === 'late') return 'text-rose-700 dark:text-rose-300'
  if (tone === 'soon') return 'text-amber-700 dark:text-amber-200'
  return 'text-ink-muted'
}

function ExpressRemain({
  group,
  nowMs,
  vi,
  className = 'text-xs',
}: {
  group: OrderGroup
  nowMs: number
  vi: boolean
  className?: string
}): ReactNode {
  const clock = expressClock(group, nowMs, vi)
  if (!clock) return null
  return (
    <span className={`font-medium leading-tight ${className} ${expressRemainClass(clock.tone)}`}>
      {clock.label}
    </span>
  )
}

function quickPackBlockedCopy(group: OrderGroup, vi: boolean): string {
  if (group.recipientNamesDiffer) {
    return vi
      ? 'Nhóm gộp nhiều người nhận — phải quét từng món, không đóng nhanh.'
      : 'This group has different recipient names — scan each item, do not quick-pack.'
  }
  const count = group.activeOrderCount > 0 ? group.activeOrderCount : 2
  return vi
    ? `Nhóm gộp ${String(count)} đơn — mỗi đơn 1 vận đơn, quét từng món vào đúng kiện rồi niêm phong.`
    : `Consolidated group of ${String(count)} orders — one shipment per order. Scan each item into the right parcel, then seal.`
}

type QueueTab =
  | 'picked'
  | 'partial_needs_review'
  | 'approved_for_packing'
  | 'awaiting_packaging'
  | 'pending_approval'
  | 'blocked'

function groupMatchesSearch(group: OrderGroup, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const parts = [
    group.id,
    group.id.slice(-8),
    group.platform,
    ...group.orders.flatMap((order) => [
      order.id,
      order.platformOrderId,
      order.recipientName,
      order.recipientPhone,
      ...order.items.flatMap((item) => [item.sku, item.name]),
    ]),
  ]
  return parts.some((part) => part.toLowerCase().includes(q))
}

function statusLabel(status: string, vi: boolean): string {
  const known = GROUP_FULFILLMENT_STATUS_LABELS[status]
  if (!known) return status
  return vi ? known.vi : known.en
}

const PLAN_STATUS_LABELS: Record<string, { vi: string; en: string }> = {
  computing: { vi: 'Đang tính', en: 'Computing' },
  ready: { vi: 'Chờ chấp nhận', en: 'Awaiting acceptance' },
  approved: { vi: 'Đã chấp nhận', en: 'Accepted' },
  packing: { vi: 'Đang đóng', en: 'Packing' },
  packed: { vi: 'Đã đóng', en: 'Packed' },
  rejected: { vi: 'Bị từ chối', en: 'Rejected' },
  failed: { vi: 'Tính lỗi', en: 'Failed' },
  superseded: { vi: 'Đã thay', en: 'Superseded' },
}

function planStatusLabel(status: string | undefined, vi: boolean): string {
  const known = status ? PLAN_STATUS_LABELS[status] : undefined
  return known ? (vi ? known.vi : known.en) : (status ?? '—')
}

/** Các bước chưa có người đóng gói được giao — vẫn hiện ở phạm vi "Việc của tôi". */
const UNASSIGNED_QUEUE_STATUSES = [
  'awaiting_packaging',
  'picked',
  'partial_needs_review',
] as const

function emptyCopy(
  tab: QueueTab,
  vi: boolean,
  counts: { awaiting: number; picked: number },
): { title: string; body: string } {
  if (tab === 'pending_approval') {
    if (counts.awaiting > 0 || counts.picked > 0) {
      return vi
        ? {
            title: 'Chưa có việc duyệt ngay',
            body:
              counts.picked > 0
                ? `Có ${String(counts.picked)} nhóm đã lấy xong, hệ thống đang tính kế hoạch. Có kế hoạch là đơn hiện tại đây để bạn duyệt.`
                : `Kho đang lấy ${String(counts.awaiting)} nhóm. Lấy xong, hệ thống tự tính kế hoạch rồi đơn sẽ hiện tại đây để duyệt.`,
          }
        : {
            title: 'Nothing to approve yet',
            body:
              counts.picked > 0
                ? `${String(counts.picked)} group(s) picked, plans are being computed. They appear here once a plan is ready.`
                : `Warehouse is picking ${String(counts.awaiting)} group(s). A plan is computed automatically after picking.`,
          }
    }
    return vi
      ? {
          title: 'Chưa có kế hoạch thùng chờ duyệt',
          body: 'Đây là việc chính của bạn: duyệt / điều chỉnh / từ chối gợi ý thùng. Hiện chưa có nhóm nào ở pending_approval.',
        }
      : {
          title: 'No packing plans pending',
          body: 'Your main job: approve, adjust, or reject carton plans. No groups in pending_approval yet.',
        }
  }
  if (tab === 'partial_needs_review') {
    return vi
      ? {
          title: 'Không có đơn thiếu hàng',
          body: 'Warehouse đã báo thiếu (report-missing) — quyết định tiếp tục với phần còn lại hoặc hủy làm lại.',
        }
      : {
          title: 'No partial-review groups',
          body: 'Only groups where warehouse reported missing items.',
        }
  }
  if (tab === 'approved_for_packing') {
    return vi
      ? {
          title: 'Không có nhóm đã duyệt kế hoạch',
          body: 'Sau khi bạn chấp nhận kế hoạch, nhóm hiện ở đây — bấm «Xác nhận đã đóng gói» khi gói xong.',
        }
      : {
          title: 'No approved plans waiting',
          body: 'After you accept a plan, groups appear here — tap «Confirm packed» when packing is done.',
        }
  }
  if (tab === 'blocked') {
    return vi
      ? {
          title: 'Không có nhóm kẹt',
          body: 'Nhóm đã lấy xong nhưng SKU chưa có hồ sơ đóng gói sẽ hiện ở đây. Đo SKU xong, hệ thống tự tính lại kế hoạch.',
        }
      : {
          title: 'No blocked groups',
          body: 'Picked groups whose SKUs have no packing profile appear here. Once SKUs are measured, the plan is recomputed automatically.',
        }
  }
  return vi
    ? {
        title: 'Không có đơn đang lấy',
        body: 'Tab chỉ xem: nhóm awaiting_packaging thuộc việc Warehouse. Packaging không thao tác tại đây.',
      }
    : {
        title: 'No groups in warehouse pick',
        body: 'View-only: awaiting_packaging is Warehouse work. Packaging cannot act here.',
      }
}

/** Route ghi trả profileStale=false. Giữ cờ từ lần GET khi kế hoạch vẫn chờ duyệt hoặc đã duyệt. */
function retainProfileStale(
  previous: PackingPlan | null,
  next: PackingPlan,
): PackingPlan {
  if (next.status !== 'ready' && next.status !== 'approved') return next
  if (next.profileStale === true) return next
  if (previous?.profileStale === true && previous.id === next.id) {
    return { ...next, profileStale: true }
  }
  return next
}

function boxViewerLabel(plan: PackingPlan | null, parcelNo: number | null, vi: boolean): string {
  const parcel = selectParcel(plan, parcelNo)
  if (!plan || !parcel) {
    return vi ? 'Chưa có kế hoạch đóng gói' : 'No packing plan yet'
  }
  const { lengthCm, widthCm, heightCm } = outerCm(parcel.box)
  const extra =
    plan.parcels.length > 1
      ? vi
        ? ` · kiện ${String(parcel.parcelNo)}/${String(plan.parcels.length)}`
        : ` · parcel ${String(parcel.parcelNo)}/${String(plan.parcels.length)}`
      : ''
  return `${parcel.box.name}: ${String(lengthCm)} × ${String(widthCm)} × ${String(heightCm)} cm${extra}`
}

function boxViewerSub(plan: PackingPlan | null, parcelNo: number | null, vi: boolean): string {
  const parcel = selectParcel(plan, parcelNo)
  if (!plan || !parcel) {
    return vi
      ? 'Hướng dẫn 3D hiện khi kế hoạch đã tính xong'
      : 'The 3D guide appears once the plan is computed'
  }
  const count = parcel.placements?.length ?? parcel.itemCount ?? 0
  return vi
    ? `${String(count)} món · làm theo từng bước trong khung 3D`
    : `${String(count)} items · follow the steps in the 3D view`
}

function weightPrefill(plan: PackingPlan): Record<number, string> {
  const next: Record<number, string> = {}
  for (const parcel of plan.parcels) {
    const kg = parcel.actualWeightKg ?? parcel.estimatedWeightG / 1000
    next[parcel.parcelNo] = kg > 0 ? String(Math.round(kg * 1000) / 1000).replace('.', ',') : ''
  }
  return next
}

function readParcelWeights(
  plan: PackingPlan,
  weights: Record<number, string>,
): { parcel_no: number; weight_kg: number }[] | null {
  const rows: { parcel_no: number; weight_kg: number }[] = []
  for (const parcel of plan.parcels) {
    const weight = parseDecimal(weights[parcel.parcelNo] ?? '') ?? Number.NaN
    if (!Number.isFinite(weight) || weight < 0.001 || weight > 100) return null
    rows.push({ parcel_no: parcel.parcelNo, weight_kg: weight })
  }
  return rows
}

export function PackagingWorkbench() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const vi = locale === 'vi'
  const canAssign =
    session?.role === UserRole.PACKAGING_STAFF || session?.role === UserRole.ADMIN

  const [tab, setTab] = useState<QueueTab>('picked')
  const [queueQuery, setQueueQuery] = useState('')
  const [tabBootstrapped, setTabBootstrapped] = useState(false)
  const [allGroups, setAllGroups] = useState<OrderGroup[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [group, setGroup] = useState<OrderGroup | null>(null)
  const [plan, setPlan] = useState<PackingPlan | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [boxConfirm, setBoxConfirm] = useState<{
    code: string
    name: string
    action: 'approve' | 'adjust'
  } | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [parcelWeights, setParcelWeights] = useState<Record<number, string>>({})
  const [planDialog, setPlanDialog] = useState<'approve' | 'adjust' | null>(null)
  const [parcelNo, setParcelNo] = useState<number | null>(null)
  const [boxCode, setBoxCode] = useState('')
  const [adjustReason, setAdjustReason] = useState<AdjustmentReason>(
    'RECOMMENDED_BOX_NOT_IN_STOCK',
  )
  const [adjustNote, setAdjustNote] = useState('')
  const [rejectCode, setRejectCode] = useState<RejectReason>('BOX_TOO_LOOSE')
  const [rejectNote, setRejectNote] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [guide3dActive, setGuide3dActive] = useState(false)
  const [asideTab, setAsideTab] = useState<'guide' | 'compare'>('guide')
  const [guideDetailOpen, setGuideDetailOpen] = useState(false)
  /** Khung nội dung app (chừa sidebar) — chi tiết 3D phủ full vùng này. */
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null)
  const [boxStock, setBoxStock] = useState<PackagingMaterialStock[]>([])
  const [boxStockError, setBoxStockError] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<Record<string, PackingPlanSummary>>({})
  const [staff, setStaff] = useState<PackingStaffMember[]>([])
  // Packaging Staff: "Việc của tôi" (mặc định — kế hoạch giao cho mình) hoặc "Tất cả" hàng chờ.
  const isPackagingStaff = session?.role === UserRole.PACKAGING_STAFF
  const [queueScope, setQueueScope] = useState<'mine' | 'all'>('mine')
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [requireScan, setRequireScan] = useState(false)
  const [requireSealPhoto, setRequireSealPhoto] = useState(false)
  /** Ảnh niêm phong của lối đóng nhanh, khoá `${planId}:${parcelNo}`. */
  const [quickSealPhotos, setQuickSealPhotos] = useState<Record<string, string[]>>({})
  const [blockedGroups, setBlockedGroups] = useState<OrderGroup[]>([])
  const [remoteGroups, setRemoteGroups] = useState<OrderGroup[] | null>(null)
  const [remoteSearching, setRemoteSearching] = useState(false)
  const [boxSources, setBoxSources] = useState<PackingBoxSources | null>(null)
  const [boxSourceInputs, setBoxSourceInputs] = useState<
    Record<number, BoxSourceInput>
  >({})
  const [recomputing, setRecomputing] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setStageEl(document.querySelector('.owner-stage'))
  }, [])

  useEffect(() => {
    if (!guideDetailOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setGuideDetailOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guideDetailOpen])

  // Kế hoạch đang tính: tải lại mỗi 3 giây tới khi có kết quả (khung 3D hiện "Đang tính").
  const computingGroupId = plan?.status === 'computing' ? plan.orderGroupId : null
  useEffect(() => {
    if (!computingGroupId) return
    return setVisibleInterval(() => {
      void getPackingPlan(computingGroupId)
        .then((next) => {
          if (!next) return
          setPlan((current) =>
            current && current.orderGroupId === next.orderGroupId ? next : current,
          )
        })
        .catch(() => undefined)
    }, 3000)
  }, [computingGroupId])

  // Mở kiện chưa có câu hướng dẫn: xin 1 lần (AI hoặc câu mẫu). Kiện xếp tay thì không gọi (BE trả 409).
  const guideRequestedRef = useRef<Set<string>>(new Set())
  const guideParcel = selectParcel(plan, parcelNo)
  // Bước hoạt ảnh 3D đang xem, dùng chung với danh sách bước chữ; đổi kiện / kế hoạch thì về bước 1.
  const guideStepKey = `${plan?.id ?? ''}:${String(plan?.version ?? '')}:${String(guideParcel?.parcelNo ?? '')}`
  const [guideStepState, setGuideStepState] = useState({ key: '', index: 0 })
  const guideStepIndex = guideStepState.key === guideStepKey ? guideStepState.index : 0
  const setGuideStepIndex = useCallback(
    (index: number) => setGuideStepState({ key: guideStepKey, index }),
    [guideStepKey],
  )
  const autoGuideKey =
    plan &&
    guideParcel &&
    !guideParcel.guide &&
    guideParcel.manualLayout !== true &&
    (guideParcel.placements?.length ?? 0) > 0 &&
    ['ready', 'approved', 'packing'].includes(plan.status)
      ? `${plan.orderGroupId}:${plan.id}:${String(guideParcel.parcelNo)}`
      : null
  useEffect(() => {
    if (!autoGuideKey || guideRequestedRef.current.has(autoGuideKey)) return
    guideRequestedRef.current.add(autoGuideKey)
    const [groupId, , no] = autoGuideKey.split(':')
    if (!groupId || !no) return
    void requestParcelGuide(groupId, Number(no))
      .then((next) => {
        setPlan((current) =>
          current && current.id === next.id ? retainProfileStale(current, next) : current,
        )
      })
      .catch(() => undefined)
  }, [autoGuideKey])

  const loadBlocked = useCallback(async () => {
    try {
      setBlockedGroups(await listOrderGroups({ packing_blocked: true }))
    } catch {
      setBlockedGroups([])
    }
  }, [])

  useEffect(() => {
    const first = window.setTimeout(() => void loadBlocked(), 0)
    const stopPolling = setVisibleInterval(() => void loadBlocked(), 15000)
    return () => {
      window.clearTimeout(first)
      stopPolling()
    }
  }, [loadBlocked])

  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const packerId =
        session?.role === UserRole.PACKAGING_STAFF
          ? (await fetchMyProfile()).id
          : ''
      if (packerId) setMyUserId(packerId)
      let rows: OrderGroup[]
      if (packerId && queueScope === 'mine') {
        // Nhóm chưa có kế hoạch thì chưa có người đóng: lọc theo người sẽ làm các tab này luôn trống.
        const lists = await Promise.all([
          listOrderGroups({ assigned_packer_id: packerId }),
          ...UNASSIGNED_QUEUE_STATUSES.map((status) =>
            listOrderGroups({ fulfillment_status: status }),
          ),
        ])
        const byId = new Map(lists.flat().map((row) => [row.id, row]))
        rows = [...byId.values()]
      } else {
        rows = await listOrderGroups({})
      }
      setAllGroups(rows)
      const ids = rows.map((row) => row.id)
      if (ids.length > 0) {
        const listed = await listPackingPlanSummaries(ids).catch(() => [])
        const next: Record<string, PackingPlanSummary> = {}
        for (const item of listed) next[item.orderGroupId] = item
        setSummaries(next)
      } else {
        setSummaries({})
      }
    } catch (err: unknown) {
      setListError(formatApiError(err))
      setAllGroups([])
    } finally {
      setListLoading(false)
    }
  }, [session, queueScope])

  const loadBoxStock = useCallback(async () => {
    try {
      const rows = await listPackagingMaterials()
      setBoxStock(rows.filter((row) => row.kind === 'box' && row.isActive))
      setBoxStockError(null)
    } catch (err: unknown) {
      setBoxStockError(formatApiError(err))
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList()
      void loadBoxStock()
    }, 150)
    return () => window.clearTimeout(timer)
  }, [loadList, loadBoxStock])

  useEffect(() => {
    if (!canAssign) return
    const timer = window.setTimeout(() => {
      void listPackingStaff()
        .then(setStaff)
        .catch(() => setStaff([]))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [canAssign])

  // Nhân viên đóng gói cũng đọc được cài đặt — cần biết bắt buộc quét / bắt buộc ảnh.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void getPackingSettings()
        .then((settings) => {
          setRequireScan(settings.requireScan)
          setRequireSealPhoto(settings.requireSealPhoto ?? false)
        })
        .catch(() => {
          setRequireScan(false)
          setRequireSealPhoto(false)
        })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const counts = useMemo(() => {
    let pending = 0
    let partial = 0
    let awaiting = 0
    let picked = 0
    let approved = 0
    for (const g of allGroups) {
      // Nhóm không còn đơn packable không vào hàng đợi đóng gói.
      if (!hasPackableOrders(g)) continue
      if (g.fulfillmentStatus === 'pending_approval') pending += 1
      else if (g.fulfillmentStatus === 'partial_needs_review') partial += 1
      else if (g.fulfillmentStatus === 'awaiting_packaging') awaiting += 1
      else if (g.fulfillmentStatus === 'picked') picked += 1
      else if (g.fulfillmentStatus === 'approved_for_packing') approved += 1
    }
    return {
      pending,
      partial,
      awaiting,
      picked,
      approved,
      blocked: blockedGroups.length,
    }
  }, [allGroups, blockedGroups])

  const groups = useMemo(() => {
    if (tab === 'blocked') return blockedGroups
    return allGroups.filter(
      (g) => g.fulfillmentStatus === tab && hasPackableOrders(g),
    )
  }, [allGroups, blockedGroups, tab])
  const localVisibleGroups = useMemo(() => {
    if (!queueQuery.trim()) return groups
    return groups.filter((group) => groupMatchesSearch(group, queueQuery))
  }, [groups, queueQuery])
  const visibleGroups =
    remoteGroups && localVisibleGroups.length === 0
      ? remoteGroups
      : localVisibleGroups

  // Tìm trên BE khi lọc tại chỗ không ra kết quả (mã đơn sàn / đuôi mã nhóm).
  useEffect(() => {
    const query = queueQuery.trim()
    if (query.length < 4 || localVisibleGroups.length > 0) {
      const clear = window.setTimeout(() => setRemoteGroups(null), 0)
      return () => window.clearTimeout(clear)
    }
    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setRemoteSearching(true)
      void listOrderGroups({ q: query }, { signal: controller.signal })
        .then((rows) => {
          if (!cancelled) setRemoteGroups(rows)
        })
        .catch(() => {
          if (!cancelled) setRemoteGroups([])
        })
        .finally(() => {
          if (!cancelled) setRemoteSearching(false)
        })
    }, 400)
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [queueQuery, localVisibleGroups.length])

  // Chỉ nhảy tới tab thao tác được.
  useEffect(() => {
    if (listLoading || tabBootstrapped) return
    const id = window.setTimeout(() => {
      if (counts.pending > 0) {
        setTab('pending_approval')
      } else if (counts.partial > 0) {
        setTab('partial_needs_review')
      } else if (counts.approved > 0) {
        setTab('approved_for_packing')
      } else {
        setTab('pending_approval')
      }
      setTabBootstrapped(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [
    listLoading,
    tabBootstrapped,
    counts.pending,
    counts.partial,
    counts.approved,
  ])

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && groups.some((g) => g.id === prev)) return prev
      if (prev && remoteGroups?.some((g) => g.id === prev)) return prev
      // Tab chỉ xem: không tự chọn group — tránh màn «đầy việc» nhưng không làm gì được.
      if (tab === 'awaiting_packaging' || tab === 'blocked') return null
      return groups[0]?.id ?? null
    })
  }, [groups, remoteGroups, tab])

  const lastPackagingKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedId) {
      lastPackagingKeyRef.current = null
      const clearId = window.setTimeout(() => {
        setGroup(null)
        setPlan(null)
      }, 0)
      return () => window.clearTimeout(clearId)
    }

    const fromList =
      groups.find((g) => g.id === selectedId) ??
      remoteGroups?.find((g) => g.id === selectedId) ??
      null
    const syncId = window.setTimeout(() => {
      setGroup(fromList)
      setDetailError(null)
      setActionError(null)
    }, 0)

    // Partial / awaiting: không cần recommendation để thao tác.
    if (
      !fromList ||
      tab === 'partial_needs_review' ||
      tab === 'awaiting_packaging' ||
      tab === 'blocked'
    ) {
      lastPackagingKeyRef.current = null
      const clearRec = window.setTimeout(() => setPlan(null), 0)
      return () => {
        window.clearTimeout(syncId)
        window.clearTimeout(clearRec)
      }
    }

    const fetchKey = `${selectedId}:${String(fromList.version)}:${tab}`
    if (lastPackagingKeyRef.current === fetchKey) {
      return () => window.clearTimeout(syncId)
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setDetailLoading(true)
      void getPackingPlan(selectedId)
        .then((next) => {
          if (cancelled) return
          lastPackagingKeyRef.current = fetchKey
          setPlan(next)
          if (next) {
            setParcelWeights(weightPrefill(next))
            setParcelNo(next.parcels[0]?.parcelNo ?? null)
            setBoxCode(next.parcels[0]?.box.code ?? '')
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setDetailError(formatApiError(err))
            setPlan(null)
          }
        })
        .finally(() => {
          if (!cancelled) setDetailLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(syncId)
      window.clearTimeout(timer)
    }
  }, [selectedId, groups, remoteGroups, tab])

  // Danh sách hàng chỉ có ở chi tiết nhóm (list API không trả orders[].items).
  const [groupOrders, setGroupOrders] = useState<{ id: string; orders: GroupOrderView[] } | null>(null)
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    void getOrderGroupById(selectedId)
      .then((detail) => {
        if (!cancelled) setGroupOrders({ id: selectedId, orders: detail.orders })
      })
      .catch(() => {
        if (!cancelled) setGroupOrders(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, group?.version])
  const packOrders = (groupOrders?.id === selectedId ? groupOrders.orders : []).filter(
    (o) => o.status !== 'canceled',
  )

  const planIdForSources = plan?.id ?? null
  const planVersionForSources = plan?.version ?? null
  const groupIdForSources = group?.id ?? null
  useEffect(() => {
    if (!groupIdForSources || !planIdForSources) {
      const clearId = window.setTimeout(() => {
        setBoxSources(null)
        setBoxSourceInputs({})
      }, 0)
      return () => window.clearTimeout(clearId)
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setBoxSourceInputs({})
      void getPackingBoxSources(groupIdForSources)
        .then((next) => {
          if (!cancelled) setBoxSources(next)
        })
        .catch(() => {
          if (!cancelled) setBoxSources(null)
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [groupIdForSources, planIdForSources, planVersionForSources])

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }

  async function refreshAfterAction(): Promise<void> {
    await loadList()
  }

  function reloadPlanAfterConflict(err: unknown): void {
    setActionError(formatApiError(err))
    if (!(err instanceof ApiError) || err.status !== 409 || !group) return
    lastPackagingKeyRef.current = null
    void getPackingPlan(group.id)
      .then((next) => {
        setPlan(next)
        if (next) {
          setParcelWeights(weightPrefill(next))
          setParcelNo(next.parcels[0]?.parcelNo ?? null)
          setBoxCode(next.parcels[0]?.box.code ?? '')
        }
      })
      .catch(() => undefined)
  }

  async function onApprove(): Promise<void> {
    if (!group || !plan) {
      setActionError(
        vi
          ? 'Chưa có kế hoạch. Hệ thống tự tính sau khi lấy hàng xong, bấm Tải lại để cập nhật.'
          : 'No plan yet. It is computed after picking finishes. Refresh to update.',
      )
      return
    }
    const needsOverride = plan.orders.some((order) => order.overParcelLimit)
    if (needsOverride && overrideReason.trim().length < 3) {
      setActionError(
        vi
          ? 'Kế hoạch vượt số kiện cho phép — nhập lý do chấp nhận (ít nhất 3 ký tự).'
          : 'Plan exceeds the parcel limit — enter an override reason (min 3 chars).',
      )
      return
    }
    const first = plan.parcels[0]
    if (first) {
      setBoxConfirm({ code: first.box.code, name: first.box.name, action: 'approve' })
      return
    }
    await submitApprove()
  }

  async function submitApprove(): Promise<void> {
    if (!group || !plan) return
    const needsOverride = plan.orders.some((order) => order.overParcelLimit)
    setActionBusy(true)
    setActionError(null)
    try {
      await approvePackingPlan(
        group.id,
        plan.version,
        needsOverride ? overrideReason.trim() : undefined,
      )
      showToast(
        vi
          ? 'Đã chấp nhận — xem hướng dẫn 3D, rồi bấm «Xác nhận đã đóng gói» khi gói xong.'
          : 'Accepted — see 3D guide, then tap «Confirm packed» when done.',
      )
      setGuide3dActive(true)
      setPlanDialog(null)
      await refreshAfterAction()
      setTab('approved_for_packing')
    } catch (err: unknown) {
      reloadPlanAfterConflict(err)
    } finally {
      setActionBusy(false)
    }
  }

  async function onUndoApprove(): Promise<void> {
    if (!group || !plan) return
    if (plan.status !== 'packing' && plan.status !== 'approved') return
    setActionBusy(true)
    setActionError(null)
    try {
      await undoApprovePackingPlan(group.id, plan.version)
      showToast(
        vi
          ? 'Đã quay lại chờ duyệt. Có thể chấp nhận hoặc từ chối lại.'
          : 'Returned to pending approval. You can accept or reject again.',
      )
      setGuide3dActive(false)
      setPlanDialog(null)
      await refreshAfterAction()
      setTab('pending_approval')
    } catch (err: unknown) {
      reloadPlanAfterConflict(err)
    } finally {
      setActionBusy(false)
    }
  }

  async function onAdjust(): Promise<void> {
    if (!group || !plan || parcelNo == null) {
      setActionError(
        vi ? 'Chọn kiện cần đổi thùng.' : 'Choose a parcel to change box.',
      )
      return
    }
    const chosen = boxStock.find((row) => row.code === boxCode)
    if (!chosen) {
      setActionError(
        vi ? 'Chọn thùng trong danh mục.' : 'Choose a box from the catalog.',
      )
      return
    }
    if (adjustReason === 'OTHER' && !adjustNote.trim()) {
      setActionError(
        vi ? 'Nhập ghi chú khi chọn lý do Khác.' : 'Note required for Other.',
      )
      return
    }
    setBoxConfirm({ code: chosen.code, name: chosen.name, action: 'adjust' })
  }

  async function submitAdjust(): Promise<void> {
    if (!group || !plan || parcelNo == null) return
    const chosen = boxStock.find((row) => row.code === boxCode)
    if (!chosen) return
    setActionBusy(true)
    setActionError(null)
    try {
      const next = await changeParcelBox(group.id, parcelNo, {
        expectedVersion: plan.version,
        boxCode: chosen.code,
        reason: adjustReason,
        ...(adjustReason === 'OTHER' ? { note: adjustNote.trim() } : {}),
      })
      setPlan((current) => retainProfileStale(current, next))
      setParcelWeights(weightPrefill(next))
      showToast(vi ? 'Đã đổi thùng.' : 'Box changed.')
      setPlanDialog(null)
    } catch (err: unknown) {
      reloadPlanAfterConflict(err)
    } finally {
      setActionBusy(false)
    }
  }

  async function onReject(): Promise<void> {
    if (!group || !plan) return
    if (rejectCode === 'OTHER' && rejectNote.trim().length < 3) {
      setActionError(
        vi
          ? 'Nhập ghi chú (ít nhất 3 ký tự) khi lý do là Khác.'
          : 'Enter a note (min 3 chars) when the reason is Other.',
      )
      return
    }
    if (
      !window.confirm(
        vi
          ? 'Từ chối kế hoạch này? Lý do sẽ gửi Admin — nhóm quay về đã lấy hàng.'
          : 'Reject this plan? Reason goes to Admin — group returns to picked.',
      )
    ) {
      return
    }
    setActionBusy(true)
    setActionError(null)
    try {
      await rejectPackingPlan(group.id, {
        expectedVersion: plan.version,
        reason: rejectCode,
        ...(rejectNote.trim() ? { note: rejectNote.trim() } : {}),
      })
      showToast(
        vi
          ? 'Đã từ chối — Admin đã được thông báo.'
          : 'Rejected — Admin notified.',
      )
      setRejectNote('')
      setRejectOpen(false)
      setGuide3dActive(false)
      await refreshAfterAction()
      setTab('pending_approval')
    } catch (err: unknown) {
      reloadPlanAfterConflict(err)
    } finally {
      setActionBusy(false)
    }
  }

  async function submitPack(): Promise<void> {
    if (!group || !plan) {
      setActionError(
        vi ? 'Chưa có kế hoạch để đóng.' : 'No plan to pack.',
      )
      return
    }
    const parcels = readParcelWeights(plan, parcelWeights)
    if (!parcels) {
      setActionError(
        vi
          ? 'Nhập cân từng kiện từ 0,001 đến 100 kg.'
          : 'Enter each parcel weight from 0.001 to 100 kg.',
      )
      return
    }
    for (const parcel of plan.parcels) {
      const info = boxSources?.parcels.find((row) => row.parcelNo === parcel.parcelNo)
      const value = boxSourceInputs[parcel.parcelNo] ?? { source: 'auto' as const }
      const message = boxSourceError(value, info, vi)
      if (message) {
        setActionError(`#${String(parcel.parcelNo)}: ${message}`)
        return
      }
    }
    const photoOf = (no: number): string[] => quickSealPhotos[`${plan.id}:${String(no)}`] ?? []
    if (requireSealPhoto) {
      const missing = parcels.filter((row) => photoOf(row.parcel_no).length === 0).map((row) => `#${String(row.parcel_no)}`)
      if (missing.length > 0) {
        setActionError(vi ? `Chụp ít nhất 1 ảnh cho kiện ${missing.join(', ')}.` : `Take a photo of parcel ${missing.join(', ')}.`)
        return
      }
    }
    const parcelsWithSource = parcels.map((row) => ({
      ...row,
      ...(photoOf(row.parcel_no).length > 0 ? { photo_urls: photoOf(row.parcel_no) } : {}),
      ...(boxSourceBody(boxSourceInputs[row.parcel_no]) as {
        box_source?: string
        box_source_reason?: string
        box_source_note?: string
      }),
    }))
    if (group.packScanRequired) {
      setActionError(quickPackBlockedCopy(group, vi))
      return
    }
    setActionBusy(true)
    setActionError(null)
    try {
      const result = await packPlan(group.id, plan.version, parcelsWithSource)
      showToast(
        result.completed
          ? vi
            ? 'Đã xác nhận đóng gói xong — nhóm chuyển sang packed.'
            : 'Confirmed packed — group is now packed.'
          : vi
            ? 'Đã gửi cân. Còn kiện lệch cân, nhóm chưa packed.'
            : 'Weights saved. A parcel is held, so the group is not packed yet.',
      )
      setGuide3dActive(false)
      await refreshAfterAction()
      await loadBoxStock()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        setActionError(
          vi
            ? 'Không có quyền pack. Kiểm tra role PACKAGING_STAFF trên BE.'
            : 'No pack permission. Check PACKAGING_STAFF role on BE.',
        )
      } else if (getApiErrorCode(err) === 'ORD_GROUP_ALL_ORDERS_CANCELED') {
        setActionError(
          vi
            ? 'Nhóm không còn đơn để đóng gói (đã hủy / sự cố).'
            : 'No active orders left to pack (canceled / exception).',
        )
      } else if (getApiErrorCode(err) === 'PACKING_SCAN_REQUIRED') {
        setActionError(formatApiError(err))
      } else {
        reloadPlanAfterConflict(err)
      }
    } finally {
      setActionBusy(false)
    }
  }

  async function onConfirmPacked(): Promise<void> {
    if (!group || group.fulfillmentStatus !== 'approved_for_packing') return
    await submitPack()
  }

  async function onRecompute(): Promise<void> {
    if (!group || !plan) return
    setRecomputing(true)
    setActionError(null)
    try {
      const next = await recomputePackingPlan(group.id, plan.version)
      setPlan((current) => retainProfileStale(current, next))
      showToast(vi ? 'Đã gửi tính lại kế hoạch.' : 'Recompute requested.')
      await refreshAfterAction()
    } catch (err: unknown) {
      reloadPlanAfterConflict(err)
    } finally {
      setRecomputing(false)
    }
  }

  async function onAssign(mode: 'auto' | 'manual', staffId?: string): Promise<void> {
    if (!group) return
    setActionBusy(true)
    setActionError(null)
    try {
      const next = await assignPacker(group.id, mode, staffId)
      setPlan((current) => retainProfileStale(current, next))
      setToast(vi ? 'Đã gán người đóng gói.' : 'Packer assigned.')
      // Cột "Người đóng" ở hàng chờ + số việc trong dropdown lấy từ danh sách — tải lại.
      void loadList()
      void listPackingStaff()
        .then(setStaff)
        .catch(() => undefined)
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  /** Packaging Staff tự nhận kế hoạch đang giao cho người khác / chưa giao. */
  async function onClaim(): Promise<void> {
    if (!group || !myUserId) return
    setActionBusy(true)
    setActionError(null)
    try {
      const next = await assignPacker(group.id, 'manual', myUserId)
      setPlan((current) => retainProfileStale(current, next))
      setToast(vi ? 'Đã nhận việc đóng gói nhóm này.' : 'You now own this packing job.')
      void loadList()
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  async function onWriteGuide(): Promise<void> {
    if (!group || !plan || plan.parcels.length === 0) return
    const no = parcelNo ?? plan.parcels[0]?.parcelNo
    if (no == null) return
    setActionBusy(true)
    setActionError(null)
    try {
      const next = await requestParcelGuide(group.id, no, true)
      setPlan((current) => retainProfileStale(current, next))
      setToast(vi ? 'Đã lấy hướng dẫn.' : 'Guide ready.')
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  async function onDecidePartial(approve: boolean): Promise<void> {
    if (!group) return
    setActionBusy(true)
    setActionError(null)
    try {
      await decidePartialOrderGroup(group.id, {
        approve,
        expected_version: group.version,
      })
      showToast(
        approve
          ? vi
            ? 'Đã giao phần có sẵn.'
            : 'Shipped available items.'
          : vi
            ? 'Đã hủy — nhóm về awaiting_packaging.'
            : 'Cancelled — group back to awaiting_packaging.',
      )
      await refreshAfterAction()
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  const empty = emptyCopy(tab, vi, {
    awaiting: counts.awaiting,
    picked: counts.picked,
  })
  const canApprove =
    tab === 'pending_approval' &&
    Boolean(plan) &&
    group?.fulfillmentStatus === 'pending_approval'
  const isViewOnlyTab = tab === 'awaiting_packaging' || tab === 'blocked'
  const scanLocked = requireScan || Boolean(group?.packScanRequired)
  const queueTabs = useMemo(
    () =>
      [
        [
          'picked',
          vi ? 'Đã lấy hàng' : 'Picked',
          counts.picked,
          false,
        ],
        [
          'pending_approval',
          vi ? 'Chờ chấp nhận kế hoạch' : 'Pending plan',
          counts.pending,
          false,
        ],
        [
          'blocked',
          vi ? 'Kẹt — SKU chưa đo' : 'Blocked — unmeasured SKU',
          counts.blocked,
          true,
        ],
        [
          'partial_needs_review',
          vi ? 'Thiếu hàng' : 'Shortage',
          counts.partial,
          false,
        ],
        [
          'approved_for_packing',
          vi ? 'Đã duyệt — đóng gói' : 'Approved — pack',
          counts.approved,
          false,
        ],
        [
          'awaiting_packaging',
          vi ? 'Kho đang lấy' : 'In warehouse',
          counts.awaiting,
          true,
        ],
      ] as const,
    [
      vi,
      counts.picked,
      counts.pending,
      counts.blocked,
      counts.partial,
      counts.approved,
      counts.awaiting,
    ],
  )

  const queuePaging = useLocalQueuePagination(visibleGroups)

  const overParcelLimit = plan?.orders.some((order) => order.overParcelLimit) ?? false

  function parcelWeightFields(): ReactNode {
    if (!plan || plan.parcels.length === 0) return null
    const layout = groupParcelsByOrder(plan.parcels)
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-ink-muted">
          {vi ? 'Cân từng kiện (kg)' : 'Weight per parcel (kg)'}
        </p>
        {layout.groups.map((bucket) => (
          <div key={bucket.key} className="space-y-2">
            {layout.multi ? (
              <p className="text-[11px] font-semibold text-ink">
                {parcelOrderHeading(bucket, vi)}
              </p>
            ) : null}
            {bucket.parcels.map((parcel) => {
              const caption = parcelOrderCaption(parcel, vi)
              return (
          <div
            key={parcel.parcelNo}
            className={`space-y-1.5 ${parcelBorderClass(parcel.recipientName, layout.multi)} pl-2`}
          >
            <label className="flex items-center gap-2 text-sm text-ink">
              <span className="w-28 font-mono text-xs">
                #{String(parcel.parcelNo)} {parcel.box.code}
              </span>
              <input
                type="number"
                min={0.001}
                max={100}
                step="0.001"
                value={parcelWeights[parcel.parcelNo] ?? ''}
                onChange={(event) =>
                  setParcelWeights((prev) => ({
                    ...prev,
                    [parcel.parcelNo]: event.target.value,
                  }))
                }
                className="w-28 rounded-lg border border-hairline bg-canvas px-2 py-1.5"
              />
              <span className="text-xs text-ink-muted">kg</span>
            </label>
            {caption ? (
              <p className="pl-1 text-[11px] text-ink-muted">{caption}</p>
            ) : null}
            <SharedParcelOrders parcel={parcel} orders={plan.orders} vi={vi} />
            <BoxSourceFields
              vi={vi}
              info={boxSources?.parcels.find((row) => row.parcelNo === parcel.parcelNo)}
              value={boxSourceInputs[parcel.parcelNo] ?? { source: 'auto' }}
              onChange={(next) =>
                setBoxSourceInputs((prev) => ({ ...prev, [parcel.parcelNo]: next }))
              }
            />
            <SealPhotoPicker
              vi={vi}
              required={requireSealPhoto}
              value={quickSealPhotos[`${plan.id}:${String(parcel.parcelNo)}`] ?? []}
              onChange={(urls) =>
                setQuickSealPhotos((prev) => ({ ...prev, [`${plan.id}:${String(parcel.parcelNo)}`]: urls }))
              }
            />
          </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[112rem] flex-col gap-4">
      {/* Breadcrumb đã ghi "Đóng gói" — tiêu đề chỉ giữ cho trình đọc màn hình. */}
      <h1 className="sr-only">{vi ? 'Đóng gói' : 'Packing'}</h1>
      <div className="pack-tabs-row">
        <nav className="pack-tabs" aria-label={vi ? 'Hàng đợi đóng gói' : 'Packing queues'}>
          {queueTabs.map(([key, label, count, viewOnly]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              title={viewOnly ? (vi ? 'Chỉ xem' : 'View only') : undefined}
            >
              {viewOnly ? <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              {label}
              <span className={`pack-tab-count${count === 0 ? ' is-zero' : ''}`}>{String(count)}</span>
              {viewOnly ? <span className="sr-only">{vi ? ' (chỉ xem)' : ' (view only)'}</span> : null}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => void loadList()}
          title={vi ? 'Tải lại' : 'Refresh'}
          className="pack-tabs-refresh"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          <span className="pack-tabs-refresh-label">{vi ? 'Tải lại' : 'Refresh'}</span>
        </button>
      </div>

      <div className="pack-bench">
        <section className="pack-bench-col">
          <div className="pack-bench-head">
            <div className="min-w-0 flex-1">
              <h2>{vi ? 'Hàng đợi' : 'Queue'}</h2>
              {isViewOnlyTab ? (
                <p className="pack-bench-viewonly">
                  {vi ? 'Chỉ xem' : 'View only'}
                </p>
              ) : null}
              <label className="relative mt-2 block">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                  <input
                    type="search"
                    value={queueQuery}
                    onChange={(event) => setQueueQuery(event.target.value)}
                    placeholder={vi ? 'Tìm mã đơn…' : 'Search order…'}
                    aria-label={vi ? 'Tìm mã đơn' : 'Search order'}
                    className="h-8 w-full rounded-lg border border-hairline bg-canvas pl-7 pr-2 text-xs text-ink"
                  />
                  {remoteSearching ? (
                    <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ink-subtle" />
                  ) : null}
                </label>
              {isPackagingStaff ? (
                <div
                  role="group"
                  aria-label={vi ? 'Phạm vi hàng chờ' : 'Queue scope'}
                  className="mt-2 inline-flex rounded-lg border border-hairline bg-surface p-0.5 text-[11px]"
                >
                  {(['mine', 'all'] as const).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setQueueScope(scope)}
                      aria-pressed={queueScope === scope}
                      className={`rounded-md px-2.5 py-1 font-medium ${
                        queueScope === scope ? 'bg-primary text-white' : 'text-ink'
                      }`}
                    >
                      {scope === 'mine'
                        ? vi
                          ? 'Việc của tôi'
                          : 'My jobs'
                        : vi
                          ? 'Tất cả'
                          : 'All'}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <span className="pack-bench-count">{String(visibleGroups.length)}</span>
          </div>
          <div className="pack-bench-scroll">
            {listLoading ? (
              <div className="flex items-center gap-2 p-3 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {vi ? 'Đang tải…' : 'Loading…'}
              </div>
            ) : listError ? (
              <p className="p-3 text-sm text-rose-600">{listError}</p>
            ) : groups.length === 0 ? (
              <div className="space-y-1 p-3">
                <p className="text-sm font-medium text-ink">{empty.title}</p>
                <p className="text-xs leading-relaxed text-ink-subtle">
                  {empty.body}
                </p>
              </div>
            ) : visibleGroups.length === 0 ? (
              <p className="p-3 text-sm text-ink-muted">
                {vi
                  ? `Không có đơn khớp «${queueQuery.trim()}».`
                  : `No order matches “${queueQuery.trim()}”.`}
              </p>
            ) : (
              <ul>
                {queuePaging.pagedItems.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(g.id)}
                      className="pack-queue-item"
                      aria-current={selectedId === g.id ? 'true' : undefined}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[13px] font-semibold text-ink">
                          {g.id.slice(-8)}
                        </span>
                        {g.orderPriority === 'express' ? (
                          <span className="rounded bg-amber-100 px-1.5 py-px text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                            {vi ? 'Hỏa tốc' : 'Express'}
                          </span>
                        ) : (
                          <span className="text-xs capitalize text-ink-subtle">{g.platform}</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xs">
                        <span
                          aria-hidden
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                            g.assignedPackerName
                              ? 'bg-primary/12 text-primary'
                              : 'border border-dashed border-ink-subtle/50 text-ink-subtle'
                          }`}
                        >
                          {g.assignedPackerName ? g.assignedPackerName.trim().charAt(0).toUpperCase() : ''}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate ${g.assignedPackerName ? 'text-ink-muted' : 'italic text-ink-subtle'}`}
                        >
                          {g.assignedPackerName ?? (vi ? 'Chưa giao' : 'Unassigned')}
                          {myUserId && g.assignedPackerId === myUserId ? (
                            <span className="font-semibold not-italic text-primary">{vi ? ' (bạn)' : ' (you)'}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-ink-subtle">
                          {g.activeOrderCount === g.orderCount
                            ? String(g.orderCount)
                            : `${String(g.activeOrderCount)}/${String(g.orderCount)}`}{' '}
                          {vi ? 'đơn' : 'ord'}
                          {summaries[g.id] ? ` · ${String(summaries[g.id]?.parcels ?? 0)} ${vi ? 'kiện' : 'pcl'}` : null}
                        </span>
                      </div>
                      {g.orderPriority === 'express' ? (
                        <p className="mt-1 text-xs">
                          <span className="capitalize text-ink-subtle">{g.platform} · </span>
                          <ExpressRemain group={g} nowMs={nowMs} vi={vi} />
                        </p>
                      ) : null}
                      {isPartiallyCanceledGroup(g) ? (
                        <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          {vi ? 'Một phần đơn đã hủy' : 'Partially canceled'}
                        </p>
                      ) : null}
                      {g.packingBlocked?.skus.length ? (
                        <p className="mt-1 truncate text-xs font-medium text-rose-700 dark:text-rose-300">
                          {vi ? 'Chưa đo: ' : 'Unmeasured: '}
                          {g.packingBlocked.skus.join(', ')}
                        </p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!listLoading && !listError && visibleGroups.length > 0 ? (
            <QueuePaginationBar
              vi={vi}
              variant="pack"
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

        <section className="pack-bench-col pack-bench-detail">
          <div className="pack-bench-head">
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2">
                {group && group.id === selectedId ? (
                  <>
                    <span>
                      <span className="capitalize">{group.platform}</span>{' '}
                      <span className="font-mono" title={group.id}>
                        #{group.id.slice(-8)}
                      </span>
                    </span>
                    {group.orderPriority === 'express' ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                        {vi ? 'Hỏa tốc' : 'Express'}
                      </span>
                    ) : null}
                    {expressClock(group, nowMs, vi) ? (
                      <ExpressRemain group={group} nowMs={nowMs} vi={vi} className="text-[11px]" />
                    ) : group.isOverdue ? (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-100">
                        <AlertTriangle className="h-3 w-3" />
                        {vi ? 'Quá hạn' : 'Overdue'}
                      </span>
                    ) : null}
                  </>
                ) : selectedId ? (
                  <span className="font-mono">{selectedId.slice(-8)}</span>
                ) : vi ? (
                  'Chưa chọn nhóm'
                ) : (
                  'No group selected'
                )}
              </h2>
            </div>
          </div>
          <div className="pack-bench-scroll pb-12">
          {!selectedId ? (
            <div className="space-y-2">
              {isViewOnlyTab ? (
                <>
                  <p className="text-sm font-medium text-ink">
                    {tab === 'blocked'
                      ? vi
                        ? 'Chỉ xem — chờ kho đo hồ sơ SKU'
                        : 'View-only — waiting for SKU measurements'
                      : vi
                        ? 'Chỉ xem — kho đang lấy hàng'
                        : 'View-only — warehouse is picking'}
                  </p>
                  <p className="text-sm text-ink-subtle">
                    {groups.length === 0
                      ? empty.body
                      : vi
                        ? tab === 'blocked'
                          ? `${String(groups.length)} nhóm kẹt vì SKU chưa đo. Chọn một dòng để xem SKU nào cần đo.`
                          : `${String(groups.length)} nhóm kho đang lấy. Chọn một dòng nếu cần xem — bạn không thao tác được tại đây.`
                        : tab === 'blocked'
                          ? `${String(groups.length)} group(s) blocked by unmeasured SKUs. Select a row to see which.`
                          : `${String(groups.length)} group(s) in pick. Select a row to inspect — you cannot act here.`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-ink-subtle">
                  {groups.length === 0
                    ? empty.body
                    : vi
                      ? 'Chọn một nhóm đơn bên trái.'
                      : 'Select a group on the left.'}
                </p>
              )}
            </div>
          ) : detailLoading ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {vi ? 'Đang tải chi tiết…' : 'Loading detail…'}
            </div>
          ) : detailError ? (
            <p className="text-sm text-rose-600">{detailError}</p>
          ) : group ? (
            <div className="space-y-5">
              {/* Trạng thái trùng tên tab thì bỏ; chỉ hiện khi khác (vd nhóm đang đóng trong tab Đã duyệt). */}
              {group.fulfillmentStatus !== tab ||
              group.packagingDeadline ||
              group.deliveryDeadline ||
              group.requiresSelfDelivery ? (
              <div>
                <dl className="pack-facts">
                  {group.fulfillmentStatus !== tab ? (
                    <div>
                      <dt className="text-ink-subtle">
                        {vi ? 'Trạng thái' : 'Status'}
                      </dt>
                      <dd>
                        <Badge tone={groupStatusTone(group.fulfillmentStatus)}>
                          {statusLabel(group.fulfillmentStatus, vi)}
                        </Badge>
                      </dd>
                    </div>
                  ) : null}
                  {group.packagingDeadline ? (
                    <div>
                      <dt className="text-ink-subtle">
                        {vi ? 'Hạn đóng gói' : 'Deadline'}
                      </dt>
                      <dd className="text-ink">{formatDateTime(group.packagingDeadline)}</dd>
                    </div>
                  ) : null}
                  {group.deliveryDeadline ? (
                    <div>
                      <dt className="text-ink-subtle">
                        {vi ? 'Hạn giao khách' : 'Delivery deadline'}
                      </dt>
                      <dd className="text-ink">
                        {formatDateTime(group.deliveryDeadline)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {group.requiresSelfDelivery ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    {vi
                      ? 'Shop tự giao — không tạo vận đơn hãng ở bước đóng gói.'
                      : 'Shop delivers this order itself — no carrier booking at pack time.'}
                  </p>
                ) : null}
              </div>
              ) : null}

              {canAssign &&
              plan &&
              ['ready', 'approved', 'packing'].includes(plan.status) &&
              (group.fulfillmentStatus === 'pending_approval' ||
                group.fulfillmentStatus === 'approved_for_packing') ? (
                <div className="flex items-end justify-between gap-3 border-b border-hairline pb-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-subtle">{vi ? 'Người đóng gói' : 'Packer'}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={actionBusy}
                        className="-ml-2 mt-0.5 inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 data-[state=open]:bg-surface-2"
                      >
                        <span
                          aria-hidden
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            plan.session?.assignedPackerId
                              ? 'bg-primary/15 text-primary'
                              : 'border border-dashed border-hairline text-ink-subtle'
                          }`}
                        >
                          {(plan.session?.assignedPackerName ?? '?').trim().charAt(0).toUpperCase() || '?'}
                        </span>
                        <span className="truncate">
                          {plan.session?.assignedPackerName ??
                            (plan.session?.assignedPackerId
                              ? plan.session.assignedPackerId.slice(-6)
                              : vi
                                ? 'Chưa giao'
                                : 'Unassigned')}
                          {myUserId && plan.session?.assignedPackerId === myUserId ? (
                            <span className="font-normal text-primary">{vi ? ' (bạn)' : ' (you)'}</span>
                          ) : null}
                        </span>
                        {actionBusy ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-muted" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64 rounded-xl p-1.5">
                        <DropdownMenuItem
                          onSelect={() => void onAssign('auto')}
                          className="cursor-pointer gap-2.5 rounded-lg py-2"
                        >
                          <Shuffle className="h-4 w-4 text-primary" />
                          <span className="flex flex-col">
                            <span className="font-medium">{vi ? 'Tự gán' : 'Auto-assign'}</span>
                            <span className="text-xs text-slate-500">
                              {vi ? 'Giao cho người ít việc nhất' : 'Least busy packer'}
                            </span>
                          </span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-xs font-medium text-slate-500">
                          {vi ? 'Nhân viên đóng gói' : 'Packing staff'}
                        </DropdownMenuLabel>
                        {staff.length === 0 ? (
                          <p className="px-2 py-1.5 text-xs text-slate-500">
                            {vi ? 'Chưa có nhân viên đóng gói.' : 'No packing staff.'}
                          </p>
                        ) : null}
                        {staff.map((person) => {
                          const current = person.staffId === plan.session?.assignedPackerId
                          return (
                            <DropdownMenuItem
                              key={person.staffId}
                              disabled={Boolean(person.onLeave) || current}
                              onSelect={() => void onAssign('manual', person.staffId)}
                              className="cursor-pointer gap-2.5 rounded-lg py-2 data-[disabled]:opacity-100"
                            >
                              <span
                                aria-hidden
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                  person.onLeave ? 'bg-slate-100 text-slate-400' : 'bg-primary/10 text-primary'
                                }`}
                              >
                                {person.fullName.trim().charAt(0).toUpperCase()}
                              </span>
                              <span className={`min-w-0 flex-1 truncate ${person.onLeave ? 'text-slate-400' : ''}`}>
                                {person.fullName}
                              </span>
                              {current ? (
                                <Check className="h-4 w-4 text-primary" aria-label={vi ? 'Đang giao' : 'Assigned'} />
                              ) : (
                                <span className="text-xs tabular-nums text-slate-500">
                                  {person.onLeave
                                    ? vi
                                      ? 'nghỉ phép'
                                      : 'on leave'
                                    : vi
                                      ? `${String(person.activeWorkload)} việc`
                                      : `${String(person.activeWorkload)} jobs`}
                                </span>
                              )}
                            </DropdownMenuItem>
                          )
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {isPackagingStaff && myUserId && plan.session?.assignedPackerId !== myUserId ? (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void onClaim()}
                      className="shrink-0 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-primary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                    >
                      {vi ? 'Giao cho tôi' : 'Assign to me'}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {tab === 'awaiting_packaging' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">
                    {vi
                      ? 'Kho đang lấy đơn này. Packaging Staff chỉ xem — không thao tác.'
                      : 'Warehouse is picking this group. Packaging Staff view-only.'}
                  </p>
                </div>
              ) : null}

              {tab === 'blocked' ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                  <p className="font-medium">
                    {group?.packingBlocked?.reason === 'missing_product_master'
                      ? vi
                        ? 'Không tính được kế hoạch vì SKU chưa có trên Product Master.'
                        : 'Plan cannot be computed because the SKU is missing from Product Master.'
                      : vi
                        ? 'Không tính được kế hoạch vì SKU chưa đo hồ sơ đóng gói.'
                        : 'Plan cannot be computed because SKU packaging profiles are missing.'}
                  </p>
                  {(group?.packingBlocked?.skus ?? []).length > 0 ? (
                    <p className="mt-2 font-mono text-xs">
                      {(group?.packingBlocked?.skus ?? []).join(', ')}
                    </p>
                  ) : null}
                  {session?.role === UserRole.ADMIN ? (
                    <Link
                      to="/app/admin/warehouse"
                      className="mt-3 inline-block text-sm font-medium underline"
                    >
                      {vi ? 'Mở hồ sơ kho / SKU' : 'Open warehouse / SKU profiles'}
                    </Link>
                  ) : (
                    <p className="mt-2 text-xs">
                      {vi
                        ? 'Nhờ Admin hoặc kho đo hồ sơ SKU rồi tính lại kế hoạch.'
                        : 'Ask Admin or warehouse to measure the SKU profile, then recompute.'}
                    </p>
                  )}
                </div>
              ) : null}

              {tab === 'approved_for_packing' ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                  <p className="font-medium">
                    {vi
                      ? 'Đã chấp nhận kế hoạch. Xem hướng dẫn 3D bên cạnh, đóng gói xong rồi bấm xác nhận.'
                      : 'Plan accepted. Follow the 3D guide, then confirm when packing is done.'}
                  </p>
                  {canAssign &&
                  plan &&
                  (plan.status === 'packing' || plan.status === 'approved') ? (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void onUndoApprove()}
                      className="mt-3 inline-flex items-center rounded-lg border border-emerald-800/30 bg-white px-3 py-2 text-sm font-medium text-emerald-950 disabled:opacity-50 dark:bg-transparent dark:text-emerald-100"
                    >
                      {vi ? 'Quay lại chờ duyệt' : 'Return to pending approval'}
                    </button>
                  ) : null}
                  {group?.fulfillmentStatus === 'approved_for_packing' ? (
                    <>
                      {plan &&
                      (plan.status === 'approved' || plan.status === 'packing') ? (
                        <PackingSessionPanel
                          groupId={group.id}
                          plan={plan}
                          boxes={boxStock.map((row) => ({ code: row.code, name: row.name }))}
                          vi={vi}
                          requireSealPhoto={requireSealPhoto}
                          onPlan={(next) => {
                            setPlan((current) => retainProfileStale(current, next))
                            setParcelWeights(weightPrefill(next))
                          }}
                          onError={(err) => reloadPlanAfterConflict(err)}
                        />
                      ) : null}
                      {scanLocked ? (
                        <p className="mt-3 text-xs text-ink-muted">
                          {group?.packScanRequired
                            ? quickPackBlockedCopy(group, vi)
                            : vi
                              ? 'Cài đặt đang bắt buộc quét từng món. Dùng phiên đóng gói phía trên, không bấm đóng nhanh.'
                              : 'Scan is required. Use the packing session above.'}
                        </p>
                      ) : (
                        <>
                          {parcelWeightFields()}
                          <button
                            type="button"
                            disabled={actionBusy || Boolean(group?.packScanRequired)}
                            onClick={() => void onConfirmPacked()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            {actionBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Package className="h-4 w-4" />
                            )}
                            {vi ? 'Xác nhận đã đóng gói' : 'Confirm packed'}
                          </button>
                        </>
                      )}
                    </>
                  ) : null}
                  {actionError && tab === 'approved_for_packing' ? (
                    <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
                      {actionError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {tab === 'partial_needs_review' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                    {vi
                      ? 'Warehouse đã báo thiếu hàng. Chọn tiếp tục với phần còn lại hoặc hủy làm lại.'
                      : 'Warehouse reported missing items. Continue with available stock or cancel to restart.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void onDecidePartial(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {vi ? 'Giao phần có sẵn' : 'Ship available items'}
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void onDecidePartial(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      {vi ? 'Hủy làm lại' : 'Cancel & restart'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-amber-900 dark:text-amber-200">
                    {vi
                      ? 'Đơn AURELLE thiếu hàng sẽ được báo giao thiếu (short_shipped) về website.'
                      : 'Short AURELLE orders are reported as short_shipped to the website.'}
                  </p>
                </div>
              ) : null}

              {packOrders.length > 0 ? (
                <section aria-labelledby="pack-items-head">
                  <h3 id="pack-items-head" className="text-sm font-semibold text-ink">
                    {vi ? 'Hàng cần đóng' : 'Items to pack'}{' '}
                    <span className="font-normal text-ink-subtle">
                      ({String(packOrders.reduce((n, o) => n + o.items.reduce((m, it) => m + it.quantity, 0), 0))})
                    </span>
                  </h3>
                  <div className="mt-2 divide-y divide-hairline rounded-lg border border-hairline">
                    {packOrders.map((order) => (
                      <div key={order.id} className="px-3 py-2">
                        {packOrders.length > 1 ? (
                          <p className="mb-1 text-xs text-ink-subtle">
                            {order.platformOrderId} · {order.recipientName}
                          </p>
                        ) : null}
                        <ul className="space-y-1">
                          {order.items.map((item, idx) => (
                            <li key={`${item.sku}-${String(idx)}`} className="flex items-baseline gap-3 text-sm">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-ink" title={item.name}>
                                  {item.name}
                                </span>
                                <span className="font-mono text-xs text-ink-muted">{item.sku}</span>
                              </span>
                              <span className="shrink-0 font-semibold tabular-nums text-ink">
                                ×{String(item.quantity)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {tab !== 'partial_needs_review' && tab !== 'awaiting_packaging' ? (
                <>
                  <section>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">
                        {vi ? 'Kế hoạch đóng gói' : 'Packing plan'}
                        {plan ? (
                          <span className="ml-2 text-xs font-normal text-ink-subtle">
                            {planStatusLabel(plan.status, vi)} · {String(plan.totals.parcels)}{' '}
                            {vi ? 'kiện' : 'parcels'}
                          </span>
                        ) : null}
                      </h3>
                      {canApprove ? (
                        <div className="flex items-center gap-2">
                        {/* Thiếu số đo/danh mục cũ đã có nút riêng trong cảnh báo bên dưới. */}
                        {plan && !plan.profileStale && !plan.catalogStale ? (
                          <button
                            type="button"
                            disabled={recomputing || actionBusy}
                            onClick={() => void onRecompute()}
                            title={vi ? 'Tính lại với danh mục thùng và tồn kho hiện tại' : 'Recompute with the current box catalog and stock'}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${recomputing ? 'animate-spin' : ''}`} aria-hidden />
                            {recomputing ? (vi ? 'Đang tính…' : 'Computing…') : vi ? 'Tính lại' : 'Recompute'}
                          </button>
                        ) : null}
                        {plan ? (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => {
                              setActionError(null)
                              setPlanDialog('adjust')
                            }}
                            className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                          >
                            {vi ? 'Đổi thùng' : 'Change box'}
                          </button>
                        ) : null}
                        </div>
                      ) : null}
                    </div>
                    {!plan ? (
                      <p className="mt-2 text-sm text-ink-subtle">
                        {vi
                          ? 'Chưa có kế hoạch. Hệ thống tự tính sau khi lấy hàng xong, có kế hoạch mới duyệt được.'
                          : 'No plan yet. It is computed after picking finishes. Cannot approve without one.'}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-3 text-sm">
                        {plan.failureReason ? (
                          <p className="text-xs text-rose-700 dark:text-rose-300">
                            {plan.failureReason}
                          </p>
                        ) : null}
                        {plan.profileStale ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs text-amber-800 dark:text-amber-200">
                              {vi
                                ? 'Hồ sơ SKU đã được đo lại sau khi tính kế hoạch. Số đo trên kế hoạch này có thể cũ.'
                                : 'A SKU profile was remeasured after this plan was calculated. Sizes on this plan may be out of date.'}
                            </p>
                            <button
                              type="button"
                              disabled={recomputing || actionBusy}
                              onClick={() => void onRecompute()}
                              className="rounded-lg border border-amber-700/40 bg-white px-2 py-1 text-xs font-medium text-amber-950 disabled:opacity-50 dark:bg-transparent dark:text-amber-100"
                            >
                              {recomputing
                                ? vi
                                  ? 'Đang tính lại…'
                                  : 'Recomputing…'
                                : vi
                                  ? 'Tính lại kế hoạch'
                                  : 'Recompute plan'}
                            </button>
                          </div>
                        ) : null}
                        {plan.catalogStale ? (
                          <div className="space-y-1.5 rounded-lg border border-amber-700/30 bg-amber-50 p-2 dark:bg-amber-950/20">
                            <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                              {vi
                                ? 'Danh mục thùng/vật tư đã đổi sau khi tính kế hoạch.'
                                : 'The box/material catalog changed after this plan was calculated.'}
                            </p>
                            {(plan.catalogChanges ?? []).length > 0 ? (
                              <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-900 dark:text-amber-100">
                                {(plan.catalogChanges ?? []).map((change) => (
                                  <li key={change}>{change}</li>
                                ))}
                              </ul>
                            ) : null}
                            <button
                              type="button"
                              disabled={recomputing || actionBusy}
                              onClick={() => void onRecompute()}
                              className="rounded-lg border border-amber-700/40 bg-white px-2 py-1 text-xs font-medium text-amber-950 disabled:opacity-50 dark:bg-transparent dark:text-amber-100"
                            >
                              {recomputing
                                ? vi
                                  ? 'Đang tính lại…'
                                  : 'Recomputing…'
                                : vi
                                  ? 'Tính lại kế hoạch'
                                  : 'Recompute plan'}
                            </button>
                          </div>
                        ) : null}
                        <ul className="space-y-2">
                          {groupParcelsByOrder(plan.parcels).groups.flatMap((bucket) => {
                            const layout = groupParcelsByOrder(plan.parcels)
                            const heading = layout.multi ? (
                              <li
                                key={`head-${bucket.key}`}
                                className="px-1 text-[11px] font-semibold text-ink"
                              >
                                {parcelOrderHeading(bucket, vi)}
                              </li>
                            ) : null
                            const rows = bucket.parcels.map((parcel) => {
                            const size = outerCm(parcel.box)
                            const caption = parcelOrderCaption(parcel, vi)
                            return (
                              <li
                                key={parcel.parcelNo}
                                className={`rounded-lg border border-hairline px-3 py-2 ${parcelBorderClass(parcel.recipientName, layout.multi)}`}
                              >
                                <p className="font-medium text-ink">
                                  #{String(parcel.parcelNo)} {parcel.box.name}{' '}
                                  <span className="font-mono text-xs text-ink-muted">
                                    {parcel.box.code}
                                  </span>
                                  <MailerBadge parcel={parcel} vi={vi} />
                                </p>
                                {caption ? (
                                  <p className="text-xs text-ink-muted">{caption}</p>
                                ) : null}
                                <p className="text-xs tabular-nums text-ink-muted">
                                  {formatDimsCm(size.lengthCm, size.widthCm, size.heightCm)}
                                  {boxCutNote(parcel.box, vi)}
                                  {' · '}
                                  {formatGAsKg(parcel.estimatedWeightG)}
                                  {parcel.shippingCostVnd != null
                                    ? ` · ${formatCurrency(parcel.shippingCostVnd)}`
                                    : ''}
                                </p>
                                <SharedParcelOrders parcel={parcel} orders={plan.orders} vi={vi} />
                                <MaterialTags materials={parcel.materials} />
                              </li>
                            )
                            })
                            return heading ? [heading, ...rows] : rows
                          })}
                        </ul>
                      </div>
                    )}
                    <details className="mt-3 border-t border-hairline pt-3">
                      <summary className="cursor-pointer text-xs font-medium text-ink-muted hover:text-ink">
                        {vi ? 'Tồn thùng' : 'Box stock'}
                      </summary>
                      {boxStockError ? (
                        <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                          {boxStockError}
                        </p>
                      ) : boxStock.length === 0 ? (
                        <p className="mt-1 text-xs text-ink-subtle">
                          {vi
                            ? 'Chưa có thùng trong danh mục vật liệu.'
                            : 'No boxes in the material catalog.'}
                        </p>
                      ) : (
                        <table className="mt-1.5 w-full border-collapse text-xs">
                          <thead>
                            <tr className="text-left text-[11px] text-ink-subtle">
                              <th scope="col" className="py-1 pr-2 font-normal">{vi ? 'Thùng' : 'Box'}</th>
                              <th scope="col" className="py-1 pl-2 text-right font-normal">{vi ? 'Mới' : 'New'}</th>
                              <th scope="col" className="whitespace-nowrap py-1 pl-2 text-right font-normal">{vi ? 'Tái dùng' : 'Reused'}</th>
                            </tr>
                          </thead>
                          <tbody className="tabular-nums">
                            {boxStock.map((row) => {
                              const size =
                                row.lengthCm != null &&
                                row.widthCm != null &&
                                row.heightCm != null
                                  ? formatDimsCm(row.lengthCm, row.widthCm, row.heightCm)
                                  : null
                              const suggested = plan?.parcels.some(
                                (parcel) => parcel.box.code === row.code,
                              )
                              return (
                                <tr
                                  key={row.code}
                                  className={`border-t border-hairline ${suggested ? 'text-primary' : 'text-ink'}`}
                                >
                                  <th scope="row" className={`py-1 pr-2 text-left ${suggested ? 'font-semibold' : 'font-normal'}`}>
                                    <span className="block">{row.name}</span>
                                    <span className="block text-[11px] font-normal text-ink-muted">
                                      {size ? <span className="tabular-nums">{size}</span> : null}
                                      {suggested ? (
                                        <span className="font-medium text-primary">
                                          {size ? ' · ' : ''}
                                          {vi ? 'kế hoạch đang dùng' : 'used by plan'}
                                        </span>
                                      ) : null}
                                    </span>
                                  </th>
                                  <td className={`py-1 pl-2 text-right ${row.qtyNew === 0 ? 'text-rose-700 dark:text-rose-300' : ''}`}>
                                    {row.qtyNew}
                                  </td>
                                  <td className="py-1 pl-2 text-right">{row.qtyReused}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </details>
                  </section>

                  {tab === 'picked' &&
                  group.fulfillmentStatus === 'picked' ? (
                    plan?.status === 'rejected' ? (
                      <RejectedPlanPanel
                        key={`${plan.id}-${String(plan.version)}`}
                        groupId={group.id}
                        plan={plan}
                        vi={vi}
                        canAct={canAssign}
                        onPlan={(next) => setPlan((current) => retainProfileStale(current, next))}
                        onDone={(message) => {
                          showToast(message)
                          void refreshAfterAction()
                        }}
                      />
                    ) : (
                      <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-muted">
                        {vi
                          ? 'Kho đã lấy xong — hệ thống đang tính kế hoạch đóng gói. Có kế hoạch nhóm sẽ sang «Chờ chấp nhận kế hoạch».'
                          : 'Picking finished — the packing plan is being computed. The group moves to pending approval when ready.'}
                      </p>
                    )
                  ) : null}

                </>
              ) : null}

              {actionError ? (
                <p className="text-sm text-rose-600">{actionError}</p>
              ) : null}
            </div>
          ) : null}

            {/* Mobile: 3D nằm dưới chi tiết, cuộn theo trang */}
            <div className="mt-5 space-y-2 border-t border-hairline pt-4 lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                {guide3dActive || tab === 'approved_for_packing'
                  ? vi
                    ? 'Hướng dẫn 3D'
                    : '3D packing guide'
                  : vi
                    ? 'Xem trước 3D'
                    : '3D preview'}
              </p>
              <Packing3DBoxViewer
                plan={plan}
                parcelNo={parcelNo}
                onParcelChange={setParcelNo}
                stepIndex={guideStepIndex}
                onStepIndexChange={setGuideStepIndex}
                autoRotate={
                  guide3dActive || tab === 'approved_for_packing'
                }
                onOpenDetail={() => setGuideDetailOpen(true)}
              />
              <MaterialTags materials={selectParcel(plan, parcelNo)?.materials ?? []} />
              <BoxComparisonTable
                comparison={selectParcel(plan, parcelNo)?.boxComparison}
                vi={vi}
                itemCount={selectParcel(plan, parcelNo)?.placements?.length ?? null}
              />
              <button
                type="button"
                onClick={() => setGuideDetailOpen(true)}
                className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
              >
                {vi ? 'Xem chi tiết' : 'View details'}
              </button>
            </div>
          </div>
          {canApprove ? (
            <div className="pack-action-bar">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setRejectOpen(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-300 bg-white px-3.5 py-2.5 text-sm font-medium text-rose-700 disabled:opacity-50 dark:border-rose-800 dark:bg-transparent dark:text-rose-300"
              >
                <XCircle className="h-4 w-4" />
                {vi ? 'Từ chối & gửi Admin' : 'Reject & notify Admin'}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => {
                  // Vượt số kiện cần lý do — ô nhập nằm trong hộp thoại duyệt.
                  if (overParcelLimit) {
                    setActionError(null)
                    setPlanDialog('approve')
                  } else void onApprove()
                }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#152d35] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                {actionBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {vi ? 'Chấp nhận thực hiện' : 'Accept & follow guide'}
              </button>
            </div>
          ) : null}
        </section>

        <aside className="pack-bench-col pack-bench-guide hidden lg:flex">
          <div className="pack-bench-head">
            <h2 className="flex items-baseline gap-2">
              {guide3dActive || tab === 'approved_for_packing'
                ? vi
                  ? 'Hướng dẫn 3D'
                  : '3D packing guide'
                : vi
                  ? 'Xem trước 3D'
                  : '3D preview'}
              <span className="text-xs font-normal text-ink-muted">
                {vi ? 'kéo để xoay' : 'drag to orbit'}
              </span>
            </h2>
          </div>
          {/* 3D ghim trên, danh sách bước cuộn riêng bên dưới: tự cuộn theo bước đang phát không đẩy 3D ra khỏi màn hình. */}
          <div className="flex min-h-0 flex-1 flex-col px-3 pt-3">
            <Packing3DBoxViewer
              showCaption={false}
              plan={plan}
              parcelNo={parcelNo}
              onParcelChange={setParcelNo}
                stepIndex={guideStepIndex}
                onStepIndexChange={setGuideStepIndex}
              autoRotate={
                guide3dActive || tab === 'approved_for_packing'
              }
              className="pack-viewer relative w-full shrink-0 select-none overflow-hidden rounded-xl border border-slate-700 bg-[#24363f]"
              onOpenDetail={() => setGuideDetailOpen(true)}
            />
            {plan && plan.parcels.length > 0 ? (
              <div className="pack-aside-tabs" role="tablist">
                {(
                  [
                    ['guide', vi ? 'Hướng dẫn' : 'Guide'],
                    ['compare', vi ? 'So sánh thùng' : 'Compare boxes'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={asideTab === key}
                    onClick={() => setAsideTab(key)}
                  >
                    {label}
                  </button>
                ))}
                {asideTab === 'guide' ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void onWriteGuide()}
                    className="pack-aside-tabs-action"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${actionBusy ? 'animate-spin' : ''}`} aria-hidden />
                    {guideParcel?.guide ? (vi ? 'Viết lại' : 'Rewrite') : vi ? 'Viết hướng dẫn' : 'Write guide'}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div data-guide-scroll className="pack-guide-scroll min-h-0 flex-1 overflow-y-auto pb-3">
            {asideTab === 'compare' ? (
              selectParcel(plan, parcelNo)?.boxComparison ? (
                <BoxComparisonTable
                  comparison={selectParcel(plan, parcelNo)?.boxComparison}
                  vi={vi}
                  itemCount={selectParcel(plan, parcelNo)?.placements?.length ?? null}
                />
              ) : plan && plan.parcels.length > 0 ? (
                <p className="mt-3 text-xs text-ink-subtle">
                  {vi
                    ? 'Kiện này chưa có bảng so sánh (kiện nhập tay hoặc tính trước 05/11). Chỉnh tay hoặc tính lại để có bảng.'
                    : 'No comparison for this parcel (manual or computed before 05/11).'}
                </p>
              ) : null
            ) : null}
            {asideTab === 'guide' && plan && plan.parcels.length > 0 ? (
              <div className="space-y-3 text-xs text-ink">
                <GuideSteps
                  guide={guideParcel?.guide}
                  parcel={guideParcel}
                  profiles={plan.itemProfiles}
                  activeIndex={guideStepIndex}
                  onSelect={setGuideStepIndex}
                  vi={vi}
                  busy={actionBusy}
                  showHeader={false}
                />
                {guideParcel?.guide && group ? (
                  <GuideRating
                    key={`${String(guideParcel.parcelNo)}:${guideParcel.guide.source}`}
                    groupId={group.id}
                    parcelNo={guideParcel.parcelNo}
                    guide={guideParcel.guide}
                    vi={vi}
                    onPlan={(next) => setPlan((current) => retainProfileStale(current, next))}
                    onToast={setToast}
                  />
                ) : null}
                {guideParcel?.guide && group && session?.role === UserRole.ADMIN ? (
                  <GuideTraceButton groupId={group.id} parcelNo={guideParcel.parcelNo} vi={vi} />
                ) : null}
              </div>
            ) : null}
            </div>
          </div>
        </aside>
      </div>

      {guideDetailOpen && stageEl && plan
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="guide-detail-title"
              className="absolute inset-0 z-[80] flex flex-col overflow-hidden rounded-[inherit] bg-[var(--ls-card-solid,#fff)]"
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                <h3 id="guide-detail-title" className="text-base font-semibold text-slate-900">
                  {vi ? 'Chi tiết hướng dẫn đóng gói' : 'Packing guide details'}
                </h3>
                <button
                  type="button"
                  onClick={() => setGuideDetailOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label={vi ? 'Đóng' : 'Close'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.6fr)_22rem]">
                <div className="min-h-0 bg-[#f8faff] p-3">
                  <Packing3DBoxViewer
                    plan={plan}
                    parcelNo={parcelNo}
                    onParcelChange={setParcelNo}
                stepIndex={guideStepIndex}
                onStepIndexChange={setGuideStepIndex}
                    autoRotate={guide3dActive || tab === 'approved_for_packing'}
                    showCaption={false}
                    className="relative h-full min-h-[280px] w-full select-none overflow-hidden rounded-xl border border-slate-700 bg-[#24363f]"
                  />
                </div>
                <aside data-guide-scroll className="min-h-0 overflow-y-auto border-t border-slate-200 p-5 lg:border-t-0 lg:border-l">
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    {vi ? 'Mô tả' : 'Description'}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {boxViewerLabel(plan, parcelNo, vi)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{boxViewerSub(plan, parcelNo, vi)}</p>
                  <div className="mt-3">
                    <MaterialTags materials={selectParcel(plan, parcelNo)?.materials ?? []} />
                  </div>
                  {(() => {
                    const parcel =
                      plan?.parcels.find((row) => row.parcelNo === parcelNo) ?? plan?.parcels[0]
                    return (
                      <div className="mt-5">
                        <GuideSteps
                          guide={parcel?.guide}
                          parcel={parcel}
                          profiles={plan.itemProfiles}
                          activeIndex={guideStepIndex}
                          onSelect={setGuideStepIndex}
                          vi={vi}
                          busy={actionBusy}
                          onWrite={plan && plan.parcels.length > 0 ? () => void onWriteGuide() : undefined}
                        />
                      </div>
                    )
                  })()}
                </aside>
              </div>
            </div>,
            stageEl,
          )
        : null}

      {planDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => {
            if (!actionBusy) setPlanDialog(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-dialog-title"
            className="w-full max-w-md rounded-xl border border-slate-200/80 bg-white p-5 shadow-lg dark:border-[var(--ls-card-border)] dark:bg-[var(--ls-panel)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="plan-dialog-title" className="text-base font-semibold text-ink">
              {planDialog === 'approve'
                ? vi
                  ? 'Duyệt kế hoạch'
                  : 'Approve plan'
                : vi
                  ? 'Điều chỉnh thùng'
                  : 'Adjust box'}
            </h3>
            {planDialog === 'approve' ? (
              <div className="mt-4 space-y-3">
                {overParcelLimit ? (
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-ink-subtle">
                      {vi
                        ? 'Lý do chấp nhận khi vượt số kiện'
                        : 'Override reason when over the parcel limit'}
                    </span>
                    <input
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-ink"
                    />
                  </label>
                ) : (
                  <p className="text-sm text-ink-muted">
                    {vi
                      ? 'Chấp nhận phương án hiện tại. Không cần điền thêm.'
                      : 'Accept the current plan. Nothing else to fill in.'}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <label className="text-sm">
                  <span className="text-ink-muted">{vi ? 'Kiện' : 'Parcel'}</span>
                  <select
                    value={parcelNo ?? ''}
                    onChange={(event) => setParcelNo(Number(event.target.value))}
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                  >
                    {(plan?.parcels ?? []).map((parcel) => (
                      <option key={parcel.parcelNo} value={parcel.parcelNo}>
                        #{String(parcel.parcelNo)} {parcel.box.code}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-ink-muted">
                    {vi ? 'Thùng trong danh mục' : 'Catalog box'}
                  </span>
                  <select
                    value={boxCode}
                    onChange={(event) => setBoxCode(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                  >
                    <option value="">{vi ? 'Chọn thùng' : 'Choose a box'}</option>
                    {boxStock.map((row) => (
                      <option key={row.code} value={row.code}>
                        {row.name} ({row.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-ink-muted">
                    {vi ? 'Lý do điều chỉnh' : 'Adjustment reason'}
                  </span>
                  <select
                    value={adjustReason}
                    onChange={(event) =>
                      setAdjustReason(event.target.value as AdjustmentReason)
                    }
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                  >
                    {ADJUSTMENT_REASONS.map((key) => (
                      <option key={key} value={key}>
                        {vi
                          ? PACKING_REASON_LABELS[key].vi
                          : PACKING_REASON_LABELS[key].en}
                      </option>
                    ))}
                  </select>
                </label>
                {adjustReason === 'OTHER' ? (
                  <label className="text-sm">
                    <span className="text-ink-muted">{vi ? 'Ghi chú' : 'Note'}</span>
                    <input
                      value={adjustNote}
                      onChange={(event) => setAdjustNote(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                    />
                  </label>
                ) : null}
              </div>
            )}
            {actionError ? (
              <p className="mt-3 text-sm text-rose-600">{actionError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setPlanDialog(null)}
                className="rounded-lg border border-hairline px-3 py-2 text-sm text-ink disabled:opacity-50"
              >
                {vi ? 'Đóng' : 'Close'}
              </button>
              {planDialog === 'approve' ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void onApprove()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#152d35] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {vi ? 'Chấp nhận thực hiện' : 'Accept & follow guide'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void onAdjust()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {vi ? 'Đổi thùng' : 'Change box'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => {
            if (!actionBusy) setRejectOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-plan-title"
            className="w-full max-w-md rounded-xl border border-slate-200/80 bg-white p-5 shadow-lg dark:border-[var(--ls-card-border)] dark:bg-[var(--ls-panel)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="reject-plan-title" className="text-base font-semibold text-ink">
              {vi ? 'Từ chối & gửi Admin' : 'Reject & notify Admin'}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? 'Chọn lý do. Nhóm quay về đã lấy hàng và Admin nhận thông báo.'
                : 'Choose a reason. The group returns to picked and Admin is notified.'}
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-subtle">
                {vi ? 'Lý do từ chối' : 'Rejection reason'}
              </span>
              <select
                value={rejectCode}
                onChange={(event) =>
                  setRejectCode(event.target.value as RejectReason)
                }
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
              >
                {REJECT_REASONS.map((key) => (
                  <option key={key} value={key}>
                    {vi
                      ? PACKING_REASON_LABELS[key].vi
                      : PACKING_REASON_LABELS[key].en}
                  </option>
                ))}
              </select>
            </label>
            {rejectCode === 'OTHER' ? (
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-subtle">
                  {vi ? 'Ghi chú' : 'Note'}
                </span>
                <textarea
                  value={rejectNote}
                  onChange={(event) => setRejectNote(event.target.value)}
                  rows={3}
                  placeholder={
                    vi
                      ? 'Ghi chú bắt buộc khi chọn Khác'
                      : 'Note required when reason is Other'
                  }
                  className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
                />
              </label>
            ) : null}
            {actionError ? (
              <p className="mt-3 text-sm text-rose-600">{actionError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setRejectOpen(false)}
                className="rounded-lg border border-hairline px-3 py-2 text-sm text-ink disabled:opacity-50"
              >
                {vi ? 'Đóng' : 'Close'}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void onReject()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {vi ? 'Gửi từ chối' : 'Send rejection'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={boxConfirm !== null}
        title={vi ? 'Xác nhận thùng' : 'Confirm box'}
        description={
          boxConfirm
            ? vi
              ? `Đổi sang thùng ${boxConfirm.name.trim() || boxConfirm.code} (${boxConfirm.code})?`
              : `Change to box ${boxConfirm.name.trim() || boxConfirm.code} (${boxConfirm.code})?`
            : ''
        }
        confirmLabel={vi ? 'Xác nhận' : 'Confirm'}
        cancelLabel={vi ? 'Hủy' : 'Cancel'}
        loading={actionBusy}
        onCancel={() => {
          if (!actionBusy) setBoxConfirm(null)
        }}
        onConfirm={() => {
          const action = boxConfirm?.action
          setBoxConfirm(null)
          if (action === 'approve') void submitApprove()
          else if (action === 'adjust') void submitAdjust()
        }}
      />

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
