import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Box, CheckCircle2, Cpu, Loader2, PackageCheck, XCircle } from 'lucide-react'
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
  type AdjustmentReason,
  type PackagingBox,
  type PackagingRecommendation,
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
  const [weights, setWeights] = useState<Record<string, string>>({})

  const isAdmin = role === UserRole.ADMIN
  const canDecide = isAdmin || role === UserRole.PACKAGING_STAFF
  const canPack = isAdmin || role === UserRole.WAREHOUSE_STAFF
  const status = plan.group?.fulfillmentStatus ?? ''
  const active =
    plan.recommendations.find((r) => r.id === activeId) ?? plan.recommendations[0] ?? null
  const statusLabel = FULFILLMENT_STATUS_LABELS[status]
  const hasNoFit = plan.recommendations.some((r) => r.solutionStatus === 'no_fit')

  const packableOrders = plan.recommendations.filter((r) => r.orderId !== null)
  const allWeightsValid = packableOrders.every((r) => Number(weights[r.orderId ?? '']) > 0)

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Kế hoạch đóng gói' : 'Packaging plans', to: '/app/packing/groups' },
          { label: groupId.slice(-8) },
        ]}
      />
      <main className="flex-1 overflow-y-auto bg-[#F9FAFB] dark:bg-[#0B0E14]">
        <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
          <Link
            to="/app/packing/groups"
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
                      </button>
                    ))}
                  </nav>

                  {active && (
                    <RecommendationPanel
                      key={`${active.id}-${active.boxCode ?? 'none'}`}
                      rec={active}
                      vi={vi}
                      boxes={plan.boxes}
                      canAdjust={status === 'pending_approval' && canDecide && active.approvalStatus === 'pending'}
                      busy={plan.busy}
                      onAdjust={(input) => plan.adjust(input)}
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
                        {packableOrders.map((rec) => (
                          <label key={rec.id} className="flex items-center gap-2 text-xs">
                            <span className="w-32 shrink-0 truncate text-slate-600 dark:text-slate-300">
                              {rec.platformOrderId ?? rec.orderId}
                              <span className="block text-slate-400">
                                {vi ? 'ước tính' : 'est.'} {kg(rec.estimatedPackageWeightG)}
                              </span>
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              inputMode="decimal"
                              placeholder="kg"
                              value={weights[rec.orderId ?? ''] ?? ''}
                              onChange={(e) => {
                                const value = e.target.value
                                setWeights((prev) => ({ ...prev, [rec.orderId ?? '']: value }))
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
                            packableOrders.map((rec) => ({
                              orderId: rec.orderId ?? '',
                              actualWeightKg: Number(weights[rec.orderId ?? '']),
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

function RecommendationPanel({
  rec,
  vi,
  boxes,
  canAdjust,
  busy,
  onAdjust,
}: {
  rec: PackagingRecommendation
  vi: boolean
  boxes: PackagingBox[]
  canAdjust: boolean
  busy: boolean
  onAdjust: (input: { orderId: string; boxCode: string; reason: AdjustmentReason; note?: string }) => Promise<boolean>
}) {
  const [boxCode, setBoxCode] = useState(rec.boxCode ?? boxes[0]?.code ?? '')
  const [reason, setReason] = useState<AdjustmentReason>('RECOMMENDED_BOX_NOT_IN_STOCK')
  const [note, setNote] = useState('')

  const box = boxes.find((b) => b.code === rec.boxCode)

  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <div className={card}>
        {rec.solutionStatus === 'ok' && rec.boxInnerMm ? (
          <PackingAnimation3D box={rec.boxInnerMm} placements={rec.placements} vi={vi} />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              {vi ? 'Không có thùng nào trong danh mục xếp vừa đơn này' : 'No box in the catalog fits this order'}
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs">
              {rec.noFitReasons.map((r) => (
                <li key={`${r.boxCode}-${r.reason}`}>
                  <span className="font-mono">{r.boxCode}</span>: {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className={`${card} space-y-1.5 text-xs text-slate-600 dark:text-slate-300`}>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {rec.boxName ?? (vi ? 'Chưa có thùng' : 'No box')}
            {rec.boxCode && <span className="ml-1 font-mono text-xs font-normal text-slate-400">{rec.boxCode}</span>}
          </p>
          {box?.isSample && (
            <p className="rounded bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              {vi ? 'Thùng mẫu (số giả lập) — cần nhập số đo thật.' : 'Sample box (placeholder numbers).'}
            </p>
          )}
          {rec.boxInnerMm && (
            <p>
              {vi ? 'Lòng thùng' : 'Inner'}: {cm(rec.boxInnerMm.lengthMm)} × {cm(rec.boxInnerMm.widthMm)} ×{' '}
              {cm(rec.boxInnerMm.heightMm)} cm
            </p>
          )}
          {rec.fillRatio !== null && (
            <p>
              {vi ? 'Lấp đầy' : 'Fill'}: {(rec.fillRatio * 100).toFixed(1)}%
            </p>
          )}
          <p>
            {vi ? 'Hàng' : 'Items'}: {kg(rec.itemsWeightG)} · {vi ? 'kiện ước tính' : 'parcel est.'}:{' '}
            {kg(rec.estimatedPackageWeightG)}
          </p>
          <p>
            {vi ? 'Cân quy đổi thể tích' : 'Volumetric weight'}: {kg(rec.volumetricWeightG)}
          </p>
          <p>
            {vi ? 'Phí ship' : 'Shipping'}:{' '}
            {rec.estimatedShippingCostVnd === null
              ? vi
                ? 'chưa có bảng cước'
                : 'no rate table yet'
              : `${rec.estimatedShippingCostVnd.toLocaleString('vi-VN')} đ`}
          </p>
          {rec.materials.length > 0 && (
            <p>
              {vi ? 'Vật tư' : 'Materials'}:{' '}
              {rec.materials.map((m) => `${m.type === 'bubble_wrap' ? 'Bubble wrap' : m.type} × ${String(m.quantity)}`).join(', ')}
            </p>
          )}
          {rec.adjustmentReason && (
            <p className="text-slate-500">
              {vi ? 'Đã đổi từ' : 'Changed from'} {rec.adjustedFromBoxCode ?? '—'} ·{' '}
              {ADJUSTMENT_REASON_LABELS[rec.adjustmentReason as AdjustmentReason][vi ? 'vi' : 'en']}
              {rec.adjustmentNote ? ` — ${rec.adjustmentNote}` : ''}
            </p>
          )}
          {rec.actualMeasuredWeightKg !== null && (
            <p className={rec.isAbnormal ? 'font-semibold text-red-600' : ''}>
              {vi ? 'Cân thật' : 'Actual'}: {rec.actualMeasuredWeightKg} kg
              {rec.isAbnormal ? (vi ? ' — lệch bất thường' : ' — abnormal') : ''}
            </p>
          )}
          <p className="pt-1 text-xs text-slate-400">
            {rec.engineVersion ?? 'legacy'} · {rec.computationTimeMs} ms
          </p>
        </div>

        {canAdjust && (
          <div className={`${card} space-y-2 text-xs`}>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {vi ? 'Đổi thùng cho đơn này' : 'Change box for this order'}
            </p>
            <select
              value={boxCode}
              onChange={(e) => {
                setBoxCode(e.target.value)
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            >
              {boxes.map((b) => (
                <option key={b.id} value={b.code}>
                  {b.code} — {cm(b.inner.lengthMm)}×{cm(b.inner.widthMm)}×{cm(b.inner.heightMm)} cm
                </option>
              ))}
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
                void onAdjust({ orderId: rec.orderId ?? '', boxCode, reason, note: note.trim() || undefined })
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
