import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Box, CheckCircle2, Cpu, Loader2, PackageCheck, RefreshCw, Sparkles, XCircle } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { PackingAnimation3D } from '../components/packing/PackingAnimation3D'
import { usePortal } from '../context/use-portal'
import { useAuth } from '../context/use-auth'
import { usePackagingPlan } from '../hooks/usePackagingPlan'
import { UserRole } from '../types/auth'
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  FULFILLMENT_STATUS_LABELS,
  materialLabel,
  type AdjustmentReason,
  type PackagingBox,
  type PackagingRecommendation,
  type PackingGuide,
  viewOfCarton,
} from '../types/packaging'

const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50'
const secondaryBtn =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
const card = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1'

function cm(mm: number): string {
  return (mm / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

function kg(g: number | null): string {
  return g === null ? '—' : `${(g / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} kg`
}

/**
 * /app/packing/groups/:groupId — kế hoạch đóng gói THẬT (engine 3D):
 * mỗi đơn 1 kiện, animation xếp từng món; Packaging Staff duyệt/đổi
 * thùng/từ chối; Warehouse Staff nhập cân từng kiện và xác nhận đóng xong.
 */
export function PackagingPlanPage() {
  const { groupId = '' } = useParams<{ groupId: string }>()
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const { session } = useAuth()
  const role = session?.role
  const plan = usePackagingPlan(groupId)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeCarton, setActiveCarton] = useState(0)
  const [weights, setWeights] = useState<Record<string, string>>({})

  const isAdmin = role === UserRole.ADMIN
  const canDecide = isAdmin || role === UserRole.PACKAGING_STAFF
  const canPack = isAdmin || role === UserRole.WAREHOUSE_STAFF
  // Trùng @Roles của POST .../packaging/:recommendationId/guide
  const canUseGuide = canDecide || role === UserRole.WAREHOUSE_STAFF
  const canPreviewCartons = canDecide || role === UserRole.WAREHOUSE_STAFF
  const status = plan.group?.fulfillmentStatus ?? ''
  const active =
    plan.recommendations.find((r) => r.id === activeId) ?? plan.recommendations[0] ?? null
  const statusLabel = FULFILLMENT_STATUS_LABELS[status]
  const hasNoFit = plan.recommendations.some((r) => r.solutionStatus === 'no_fit')

  // Mỗi KIỆN có cân riêng (đơn nhiều kiện có nhiều dòng). Khóa = `orderId:cartonIndex`.
  const parcelRows = plan.recommendations
    .filter((r) => r.orderId !== null && r.solutionStatus === 'ok')
    .flatMap((r) =>
      (r.cartons.length > 0 ? r.cartons : [{ index: 0, estimatedPackageWeightG: r.estimatedPackageWeightG }]).map((c) => ({
        rec: r,
        index: c.index,
        key: `${r.orderId ?? ''}:${String(c.index)}`,
        estimatedG: c.estimatedPackageWeightG,
      })),
    )
  const allWeightsValid = parcelRows.length > 0 && parcelRows.every((row) => Number(weights[row.key]) > 0)
  const cartonIndex = active && activeCarton < active.cartonCount ? activeCarton : 0
  const activeView = active ? viewOfCarton(active, cartonIndex) : null

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Kế hoạch đóng gói' : 'Packaging plans', to: '/app/packing' },
          { label: groupId.slice(-8) },
        ]}
      />
      <main className="flex-1 overflow-y-auto bg-[#F9FAFB] dark:bg-[#0B0E14]">
        <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
          <Link
            to="/app/packing"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            {vi ? 'Danh sách nhóm đơn' : 'Order group list'}
          </Link>

          {plan.loading ? (
            <div className={`${card} flex items-center gap-2 text-sm text-slate-500`}>
              <Loader2 className="h-4 w-4 animate-spin" />
              {vi ? 'Đang tải kế hoạch đóng gói…' : 'Loading packaging plan…'}
            </div>
          ) : (
            <>
              <section className={`${card} flex flex-wrap items-center gap-3`}>
                <div className="min-w-0">
                  <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {vi ? 'Nhóm đơn' : 'Order group'} …{groupId.slice(-8)}
                  </h1>
                  <p className="text-xs text-slate-500">
                    {plan.group?.orderCount ?? 0} {vi ? 'đơn' : 'orders'} · {vi ? 'phiên bản' : 'version'}{' '}
                    {plan.group?.version ?? '—'}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {statusLabel ? (vi ? statusLabel.vi : statusLabel.en) : status}
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
                  {status === 'picked' && canPreviewCartons && (
                    <button
                      type="button"
                      className={secondaryBtn}
                      disabled={plan.cartonPreviewLoading}
                      onClick={() => void plan.previewCartons()}
                    >
                      {plan.cartonPreviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Box className="h-4 w-4" />}
                      {vi ? 'Xem thử số kiện 3D' : 'Preview multi-carton plan'}
                    </button>
                  )}
                  {status === 'picked' && isAdmin && (
                    <button type="button" className={primaryBtn} disabled={plan.busy} onClick={() => void plan.generate()}>
                      <Cpu className="h-4 w-4" />
                      {vi ? 'Tính phương án (engine 3D)' : 'Compute plan (3D engine)'}
                    </button>
                  )}
                  {status === 'pending_approval' && canDecide && (
                    <>
                      <button type="button" className={secondaryBtn} disabled={plan.busy} onClick={() => void plan.reject()}>
                        <XCircle className="h-4 w-4" />
                        {vi ? 'Từ chối, tính lại' : 'Reject & recompute'}
                      </button>
                      <button
                        type="button"
                        className={primaryBtn}
                        disabled={plan.busy || hasNoFit}
                        title={hasNoFit ? (vi ? 'Còn đơn chưa có thùng hợp lệ' : 'Some orders have no valid box') : undefined}
                        onClick={() => void plan.approve()}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {vi ? 'Duyệt tất cả' : 'Approve all'}
                      </button>
                    </>
                  )}
                </div>
              </section>

              {plan.error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {plan.error}
                    {plan.errorCode && <span className="ml-1 font-mono text-xs opacity-70">({plan.errorCode})</span>}
                  </span>
                </div>
              )}

              {plan.cartonPreview && (
                <section className={card}>
                  <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {vi ? 'Xem trước đóng gói nhiều kiện' : 'Multi-carton preview'}
                  </h2>
                  <div className="space-y-3">
                    {plan.cartonPreview.orders.map((order) => (
                      <article key={order.orderId} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <strong>{order.platformOrderId}</strong>
                          <span className={order.status === 'ok' ? 'text-emerald-600' : 'text-red-600'}>
                            {order.status === 'ok' ? `${order.cartons.length} ${vi ? 'kiện' : 'cartons'}` : vi ? `Không xếp được ${order.unplacedItemKeys.length} món` : `${order.unplacedItemKeys.length} items do not fit`}
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {order.cartons.map((carton, index) => (
                            <div key={`${carton.box.code}-${index}`} className="rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-800">
                              <div className="font-semibold">{vi ? 'Kiện' : 'Carton'} {index + 1}: {carton.box.code}</div>
                              <div className="text-slate-500">{carton.box.inner.length_mm} × {carton.box.inner.width_mm} × {carton.box.inner.height_mm} mm</div>
                              <div className="text-slate-500">{vi ? 'Ước tính' : 'Estimated'} {kg(carton.estimated_package_weight_g)}</div>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {vi ? 'Chi phí bao bì ước tính' : 'Estimated packaging cost'}:{' '}
                          {order.totalPackagingCostVnd.toLocaleString('vi-VN')} VND
                        </p>
                      </article>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {vi
                      ? 'Đây là bản xem trước: chưa lưu phương án, chưa giữ/trừ tồn và chưa dùng để xác nhận đóng gói.'
                      : 'Preview only: it does not save a recommendation, reserve stock, or confirm packing.'}
                  </p>
                </section>
              )}

              {plan.recommendations.length === 0 ? (
                <div className={`${card} text-sm text-slate-500`}>
                  {status === 'picked'
                    ? vi
                      ? 'Đã lấy hàng xong — chưa tính phương án đóng gói.'
                      : 'Picking done — no packaging plan yet.'
                    : vi
                      ? 'Nhóm đơn chưa có phương án đóng gói (phương án chỉ tính sau khi lấy hàng xong).'
                      : 'No packaging plan yet (computed after picking is done).'}
                </div>
              ) : (
                <>
                  <nav className="flex gap-2 overflow-x-auto pb-1">
                    {plan.recommendations.map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => {
                          setActiveId(rec.id)
                          setActiveCarton(0)
                        }}
                        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                          active?.id === rec.id
                            ? 'border-[#2563eb] bg-blue-50 text-[#1d4ed8] dark:bg-blue-950/40 dark:text-blue-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                      >
                        {rec.solutionStatus === 'no_fit' ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        ) : (
                          <Box className="h-3.5 w-3.5" />
                        )}
                        {vi ? 'Đơn' : 'Order'} {rec.platformOrderId ?? rec.orderId?.slice(-6) ?? '—'}
                        {rec.cartonCount > 1 && (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                            {rec.cartonCount} {vi ? 'kiện' : 'parcels'}
                          </span>
                        )}
                      </button>
                    ))}
                  </nav>

                  {active && active.cartonCount > 1 && (
                    <nav className="flex flex-wrap gap-2" aria-label={vi ? 'Các kiện của đơn' : 'Order parcels'}>
                      {active.cartons.map((c) => (
                        <button
                          key={c.index}
                          type="button"
                          onClick={() => {
                            setActiveCarton(c.index)
                          }}
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                            cartonIndex === c.index
                              ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                          }`}
                        >
                          {vi ? 'Kiện' : 'Parcel'} {c.index + 1}/{active.cartonCount} · {c.boxCode}
                          {c.isAbnormal ? ' ⚠' : ''}
                        </button>
                      ))}
                    </nav>
                  )}

                  {active && activeView && (
                    <RecommendationPanel
                      key={`${active.id}-${String(cartonIndex)}-${activeView.boxCode ?? 'none'}`}
                      rec={activeView}
                      cartonIndex={cartonIndex}
                      cartonCount={active.cartonCount}
                      vi={vi}
                      boxes={plan.boxes}
                      canAdjust={status === 'pending_approval' && canDecide && active.approvalStatus === 'pending'}
                      busy={plan.busy}
                      onAdjust={(input) => plan.adjust(input)}
                      canUseGuide={canUseGuide}
                      guideLoading={plan.guideLoadingId === `${active.id}:${String(cartonIndex)}`}
                      guideError={plan.guideError}
                      onLoadGuide={(regenerate) => plan.loadGuide(active.id, regenerate, cartonIndex)}
                    />
                  )}

                  {status === 'approved_for_packing' && canPack && (
                    <section className={card}>
                      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        <PackageCheck className="h-4 w-4" />
                        {vi ? 'Đã đóng xong — nhập cân thật từng kiện' : 'Packing done — enter actual weight per parcel'}
                      </h2>
                      <p className="mb-3 text-xs text-slate-500">
                        {vi
                          ? 'Cân cả kiện (hàng + thùng + vật tư). Lệch quá 20% so với ước tính sẽ được đánh dấu bất thường.'
                          : 'Weigh the whole parcel. Deviation over 20% from the estimate is flagged.'}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {parcelRows.map((row) => (
                          <label key={row.key} className="flex items-center gap-2 text-xs">
                            <span className="w-32 shrink-0 truncate text-slate-600 dark:text-slate-300">
                              {row.rec.platformOrderId ?? row.rec.orderId}
                              {row.rec.cartonCount > 1 && (
                                <span className="ml-1 font-semibold">
                                  ({vi ? 'kiện' : 'parcel'} {row.index + 1}/{row.rec.cartonCount})
                                </span>
                              )}
                              <span className="block text-slate-400">
                                {vi ? 'ước tính' : 'est.'} {kg(row.estimatedG)}
                              </span>
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              inputMode="decimal"
                              placeholder="kg"
                              value={weights[row.key] ?? ''}
                              onChange={(e) => {
                                const value = e.target.value
                                setWeights((prev) => ({ ...prev, [row.key]: value }))
                              }}
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                            />
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        className={`${primaryBtn} mt-3`}
                        disabled={plan.busy || !allWeightsValid}
                        onClick={() =>
                          void plan.pack(
                            parcelRows.map((row) => ({
                              orderId: row.rec.orderId ?? '',
                              cartonIndex: row.index,
                              actualWeightKg: Number(weights[row.key]),
                            })),
                          )
                        }
                      >
                        <PackageCheck className="h-4 w-4" />
                        {vi ? 'Xác nhận đã đóng gói' : 'Confirm packed'}
                      </button>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  )
}

const FALLBACK_LABELS: Record<NonNullable<PackingGuide['fallbackReason']>, { vi: string; en: string }> = {
  no_api_key: { vi: 'Chưa cấu hình AI (AI_API_KEY) — đang dùng câu mẫu.', en: 'AI not configured (AI_API_KEY) — using template text.' },
  ai_error: { vi: 'Groq tạm thời không phản hồi — đang dùng câu mẫu.', en: 'Groq did not respond — using template text.' },
  ai_invalid_output: {
    vi: 'AI trả hướng dẫn không khớp phương án — đang dùng câu mẫu.',
    en: 'AI output did not match the plan — using template text.',
  },
}

/** Tóm tắt + nguồn của lời hướng dẫn (AI hay câu mẫu), nút viết lại. */
function GuideHeader({
  guide,
  vi,
  loading,
  error,
  canRegenerate,
  onRegenerate,
}: {
  guide: PackingGuide | null
  vi: boolean
  loading: boolean
  error: string | null
  canRegenerate: boolean
  onRegenerate: () => void
}) {
  const fallback = guide?.fallbackReason ? FALLBACK_LABELS[guide.fallbackReason] : null
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" />
        <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {vi ? 'Hướng dẫn đóng gói từng bước' : 'Step-by-step packing guide'}
        </span>
        {guide && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              guide.source === 'ai'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            {guide.source === 'ai' ? `AI · ${guide.model ?? ''}` : vi ? 'Câu mẫu' : 'Template'}
          </span>
        )}
        {canRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-900/40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {guide ? (vi ? 'Viết lại bằng AI' : 'Rewrite with AI') : vi ? 'Tạo hướng dẫn' : 'Create guide'}
          </button>
        )}
      </div>
      {loading && !guide && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {vi ? 'AI đang viết hướng dẫn cho từng bước…' : 'AI is writing the step instructions…'}
        </p>
      )}
      {guide && <p className="mt-1.5 max-w-[75ch] leading-relaxed text-slate-600 dark:text-slate-300">{guide.summary}</p>}
      {fallback && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{vi ? fallback.vi : fallback.en}</p>}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function RecommendationPanel({
  rec,
  cartonIndex,
  cartonCount,
  vi,
  boxes,
  canAdjust,
  busy,
  onAdjust,
  canUseGuide,
  guideLoading,
  guideError,
  onLoadGuide,
}: {
  rec: PackagingRecommendation
  cartonIndex: number
  cartonCount: number
  vi: boolean
  boxes: PackagingBox[]
  canAdjust: boolean
  busy: boolean
  onAdjust: (input: {
    orderId: string
    cartonIndex?: number
    boxCode: string
    reason: AdjustmentReason
    note?: string
  }) => Promise<boolean>
  canUseGuide: boolean
  guideLoading: boolean
  guideError: string | null
  onLoadGuide: (regenerate: boolean) => Promise<void>
}) {
  // Tự tạo hướng dẫn 1 lần khi mở đơn chưa có (panel remount theo đơn/thùng).
  const guideRequested = useRef(false)
  const needsGuide = canUseGuide && rec.solutionStatus === 'ok' && rec.packingGuide === null
  useEffect(() => {
    if (!needsGuide || guideRequested.current) return
    guideRequested.current = true
    void onLoadGuide(false)
  }, [needsGuide, onLoadGuide])

  const [boxCode, setBoxCode] = useState(rec.boxCode ?? boxes[0]?.code ?? '')
  const [reason, setReason] = useState<AdjustmentReason>('RECOMMENDED_BOX_NOT_IN_STOCK')
  const [note, setNote] = useState('')

  const box = boxes.find((b) => b.code === rec.boxCode)

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className={card}>
        {rec.solutionStatus === 'ok' && rec.boxInnerMm ? (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <GuideHeader
                  guide={rec.packingGuide}
                  vi={vi}
                  loading={guideLoading}
                  error={guideError}
                  canRegenerate={canUseGuide}
                  onRegenerate={() => void onLoadGuide(rec.packingGuide !== null)}
                />
              </div>
              <Link
                to={`/app/packing/groups/${rec.orderGroupId}/orders/${rec.id}?carton=${String(cartonIndex)}`}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-blue-700"
              >
                <PackageCheck className="h-4 w-4" />
                {vi ? 'Bắt đầu đóng gói từng bước' : 'Start step-by-step packing'}
              </Link>
            </div>
            <PackingAnimation3D
              box={rec.boxInnerMm}
              placements={rec.placements}
              vi={vi}
              guideSteps={rec.packingGuide?.steps ?? null}
              itemProfiles={rec.itemProfiles}
            />
            <p className="mt-2 text-xs text-slate-400">
              {vi ? 'Mô hình 3D minh hoạ từ ' : '3D models from '}
              <a
                href="/models/CREDITS.md"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-slate-600 dark:hover:text-slate-200"
              >
                Poly Pizza (CC-BY 3.0 / CC0)
              </a>
              {vi ? ' — kích thước thật theo khối engine tính.' : ' — true size follows the engine block.'}
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              {rec.provenInfeasible === true
                ? vi
                  ? 'Không thể xếp: có bằng chứng (món quá cỡ / quá tải) — cần thùng lớn hơn hoặc xử lý tay'
                  : 'Cannot be packed: proven (oversize / overweight item) — needs a bigger box or manual handling'
                : vi
                  ? 'Chưa tìm được cách xếp tự động — chưa chắc là không xếp được; xử lý tay hoặc tạo lại phương án'
                  : 'No automatic arrangement found yet — not proven impossible; handle manually or regenerate'}
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs">
              {rec.noFitReasons.map((r) => (
                <li key={`${r.boxCode}-${r.code ?? ''}-${r.reason}`}>
                  {r.boxCode !== '-' && <span className="font-mono">{r.boxCode}: </span>}
                  {r.code && <span className="mr-1 rounded bg-amber-100 px-1 font-mono text-xs dark:bg-amber-900/50">{r.code}</span>}
                  {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className={`${card} space-y-4 text-sm text-slate-600 dark:text-slate-300`}>
          <div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              {rec.boxName ?? (vi ? 'Chưa có thùng' : 'No box')}
              {rec.boxCode && <span className="font-mono text-xs font-normal text-slate-400">{rec.boxCode}</span>}
              {cartonCount > 1 && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                  {vi ? 'Kiện' : 'Parcel'} {cartonIndex + 1}/{cartonCount}
                </span>
              )}
            </p>
            {rec.lowerBoundCartons !== null && cartonCount > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                {cartonCount <= rec.lowerBoundCartons
                  ? vi
                    ? `Số kiện đã đạt mức tối thiểu (${String(rec.lowerBoundCartons)}) — tối ưu về số kiện.`
                    : `Parcel count at the proven minimum (${String(rec.lowerBoundCartons)}).`
                  : vi
                    ? `Tối thiểu lý thuyết ${String(rec.lowerBoundCartons)} kiện (đang dùng ${String(cartonCount)}).`
                    : `Theoretical minimum ${String(rec.lowerBoundCartons)} parcels (using ${String(cartonCount)}).`}
              </p>
            )}
          </div>

          {(rec.preferredBoxOutOfStock || box?.isSample || rec.materialsShortfall.length > 0) && (
            <div className="space-y-1.5 text-xs">
              {rec.preferredBoxOutOfStock && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {vi
                    ? `Thùng ${rec.preferredBoxOutOfStock} vừa hơn nhưng kho đã hết — đang dùng ${rec.boxCode ?? ''}. Nhập thêm ${rec.preferredBoxOutOfStock} để tiết kiệm thùng.`
                    : `${rec.preferredBoxOutOfStock} would fit better but is out of stock — using ${rec.boxCode ?? ''}.`}
                </p>
              )}
              {box?.isSample && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {vi ? 'Thùng mẫu (số giả lập) — cần nhập số đo thật.' : 'Sample box (placeholder numbers).'}
                </p>
              )}
              {rec.materialsShortfall.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {vi ? 'Kho thiếu vật tư lúc đóng: ' : 'Short of materials when packing: '}
                  {rec.materialsShortfall
                    .map((s) => `${s.code} (${vi ? 'thiếu' : 'missing'} ${String(s.missing)})`)
                    .join(', ')}
                </p>
              )}
            </div>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {box && (
              <>
                <dt className="text-slate-500">{vi ? 'Kho thùng' : 'Box stock'}</dt>
                <dd className={`text-right tabular-nums ${box.available === 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'font-medium text-slate-900 dark:text-slate-100'}`}>
                  {vi ? 'còn trống' : 'free'} {box.available}
                  <span className="block text-xs font-normal text-slate-500">
                    {box.quantityOnHand} {vi ? 'thùng' : 'boxes'} · {vi ? 'giữ chỗ' : 'reserved'} {box.reserved}
                  </span>
                </dd>
              </>
            )}
            {rec.boxInnerMm && (
              <>
                <dt className="text-slate-500">{vi ? 'Lòng thùng' : 'Inner size'}</dt>
                <dd className="text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {cm(rec.boxInnerMm.lengthMm)} × {cm(rec.boxInnerMm.widthMm)} × {cm(rec.boxInnerMm.heightMm)} cm
                </dd>
              </>
            )}
            {rec.fillRatio !== null && (
              <>
                <dt className="text-slate-500">{vi ? 'Lấp đầy' : 'Fill'}</dt>
                <dd className="text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {(rec.fillRatio * 100).toFixed(1)}%
                </dd>
              </>
            )}
            <dt className="text-slate-500">{vi ? 'Cân hàng' : 'Items weight'}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{kg(rec.itemsWeightG)}</dd>
            <dt className="text-slate-500">{vi ? 'Kiện ước tính' : 'Parcel estimate'}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {kg(rec.estimatedPackageWeightG)}
            </dd>
            <dt className="text-slate-500">{vi ? 'Cân quy đổi' : 'Volumetric'}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{kg(rec.volumetricWeightG)}</dd>
            <dt className="text-slate-500">{vi ? 'Phí ship' : 'Shipping'}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {rec.estimatedShippingCostVnd === null ? (
                <span className="font-normal text-slate-500">{vi ? 'chưa có bảng cước' : 'no rate table yet'}</span>
              ) : (
                `${rec.estimatedShippingCostVnd.toLocaleString('vi-VN')} đ`
              )}
            </dd>
          </dl>

          {rec.materials.length > 0 && (
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <p className="mb-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {vi ? 'Vật tư chèn' : 'Cushioning'}
                <span className="ml-1.5 text-xs font-normal text-slate-500">{vi ? '(ước lượng theo luật)' : '(rule-based estimate)'}</span>
              </p>
              <ul className="space-y-1 text-sm">
                {rec.materials.map((m) => (
                  <li key={`${m.code ?? m.type}`} className="flex justify-between gap-3 tabular-nums">
                    <span>
                      {materialLabel(m, vi)} × {m.quantity}
                      {m.unit ? ` ${m.unit}` : ''}
                    </span>
                    {m.costVnd > 0 && <span className="text-slate-500">{m.costVnd.toLocaleString('vi-VN')} đ</span>}
                  </li>
                ))}
              </ul>
              {rec.materialsCostVnd > 0 && (
                <p className="mt-2 flex justify-between gap-3 border-t border-dashed border-slate-200 pt-2 text-sm font-medium tabular-nums text-slate-900 dark:border-slate-700 dark:text-slate-100">
                  <span>{vi ? 'Tổng vật tư' : 'Materials total'}</span>
                  <span>
                    {rec.materialsCostVnd.toLocaleString('vi-VN')} đ · {kg(rec.materialsWeightG)}
                  </span>
                </p>
              )}
            </div>
          )}

          {(rec.adjustmentReason || rec.actualMeasuredWeightKg !== null) && (
            <div className="space-y-1.5 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
              {rec.adjustmentReason && (
                <p className="text-slate-500">
                  {vi ? 'Đã đổi từ' : 'Changed from'} {rec.adjustedFromBoxCode ?? '—'} ·{' '}
                  {ADJUSTMENT_REASON_LABELS[rec.adjustmentReason as AdjustmentReason][vi ? 'vi' : 'en']}
                  {rec.adjustmentNote ? ` — ${rec.adjustmentNote}` : ''}
                </p>
              )}
              {rec.actualMeasuredWeightKg !== null && (
                <p className={rec.isAbnormal ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
                  {vi ? 'Cân thật' : 'Actual'}: {rec.actualMeasuredWeightKg} kg
                  {rec.isAbnormal ? (vi ? ' — lệch bất thường' : ' — abnormal') : ''}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400">
            {rec.engineVersion ?? 'legacy'} · {rec.computationTimeMs} ms
          </p>
        </div>

        {canAdjust && (
          <div className={`${card} space-y-2 text-xs`}>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {cartonCount > 1
                ? vi
                  ? `Đổi thùng cho kiện ${String(cartonIndex + 1)}`
                  : `Change box for parcel ${String(cartonIndex + 1)}`
                : vi
                  ? 'Đổi thùng cho đơn này'
                  : 'Change box for this order'}
            </p>
            <select
              value={boxCode}
              onChange={(e) => {
                setBoxCode(e.target.value)
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            >
              {boxes.map((b) => {
                // Thùng đang dùng: chỗ nó giữ sẽ được trả lại nên vẫn chọn được.
                const outOfStock = b.available <= 0 && b.code !== rec.boxCode
                return (
                  <option key={b.id} value={b.code} disabled={outOfStock}>
                    {b.code} — {cm(b.inner.lengthMm)}×{cm(b.inner.widthMm)}×{cm(b.inner.heightMm)} cm ·{' '}
                    {outOfStock ? (vi ? 'hết hàng' : 'out of stock') : `${vi ? 'còn' : 'avail.'} ${String(b.available)}`}
                  </option>
                )
              })}
            </select>
            <select
              value={reason}
              onChange={(e) => {
                setReason(e.target.value as AdjustmentReason)
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            >
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {ADJUSTMENT_REASON_LABELS[r][vi ? 'vi' : 'en']}
                </option>
              ))}
            </select>
            <input
              value={note}
              onChange={(e) => {
                setNote(e.target.value)
              }}
              placeholder={vi ? 'Ghi chú (bắt buộc khi chọn "Khác")' : 'Note (required for "Other")'}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              className={secondaryBtn}
              disabled={busy || !boxCode || !rec.orderId}
              onClick={() =>
                void onAdjust({
                  orderId: rec.orderId ?? '',
                  cartonIndex,
                  boxCode,
                  reason,
                  note: note.trim() || undefined,
                })
              }
            >
              {vi ? 'Xếp lại vào thùng này' : 'Repack into this box'}
            </button>
          </div>
        )}
      </aside>
    </section>
  )
}
