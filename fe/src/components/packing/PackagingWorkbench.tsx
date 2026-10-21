import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../context/use-auth'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Package,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react'
import {
  approvePackingPlan,
  undoApprovePackingPlan,
  assignPacker,
  backToPicking,
  changeParcelBox,
  getPackingPlan,
  getPackingSettings,
  listPackingPlanSummaries,
  listPackingStaff,
  packPlan,
  rejectPackingPlan,
  requestParcelGuide,
} from '../../api/packing-plan.api'
import { decidePartialOrderGroup, listOrderGroups } from '../../api/order-groups.api'
import { fetchMyProfile } from '../../api/users.api'
import {
  listPackagingMaterials,
  type PackagingMaterialStock,
} from '../../api/packaging-materials.api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { usePortal } from '../../context/use-portal'
import { UserRole } from '../../types/auth'
import { ApiError, formatApiError, getApiErrorCode } from '../../lib/api'
import {
  GROUP_FULFILLMENT_STATUS_LABELS,
  hasPackableOrders,
  isPartiallyCanceledGroup,
  type OrderGroup,
} from '../../types/order-groups'
import {
  ADJUSTMENT_REASONS,
  outerCm,
  PACKING_REASON_LABELS,
  REJECT_REASONS,
  type AdjustmentReason,
  type PackingPlan,
  type PackingPlanSummary,
  type PackingStaffMember,
  type RejectReason,
} from '../../types/packing-plan'
import { formatCurrency, formatDateTime } from '../../utils/format'
import { useLocalQueuePagination } from '../../hooks/useLocalQueuePagination'
import { Badge } from '../ui/Badge'
import { QueuePaginationBar } from '../ui/QueuePaginationBar'
import { Packing3DBoxViewer } from './Packing3DBoxViewer'
import { PackingSessionPanel } from './PackingSessionPanel'

/**
 * Bàn Packaging Staff — duyệt / điều chỉnh / từ chối kế hoạch thùng.
 * Admin chốt kế hoạch ở `/app/admin/packing-plans` (không dùng trang này).
 * Demo 3D chỉ hướng dẫn, không ghi trạng thái lên BE.
 */
type QueueTab =
  | 'picked'
  | 'partial_needs_review'
  | 'approved_for_packing'
  | 'awaiting_packaging'
  | 'pending_approval'

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
                ? `Có ${String(counts.picked)} nhóm đã lấy xong — chờ Admin chốt kế hoạch. Sau đó đơn sẽ hiện tại đây để bạn duyệt.`
                : `Kho đang lấy ${String(counts.awaiting)} nhóm. Khi lấy xong và Admin chốt kế hoạch, đơn sẽ hiện tại đây để duyệt.`,
          }
        : {
            title: 'Nothing to approve yet',
            body:
              counts.picked > 0
                ? `${String(counts.picked)} group(s) picked — wait for Admin to confirm a packing plan. They will appear here for approval.`
                : `Warehouse is picking ${String(counts.awaiting)} group(s). After pick and Admin confirm, approve here.`,
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

function boxViewerLabel(plan: PackingPlan | null, vi: boolean): string {
  const first = plan?.parcels[0]
  if (!plan || !first) {
    return vi ? 'Demo thùng — chưa có kế hoạch' : 'Demo box — no plan yet'
  }
  const { lengthCm, widthCm, heightCm } = outerCm(first.box)
  const extra =
    plan.parcels.length > 1
      ? vi
        ? ` · ${String(plan.parcels.length)} kiện`
        : ` · ${String(plan.parcels.length)} parcels`
      : ''
  return vi
    ? `${first.box.name}: ${String(lengthCm)} × ${String(widthCm)} × ${String(heightCm)} cm${extra}`
    : `${first.box.name}: ${String(lengthCm)} × ${String(widthCm)} × ${String(heightCm)} cm${extra}`
}

function boxViewerSub(plan: PackingPlan | null, vi: boolean): string {
  const first = plan?.parcels[0]
  if (!plan || !first) {
    return vi
      ? 'Hướng dẫn 3D (demo) — không ghi trạng thái lên hệ thống'
      : '3D guide (demo) — does not write fulfillment status'
  }
  return vi ? 'Demo hướng dẫn đóng gói' : 'Packing guide demo'
}

function MaterialTags({
  materials,
}: {
  materials: { name: string; quantity: number; code?: string | null }[]
}): ReactNode {
  if (materials.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {materials.map((row, index) => (
        <Badge
          key={`${row.code ?? row.name}-${String(index)}`}
          tone="primary"
          className="font-medium"
        >
          {row.name}
          {row.quantity > 1 ? ` ×${String(row.quantity)}` : ''}
        </Badge>
      ))}
    </div>
  )
}

function weightPrefill(plan: PackingPlan): Record<number, string> {
  const next: Record<number, string> = {}
  for (const parcel of plan.parcels) {
    const kg = parcel.actualWeightKg ?? parcel.estimatedWeightG / 1000
    next[parcel.parcelNo] = kg > 0 ? kg.toFixed(3) : ''
  }
  return next
}

function readParcelWeights(
  plan: PackingPlan,
  weights: Record<number, string>,
): { parcel_no: number; weight_kg: number }[] | null {
  const rows: { parcel_no: number; weight_kg: number }[] = []
  for (const parcel of plan.parcels) {
    const weight = Number(weights[parcel.parcelNo])
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
  const [guideDetailOpen, setGuideDetailOpen] = useState(false)
  const [boxStock, setBoxStock] = useState<PackagingMaterialStock[]>([])
  const [boxStockError, setBoxStockError] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<Record<string, PackingPlanSummary>>({})
  const [staff, setStaff] = useState<PackingStaffMember[]>([])
  const [staffId, setStaffId] = useState('')
  const [returnSku, setReturnSku] = useState('')
  const [returnQty, setReturnQty] = useState('1')
  const [returnRestock, setReturnRestock] = useState(false)
  const [returnNote, setReturnNote] = useState('')
  const [requireScan, setRequireScan] = useState(false)

  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const packerId =
        session?.role === UserRole.PACKAGING_STAFF
          ? (await fetchMyProfile()).id
          : ''
      const rows = await listOrderGroups(
        packerId ? { assigned_packer_id: packerId } : {},
      )
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
  }, [session])

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
      void getPackingSettings()
        .then((settings) => setRequireScan(settings.requireScan))
        .catch(() => setRequireScan(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [canAssign])

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
    return { pending, partial, awaiting, picked, approved }
  }, [allGroups])

  const groups = useMemo(
    () =>
      allGroups.filter(
        (g) => g.fulfillmentStatus === tab && hasPackableOrders(g),
      ),
    [allGroups, tab],
  )
  const visibleGroups = useMemo(() => {
    if (tab !== 'pending_approval') return groups
    return groups.filter((group) => groupMatchesSearch(group, queueQuery))
  }, [groups, tab, queueQuery])

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
      // Tab chỉ xem: không tự chọn group — tránh màn «đầy việc» nhưng không làm gì được.
      if (tab === 'awaiting_packaging') return null
      return groups[0]?.id ?? null
    })
  }, [groups, tab])

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

    const fromList = groups.find((g) => g.id === selectedId) ?? null
    const syncId = window.setTimeout(() => {
      setGroup(fromList)
      setDetailError(null)
      setActionError(null)
    }, 0)

    // Partial / awaiting: không cần recommendation để thao tác.
    if (
      !fromList ||
      tab === 'partial_needs_review' ||
      tab === 'awaiting_packaging'
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
  }, [selectedId, groups, tab])

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
          ? 'Chưa có kế hoạch. Chờ Admin chốt hoặc bấm Tải lại.'
          : 'No plan yet. Wait for Admin to confirm, or refresh.',
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
      setPlan(next)
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
    setActionBusy(true)
    setActionError(null)
    try {
      const result = await packPlan(group.id, plan.version, parcels)
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

  async function onPack(): Promise<void> {
    await submitPack()
  }

  async function onAssign(mode: 'auto' | 'manual'): Promise<void> {
    if (!group) return
    setActionBusy(true)
    setActionError(null)
    try {
      const next = await assignPacker(group.id, mode, staffId || undefined)
      setPlan(next)
      setToast(vi ? 'Đã gán người đóng gói.' : 'Packer assigned.')
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  async function onBackToPicking(): Promise<void> {
    if (!group || !plan) return
    const quantity = Number(returnQty)
    if (!returnSku.trim() || !Number.isInteger(quantity) || quantity < 1) {
      setActionError(vi ? 'Nhập SKU và số lượng.' : 'Enter SKU and quantity.')
      return
    }
    setActionBusy(true)
    setActionError(null)
    try {
      const next = await backToPicking(group.id, {
        expectedVersion: plan.version,
        items: [{ sku: returnSku.trim(), quantity, restock: returnRestock }],
        note: returnNote.trim() || undefined,
      })
      setPlan(next)
      setToast(vi ? 'Đã trả về lấy hàng.' : 'Sent back to picking.')
    } catch (err: unknown) {
      reloadPlanAfterConflict(err)
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
      setPlan(next)
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
            ? 'Đã duyệt tiếp (→ picked).'
            : 'Approved to continue (→ picked).'
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
  const actionableCount = counts.pending + counts.partial
  const isViewOnlyTab = tab === 'awaiting_packaging'
  const queueTabs = useMemo(
    () =>
      [
        [
          'pending_approval',
          vi ? 'Chờ duyệt kế hoạch' : 'Pending plan',
          counts.pending,
          false,
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
    [vi, counts.pending, counts.partial, counts.approved, counts.awaiting],
  )
  const currentTabLabel =
    queueTabs.find((row) => row[0] === tab)?.[1] ??
    (vi ? 'Hàng đợi' : 'Queue')

  const queuePaging = useLocalQueuePagination(visibleGroups)

  const overParcelLimit = plan?.orders.some((order) => order.overParcelLimit) ?? false

  function parcelWeightFields(): ReactNode {
    if (!plan || plan.parcels.length === 0) return null
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-ink-muted">
          {vi ? 'Cân từng kiện (kg)' : 'Weight per parcel (kg)'}
        </p>
        {plan.parcels.map((parcel) => (
          <label
            key={parcel.parcelNo}
            className="flex items-center gap-2 text-sm text-ink"
          >
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
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="owner-hero">
        <div>
          <p className="owner-hero-kicker">
            {vi ? 'Nhân viên đóng gói' : 'Packaging Staff'}
          </p>
          <h1>{vi ? 'Bàn đóng gói' : 'Packing station'}</h1>
          <p className="owner-hero-lead">
            {vi
              ? 'Chấp nhận kế hoạch → xem hướng dẫn 3D. Từ chối kèm lý do → gửi Admin.'
              : 'Accept plan → 3D guide. Reject with reason → Admin notified.'}
          </p>
          <div className="owner-hero-ctas">
            <button
              type="button"
              onClick={() => void loadList()}
              className="owner-btn-primary inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {vi ? 'Tải lại' : 'Refresh'}
            </button>
          </div>
        </div>
        <ol className="owner-steps">
          {queueTabs.map(([key, label, count, viewOnly], index) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key ? 'true' : undefined}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {label} ({String(count)})
                {viewOnly ? (
                  <em className="not-italic text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    {vi ? 'Chỉ xem' : 'View'}
                  </em>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <div
        className={`owner-panel flex items-start gap-2 rounded-2xl px-4 py-3 text-xs ${
          actionableCount > 0
            ? 'text-[var(--ls-ink)]'
            : 'text-[var(--ls-muted)]'
        }`}
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          {actionableCount > 0
            ? vi
              ? `Bạn có ${String(actionableCount)} việc cần xử lý (${String(counts.pending)} chờ duyệt · ${String(counts.partial)} thiếu hàng).`
              : `You have ${String(actionableCount)} task(s) (${String(counts.pending)} pending plan · ${String(counts.partial)} shortage).`
            : vi
              ? counts.awaiting > 0 || counts.picked > 0
                ? `Chưa có việc duyệt. ${counts.picked > 0 ? `${String(counts.picked)} nhóm đã lấy — chờ Admin chốt kế hoạch. ` : ''}${counts.awaiting > 0 ? `${String(counts.awaiting)} nhóm kho đang lấy (tab «Chỉ xem»). ` : ''}Bấm Tải lại khi có gợi ý.`
                : 'Chưa có việc. Khi có gợi ý thùng, đơn sẽ hiện ở «Chờ duyệt kế hoạch».'
              : counts.awaiting > 0 || counts.picked > 0
                ? `Nothing to approve yet. ${counts.picked > 0 ? `${String(counts.picked)} picked — wait for Admin to confirm a plan. ` : ''}${counts.awaiting > 0 ? `${String(counts.awaiting)} still in warehouse (view-only). ` : ''}Refresh when a plan appears.`
                : 'Nothing yet. After a carton plan exists, groups appear under Pending plan.'}
        </p>
      </div>

      <div className="pack-bench">
        <section className="pack-bench-col">
          <div className="pack-bench-head">
            <div className="min-w-0 flex-1">
              <p className="pack-bench-kicker">
                {vi ? 'Hàng đợi' : 'Queue'}
              </p>
              <h2>{currentTabLabel}</h2>
              {isViewOnlyTab ? (
                <p className="pack-bench-viewonly">
                  {vi ? 'Chỉ xem' : 'View only'}
                </p>
              ) : null}
              {tab === 'pending_approval' ? (
                <label className="relative mt-2 block">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                  <input
                    type="search"
                    value={queueQuery}
                    onChange={(event) => setQueueQuery(event.target.value)}
                    placeholder={vi ? 'Tìm mã đơn…' : 'Search order…'}
                    aria-label={vi ? 'Tìm đơn chờ duyệt' : 'Search pending orders'}
                    className="h-8 w-full rounded-lg border border-hairline bg-canvas pl-7 pr-2 text-xs text-ink"
                  />
                </label>
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
              <ul className="divide-y divide-hairline">
                {queuePaging.pagedItems.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(g.id)}
                      className="pack-queue-item"
                      aria-current={selectedId === g.id ? 'true' : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-medium text-ink">
                          {g.id.slice(-8)}
                        </span>
                        {g.orderPriority === 'express' ? (
                          <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                            Express
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted capitalize">
                        {g.platform} · {g.activeOrderCount}/{g.orderCount}{' '}
                        {vi ? 'còn/tổng' : 'active/total'}
                        {isPartiallyCanceledGroup(g) ? (
                          <span className="font-semibold text-amber-700 dark:text-amber-300">
                            {vi ? ' · một phần hủy' : ' · partial cancel'}
                          </span>
                        ) : null}
                        <span className="text-ink-subtle">
                          {' · '}
                          {statusLabel(g.fulfillmentStatus, vi)}
                        </span>
                      </p>
                      {summaries[g.id] ? (
                        <p className="mt-0.5 text-[10px] text-ink-subtle">
                          {vi ? 'Kế hoạch' : 'Plan'} {summaries[g.id]?.status} ·{' '}
                          {String(summaries[g.id]?.parcels ?? 0)} {vi ? 'kiện' : 'parcels'}
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
              <p className="pack-bench-kicker">
                {vi ? 'Chi tiết nhóm' : 'Group detail'}
              </p>
              <h2>
                {selectedId
                  ? selectedId.slice(-8)
                  : vi
                    ? 'Chưa chọn nhóm'
                    : 'No group selected'}
              </h2>
            </div>
          </div>
          <div className="pack-bench-scroll pb-12">
          {!selectedId ? (
            <div className="space-y-2">
              {isViewOnlyTab ? (
                <>
                  <p className="text-sm font-medium text-ink">
                    {vi
                      ? 'Tab chỉ xem — việc của Warehouse'
                      : 'View-only — Warehouse work'}
                  </p>
                  <p className="text-sm text-ink-subtle">
                    {groups.length === 0
                      ? empty.body
                      : vi
                        ? `Có ${String(groups.length)} nhóm đang lấy. Chọn một dòng bên trái nếu cần xem chi tiết — bạn không thao tác được tại đây. Quay lại «Chờ duyệt kế hoạch» khi có việc.`
                        : `${String(groups.length)} group(s) in pick. Select a row to inspect — you cannot act here. Return to Pending plan when you have work.`}
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
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <h2 className="font-mono text-sm font-semibold text-ink">
                    {group.id}
                  </h2>
                  {group.isOverdue ? (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-100">
                      <AlertTriangle className="h-3 w-3" />
                      Overdue
                    </span>
                  ) : null}
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-subtle">
                      {vi ? 'Trạng thái' : 'Status'}
                    </dt>
                    <dd className="font-medium text-ink">
                      {statusLabel(group.fulfillmentStatus, vi)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Version</dt>
                    <dd className="font-mono text-ink">{group.version}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">
                      {vi ? 'Ưu tiên' : 'Priority'}
                    </dt>
                    <dd className="capitalize text-ink">{group.orderPriority}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">
                      {vi ? 'Hạn đóng gói' : 'Deadline'}
                    </dt>
                    <dd className="text-ink">
                      {group.packagingDeadline
                        ? formatDateTime(
                            typeof group.packagingDeadline === 'string'
                              ? group.packagingDeadline
                              : new Date(group.packagingDeadline).toISOString(),
                          )
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              {tab === 'awaiting_packaging' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">
                    {vi
                      ? 'Kho đang lấy đơn này. Packaging Staff chỉ xem — không thao tác.'
                      : 'Warehouse is picking this group. Packaging Staff view-only.'}
                  </p>
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
                      {canAssign && plan ? (
                        <div className="mt-3 space-y-2 rounded-lg border border-hairline bg-surface p-3 text-xs">
                          <p className="font-semibold text-ink">
                            {vi ? 'Gán người đóng' : 'Assign packer'}
                            {plan.session?.assignedPackerId
                              ? ` · ${plan.session.assignedPackerId.slice(-6)}`
                              : ''}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void onAssign('auto')}
                              className="rounded-lg border border-hairline px-2 py-1"
                            >
                              {vi ? 'Tự gán' : 'Auto'}
                            </button>
                            <select
                              value={staffId}
                              onChange={(e) => setStaffId(e.target.value)}
                              className="rounded-lg border border-hairline bg-canvas px-2 py-1"
                            >
                              <option value="">{vi ? 'Chọn nhân viên' : 'Pick staff'}</option>
                              {staff.map((person) => (
                                <option key={person.staffId} value={person.staffId}>
                                  {person.fullName} ({String(person.activeWorkload)})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={actionBusy || !staffId}
                              onClick={() => void onAssign('manual')}
                              className="rounded-lg border border-hairline px-2 py-1 disabled:opacity-50"
                            >
                              {vi ? 'Gán tay' : 'Assign'}
                            </button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              value={returnSku}
                              onChange={(e) => setReturnSku(e.target.value)}
                              placeholder="SKU"
                              className="rounded-lg border border-hairline bg-canvas px-2 py-1"
                            />
                            <input
                              value={returnQty}
                              onChange={(e) => setReturnQty(e.target.value)}
                              inputMode="numeric"
                              className="rounded-lg border border-hairline bg-canvas px-2 py-1"
                            />
                          </div>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={returnRestock}
                              onChange={(e) => setReturnRestock(e.target.checked)}
                            />
                            {vi ? 'Hàng còn tốt, nhập lại kệ' : 'Good item, restock'}
                          </label>
                          <input
                            value={returnNote}
                            onChange={(e) => setReturnNote(e.target.value)}
                            placeholder={vi ? 'Ghi chú (tuỳ chọn)' : 'Note'}
                            className="w-full rounded-lg border border-hairline bg-canvas px-2 py-1"
                          />
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void onBackToPicking()}
                            className="rounded-lg border border-hairline px-2 py-1"
                          >
                            {vi ? 'Trả về lấy hàng' : 'Back to picking'}
                          </button>
                        </div>
                      ) : null}
                      {plan &&
                      (plan.status === 'approved' || plan.status === 'packing') ? (
                        <PackingSessionPanel
                          groupId={group.id}
                          plan={plan}
                          boxes={boxStock.map((row) => ({ code: row.code, name: row.name }))}
                          vi={vi}
                          onPlan={(next) => {
                            setPlan(next)
                            setParcelWeights(weightPrefill(next))
                          }}
                          onError={(err) => reloadPlanAfterConflict(err)}
                        />
                      ) : null}
                      {requireScan ? (
                        <p className="mt-3 text-xs text-ink-muted">
                          {vi
                            ? 'Cài đặt đang bắt buộc quét từng món. Dùng phiên đóng gói phía trên, không bấm đóng nhanh.'
                            : 'Scan is required. Use the packing session above.'}
                        </p>
                      ) : (
                        <>
                          {parcelWeightFields()}
                          <button
                            type="button"
                            disabled={actionBusy}
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
                      {vi ? 'Duyệt tiếp (→ picked)' : 'Approve continue (→ picked)'}
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
                </div>
              ) : tab !== 'awaiting_packaging' ? (
                <>
                  <div className="rounded-lg border border-hairline bg-canvas p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">
                        {vi ? 'Kế hoạch đóng gói' : 'Packing plan'}
                      </h3>
                      {canApprove ? (
                        <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null)
                              setPlanDialog('approve')
                            }}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                              planDialog === 'approve'
                                ? 'bg-primary text-white'
                                : 'text-ink'
                            }`}
                          >
                            {vi ? 'Duyệt' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null)
                              setPlanDialog('adjust')
                            }}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                              planDialog === 'adjust'
                                ? 'bg-primary text-white'
                                : 'text-ink'
                            }`}
                          >
                            {vi ? 'Điều chỉnh' : 'Adjust'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {!plan ? (
                      <p className="mt-2 text-sm text-ink-subtle">
                        {vi
                          ? 'Chưa có kế hoạch. Chờ Admin chốt. Không thể duyệt khi chưa có kế hoạch.'
                          : 'No plan yet. Wait for Admin to confirm. Cannot approve without one.'}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm">
                        <dl className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <dt className="text-ink-subtle">
                              {vi ? 'Trạng thái kế hoạch' : 'Plan status'}
                            </dt>
                            <dd className="capitalize text-ink">{plan.status}</dd>
                          </div>
                          <div>
                            <dt className="text-ink-subtle">
                              {vi ? 'Số kiện' : 'Parcels'}
                            </dt>
                            <dd className="text-ink">{plan.totals.parcels}</dd>
                          </div>
                        </dl>
                        {plan.failureReason ? (
                          <p className="text-xs text-rose-700 dark:text-rose-300">
                            {plan.failureReason}
                          </p>
                        ) : null}
                        <ul className="space-y-2">
                          {plan.parcels.map((parcel) => {
                            const size = outerCm(parcel.box)
                            return (
                              <li
                                key={parcel.parcelNo}
                                className="rounded-lg border border-hairline px-3 py-2"
                              >
                                <p className="font-medium text-ink">
                                  #{String(parcel.parcelNo)} {parcel.box.name}{' '}
                                  <span className="font-mono text-xs text-ink-muted">
                                    {parcel.box.code}
                                  </span>
                                </p>
                                <p className="font-mono text-xs text-ink-muted">
                                  {size.lengthCm} × {size.widthCm} × {size.heightCm} cm
                                  {' · '}
                                  {(parcel.estimatedWeightG / 1000).toFixed(2)} kg
                                  {parcel.shippingCostVnd != null
                                    ? ` · ${formatCurrency(parcel.shippingCostVnd)}`
                                    : ''}
                                </p>
                                <MaterialTags materials={parcel.materials} />
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                    <div className="mt-3 border-t border-hairline pt-3">
                      <p className="text-xs font-medium text-ink-muted">
                        {vi ? 'Tồn thùng' : 'Box stock'}
                      </p>
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
                        <ul className="mt-1 space-y-1 text-xs text-ink">
                          {boxStock.map((row) => {
                            const size =
                              row.lengthCm != null &&
                              row.widthCm != null &&
                              row.heightCm != null
                                ? `${row.lengthCm}×${row.widthCm}×${row.heightCm} cm`
                                : null
                            const suggested = plan?.parcels.some(
                              (parcel) => parcel.box.code === row.code,
                            )
                            return (
                              <li
                                key={row.code}
                                className={
                                  suggested ? 'font-medium text-primary' : undefined
                                }
                              >
                                {row.name}
                                {size ? ` · ${size}` : ''}
                                {' — '}
                                {vi ? 'mới' : 'new'} {row.qtyNew}
                                {' · '}
                                {vi ? 'tái sử dụng' : 'reused'} {row.qtyReused}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  {tab === 'picked' &&
                  group.fulfillmentStatus === 'picked' ? (
                    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                      <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">
                        {vi
                          ? 'Kho đã lấy xong. Nhập cân từng kiện rồi xác nhận.'
                          : 'Warehouse finished picking. Enter each parcel weight, then confirm.'}
                      </p>
                      {requireScan ? (
                        <p className="text-xs text-emerald-900 dark:text-emerald-100">
                          {vi
                            ? 'Cài đặt bắt buộc quét. Chuyển sang tab đã duyệt để đóng theo phiên.'
                            : 'Scan is required. Open the approved tab and use the session.'}
                        </p>
                      ) : (
                        <>
                          {parcelWeightFields()}
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void onPack()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {vi ? 'Xác nhận đã đóng gói' : 'Confirm packed'}
                          </button>
                        </>
                      )}
                    </div>
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
                boxLabel={boxViewerLabel(plan, vi)}
                boxSub={boxViewerSub(plan, vi)}
                autoRotate={
                  guide3dActive || tab === 'approved_for_packing'
                }
                onOpenDetail={() => setGuideDetailOpen(true)}
              />
              <MaterialTags materials={plan?.parcels[0]?.materials ?? []} />
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-sm font-medium text-rose-700 disabled:opacity-50 dark:border-rose-800 dark:bg-transparent dark:text-rose-300"
              >
                <XCircle className="h-4 w-4" />
                {vi ? 'Từ chối & gửi Admin' : 'Reject & notify Admin'}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void onApprove()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#152d35] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
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
            <div className="min-w-0">
              <p className="pack-bench-kicker">
                {guide3dActive || tab === 'approved_for_packing'
                  ? vi
                    ? 'Hướng dẫn 3D'
                    : '3D packing guide'
                  : vi
                    ? 'Xem trước 3D'
                    : '3D preview'}
              </p>
              <h2>
                {guide3dActive || tab === 'approved_for_packing'
                  ? vi
                    ? 'Thùng xoay tự động'
                    : 'Box auto-rotates'
                  : vi
                    ? 'Kéo để xoay thùng'
                    : 'Drag to orbit'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setGuideDetailOpen(true)}
              className="shrink-0 rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs font-medium text-ink"
            >
              {vi ? 'Xem chi tiết' : 'View details'}
            </button>
          </div>
          <div className="pack-bench-scroll p-3">
            <Packing3DBoxViewer
              boxLabel={boxViewerLabel(plan, vi)}
              boxSub={boxViewerSub(plan, vi)}
              autoRotate={
                guide3dActive || tab === 'approved_for_packing'
              }
              className="relative h-full w-full select-none overflow-hidden rounded-xl border border-slate-100 bg-[#f8faff] dark:border-slate-800 dark:bg-slate-900/40"
              onOpenDetail={() => setGuideDetailOpen(true)}
            />
            <MaterialTags materials={plan?.parcels[0]?.materials ?? []} />
            {plan && plan.parcels.length > 0 ? (
              <div className="mt-3 space-y-2 text-xs text-ink">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void onWriteGuide()}
                  className="rounded-lg border border-hairline px-2 py-1 disabled:opacity-50"
                >
                  {vi ? 'Viết hướng dẫn kiện' : 'Write parcel guide'}
                </button>
                {(plan.parcels.find((row) => row.parcelNo === parcelNo) ?? plan.parcels[0])?.guide
                  ?.steps.map((step) => (
                    <p key={step.step}>
                      {step.step}. {step.instruction}
                      {step.tip ? ` — ${step.tip}` : ''}
                    </p>
                  ))}
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {guideDetailOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setGuideDetailOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-detail-title"
            className="flex h-[min(92vh,880px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
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
              <div className="min-h-[360px] bg-[#f8faff] p-3">
                <Packing3DBoxViewer
                  boxLabel={boxViewerLabel(plan, vi)}
                  boxSub={boxViewerSub(plan, vi)}
                  autoRotate={guide3dActive || tab === 'approved_for_packing'}
                  className="relative h-full min-h-[340px] w-full select-none overflow-hidden rounded-xl border border-slate-100 bg-[#f8faff]"
                />
              </div>
              <aside className="min-h-0 overflow-y-auto border-t border-slate-200 p-5 lg:border-t-0 lg:border-l">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {vi ? 'Mô tả' : 'Description'}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">{boxViewerLabel(plan, vi)}</p>
                <p className="mt-1 text-sm text-slate-600">{boxViewerSub(plan, vi)}</p>
                <div className="mt-3">
                  <MaterialTags materials={plan?.parcels[0]?.materials ?? []} />
                </div>
                {(() => {
                  const guide = (
                    plan?.parcels.find((row) => row.parcelNo === parcelNo) ?? plan?.parcels[0]
                  )?.guide
                  return (
                    <div className="mt-5">
                      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                        {vi ? 'Các bước' : 'Steps'}
                      </p>
                      {guide?.summary ? (
                        <p className="mt-2 text-sm text-slate-700">{guide.summary}</p>
                      ) : null}
                      {guide && guide.steps.length > 0 ? (
                        <ol className="mt-3 space-y-3">
                          {guide.steps.map((step) => (
                            <li key={step.step} className="flex gap-3">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#152d35] text-xs font-semibold text-white">
                                {step.step}
                              </span>
                              <div>
                                <p className="text-sm text-slate-800">{step.instruction}</p>
                                {step.tip ? (
                                  <p className="mt-1 text-xs text-slate-500">{step.tip}</p>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">
                          {vi
                            ? 'Chưa có hướng dẫn từng bước.'
                            : 'No step-by-step guide yet.'}
                        </p>
                      )}
                      {plan && plan.parcels.length > 0 ? (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void onWriteGuide()}
                          className="mt-4 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
                        >
                          {vi ? 'Viết hướng dẫn kiện' : 'Write parcel guide'}
                        </button>
                      ) : null}
                    </div>
                  )
                })()}
              </aside>
            </div>
          </div>
        </div>
      ) : null}

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
