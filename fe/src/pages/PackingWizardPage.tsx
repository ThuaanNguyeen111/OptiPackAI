import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCircle2,
  Expand,
  Layers,
  Lightbulb,
  ListChecks,
  Loader2,
  PackageCheck,
  Scissors,
  ShoppingBag,
  Sparkles,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { PackingStepView } from '../components/packing/PackingAnimation3D'
import { usePortal } from '../context/use-portal'
import { useAuth } from '../context/use-auth'
import { usePackagingPlan } from '../hooks/usePackagingPlan'
import { UserRole } from '../types/auth'
import { PRODUCT_CATEGORY_LABELS, type PackagingRecommendation } from '../types/packaging'

const card = 'rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1'
const navBtn =
  'inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40'

function cm(mm: number): string {
  return (mm / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

/**
 * /app/packing/groups/:groupId/orders/:recommendationId — đóng gói TỪNG BƯỚC
 * cho 1 đơn (22/09/2026). Mỗi bước 1 màn hình: màn 0 chuẩn bị vật tư,
 * màn 1…N đặt từng món (3D chỉ hiện tới bước đó), màn cuối kiểm đủ món + cân.
 * Group `approved_for_packing` mới nhập cân / xác nhận đóng; trước đó chỉ xem.
 */
export function PackingWizardPage() {
  const { groupId = '', recommendationId = '' } = useParams<{ groupId: string; recommendationId: string }>()
  const navigate = useNavigate()
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const { session } = useAuth()
  const role = session?.role
  const plan = usePackagingPlan(groupId)
  const [screen, setScreen] = useState(0)
  const [weights, setWeights] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const stageRef = useRef<HTMLDivElement>(null)

  const rec = plan.recommendations.find((r) => r.id === recommendationId) ?? null
  const steps = useMemo(() => [...(rec?.placements ?? [])].sort((a, b) => a.step - b.step), [rec])
  const profiles = useMemo(() => new Map((rec?.itemProfiles ?? []).map((p) => [p.sku, p])), [rec])
  const guideByStep = useMemo(
    () => new Map((rec?.packingGuide?.steps ?? []).map((g) => [g.step, g])),
    [rec],
  )
  const lastScreen = steps.length + 1
  const canUseGuide =
    role === UserRole.ADMIN || role === UserRole.PACKAGING_STAFF || role === UserRole.WAREHOUSE_STAFF
  const canPack =
    (role === UserRole.ADMIN || role === UserRole.WAREHOUSE_STAFF) &&
    plan.group?.fulfillmentStatus === 'approved_for_packing'

  // Tạo hướng dẫn lần đầu nếu đơn chưa có (giống trang kế hoạch).
  // Theo từng đơn — chuyển sang đơn khác trong nhóm (cùng trang) vẫn tự tạo.
  const guideRequestedFor = useRef<string | null>(null)
  const needsGuide = canUseGuide && rec?.solutionStatus === 'ok' && rec.packingGuide === null
  useEffect(() => {
    if (!needsGuide || guideRequestedFor.current === recommendationId) return
    guideRequestedFor.current = recommendationId
    void plan.loadGuide(recommendationId, false)
  }, [needsGuide, plan, recommendationId])

  // Phím ← / → để chuyển màn (nhân viên đang cầm hàng, không tiện bấm chuột).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight') setScreen((s) => Math.min(lastScreen, s + 1))
      if (e.key === 'ArrowLeft') setScreen((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [lastScreen])

  const orders = plan.recommendations.filter((r) => r.orderId !== null)
  const allWeightsValid = orders.length > 0 && orders.every((r) => Number(weights[r.orderId ?? '']) > 0)

  const confirmPack = async () => {
    const ok = await plan.pack(orders.map((r) => ({ orderId: r.orderId ?? '', actualWeightKg: Number(weights[r.orderId ?? '']) })))
    if (ok) void navigate(`/app/packing/groups/${groupId}`)
  }

  const header = (
    <PortalTopBar
      breadcrumbs={[
        { label: 'OptiPackAI', to: '/app' },
        { label: vi ? 'Kế hoạch đóng gói' : 'Packaging plans', to: '/app/packing/groups' },
        { label: groupId.slice(-8), to: `/app/packing/groups/${groupId}` },
        { label: vi ? 'Đóng gói từng bước' : 'Step-by-step' },
      ]}
    />
  )

  if (plan.loading) {
    return (
      <>
        {header}
        <main className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {vi ? 'Đang tải…' : 'Loading…'}
        </main>
      </>
    )
  }

  if (!rec || rec.solutionStatus !== 'ok' || !rec.boxInnerMm) {
    return (
      <>
        {header}
        <main className="flex-1 p-6">
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            {vi
              ? 'Đơn này chưa có phương án xếp hợp lệ (không tìm thấy hoặc không thùng nào vừa).'
              : 'This order has no valid packing plan.'}
          </div>
        </main>
      </>
    )
  }

  const current = screen >= 1 && screen <= steps.length ? steps[screen - 1] : undefined
  const currentGuide = current ? guideByStep.get(current.step) : undefined
  const currentProfile = current ? profiles.get(current.sku) : undefined
  const bagCounts = new Map<string, number>()
  let foldCount = 0
  for (const p of steps) {
    const bag = profiles.get(p.sku)?.zipBagCode
    if (bag) bagCounts.set(bag, (bagCounts.get(bag) ?? 0) + 1)
    if (p.folded) foldCount += 1
  }
  const bubble = rec.materials.reduce((sum, m) => sum + m.quantity, 0)

  return (
    <>
      {header}
      <main className="flex min-h-0 flex-1 flex-col bg-[#F9FAFB] dark:bg-[#0B0E14]">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-surface-1">
          <Link
            to={`/app/packing/groups/${groupId}`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            {vi ? 'Kế hoạch' : 'Plan'}
          </Link>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {vi ? 'Đơn' : 'Order'} {rec.platformOrderId ?? rec.orderId?.slice(-6)} · {rec.boxName ?? rec.boxCode}
          </p>
          <span className="ml-auto text-sm tabular-nums text-slate-500">
            {screen === 0
              ? vi
                ? 'Chuẩn bị'
                : 'Prepare'
              : screen === lastScreen
                ? vi
                  ? 'Kiểm tra & cân'
                  : 'Check & weigh'
                : `${vi ? 'Bước' : 'Step'} ${String(screen)}/${String(steps.length)}`}
          </span>
          <button
            type="button"
            onClick={() => void stageRef.current?.requestFullscreen()}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title={vi ? 'Toàn màn hình' : 'Fullscreen'}
          >
            <Expand className="h-4 w-4" />
          </button>
        </div>

        <div ref={stageRef} className="flex min-h-0 flex-1 flex-col gap-4 bg-[#F9FAFB] p-4 dark:bg-[#0B0E14] sm:p-6 lg:flex-row">
          <div className={`${card} relative min-h-[320px] flex-1 overflow-hidden`}>
            <PackingStepView
              box={rec.boxInnerMm}
              placements={rec.placements}
              itemProfiles={rec.itemProfiles}
              step={Math.min(screen, steps.length)}
            />
          </div>

          <section className={`${card} flex w-full flex-col gap-4 p-5 lg:w-[380px]`}>
            {screen === 0 && (
              <PrepareScreen
                vi={vi}
                rec={rec}
                itemCount={steps.length}
                bagCounts={bagCounts}
                foldCount={foldCount}
                bubble={bubble}
              />
            )}

            {current && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {currentProfile?.productCategory && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {PRODUCT_CATEGORY_LABELS[currentProfile.productCategory][vi ? 'vi' : 'en']}
                    </span>
                  )}
                  {currentProfile?.zipBagCode && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {vi ? 'Túi zip' : 'Zip bag'} {currentProfile.zipBagCode}
                      {currentProfile.zipBagFolded ? (vi ? ' · gập túi' : ' · fold bag') : ''}
                    </span>
                  )}
                  {current.folded && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      <Scissors className="h-3 w-3" />
                      {vi ? 'Gập đôi' : 'Fold in half'}
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-slate-400">
                  {current.sku} · {current.itemKey} · {cm(current.dx)}×{cm(current.dy)}×{cm(current.dz)} cm
                </p>
                {currentGuide ? (
                  <p className="text-lg font-medium leading-relaxed text-slate-900 dark:text-slate-50">
                    {currentGuide.instruction}
                  </p>
                ) : plan.guideLoadingId === rec.id ? (
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {vi ? 'AI đang viết hướng dẫn…' : 'Writing instructions…'}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">
                    {vi ? 'Đặt món theo vị trí trên hình 3D.' : 'Place the item as shown in 3D.'}
                  </p>
                )}
                {currentGuide?.tip && (
                  <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{currentGuide.tip}</span>
                  </p>
                )}
                {rec.packingGuide && (
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Sparkles className="h-3 w-3" />
                    {rec.packingGuide.source === 'ai'
                      ? `AI · ${rec.packingGuide.model ?? ''}`
                      : vi
                        ? 'Câu mẫu'
                        : 'Template'}
                  </p>
                )}
              </div>
            )}

            {screen === lastScreen && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {vi ? 'Kiểm đủ món trong thùng' : 'Check every item'}
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {steps.map((p) => (
                      <li key={p.itemKey}>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked[p.itemKey] ?? false}
                            onChange={(e) => {
                              const value = e.target.checked
                              setChecked((prev) => ({ ...prev, [p.itemKey]: value }))
                            }}
                          />
                          <span className="font-mono text-xs">{p.itemKey}</span>
                          {p.folded && <Scissors className="h-3 w-3 text-amber-600" />}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>

                {canPack ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {vi ? 'Cân từng kiện (kg)' : 'Weigh each parcel (kg)'}
                    </p>
                    {orders.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm">
                        <span className={`w-28 truncate ${r.id === rec.id ? 'font-semibold' : 'text-slate-500'}`}>
                          {r.platformOrderId ?? r.orderId?.slice(-6)}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={weights[r.orderId ?? ''] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value
                            setWeights((prev) => ({ ...prev, [r.orderId ?? '']: value }))
                          }}
                          placeholder={
                            r.estimatedPackageWeightG === null ? '' : `~${String(r.estimatedPackageWeightG / 1000)}`
                          }
                          className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                        />
                        {r.id !== rec.id && (
                          <Link
                            to={`/app/packing/groups/${groupId}/orders/${r.id}`}
                            onClick={() => {
                              setScreen(0)
                            }}
                            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {vi ? 'Mở hướng dẫn' : 'Open guide'}
                          </Link>
                        )}
                      </label>
                    ))}
                    {plan.error && <p className="text-sm text-red-600 dark:text-red-400">{plan.error}</p>}
                    <button
                      type="button"
                      disabled={!allWeightsValid || plan.busy}
                      onClick={() => void confirmPack()}
                      className={`${navBtn} w-full justify-center bg-emerald-600 text-white hover:bg-emerald-700`}
                    >
                      {plan.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                      {vi ? 'Xác nhận đóng gói xong' : 'Confirm packed'}
                    </button>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <CheckCircle2 className="h-4 w-4" />
                    {vi
                      ? 'Chế độ xem trước — nhập cân và xác nhận khi group đã được duyệt đóng gói.'
                      : 'Preview only — weigh and confirm once the group is approved.'}
                  </p>
                )}
              </div>
            )}

            <div className="mt-auto space-y-3 pt-2">
              <div className="flex flex-wrap gap-1" aria-hidden>
                {Array.from({ length: lastScreen + 1 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setScreen(i)
                    }}
                    className={`h-2 flex-1 rounded-full ${
                      i === screen ? 'bg-blue-600' : i < screen ? 'bg-blue-300 dark:bg-blue-800' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={screen === 0}
                  onClick={() => {
                    setScreen((s) => Math.max(0, s - 1))
                  }}
                  className={`${navBtn} flex-1 justify-center border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {vi ? 'Trước' : 'Back'}
                </button>
                <button
                  type="button"
                  disabled={screen === lastScreen}
                  onClick={() => {
                    setScreen((s) => Math.min(lastScreen, s + 1))
                  }}
                  className={`${navBtn} flex-1 justify-center bg-blue-600 text-white hover:bg-blue-700`}
                >
                  {screen === 0 ? (vi ? 'Bắt đầu' : 'Start') : vi ? 'Sau' : 'Next'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}

function PrepareScreen({
  vi,
  rec,
  itemCount,
  bagCounts,
  foldCount,
  bubble,
}: {
  vi: boolean
  rec: PackagingRecommendation
  itemCount: number
  bagCounts: Map<string, number>
  foldCount: number
  bubble: number
}) {
  return (
    <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
      <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{vi ? 'Chuẩn bị' : 'Prepare'}</p>
      {rec.packingGuide && <p className="leading-relaxed">{rec.packingGuide.summary}</p>}
      <ul className="space-y-2">
        <li className="flex items-center gap-2">
          <Box className="h-4 w-4 text-slate-400" />
          {vi ? 'Thùng' : 'Box'}: <b>{rec.boxName ?? rec.boxCode}</b>
          {rec.boxInnerMm &&
            ` (${cm(rec.boxInnerMm.lengthMm)}×${cm(rec.boxInnerMm.widthMm)}×${cm(rec.boxInnerMm.heightMm)} cm)`}
        </li>
        <li className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-slate-400" />
          {vi ? 'Số món' : 'Items'}: <b>{itemCount}</b>
        </li>
        {[...bagCounts].map(([code, count]) => (
          <li key={code} className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-slate-400" />
            {vi ? 'Túi zip' : 'Zip bag'} {code}: <b>{count}</b>
          </li>
        ))}
        {bubble > 0 && (
          <li className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-400" />
            {vi ? 'Xốp hơi' : 'Bubble wrap'}: <b>{bubble}</b>
          </li>
        )}
        {foldCount > 0 && (
          <li className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-slate-400" />
            {vi ? 'Món cần gập đôi' : 'Items to fold'}: <b>{foldCount}</b>
          </li>
        )}
      </ul>
      {rec.preferredBoxOutOfStock && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {vi
            ? `Thùng ${rec.preferredBoxOutOfStock} vừa hơn nhưng kho đã hết.`
            : `${rec.preferredBoxOutOfStock} would fit better but is out of stock.`}
        </p>
      )}
      <p className="text-xs text-slate-500">
        {vi ? 'Dùng nút Sau hoặc phím → để sang bước tiếp theo.' : 'Use Next or the → key to continue.'}
      </p>
    </div>
  )
}
