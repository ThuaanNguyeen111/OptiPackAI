import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Loader2 } from 'lucide-react'
import { ApiError, getApiErrorCode } from '../../lib/api'
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
import { useAuth } from '../../context/use-auth'
import { sessionUserId } from '../../lib/session-user'
import { formatKg } from '../../utils/units'

type BoxOption = { code: string; name: string }

function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `scan-${String(Date.now())}`
}

/** AOFP-323 — nhãn trạng thái kế hoạch / kiện (không hiện mã tiếng Anh). */
const PLAN_STATUS_LABELS: Record<string, { vi: string; en: string }> = {
  approved: { vi: 'Đã duyệt – chờ đóng', en: 'Approved – ready to pack' },
  packing: { vi: 'Đang đóng', en: 'Packing' },
  packed: { vi: 'Đã đóng xong', en: 'Packed' },
}
const PARCEL_STATUS_LABELS: Record<string, { vi: string; en: string }> = {
  pending: { vi: 'Chờ niêm phong', en: 'Waiting to seal' },
  sealed: { vi: 'Đã niêm phong', en: 'Sealed' },
  held: { vi: 'Lệch cân – chờ xem lại', en: 'Weight off – awaiting review' },
  to_unpack: { vi: 'Cần tháo', en: 'Must unpack' },
  voided: { vi: 'Đã tháo', en: 'Unpacked' },
}
function statusLabel(labels: Record<string, { vi: string; en: string }>, status: string, vi: boolean): string {
  const label = labels[status]
  return label ? (vi ? label.vi : label.en) : status
}

/** Kiện còn hiệu lực (giống BE `isLiveParcel`): kiện cần tháo / đã tháo không tính. */
function isLiveParcel(parcel: { status: string }): boolean {
  return parcel.status !== 'to_unpack' && parcel.status !== 'voided'
}

/** AOFP-332 — mọi món của kiện (cả chưa quét) để báo sự cố; kiện không có toạ độ thì dùng món đã quét. */
function parcelItems(parcel: PackingPlan['parcels'][number]): { itemKey: string; sku: string; scanned: boolean }[] {
  const scanned = new Set((parcel.scans ?? []).map((s) => s.itemKey))
  const placements = parcel.placements ?? []
  const source = placements.length > 0 ? placements : (parcel.scans ?? [])
  return source.map((p) => ({ itemKey: p.itemKey, sku: p.sku, scanned: scanned.has(p.itemKey) }))
}

/** "SKU#2" của chính SKU đó → "SKU · cái 2" (không lặp mã SKU trong ô chọn). */
function issueItemLabel(item: { itemKey: string; sku: string; scanned: boolean }, vi: boolean): string {
  const ordinal = item.itemKey.startsWith(`${item.sku}#`) ? item.itemKey.slice(item.sku.length + 1) : null
  const name = ordinal ? `${item.sku} · ${vi ? 'cái' : 'unit'} ${ordinal}` : `${item.sku} · ${item.itemKey}`
  return item.scanned ? `${name} ${vi ? '(đã quét)' : '(scanned)'}` : name
}

const FIELD_CLASS = 'mt-1 block h-9 w-full min-w-0 rounded-lg border border-hairline bg-canvas px-2 text-sm text-ink'

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
  const { session } = useAuth()
  const me = sessionUserId(session?.accessToken)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)
  /** Kết quả lần quét gần nhất (đã quét / quét sai kiện) — hiện ngay dưới ô quét. */
  const [scanNote, setScanNote] = useState<{ text: string; warn: boolean } | null>(null)
  // AOFP-323 — cân / cân lại / tình trạng thùng theo TỪNG kiện (khoá `${plan.id}:${parcelNo}`),
  // để cân kiện 1 không dính sang kiện 2.
  const [sealWeights, setSealWeights] = useState<Record<string, string>>({})
  const [reviewWeights, setReviewWeights] = useState<Record<string, string>>({})
  /** Kiện người dùng chọn làm; null / không còn chờ niêm phong → kiện chờ có số nhỏ nhất. */
  const [chosenNo, setChosenNo] = useState<number | null>(null)
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
  const [unsealBoxCondition, setUnsealBoxCondition] = useState<'reusable' | 'damaged'>('reusable')
  /** (13/11/2026) Ảnh món lỗi theo kiện, chưa tải lên. */
  const [issuePhotos, setIssuePhotos] = useState<Record<number, File[]>>({})
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
    setUnsealBoxCondition('reusable')
  }

  const canStart = plan.status === 'approved'
  const liveParcels = plan.parcels.filter(isLiveParcel)
  const canFinish =
    plan.status === 'packing' &&
    liveParcels.length > 0 &&
    liveParcels.every((parcel) => parcel.status === 'sealed')
  const pendingNos = plan.parcels
    .filter((parcel) => parcel.status === 'pending')
    .map((parcel) => parcel.parcelNo)
    .sort((a, b) => a - b)
  const activeNo =
    plan.status !== 'packing'
      ? null
      : chosenNo != null && pendingNos.includes(chosenNo)
        ? chosenNo
        : (pendingNos[0] ?? null)
  const activeParcel = plan.parcels.find((parcel) => parcel.parcelNo === activeNo) ?? null
  const keyOf = (parcelNo: number): string => `${plan.id}:${String(parcelNo)}`

  async function run(task: () => Promise<PackingPlan>, onDone?: () => void): Promise<void> {
    setBusy(true)
    try {
      onPlan(await task())
      onDone?.()
    } catch (err: unknown) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  async function scan(parcelNo: number): Promise<void> {
    const value = code.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      const res = await scanParcelItem(groupId, parcelNo, { code: value, quantity: 1, clientEventId: newEventId() })
      onPlan(res.plan)
      setCode('')
      setScanNote({
        text: res.scan.duplicate
          ? vi ? `Đã ghi nhận ${res.scan.sku} trước đó (bỏ qua lần gửi lại)` : `${res.scan.sku} was already recorded`
          : vi
            ? `Đã quét ${res.scan.sku} · kiện ${String(res.scan.parcelNo)} còn ${String(res.scan.remainingInParcel)} món`
            : `Scanned ${res.scan.sku} · parcel ${String(res.scan.parcelNo)} has ${String(res.scan.remainingInParcel)} left`,
        warn: false,
      })
    } catch (err: unknown) {
      const belongs = err instanceof ApiError ? err.details?.belongsToParcels : null
      if (getApiErrorCode(err) === 'PACKING_SCAN_WRONG_PARCEL' && Array.isArray(belongs) && belongs.length > 0) {
        setCode('')
        setScanNote({ text: vi ? `Món này thuộc kiện ${belongs.join(', ')}` : `This item belongs to parcel ${belongs.join(', ')}`, warn: true })
      } else {
        setScanNote(null)
        onError(err)
        scanInputRef.current?.select() // giữ mã để sửa tay, nhưng lần bắn súng kế tiếp ghi đè thay vì nối vào
      }
    } finally {
      setBusy(false)
      scanInputRef.current?.focus() // súng quét bắn liên tục — giữ focus cho lần quét sau
    }
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          {vi ? 'Phiên đóng gói' : 'Packing session'}
        </h3>
        <span className="text-xs text-ink-muted">{statusLabel(PLAN_STATUS_LABELS, plan.status, vi)}</span>
      </div>
      {activeParcel ? (
        <p className="rounded-md bg-sky-50 px-2 py-1.5 text-xs font-medium text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
          {vi
            ? `Kiện ${String(liveParcels.findIndex((p) => p.parcelNo === activeParcel.parcelNo) + 1)}/${String(liveParcels.length)} · đã quét ${String(activeParcel.scannedCount ?? activeParcel.scans?.length ?? 0)}/${String(activeParcel.itemCount ?? '—')} món`
            : `Parcel ${String(liveParcels.findIndex((p) => p.parcelNo === activeParcel.parcelNo) + 1)}/${String(liveParcels.length)} · scanned ${String(activeParcel.scannedCount ?? activeParcel.scans?.length ?? 0)}/${String(activeParcel.itemCount ?? '—')} items`}
        </p>
      ) : null}
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
          <div key={bucket.key} className="min-w-0 space-y-2">
            {layout.multi ? (
              <p className="text-xs font-semibold text-ink">{parcelOrderHeading(bucket, vi)}</p>
            ) : null}
            {bucket.parcels.map((parcel) => {
        const pending = parcel.status === 'pending'
        const held = parcel.status === 'held'
        // AOFP-331 — người niêm phong không tự chấp nhận / cân lại kiện lệch cân (BE trả 403).
        const sealedByMe = held && me !== null && parcel.sealedBy === me
        const sealed = parcel.status === 'sealed' || held
        const toUnpack = parcel.status === 'to_unpack'
        const sourceInfo = sources?.parcels.find((p) => p.parcelNo === parcel.parcelNo)
        const choice: BoxSourceInput = boxChoice[parcel.parcelNo] ?? { source: 'auto' }
        const caption = parcelOrderCaption(parcel, vi)
        const photoKey = keyOf(parcel.parcelNo)
        const photos = sealPhotos[photoKey] ?? []
        // AOFP-323 — chỉ kiện đang làm mở form; kiện chờ khác thu gọn, bấm "Làm kiện N" để chuyển.
        const working = pending && parcel.parcelNo === activeNo
        const collapsed = pending && plan.status === 'packing' && !working
        const scannedCount = parcel.scannedCount ?? parcel.scans?.length ?? 0
        const fullyScanned = parcel.itemCount == null || scannedCount >= parcel.itemCount
        const sealWeight = sealWeights[photoKey] ?? ''
        const reviewWeight = reviewWeights[photoKey] ?? ''
        return (
          <div
            key={parcel.parcelNo}
            className={`min-w-0 rounded-lg border border-hairline p-3 text-sm ${parcelBorderClass(parcel.recipientName, layout.multi)}`}
          >
            <p className="font-medium text-ink">
              #{String(parcel.parcelNo)} {parcel.box.code}
              <MailerBadge parcel={parcel} vi={vi} />
              {caption ? (
                <span className="ml-2 text-xs font-semibold text-sky-700">{caption}</span>
              ) : null}
              <span className="ml-2 text-xs text-ink-muted">{statusLabel(PARCEL_STATUS_LABELS, parcel.status, vi)}</span>
              <span className="ml-2 text-xs text-ink-muted">
                {String(scannedCount)}/
                {String(parcel.itemCount ?? '—')}
              </span>
            </p>
            {collapsed ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setChosenNo(parcel.parcelNo)
                  setScanNote(null)
                }}
                className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {vi ? `Làm kiện ${String(parcel.parcelNo)}` : `Work on parcel ${String(parcel.parcelNo)}`}
              </button>
            ) : null}
            {collapsed ? null : <>
            <SharedParcelOrders parcel={parcel} orders={plan.orders} vi={vi} />
            {pending && parcel.box.cutFromInnerHeightMm != null ? (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                {vi ? 'Cắt hạ thùng trước khi xếp hàng' : 'Cut the box down before packing'}
                {boxCutNote(parcel.box, vi)}
              </p>
            ) : null}
            {working ? (
              // Súng quét gõ mã rồi gửi Enter → submit form.
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void scan(parcel.parcelNo)
                }}
              >
                <input
                  ref={scanInputRef}
                  autoFocus
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={vi ? 'SKU sàn hoặc SKU nội bộ' : 'Seller or master SKU'}
                  aria-label={vi ? `Quét món kiện ${String(parcel.parcelNo)}` : `Scan item for parcel ${String(parcel.parcelNo)}`}
                  className="h-9 min-w-[12rem] rounded-lg border border-hairline bg-canvas px-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || code.trim().length === 0}
                  className="rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {vi ? 'Quét' : 'Scan'}
                </button>
                {scanNote ? (
                  <p
                    role="status"
                    className={`basis-full text-xs font-medium ${scanNote.warn ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-700 dark:text-emerald-300'}`}
                  >
                    {scanNote.text}
                  </p>
                ) : null}
              </form>
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
                              () => setUnscanReason(''),
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
            {working && sourceInfo ? (
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
            {working && fullyScanned ? (
              <SealPhotoPicker
                vi={vi}
                required={requireSealPhoto}
                disabled={busy}
                value={photos}
                onChange={(urls) => setSealPhotos((prev) => ({ ...prev, [photoKey]: urls }))}
              />
            ) : null}
            {working && !fullyScanned ? (
              <p className="mt-2 text-xs text-ink-muted">
                {vi
                  ? `Quét đủ ${String(parcel.itemCount ?? '')} món rồi mới cân và niêm phong.`
                  : `Scan all ${String(parcel.itemCount ?? '')} items before weighing and sealing.`}
              </p>
            ) : null}
            {working ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {fullyScanned ? (
                  <>
                <label className="text-xs text-ink-muted">
                  {vi ? `Cân kiện ${String(parcel.parcelNo)} (kg)` : `Parcel ${String(parcel.parcelNo)} weight (kg)`}
                  <input
                    value={sealWeight}
                    onChange={(event) => setSealWeights((prev) => ({ ...prev, [photoKey]: event.target.value }))}
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
                    void run(
                      () =>
                        sealParcel(
                          groupId,
                          parcel.parcelNo,
                          plan.version,
                          weight,
                          sourceInfo ? choice : undefined,
                          photos,
                        ),
                      () => {
                        // Niêm phong xong: xoá cân + ảnh của kiện này; kiện chờ kế tiếp tự mở.
                        setSealWeights((prev) => ({ ...prev, [photoKey]: '' }))
                        setSealPhotos((prev) => ({ ...prev, [photoKey]: [] }))
                        setScanNote(null)
                      },
                    )
                  }}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {vi ? `Niêm phong kiện ${String(parcel.parcelNo)}` : `Seal parcel ${String(parcel.parcelNo)}`}
                </button>
                  </>
                ) : null}
              </div>
            ) : null}
            {working ? (
              <details className="mt-2 min-w-0 rounded-lg border border-hairline">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink">
                  {vi ? 'Đổi sang thùng khác' : 'Use a different box'}
                </summary>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2 border-t border-hairline p-3">
                  <label className="min-w-0 text-xs text-ink-muted">
                    {vi ? 'Thùng thay thế' : 'New box'}
                    <select value={boxCode} onChange={(event) => setBoxCode(event.target.value)} className={FIELD_CLASS}>
                      {boxes.map((box) => (
                        <option key={box.code} value={box.code}>
                          {box.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-0 text-xs text-ink-muted">
                    {vi ? 'Lý do đổi' : 'Reason'}
                    <select
                      value={boxReason}
                      onChange={(event) => setBoxReason(event.target.value as AdjustmentReason)}
                      className={FIELD_CLASS}
                    >
                      {ADJUSTMENT_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {vi ? PACKING_REASON_LABELS[reason].vi : PACKING_REASON_LABELS[reason].en}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-0 text-xs text-ink-muted">
                    {vi ? 'Tình trạng thùng cũ' : 'Old box'}
                    <select
                      value={oldOutcome}
                      onChange={(event) => setOldOutcome(event.target.value as 'unused' | 'damaged')}
                      className={FIELD_CLASS}
                    >
                      <option value="unused">{vi ? 'Thùng cũ chưa dùng' : 'Old box unused'}</option>
                      <option value="damaged">{vi ? 'Thùng cũ hỏng' : 'Old box damaged'}</option>
                    </select>
                  </label>
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
                    className="col-span-full justify-self-start rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                  >
                    {vi ? 'Đổi thùng lúc đóng' : 'Change box while packing'}
                  </button>
                </div>
              </details>
            ) : null}
            {held ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <p className="w-full text-xs text-amber-800">
                  {weightOffCopy(parcel, vi)}
                  {sealedByMe
                    ? vi
                      ? ' Cần người khác xem lại kiện này.'
                      : ' Someone else must review this parcel.'
                    : ''}
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
                {sealedByMe ? null : (
                  <>
                <input
                  value={reviewWeight}
                  onChange={(event) => setReviewWeights((prev) => ({ ...prev, [photoKey]: event.target.value }))}
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
                  </>
                )}
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
            {working && parcelItems(parcel).length > 0 ? (
              <details className="mt-2 min-w-0 rounded-lg border border-hairline">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink">
                  {vi ? 'Món có vấn đề? Báo sự cố' : 'Problem with an item? Report it'}
                </summary>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2 border-t border-hairline p-3">
                <label className="col-span-full min-w-0 text-xs text-ink-muted">
                {vi ? 'Món bị sự cố' : 'Item with issue'}
                <select
                  aria-label={vi ? 'Món bị sự cố' : 'Item with issue'}
                  value={issueItem[parcel.parcelNo] ?? parcelItems(parcel)[0]?.itemKey ?? ''}
                  onChange={(event) =>
                    setIssueItem((prev) => ({ ...prev, [parcel.parcelNo]: event.target.value }))
                  }
                  className={FIELD_CLASS}
                >
                  {parcelItems(parcel).map((item) => (
                    <option key={item.itemKey} value={item.itemKey}>
                      {issueItemLabel(item, vi)}
                    </option>
                  ))}
                </select>
                </label>
                <label className="min-w-0 text-xs text-ink-muted">
                {vi ? 'Vấn đề' : 'Issue'}
                <select
                  value={issue}
                  onChange={(event) =>
                    setIssue(event.target.value as 'damaged' | 'missing' | 'wrong_item')
                  }
                  className={FIELD_CLASS}
                >
                  <option value="damaged">{vi ? 'Hỏng' : 'Damaged'}</option>
                  <option value="missing">{vi ? 'Thiếu' : 'Missing'}</option>
                  <option value="wrong_item">{vi ? 'Nhầm món' : 'Wrong item'}</option>
                </select>
                </label>
                <label className="min-w-0 text-xs text-ink-muted">
                {vi ? 'Cách xử lý' : 'Resolution'}
                <select
                  value={resolution}
                  onChange={(event) =>
                    setResolution(event.target.value as 'replace' | 'back_to_picking')
                  }
                  className={FIELD_CLASS}
                >
                  <option value="back_to_picking">{vi ? 'Trả về lấy hàng' : 'Back to picking'}</option>
                  <option value="replace">{vi ? 'Lấy món thay' : 'Replace'}</option>
                </select>
                </label>
                {resolution === 'replace' ? (
                  <label className="col-span-full min-w-0 text-xs text-ink-muted">
                  {vi ? 'Kho lấy món thay' : 'Replacement warehouse'}
                  <select
                    aria-label={vi ? 'Kho lấy món thay' : 'Replacement warehouse'}
                    value={warehouseId || (warehouses[0]?.id ?? '')}
                    onChange={(event) => setWarehouseId(event.target.value)}
                    className={FIELD_CLASS}
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
                  </label>
                ) : null}
                <div className="col-span-full min-w-0">
                  <ProofPhotoPicker
                    vi={vi}
                    files={issuePhotos[parcel.parcelNo] ?? []}
                    onChange={(files) => setIssuePhotos((prev) => ({ ...prev, [parcel.parcelNo]: files }))}
                    disabled={busy}
                    label={vi ? 'Ảnh món lỗi' : 'Issue photo'}
                  />
                </div>
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
                  className="col-span-full justify-self-start rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  {vi ? 'Báo sự cố' : 'Report issue'}
                </button>
                </div>
              </details>
            ) : null}
            </>}
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
              boxCondition: unsealBoxCondition,
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
              value={unsealBoxCondition}
              onChange={(event) => setUnsealBoxCondition(event.target.value as 'reusable' | 'damaged')}
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

/** "Kiện 2 lệch cân: cân 1,6 kg, ước tính 1,2 kg (lệch 33%)." */
function weightOffCopy(parcel: PackingPlan['parcels'][number], vi: boolean): string {
  const actual = parcel.actualWeightKg
  const estimatedKg = parcel.estimatedWeightG / 1000
  if (actual === null || estimatedKg <= 0) {
    return vi ? `Kiện ${String(parcel.parcelNo)} lệch cân.` : `Parcel ${String(parcel.parcelNo)} weight is off.`
  }
  const pct = Math.round((Math.abs(actual - estimatedKg) / estimatedKg) * 100)
  return vi
    ? `Kiện ${String(parcel.parcelNo)} lệch cân: cân ${formatKg(actual)}, ước tính ${formatKg(estimatedKg)} (lệch ${String(pct)}%).`
    : `Parcel ${String(parcel.parcelNo)} weight is off: ${formatKg(actual)} vs estimated ${formatKg(estimatedKg)} (${String(pct)}% off).`
}
