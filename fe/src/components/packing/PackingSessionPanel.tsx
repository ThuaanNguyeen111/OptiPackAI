import { useEffect, useState, type ReactElement } from 'react'
import { Loader2 } from 'lucide-react'
import { BoxSourceFields, boxSourceError } from './BoxSourceFields'
import { uploadProofPhotos } from '../../api/proof-photos.api'
import { ProofPhotoPicker } from '../proof/ProofPhotoPicker'
import {
  changeParcelBoxInSession,
  finishPackingSession,
  getPackingBoxSources,
  listReplacementWarehouses,
  reportPackingIssue,
  reviewParcel,
  scanParcelItem,
  sealParcel,
  startPackingSession,
  unpackParcel,
  unscanParcelItem,
  unsealParcel,
  type ReplacementWarehouse,
} from '../../api/packing-plan.api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import {
  ADJUSTMENT_REASONS,
  boxCutNote,
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
import { MailerBadge, SharedParcelOrders } from './SharedParcelOrders'
import { SealPhotoPicker } from './SealPhotoPicker'
import { PhotoThumbs } from '../ui/PhotoThumbs'

type BoxOption = { code: string; name: string }

function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `scan-${String(Date.now())}`
}

/** AOFP-332 — mọi món của kiện (cả chưa quét) để báo sự cố; kiện không có toạ độ thì dùng món đã quét. */
function parcelItems(parcel: PackingPlan['parcels'][number]): { itemKey: string; sku: string; scanned: boolean }[] {
  const scanned = new Set((parcel.scans ?? []).map((s) => s.itemKey))
  const placements = parcel.placements ?? []
  const source = placements.length > 0 ? placements : (parcel.scans ?? [])
  return source.map((p) => ({ itemKey: p.itemKey, sku: p.sku, scanned: scanned.has(p.itemKey) }))
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
  requireSealPhoto = false,
}: {
  groupId: string
  plan: PackingPlan
  boxes: BoxOption[]
  vi: boolean
  requireSealPhoto?: boolean
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
  const [warehouses, setWarehouses] = useState<ReplacementWarehouse[]>([])
  const [issueItem, setIssueItem] = useState<Record<number, string>>({})
  // AOFP-332 — tháo kiện / hoàn tác niêm phong qua hộp xác nhận.
  const [unpackFor, setUnpackFor] = useState<number | null>(null)
  const [unpackCondition, setUnpackCondition] = useState<'reusable' | 'damaged' | null>(null)
  const [recoverQty, setRecoverQty] = useState<Record<string, number>>({})
  const [unsealFor, setUnsealFor] = useState<number | null>(null)
  const [unsealReason, setUnsealReason] = useState<AdjustmentReason | ''>('')
  const [unsealNote, setUnsealNote] = useState('')
  /** (13/11/2026) Ảnh món lỗi theo kiện, chưa tải lên. */
  const [issuePhotos, setIssuePhotos] = useState<Record<number, File[]>>({})
  const [boxCondition, setBoxCondition] = useState<'reusable' | 'damaged'>('reusable')
  const [sources, setSources] = useState<PackingBoxSources | null>(null)
  const [boxChoice, setBoxChoice] = useState<Record<number, BoxSourceInput>>({})
  // Khoá theo kế hoạch + kiện: đổi kế hoạch thì ảnh cũ không dính sang.
  const [sealPhotos, setSealPhotos] = useState<Record<string, string[]>>({})

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

  useEffect(() => {
    if (plan.status !== 'packing') return
    let cancelled = false
    listReplacementWarehouses(groupId)
      .then((rows) => {
        if (!cancelled) window.setTimeout(() => setWarehouses(rows), 0)
      })
      .catch(() => {
        if (!cancelled) window.setTimeout(() => setWarehouses([]), 0)
      })
    return () => {
      cancelled = true
    }
  }, [groupId, plan.status])

  const unpackParcelRow = plan.parcels.find((p) => p.parcelNo === unpackFor)
  const unpackCut = unpackParcelRow?.box.cutFromInnerHeightMm != null
  const unpackChoice = unpackCut ? 'damaged' : unpackCondition
  const unsealNeedsNote = unsealReason === 'OTHER' && unsealNote.trim().length === 0

  function openUnpack(parcelNo: number): void {
    setUnpackFor(parcelNo)
    setUnpackCondition(null)
    setRecoverQty({})
  }

  function openUnseal(parcelNo: number): void {
    setUnsealFor(parcelNo)
    setUnsealReason('')
    setUnsealNote('')
    setBoxCondition('reusable')
  }

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
        const photoKey = `${plan.id}:${String(parcel.parcelNo)}`
        const photos = sealPhotos[photoKey] ?? []
        return (
          <div
            key={parcel.parcelNo}
            className={`rounded-lg border border-hairline p-3 text-sm ${parcelBorderClass(parcel.recipientName, layout.multi)}`}
          >
            <p className="font-medium text-ink">
              #{String(parcel.parcelNo)} {parcel.box.code}
              <MailerBadge parcel={parcel} vi={vi} />
              {caption ? (
                <span className="ml-2 text-xs font-semibold text-sky-700">{caption}</span>
              ) : null}
              <span className="ml-2 text-xs capitalize text-ink-muted">{parcel.status}</span>
              <span className="ml-2 text-xs text-ink-muted">
                {String(parcel.scannedCount ?? parcel.scans?.length ?? 0)}/
                {String(parcel.itemCount ?? '—')}
              </span>
            </p>
            <SharedParcelOrders parcel={parcel} orders={plan.orders} vi={vi} />
            {pending && parcel.box.cutFromInnerHeightMm != null ? (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                {vi ? 'Cắt hạ thùng trước khi xếp hàng' : 'Cut the box down before packing'}
                {boxCutNote(parcel.box, vi)}
              </p>
            ) : null}
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
            {sealed && (parcel.sealPhotoUrls ?? []).length > 0 ? (
              <div className="mt-2">
                <PhotoThumbs urls={parcel.sealPhotoUrls ?? []} alt={vi ? 'Ảnh niêm phong' : 'Seal photo'} size="h-14 w-14" />
              </div>
            ) : null}
            {pending && plan.status === 'packing' ? (
              <SealPhotoPicker
                vi={vi}
                required={requireSealPhoto}
                disabled={busy}
                value={photos}
                onChange={(urls) => setSealPhotos((prev) => ({ ...prev, [photoKey]: urls }))}
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
                  disabled={busy || weightOk(sealWeight) == null || (requireSealPhoto && photos.length === 0)}
                  title={requireSealPhoto && photos.length === 0 ? (vi ? 'Chụp ít nhất 1 ảnh kiện trước' : 'Take a parcel photo first') : undefined}
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
                        photos,
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
            {/* Panel chỉ hiện khi kế hoạch approved/packing — kế hoạch packed (Staff bị 403) không tới đây. */}
            {sealed && plan.status === 'packing' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => openUnseal(parcel.parcelNo)}
                className="mt-2 rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
              >
                {vi ? 'Mở niêm phong' : 'Unseal'}
              </button>
            ) : null}
            {toUnpack ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => openUnpack(parcel.parcelNo)}
                className="mt-2 rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
              >
                {vi ? 'Tháo kiện đơn hủy' : 'Unpack canceled order'}
              </button>
            ) : null}
            {pending && plan.status === 'packing' && parcelItems(parcel).length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  aria-label={vi ? 'Món bị sự cố' : 'Item with issue'}
                  value={issueItem[parcel.parcelNo] ?? parcelItems(parcel)[0]?.itemKey ?? ''}
                  onChange={(event) =>
                    setIssueItem((prev) => ({ ...prev, [parcel.parcelNo]: event.target.value }))
                  }
                  className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                >
                  {parcelItems(parcel).map((item) => (
                    <option key={item.itemKey} value={item.itemKey}>
                      {item.sku} · {item.itemKey}
                      {item.scanned ? (vi ? ' (đã quét)' : ' (scanned)') : ''}
                    </option>
                  ))}
                </select>
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
                  <select
                    aria-label={vi ? 'Kho lấy món thay' : 'Replacement warehouse'}
                    value={warehouseId || (warehouses[0]?.id ?? '')}
                    onChange={(event) => setWarehouseId(event.target.value)}
                    className="h-9 rounded-lg border border-hairline bg-canvas px-2 text-sm"
                  >
                    {warehouses.length === 0 ? (
                      <option value="">{vi ? 'Chưa có kho' : 'No warehouse'}</option>
                    ) : null}
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} · {w.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  disabled={busy || (resolution === 'replace' && !(warehouseId || warehouses[0]?.id))}
                  onClick={() => {
                    const itemKey = issueItem[parcel.parcelNo] ?? parcelItems(parcel)[0]?.itemKey
                    if (!itemKey) return
                    const replaceFrom = warehouseId || warehouses[0]?.id
                    void run(async () => {
                      const photoUrls = await uploadProofPhotos(issuePhotos[parcel.parcelNo] ?? [])
                      const next = await reportPackingIssue(groupId, {
                        expectedVersion: plan.version,
                        parcelNo: parcel.parcelNo,
                        itemKey,
                        issue,
                        resolution,
                        warehouseId: resolution === 'replace' ? replaceFrom : undefined,
                        photoUrls,
                      })
                      setIssuePhotos((prev) => ({ ...prev, [parcel.parcelNo]: [] }))
                      return next
                    })
                  }}
                  className="rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                >
                  {vi ? 'Báo sự cố' : 'Report issue'}
                </button>
                <div className="basis-full">
                  <ProofPhotoPicker
                    vi={vi}
                    files={issuePhotos[parcel.parcelNo] ?? []}
                    onChange={(files) => setIssuePhotos((prev) => ({ ...prev, [parcel.parcelNo]: files }))}
                    disabled={busy}
                    label={vi ? 'Ảnh món lỗi' : 'Issue photo'}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )
            })}
          </div>
        )
      })}
      <ConfirmDialog
        open={unpackFor != null}
        title={vi ? `Tháo kiện #${String(unpackFor ?? '')}` : `Unpack parcel #${String(unpackFor ?? '')}`}
        description={
          vi
            ? 'Hàng trong kiện trả về kệ. Chọn tình trạng thùng và số vật tư chèn còn dùng lại được.'
            : 'Items go back to the shelf. Choose the box condition and how many fillers can be reused.'
        }
        confirmLabel={vi ? 'Tháo kiện' : 'Unpack'}
        cancelLabel={vi ? 'Huỷ' : 'Cancel'}
        loading={busy}
        confirmDisabled={unpackChoice == null}
        onCancel={() => setUnpackFor(null)}
        onConfirm={() => {
          if (unpackFor == null || unpackChoice == null) return
          const parcelNo = unpackFor
          const recoveredMaterials = Object.entries(recoverQty)
            .filter(([, quantity]) => quantity > 0)
            .map(([materialCode, quantity]) => ({ code: materialCode, quantity }))
          setUnpackFor(null)
          void run(() =>
            unpackParcel(groupId, parcelNo, {
              expectedVersion: plan.version,
              boxCondition: unpackChoice,
              recoveredMaterials,
            }),
          )
        }}
      >
        <fieldset className="mt-3 space-y-1 text-sm">
          <legend className="text-xs font-medium text-ink">{vi ? 'Tình trạng thùng' : 'Box condition'}</legend>
          {unpackCut ? (
            <p className="text-xs text-amber-800">
              {vi
                ? 'Thùng đã cắt hạ — không dùng lại như thùng nguyên cỡ, tính là thùng hỏng.'
                : 'Box was cut down — it cannot be reused as full size, counted as damaged.'}
            </p>
          ) : null}
          {(['reusable', 'damaged'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="unpack-box-condition"
                checked={unpackChoice === value}
                disabled={unpackCut}
                onChange={() => setUnpackCondition(value)}
              />
              {value === 'reusable'
                ? vi ? 'Thùng còn dùng được' : 'Box reusable'
                : vi ? 'Thùng hỏng' : 'Box damaged'}
            </label>
          ))}
        </fieldset>
        {(unpackParcelRow?.materials ?? []).some((m) => m.code) ? (
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-xs font-medium text-ink">{vi ? 'Vật tư chèn thu hồi' : 'Fillers recovered'}</p>
            {(unpackParcelRow?.materials ?? []).map((m) => {
              const materialCode = m.code
              if (!materialCode) return null
              return (
                <label key={materialCode} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    {m.name} ({vi ? 'tối đa' : 'max'} {String(m.quantity)})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={m.quantity}
                    value={recoverQty[materialCode] ?? 0}
                    onChange={(event) => {
                      const n = Math.max(0, Math.min(m.quantity, Math.floor(Number(event.target.value) || 0)))
                      setRecoverQty((prev) => ({ ...prev, [materialCode]: n }))
                    }}
                    className="h-8 w-20 rounded border border-hairline bg-canvas px-2"
                  />
                </label>
              )
            })}
          </div>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={unsealFor != null}
        title={vi ? `Mở niêm phong kiện #${String(unsealFor ?? '')}` : `Unseal parcel #${String(unsealFor ?? '')}`}
        description={
          vi
            ? 'Kiện quay về chưa niêm phong để đóng lại. Thùng hỏng thì ghi hao hụt, niêm phong lại sẽ lấy thùng mới.'
            : 'The parcel goes back to unsealed. A damaged box is written off and a new one is taken on reseal.'
        }
        confirmLabel={vi ? 'Mở niêm phong' : 'Unseal'}
        cancelLabel={vi ? 'Huỷ' : 'Cancel'}
        loading={busy}
        confirmDisabled={unsealReason === '' || unsealNeedsNote}
        onCancel={() => setUnsealFor(null)}
        onConfirm={() => {
          if (unsealFor == null || unsealReason === '' || unsealNeedsNote) return
          const parcelNo = unsealFor
          const reason = unsealReason
          setUnsealFor(null)
          void run(() =>
            unsealParcel(groupId, parcelNo, {
              expectedVersion: plan.version,
              reason,
              boxCondition,
              note: unsealNote.trim() || undefined,
            }),
          )
        }}
      >
        <div className="mt-3 space-y-2 text-sm">
          <label className="block text-xs text-ink-muted">
            {vi ? 'Lý do' : 'Reason'}
            <select
              value={unsealReason}
              onChange={(event) => setUnsealReason(event.target.value as AdjustmentReason | '')}
              className="mt-1 block h-9 w-full rounded-lg border border-hairline bg-canvas px-2 text-sm"
            >
              <option value="">{vi ? '— Chọn lý do —' : '— Choose a reason —'}</option>
              {ADJUSTMENT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {vi ? PACKING_REASON_LABELS[reason].vi : PACKING_REASON_LABELS[reason].en}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-ink-muted">
            {vi ? 'Thùng' : 'Box'}
            <select
              value={boxCondition}
              onChange={(event) => setBoxCondition(event.target.value as 'reusable' | 'damaged')}
              className="mt-1 block h-9 w-full rounded-lg border border-hairline bg-canvas px-2 text-sm"
            >
              <option value="reusable">{vi ? 'Thùng còn dùng được' : 'Box reusable'}</option>
              <option value="damaged">{vi ? 'Thùng hỏng' : 'Box damaged'}</option>
            </select>
          </label>
          <label className="block text-xs text-ink-muted">
            {unsealReason === 'OTHER' ? (vi ? 'Ghi chú (bắt buộc)' : 'Note (required)') : vi ? 'Ghi chú' : 'Note'}
            <input
              value={unsealNote}
              onChange={(event) => setUnsealNote(event.target.value)}
              maxLength={500}
              className="mt-1 block h-9 w-full rounded-lg border border-hairline bg-canvas px-2 text-sm"
            />
          </label>
        </div>
      </ConfirmDialog>
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
