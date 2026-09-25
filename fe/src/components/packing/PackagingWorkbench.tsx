import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Package,
  RefreshCw,
  Scale,
  XCircle,
} from 'lucide-react'
import { decidePartialOrderGroup, listOrderGroups, packOrderGroup } from '../../api/order-groups.api'
import {
  adjustPackaging,
  approvePackaging,
  getPackagingRecommendation,
  rejectPackaging,
} from '../../api/packaging.api'
import { usePortal } from '../../context/use-portal'
import { formatApiError } from '../../lib/api'
import {
  GROUP_FULFILLMENT_STATUS_LABELS,
  type OrderGroup,
} from '../../types/order-groups'
import {
  ADJUSTMENT_REASON_LABELS,
  type AdjustPackagingInput,
  type PackagingRecommendation,
} from '../../types/packaging'
import { formatCurrency, formatDateTime } from '../../utils/format'
import { Packing3DBoxViewer } from './Packing3DBoxViewer'

/**
 * Bàn Packaging Staff — duyệt / điều chỉnh / từ chối kế hoạch thùng.
 * Admin chốt kế hoạch ở `/app/admin/packing-plans` (không dùng trang này).
 * Demo 3D chỉ hướng dẫn, không ghi trạng thái lên BE.
 */
type QueueTab =
  | 'pending_approval'
  | 'partial_needs_review'
  | 'approved_for_packing'
  | 'awaiting_packaging'

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

function boxViewerLabel(rec: PackagingRecommendation | null, vi: boolean): string {
  if (!rec) {
    return vi ? 'Demo thùng — chưa có gợi ý BE' : 'Demo box — no BE plan yet'
  }
  const { lengthCm, widthCm, heightCm } = rec.boxSize
  return vi
    ? `Thùng: ${String(lengthCm)} × ${String(widthCm)} × ${String(heightCm)} cm`
    : `Box: ${String(lengthCm)} × ${String(widthCm)} × ${String(heightCm)} cm`
}

function boxViewerSub(rec: PackagingRecommendation | null, vi: boolean): string {
  if (!rec) {
    return vi
      ? 'Hướng dẫn 3D (demo) — không ghi trạng thái lên hệ thống'
      : '3D guide (demo) — does not write fulfillment status'
  }
  return vi
    ? `${rec.materialType} · demo hướng dẫn đóng gói`
    : `${rec.materialType} · packing guide demo`
}

export function PackagingWorkbench() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  const [tab, setTab] = useState<QueueTab>('pending_approval')
  const [tabBootstrapped, setTabBootstrapped] = useState(false)
  const [allGroups, setAllGroups] = useState<OrderGroup[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [group, setGroup] = useState<OrderGroup | null>(null)
  const [rec, setRec] = useState<PackagingRecommendation | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [weightKg, setWeightKg] = useState('')
  const [mode, setMode] = useState<'approve' | 'adjust'>('approve')
  const [boxL, setBoxL] = useState('')
  const [boxW, setBoxW] = useState('')
  const [boxH, setBoxH] = useState('')
  const [material, setMaterial] = useState('Bubble Wrap')
  const [adjustReason, setAdjustReason] =
    useState<AdjustPackagingInput['adjustment_reason']>(
      'RECOMMENDED_BOX_NOT_IN_STOCK',
    )
  const [adjustNote, setAdjustNote] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [guide3dActive, setGuide3dActive] = useState(false)

  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const rows = await listOrderGroups()
      setAllGroups(rows)
    } catch (err: unknown) {
      setListError(formatApiError(err))
      setAllGroups([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList()
    }, 150)
    return () => window.clearTimeout(timer)
  }, [loadList])

  const counts = useMemo(() => {
    let pending = 0
    let partial = 0
    let awaiting = 0
    let picked = 0
    let approved = 0
    for (const g of allGroups) {
      if (g.fulfillmentStatus === 'pending_approval') pending += 1
      else if (g.fulfillmentStatus === 'partial_needs_review') partial += 1
      else if (g.fulfillmentStatus === 'awaiting_packaging') awaiting += 1
      else if (g.fulfillmentStatus === 'picked') picked += 1
      else if (g.fulfillmentStatus === 'approved_for_packing') approved += 1
    }
    return { pending, partial, awaiting, picked, approved }
  }, [allGroups])

  const groups = useMemo(
    () => allGroups.filter((g) => g.fulfillmentStatus === tab),
    [allGroups, tab],
  )

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
        setRec(null)
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
      const clearRec = window.setTimeout(() => setRec(null), 0)
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
      void getPackagingRecommendation(selectedId)
        .then((recommendation) => {
          if (cancelled) return
          lastPackagingKeyRef.current = fetchKey
          setRec(recommendation)
          if (recommendation) {
            setBoxL(String(recommendation.boxSize.lengthCm))
            setBoxW(String(recommendation.boxSize.widthCm))
            setBoxH(String(recommendation.boxSize.heightCm))
            setMaterial(recommendation.materialType)
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setDetailError(formatApiError(err))
            setRec(null)
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

  async function onApprove(): Promise<void> {
    if (!group) return
    const weight = Number(weightKg)
    if (!Number.isFinite(weight) || weight < 0) {
      setActionError(
        vi ? 'Nhập cân nặng thật (kg) ≥ 0.' : 'Enter measured weight (kg) ≥ 0.',
      )
      return
    }
    setActionBusy(true)
    setActionError(null)
    try {
      await approvePackaging(group.id, {
        actual_measured_weight_kg: weight,
        expected_group_version: group.version,
      })
      showToast(
        vi
          ? 'Đã chấp nhận — xem hướng dẫn 3D, rồi bấm «Xác nhận đã đóng gói» khi gói xong.'
          : 'Accepted — see 3D guide, then tap «Confirm packed» when done.',
      )
      setWeightKg('')
      setGuide3dActive(true)
      await refreshAfterAction()
      setTab('approved_for_packing')
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  async function onAdjust(): Promise<void> {
    if (!group) return
    const weight = Number(weightKg)
    const l = Number(boxL)
    const w = Number(boxW)
    const h = Number(boxH)
    if (
      ![weight, l, w, h].every((n) => Number.isFinite(n) && n >= 0) ||
      l < 1 ||
      w < 1 ||
      h < 1
    ) {
      setActionError(
        vi
          ? 'Kiểm tra kích thước thùng (≥1) và cân nặng (≥0).'
          : 'Check box size (≥1) and weight (≥0).',
      )
      return
    }
    if (adjustReason === 'OTHER' && !adjustNote.trim()) {
      setActionError(
        vi ? 'Nhập ghi chú khi chọn lý do Khác.' : 'Note required for Other.',
      )
      return
    }
    setActionBusy(true)
    setActionError(null)
    try {
      await adjustPackaging(group.id, {
        box_size: { length_cm: l, width_cm: w, height_cm: h },
        material_type: material.trim() || 'Bubble Wrap',
        adjustment_reason: adjustReason,
        ...(adjustReason === 'OTHER'
          ? { adjustment_note: adjustNote.trim() }
          : {}),
        actual_measured_weight_kg: weight,
        expected_group_version: group.version,
      })
      showToast(
        vi
          ? 'Đã điều chỉnh & chấp nhận — xem hướng dẫn 3D, rồi xác nhận đã đóng gói.'
          : 'Adjusted & accepted — see 3D guide, then confirm packed.',
      )
      setWeightKg('')
      setGuide3dActive(true)
      await refreshAfterAction()
      setTab('approved_for_packing')
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  async function onReject(): Promise<void> {
    if (!group) return
    const reason = rejectReason.trim()
    if (reason.length < 3) {
      setActionError(
        vi
          ? 'Nhập lý do từ chối (ít nhất 3 ký tự) để gửi Admin.'
          : 'Enter a rejection reason (min 3 chars) for Admin.',
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
      await rejectPackaging(group.id, {
        expected_group_version: group.version,
        rejection_reason: reason,
      })
      showToast(
        vi
          ? 'Đã từ chối — Admin đã được thông báo.'
          : 'Rejected — Admin notified.',
      )
      setRejectReason('')
      setGuide3dActive(false)
      await refreshAfterAction()
      setTab('pending_approval')
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  async function onConfirmPacked(): Promise<void> {
    if (!group || group.fulfillmentStatus !== 'approved_for_packing') return
    setActionBusy(true)
    setActionError(null)
    try {
      await packOrderGroup(group.id, { expected_version: group.version })
      showToast(
        vi
          ? 'Đã xác nhận đóng gói xong — nhóm chuyển sang packed.'
          : 'Confirmed packed — group is now packed.',
      )
      setGuide3dActive(false)
      await refreshAfterAction()
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
    Boolean(rec) &&
    group?.fulfillmentStatus === 'pending_approval'
  const actionableCount = counts.pending + counts.partial
  const isViewOnlyTab = tab === 'awaiting_packaging'

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 pb-10 md:p-6 md:pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">
            {vi ? 'Bàn đóng gói' : 'Packing station'}
          </h1>
          <p className="mt-0.5 text-sm text-ink-subtle">
            {vi
              ? 'Chấp nhận kế hoạch → xem hướng dẫn 3D. Từ chối kèm lý do → gửi Admin.'
              : 'Accept plan → 3D guide. Reject with reason → Admin notified.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadList()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink hover:bg-surface-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {vi ? 'Tải lại' : 'Refresh'}
        </button>
      </div>

      {/* Một banner ngữ cảnh — không lặp lại toàn bộ số đếm của tab */}
      <div
        className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
          actionableCount > 0
            ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
            : 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100'
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

      <div className="flex flex-wrap gap-2">
        {(
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
          ] as const
        ).map(([key, label, count, viewOnly]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? viewOnly
                  ? 'bg-ink-muted text-white'
                  : 'bg-primary text-white'
                : viewOnly
                  ? 'border border-dashed border-hairline bg-surface/80 text-ink-subtle hover:bg-surface-2'
                  : 'border border-hairline bg-surface text-ink-muted hover:bg-surface-2'
            }`}
          >
            <span>
              {label} ({String(count)})
            </span>
            {viewOnly ? (
              <span
                className={`rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  tab === key
                    ? 'bg-white/20 text-white'
                    : 'bg-surface-2 text-ink-subtle'
                }`}
              >
                {vi ? 'Chỉ xem' : 'View'}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Hai cột biên đồng bộ chiều cao cố định (khớp ô demo thùng) */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_minmax(0,340px)] lg:items-start">
        <section className="flex h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-hairline bg-surface lg:sticky lg:top-4">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-2.5 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
              {vi ? 'Hàng đợi' : 'Queue'}
              {groups.length > 0 ? (
                <span className="ml-1 font-normal normal-case text-ink-muted">
                  ({String(groups.length)})
                </span>
              ) : null}
            </span>
            {isViewOnlyTab ? (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-subtle">
                {vi ? 'Chỉ xem' : 'View only'}
              </span>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
            ) : (
              <ul className="divide-y divide-hairline">
                {groups.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(g.id)}
                      className={`w-full px-2.5 py-1.5 text-left transition-colors ${
                        selectedId === g.id
                          ? 'bg-primary/10'
                          : 'hover:bg-surface-2'
                      }`}
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
                        {g.platform} · {g.orderCount}{' '}
                        {vi ? 'đơn' : 'orders'}
                        <span className="text-ink-subtle">
                          {' · '}
                          {statusLabel(g.fulfillmentStatus, vi)}
                        </span>
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-hairline bg-surface">
          <div className="p-4 md:p-5">
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
                  {group?.fulfillmentStatus === 'approved_for_packing' ? (
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
                    <h3 className="text-sm font-semibold text-ink">
                      {vi ? 'Gợi ý đóng gói' : 'Packaging recommendation'}
                    </h3>
                    {!rec ? (
                      <p className="mt-2 text-sm text-ink-subtle">
                        {vi
                          ? 'Chưa có gợi ý. Chờ Admin chốt kế hoạch. Không thể duyệt khi chưa có kế hoạch thùng.'
                          : 'No recommendation yet. Wait for Admin to confirm a plan. Cannot approve without one.'}
                      </p>
                    ) : (
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-ink-subtle">
                            {vi ? 'Thùng (cm)' : 'Box (cm)'}
                          </dt>
                          <dd className="font-mono text-ink">
                            {rec.boxSize.lengthCm} × {rec.boxSize.widthCm} ×{' '}
                            {rec.boxSize.heightCm}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-subtle">
                            {vi ? 'Vật liệu' : 'Material'}
                          </dt>
                          <dd className="text-ink">
                            {rec.materialType} × {rec.materialQuantity}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-subtle">
                            {vi ? 'Ước phí ship' : 'Est. shipping'}
                          </dt>
                          <dd className="text-ink">
                            {formatCurrency(rec.estimatedShippingCostVnd)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-subtle">
                            {vi ? 'Trạng thái duyệt' : 'Approval'}
                          </dt>
                          <dd className="capitalize text-ink">
                            {rec.approvalStatus}
                          </dd>
                        </div>
                        {rec.fallbackUsed ? (
                          <div className="sm:col-span-2 text-xs text-amber-700 dark:text-amber-300">
                            {vi
                              ? 'Đang dùng thuật toán fallback (không phải AI đầy đủ).'
                              : 'Using fallback algorithm (not full AI).'}
                          </div>
                        ) : null}
                      </dl>
                    )}
                  </div>

                  {canApprove ? (
                    <div className="space-y-4 rounded-lg border border-hairline p-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMode('approve')}
                          className={`rounded-lg px-3 py-1.5 text-sm ${
                            mode === 'approve'
                              ? 'bg-primary text-white'
                              : 'border border-hairline'
                          }`}
                        >
                          {vi ? 'Duyệt' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode('adjust')}
                          className={`rounded-lg px-3 py-1.5 text-sm ${
                            mode === 'adjust'
                              ? 'bg-primary text-white'
                              : 'border border-hairline'
                          }`}
                        >
                          {vi ? 'Điều chỉnh' : 'Adjust'}
                        </button>
                      </div>

                      <label className="block text-sm">
                        <span className="mb-1 flex items-center gap-1 text-ink-muted">
                          <Scale className="h-3.5 w-3.5" />
                          {vi ? 'Cân nặng thật (kg)' : 'Measured weight (kg)'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={weightKg}
                          onChange={(e) => setWeightKg(e.target.value)}
                          className="w-full max-w-xs rounded-lg border border-hairline bg-canvas px-3 py-2 text-ink"
                        />
                      </label>

                      {mode === 'adjust' ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="text-sm">
                            <span className="text-ink-muted">L (cm)</span>
                            <input
                              type="number"
                              min={1}
                              value={boxL}
                              onChange={(e) => setBoxL(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="text-ink-muted">W (cm)</span>
                            <input
                              type="number"
                              min={1}
                              value={boxW}
                              onChange={(e) => setBoxW(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="text-ink-muted">H (cm)</span>
                            <input
                              type="number"
                              min={1}
                              value={boxH}
                              onChange={(e) => setBoxH(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                            />
                          </label>
                          <label className="text-sm sm:col-span-2">
                            <span className="text-ink-muted">
                              {vi ? 'Vật liệu' : 'Material'}
                            </span>
                            <input
                              value={material}
                              onChange={(e) => setMaterial(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                            />
                          </label>
                          <label className="text-sm sm:col-span-3">
                            <span className="text-ink-muted">
                              {vi ? 'Lý do điều chỉnh' : 'Adjustment reason'}
                            </span>
                            <select
                              value={adjustReason}
                              onChange={(e) =>
                                setAdjustReason(
                                  e.target
                                    .value as AdjustPackagingInput['adjustment_reason'],
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                            >
                              {(
                                Object.keys(
                                  ADJUSTMENT_REASON_LABELS,
                                ) as AdjustPackagingInput['adjustment_reason'][]
                              ).map((key) => (
                                <option key={key} value={key}>
                                  {vi
                                    ? ADJUSTMENT_REASON_LABELS[key].vi
                                    : ADJUSTMENT_REASON_LABELS[key].en}
                                </option>
                              ))}
                            </select>
                          </label>
                          {adjustReason === 'OTHER' ? (
                            <label className="text-sm sm:col-span-3">
                              <span className="text-ink-muted">
                                {vi ? 'Ghi chú' : 'Note'}
                              </span>
                              <input
                                value={adjustNote}
                                onChange={(e) => setAdjustNote(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2"
                              />
                            </label>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() =>
                            void (mode === 'approve' ? onApprove() : onAdjust())
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {actionBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          {mode === 'approve'
                            ? vi
                              ? 'Chấp nhận thực hiện'
                              : 'Accept & follow guide'
                            : vi
                              ? 'Lưu điều chỉnh & duyệt'
                              : 'Save adjust & approve'}
                        </button>
                        <div className="w-full space-y-1.5 sm:col-span-2">
                          <label className="block text-xs font-medium text-ink-subtle">
                            {vi
                              ? 'Lý do từ chối (bắt buộc nếu từ chối)'
                              : 'Rejection reason (required to reject)'}
                          </label>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={2}
                            placeholder={
                              vi
                                ? 'VD: Thùng quá lớn so với hàng đã lấy…'
                                : 'e.g. Box too large for picked items…'
                            }
                            className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void onReject()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-700 dark:border-rose-800 dark:text-rose-300 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          {vi ? 'Từ chối & gửi Admin' : 'Reject & notify Admin'}
                        </button>
                      </div>
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
                boxLabel={boxViewerLabel(rec, vi)}
                boxSub={boxViewerSub(rec, vi)}
                autoRotate={
                  guide3dActive || tab === 'approved_for_packing'
                }
              />
            </div>
          </div>
        </section>

        {/* Desktop 3D — cùng chiều cao h-[28rem] với Hàng đợi */}
        <aside className="hidden h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-hairline bg-surface lg:sticky lg:top-4 lg:flex">
          <div className="shrink-0 border-b border-hairline px-2.5 py-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
              {guide3dActive || tab === 'approved_for_packing'
                ? vi
                  ? 'Hướng dẫn 3D'
                  : '3D packing guide'
                : vi
                  ? 'Xem trước 3D'
                  : '3D preview'}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
              {guide3dActive || tab === 'approved_for_packing'
                ? vi
                  ? 'Đã chấp nhận — thùng xoay tự động. Kéo để chỉnh góc nhìn.'
                  : 'Accepted — box auto-rotates. Drag to adjust view.'
                : vi
                  ? 'Kéo để xoay thùng. Chấp nhận kế hoạch để bật animation hướng dẫn.'
                  : 'Drag to orbit. Accept the plan to enable guide animation.'}
            </p>
          </div>
          <div className="min-h-0 flex-1 p-2">
            <Packing3DBoxViewer
              boxLabel={boxViewerLabel(rec, vi)}
              boxSub={boxViewerSub(rec, vi)}
              autoRotate={
                guide3dActive || tab === 'approved_for_packing'
              }
              className="relative h-full w-full select-none overflow-hidden rounded-xl border border-slate-100 bg-[#f8faff] dark:border-slate-800 dark:bg-slate-900/40"
            />
          </div>
        </aside>
      </div>

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
