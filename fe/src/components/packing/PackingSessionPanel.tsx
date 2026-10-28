import { useEffect, useState, type ReactElement } from 'react'
import { Loader2 } from 'lucide-react'
import { BoxSourceFields, boxSourceError } from './BoxSourceFields'
import {
  changeParcelBoxInSession,
  finishPackingSession,
  getPackingBoxSources,
  reportPackingIssue,
  reviewParcel,
  scanParcelItem,
  sealParcel,
  startPackingSession,
  unpackParcel,
  unscanParcelItem,
  unsealParcel,
} from '../../api/packing-plan.api'
import {
  ADJUSTMENT_REASONS,
  PACKING_REASON_LABELS,
  PARCEL_REVIEW_LABELS,
  PARCEL_REVIEW_REASONS,
  type AdjustmentReason,
  type BoxSourceInput,
  type PackingBoxSources,
  type PackingPlan,
  type ParcelReviewReason,
} from '../../types/packing-plan'
import {
  groupParcelsByOrder,
  parcelBorderClass,
  parcelOrderCaption,
  parcelOrderHeading,
} from '../../lib/parcel-order-display'

type BoxOption = { code: string; name: string }

function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `scan-${String(Date.now())}`
}

function weightOk(value: string): number | null {
  const weight = Number(value)
  if (!Number.isFinite(weight) || weight < 0.001 || weight > 100) return null
  return weight
}

export function PackingSessionPanel({
  groupId,
  plan,
  boxes,
  vi,
  onPlan,
  onError,
}: {
  groupId: string
  plan: PackingPlan
  boxes: BoxOption[]
  vi: boolean
  onPlan: (plan: PackingPlan) => void
  onError: (err: unknown) => void
}): ReactElement {
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [sealWeight, setSealWeight] = useState('')
  const [reviewWeight, setReviewWeight] = useState('')
  const [reviewReason, setReviewReason] = useState<ParcelReviewReason>('SCALE_ERROR')
  const [unscanReason, setUnscanReason] = useState('')
  const [boxCode, setBoxCode] = useState(boxes[0]?.code ?? '')
  const [boxReason, setBoxReason] = useState<AdjustmentReason>('BOX_TOO_TIGHT')
  const [oldOutcome, setOldOutcome] = useState<'unused' | 'damaged'>('unused')
  const [issue, setIssue] = useState<'damaged' | 'missing' | 'wrong_item'>('damaged')
  const [resolution, setResolution] = useState<'replace' | 'back_to_picking'>('back_to_picking')
  const [warehouseId, setWarehouseId] = useState('')
  const [boxCondition, setBoxCondition] = useState<'reusable' | 'damaged'>('reusable')
  const [sources, setSources] = useState<PackingBoxSources | null>(null)
  const [boxChoice, setBoxChoice] = useState<Record<number, BoxSourceInput>>({})

  useEffect(() => {
    if (plan.status !== 'packing') return
    let cancelled = false
    getPackingBoxSources(groupId)
      .then((data) => {
        if (!cancelled) window.setTimeout(() => setSources(data), 0)
      })
      .catch(() => {
        if (!cancelled) window.setTimeout(() => setSources(null), 0)
      })
    return () => {
      cancelled = true
    }
  }, [groupId, plan.status, plan.version])

  const canStart = plan.status === 'approved'
  const canFinish =
    plan.status === 'packing' &&
    plan.parcels.length > 0 &&
    plan.parcels.every((parcel) => parcel.status === 'sealed')

  async function run(task: () => Promise<PackingPlan>): Promise<void> {
    setBusy(true)
    try {
      onPlan(await task())
    } catch (err: unknown) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          {vi ? 'Phiên đóng gói' : 'Packing session'}
        </h3>
        <span className="text-xs capitalize text-ink-muted">{plan.status}</span>
      </div>
      {canStart ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => startPackingSession(groupId, plan.version))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {vi ? 'Bắt đầu đóng' : 'Start packing'}
        </button>
      ) : null}
      {groupParcelsByOrder(plan.parcels).groups.map((bucket) => {
        const layout = groupParcelsByOrder(plan.parcels)
        return (
          <div key={bucket.key} className="space-y-2">
            {layout.multi ? (
              <p className="text-xs font-semibold text-ink">{parcelOrderHeading(bucket, vi)}</p>
            ) : null}
            {bucket.parcels.map((parcel) => {
        const pending = parcel.status === 'pending'
        const held = parcel.status === 'held'
        const sealed = parcel.status === 'sealed' || held
        const toUnpack = parcel.status === 'to_unpack'
        const sourceInfo = sources?.parcels.find((p) => p.parcelNo === parcel.parcelNo)
        const choice: BoxSourceInput = boxChoice[parcel.parcelNo] ?? { source: 'auto' }
        const caption = parcelOrderCaption(parcel, vi)
        return (
          <div
            key={parcel.parcelNo}
            className={`rounded-lg border border-hairline p-3 text-sm ${parcelBorderClass(parcel.recipientName, layout.multi)}`}
          >
            <p className="font-medium text-ink">
              #{String(parcel.parcelNo)} {parcel.box.code}
              {caption ? (
                <span className="ml-2 text-xs font-semibold text-sky-700">{caption}</span>
              ) : null}
              <span className="ml-2 text-xs capitalize text-ink-muted">{parcel.status}</span>
              <span className="ml-2 text-xs text-ink-muted">
                {String(parcel.scannedCount ?? parcel.scans?.length ?? 0)}/
                {String(parcel.itemCount ?? '—')}
              </span>
            </p>
            {pending && plan.status === 'packing' ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={vi ? 'SKU sàn hoặc SKU nội bộ' : 'Seller or master SKU'}
                  className="h-9 min-w-[12rem] rounded-lg border border-hairline bg-canvas px-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || code.trim().length === 0}
                  onClick={() =>
                    void run(async () => {
                      const next = await scanParcelItem(groupId, parcel.parcelNo, {
                        code: code.trim(),
                        quantity: 1,
                        clientEventId: newEventId(),
                      })
                      setCode('')
                      return next
                    })
                  }
                  className="rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {vi ? 'Quét' : 'Scan'}
                </button>
              </div>
            ) : null}
            {(parcel.scans ?? []).length > 0 ? (
              <ul className="mt-2 space-y-1">
                {(parcel.scans ?? []).map((scan) => (
                  <li key={scan.itemKey} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-ink">{scan.sku}</span>
                    <span className="text-ink-muted">{scan.itemKey}</span>
                    {pending ? (
                      <>
                        <input
                          value={unscanReason}
                          onChange={(event) => setUnscanReason(event.target.value)}
                          placeholder={vi ? 'Lý do gỡ (tối thiểu 3 ký tự)' : 'Unscan reason (min 3)'}
                          className="h-8 rounded border border-hairline bg-canvas px-2"
                        />
                        <button
                          type="button"
                          disabled={busy || unscanReason.trim().length < 3}
                          onClick={() =>
                            void run(() =>
                              unscanParcelItem(groupId, parcel.parcelNo, {
                                expectedVersion: plan.version,
                                itemKey: scan.itemKey,
                                reason: unscanReason.trim(),
                              }),
                            )
                          }
                          className="rounded border border-hairline px-2 py-1 disabled:opacity-50"
                        >
                          {vi ? 'Bỏ quét' : 'Unscan'}
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {pending && plan.status === 'packing' && sourceInfo ? (
              <BoxSourceFields
                vi={vi}
                info={sourceInfo}
                value={choice}
                onChange={(next) => setBoxChoice((prev) => ({ ...prev, [parcel.parcelNo]: next }))}
              />
            ) : null}
            {pending && plan.status === 'packing' ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="text-xs text-ink-muted">
                  {vi ? 'Cân kiện (kg)' : 'Parcel weight (kg)'}
                  <input
                    value={sealWeight}
                    onChange={(event) => setSealWeight(event.target.value)}
                    inputMode="decimal"
                    className="mt-1 block h-9 w-28 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || weightOk(sealWeight) == null}
                  onClick={() => {
                    const weight = weightOk(sealWeight)
                    if (weight == null) return
                    const msg = boxSourceError(choice, sourceInfo, vi)
                    if (msg) {
                      onError(new Error(msg))
                      return
                    }
                    void run(() =>
                      sealParcel(
                        groupId,
                        parcel.parcelNo,
                        plan.version,
                        weight,
                        sourceInfo ? choice : undefined,
                      ),
                    )
                  }}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {vi ? 'Niêm phong' : 'Seal'}
                </button>
                <select
                  value={boxCode}
                  onChange={(event) => setBoxCode(event.target.value)}
                  className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                >
                  {boxes.map((box) => (
                    <option key={box.code} value={box.code}>
                      {box.code}
                    </option>
                  ))}
                </select>
                <select
                  value={boxReason}
                  onChange={(event) => setBoxReason(event.target.value as AdjustmentReason)}
                  className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                >
                  {ADJUSTMENT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {vi ? PACKING_REASON_LABELS[reason].vi : PACKING_REASON_LABELS[reason].en}
                    </option>
                  ))}
                </select>
                <select
                  value={oldOutcome}
                  onChange={(event) => setOldOutcome(event.target.value as 'unused' | 'damaged')}
                  className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                >
                  <option value="unused">{vi ? 'Thùng cũ chưa dùng' : 'Old box unused'}</option>
                  <option value="damaged">{vi ? 'Thùng cũ hỏng' : 'Old box damaged'}</option>
                </select>
                <button
                  type="button"
                  disabled={busy || boxCode.length === 0}
                  onClick={() =>
                    void run(() =>
                      changeParcelBoxInSession(groupId, parcel.parcelNo, {
                        expectedVersion: plan.version,
                        boxCode,
                        reason: boxReason,
                        oldBoxOutcome: oldOutcome,
                      }),
                    )
                  }
                  className="rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                >
                  {vi ? 'Đổi thùng lúc đóng' : 'Change box while packing'}
                </button>
              </div>
            ) : null}
            {held ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <p className="w-full text-xs text-amber-800">
                  {vi
                    ? 'Kiện lệch cân. Người khác người niêm phong mới được chấp nhận.'
                    : 'Weight is off. Someone other than the sealer must accept it.'}
                </p>
                <select
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value as ParcelReviewReason)}
                  className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                >
                  {PARCEL_REVIEW_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {vi ? PARCEL_REVIEW_LABELS[reason].vi : PARCEL_REVIEW_LABELS[reason].en}
                    </option>
                  ))}
                </select>
                <input
                  value={reviewWeight}
                  onChange={(event) => setReviewWeight(event.target.value)}
                  placeholder={vi ? 'Cân mới (kg)' : 'New weight (kg)'}
                  className="h-9 w-28 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      reviewParcel(groupId, parcel.parcelNo, {
                        expectedVersion: plan.version,
                        action: 'accept',
                        reason: reviewReason,
                      }),
                    )
                  }
                  className="rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {vi ? 'Chấp nhận' : 'Accept'}
                </button>
                <button
                  type="button"
                  disabled={busy || weightOk(reviewWeight) == null}
                  onClick={() => {
                    const weight = weightOk(reviewWeight)
                    if (weight == null) return
                    void run(() =>
                      reviewParcel(groupId, parcel.parcelNo, {
                        expectedVersion: plan.version,
                        action: 'reweigh',
                        reason: reviewReason,
                        weightKg: weight,
                      }),
                    )
                  }}
                  className="rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                >
                  {vi ? 'Cân lại' : 'Reweigh'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      reviewParcel(groupId, parcel.parcelNo, {
                        expectedVersion: plan.version,
                        action: 'reopen',
                        reason: reviewReason,
                      }),
                    )
                  }
                  className="rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                >
                  {vi ? 'Mở ra đóng lại' : 'Reopen'}
                </button>
              </div>
            ) : null}
            {sealed ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={boxCondition}
                  onChange={(event) =>
                    setBoxCondition(event.target.value as 'reusable' | 'damaged')
                  }
                  className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                >
                  <option value="reusable">{vi ? 'Thùng còn dùng được' : 'Box reusable'}</option>
                  <option value="damaged">{vi ? 'Thùng hỏng' : 'Box damaged'}</option>
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      unsealParcel(groupId, parcel.parcelNo, {
                        expectedVersion: plan.version,
                        reason: 'OTHER',
                        boxCondition,
                        note: vi ? 'Mở lại kiện trên màn đóng gói' : 'Unseal from packing screen',
                      }),
                    )
                  }
                  className="rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                >
                  {vi ? 'Mở niêm phong' : 'Unseal'}
                </button>
              </div>
            ) : null}
            {toUnpack ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    unpackParcel(groupId, parcel.parcelNo, {
                      expectedVersion: plan.version,
                      boxCondition,
                    }),
                  )
                }
                className="mt-2 rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
              >
                {vi ? 'Tháo kiện đơn hủy' : 'Unpack canceled order'}
              </button>
            ) : null}
            {(parcel.scans ?? []).length > 0 && pending ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  value={issue}
                  onChange={(event) =>
                    setIssue(event.target.value as 'damaged' | 'missing' | 'wrong_item')
                  }
                  className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                >
                  <option value="damaged">{vi ? 'Hỏng' : 'Damaged'}</option>
                  <option value="missing">{vi ? 'Thiếu' : 'Missing'}</option>
                  <option value="wrong_item">{vi ? 'Nhầm món' : 'Wrong item'}</option>
                </select>
                <select
                  value={resolution}
                  onChange={(event) =>
                    setResolution(event.target.value as 'replace' | 'back_to_picking')
                  }
                  className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                >
                  <option value="back_to_picking">{vi ? 'Trả về lấy hàng' : 'Back to picking'}</option>
                  <option value="replace">{vi ? 'Lấy món thay' : 'Replace'}</option>
                </select>
                {resolution === 'replace' ? (
                  <input
                    value={warehouseId}
                    onChange={(event) => setWarehouseId(event.target.value)}
                    placeholder={vi ? 'Id kho' : 'Warehouse id'}
                    className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                  />
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const itemKey = parcel.scans?.[0]?.itemKey
                    if (!itemKey) return
                    void run(() =>
                      reportPackingIssue(groupId, {
                        expectedVersion: plan.version,
                        parcelNo: parcel.parcelNo,
                        itemKey,
                        issue,
                        resolution,
                        warehouseId: warehouseId.trim() || undefined,
                      }),
                    )
                  }}
                  className="rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                >
                  {vi ? 'Báo sự cố' : 'Report issue'}
                </button>
              </div>
            ) : null}
          </div>
        )
            })}
          </div>
        )
      })}
      {canFinish ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => finishPackingSession(groupId, plan.version))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {vi ? 'Hoàn tất đóng gói' : 'Finish packing'}
        </button>
      ) : null}
    </div>
  )
}
