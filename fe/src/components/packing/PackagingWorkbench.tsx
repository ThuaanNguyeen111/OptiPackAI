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
import {
  decidePartialOrderGroup,
  listOrderGroups,
} from '../../api/order-groups.api'
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

/** Hàng đợi UC-04 + trạng thái BE trước khi có gợi ý (chỉ xem). */
type QueueTab =
  | 'pending_approval'
  | 'partial_needs_review'
  | 'awaiting_packaging'

function statusLabel(status: string, vi: boolean): string {
  const known = GROUP_FULFILLMENT_STATUS_LABELS[status]
  if (!known) return status
  return vi ? known.vi : known.en
}

function emptyCopy(tab: QueueTab, vi: boolean): { title: string; body: string } {
  if (tab === 'pending_approval') {
    return vi
      ? {
          title: 'Chưa có nhóm chờ duyệt',
          body: 'BE chỉ đưa nhóm vào pending_approval sau khi có PackagingRecommendation (Admin gọi POST …/packaging/generate tạm, hoặc AI Package 3). Nhóm mới thường nằm tab «Chờ gợi ý».',
        }
      : {
          title: 'No groups pending approval',
          body: 'BE moves a group to pending_approval only after a PackagingRecommendation exists (Admin POST …/packaging/generate, or AI later). New groups are usually under «Awaiting plan».',
        }
  }
  if (tab === 'partial_needs_review') {
    return vi
      ? {
          title: 'Không có đơn thiếu hàng',
          body: 'Tab này chỉ hiện nhóm Warehouse đã báo thiếu (report-missing) — trạng thái partial_needs_review trên BE.',
        }
      : {
          title: 'No partial-review groups',
          body: 'Only groups where Warehouse reported missing items (partial_needs_review) appear here.',
        }
  }
  return vi
    ? {
        title: 'Không có nhóm chờ gợi ý',
        body: 'Không có order_group ở awaiting_packaging (hoặc chưa sync/backfill nhóm đơn từ BE).',
      }
    : {
        title: 'No awaiting-packaging groups',
        body: 'No order_groups in awaiting_packaging (or groups not synced/backfilled yet).',
      }
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

  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      // Một lần GET /order-groups (Packaging Staff được BE cho đọc) — lọc tab phía FE.
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
    for (const g of allGroups) {
      if (g.fulfillmentStatus === 'pending_approval') pending += 1
      else if (g.fulfillmentStatus === 'partial_needs_review') partial += 1
      else if (g.fulfillmentStatus === 'awaiting_packaging') awaiting += 1
    }
    return { pending, partial, awaiting }
  }, [allGroups])

  const groups = useMemo(
    () => allGroups.filter((g) => g.fulfillmentStatus === tab),
    [allGroups, tab],
  )

  // Lần tải đầu: nếu chưa có pending nhưng có awaiting/partial → mở đúng tab có dữ liệu BE.
  useEffect(() => {
    if (listLoading || tabBootstrapped) return
    const id = window.setTimeout(() => {
      if (counts.pending === 0 && counts.awaiting > 0) {
        setTab('awaiting_packaging')
      } else if (counts.pending === 0 && counts.partial > 0) {
        setTab('partial_needs_review')
      }
      setTabBootstrapped(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [listLoading, tabBootstrapped, counts.pending, counts.awaiting, counts.partial])

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && groups.some((g) => g.id === prev)) return prev
      return groups[0]?.id ?? null
    })
  }, [groups])

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

    // Partial / awaiting: không cần (hoặc chưa có) recommendation để thao tác UC-04.
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
      showToast(vi ? 'Đã duyệt gợi ý đóng gói.' : 'Packaging approved.')
      setWeightKg('')
      await refreshAfterAction()
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
      showToast(vi ? 'Đã điều chỉnh và duyệt.' : 'Adjusted and approved.')
      setWeightKg('')
      await refreshAfterAction()
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  async function onReject(): Promise<void> {
    if (!group) return
    if (
      !window.confirm(
        vi
          ? 'Từ chối gợi ý này và đưa nhóm về chờ tính lại?'
          : 'Reject this plan and return the group for recomputation?',
      )
    ) {
      return
    }
    setActionBusy(true)
    setActionError(null)
    try {
      await rejectPackaging(group.id, {
        expected_group_version: group.version,
      })
      showToast(vi ? 'Đã từ chối gợi ý.' : 'Recommendation rejected.')
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
            ? 'Đã duyệt tiếp với phần hàng có sẵn.'
            : 'Approved to continue with available items.'
          : vi
            ? 'Đã hủy — nhóm quay lại chờ đóng gói.'
            : 'Cancelled — group back to awaiting packaging.',
      )
      await refreshAfterAction()
    } catch (err: unknown) {
      setActionError(formatApiError(err))
    } finally {
      setActionBusy(false)
    }
  }

  const empty = emptyCopy(tab, vi)
  const canApprove =
    tab === 'pending_approval' &&
    Boolean(rec) &&
    group?.fulfillmentStatus === 'pending_approval'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">
            {vi ? 'Duyệt đóng gói (UC-04)' : 'Packaging approval (UC-04)'}
          </h1>
          <p className="mt-0.5 text-sm text-ink-subtle">
            {vi
              ? 'Khớp BE: chờ duyệt AI · thiếu hàng · chờ gợi ý (chỉ xem). Duyệt/điều chỉnh chỉ khi pending_approval + đã có recommendation.'
              : 'Matches BE: pending approval · partial review · awaiting plan (read-only). Approve/adjust only with pending_approval + recommendation.'}
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

      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          {vi
            ? `Luồng BE: awaiting_packaging (${String(counts.awaiting)}) → Admin generate / AI → pending_approval (${String(counts.pending)}) → bạn Duyệt / Điều chỉnh / Từ chối. Thiếu hàng: partial_needs_review (${String(counts.partial)}).`
            : `BE flow: awaiting_packaging (${String(counts.awaiting)}) → Admin generate / AI → pending_approval (${String(counts.pending)}) → Approve / Adjust / Reject. Missing stock: partial_needs_review (${String(counts.partial)}).`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            [
              'pending_approval',
              vi ? 'Chờ duyệt AI' : 'Pending approval',
              counts.pending,
            ],
            [
              'partial_needs_review',
              vi ? 'Thiếu hàng — duyệt' : 'Partial review',
              counts.partial,
            ],
            [
              'awaiting_packaging',
              vi ? 'Chờ gợi ý (xem)' : 'Awaiting plan (view)',
              counts.awaiting,
            ],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-primary text-white'
                : 'border border-hairline bg-surface text-ink-muted hover:bg-surface-2'
            }`}
          >
            {label} ({String(count)})
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="border-b border-hairline px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">
            {vi ? 'Hàng đợi' : 'Queue'}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {vi ? 'Đang tải…' : 'Loading…'}
              </div>
            ) : listError ? (
              <p className="p-4 text-sm text-rose-600">{listError}</p>
            ) : groups.length === 0 ? (
              <div className="space-y-1 p-4">
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
                      className={`w-full px-3 py-3 text-left transition-colors ${
                        selectedId === g.id
                          ? 'bg-primary/10'
                          : 'hover:bg-surface-2'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-ink">
                          {g.id.slice(-8)}
                        </span>
                        {g.orderPriority === 'express' ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                            Express
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-ink-muted capitalize">
                        {g.platform} · {g.orderCount}{' '}
                        {vi ? 'đơn' : 'orders'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-subtle">
                        {statusLabel(g.fulfillmentStatus, vi)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto rounded-xl border border-hairline bg-surface p-4 md:p-5">
          {!selectedId ? (
            <p className="text-sm text-ink-subtle">
              {groups.length === 0
                ? empty.body
                : vi
                  ? 'Chọn một nhóm đơn bên trái.'
                  : 'Select a group on the left.'}
            </p>
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
                      ? 'Chỉ xem — chưa tới bước duyệt (UC-04)'
                      : 'View only — not ready for UC-04 yet'}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed opacity-90">
                    {vi
                      ? 'BE: group đang awaiting_packaging. Packaging Staff không gọi generate (chỉ Admin). Sau khi có recommendation, group chuyển pending_approval — lúc đó tab «Chờ duyệt AI» mới cho Duyệt / Điều chỉnh / Từ chối.'
                      : 'BE: group is awaiting_packaging. Packaging Staff cannot call generate (Admin only). After a recommendation exists, status becomes pending_approval — then Approve / Adjust / Reject unlock.'}
                  </p>
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
                          ? 'Chưa có gợi ý (Admin cần generate tạm hoặc chờ AI). Không thể duyệt khi chưa có recommendation.'
                          : 'No recommendation yet (Admin generate or AI). Cannot approve without one.'}
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
                              ? 'Xác nhận duyệt'
                              : 'Confirm approve'
                            : vi
                              ? 'Lưu điều chỉnh & duyệt'
                              : 'Save adjust & approve'}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void onReject()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-700 dark:border-rose-800 dark:text-rose-300 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          {vi ? 'Từ chối' : 'Reject'}
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
        </section>
      </div>

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
