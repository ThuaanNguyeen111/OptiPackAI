import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Pause,
  Play,
  RotateCcw,
  ZoomIn,
} from 'lucide-react'
import { usePortal } from '../../context/use-portal'
import type { PackingPlacement, PackingPlan, PackingPlanParcel } from '../../types/packing-plan'
import { boxCutNote } from '../../types/packing-plan'
import {
  STEP_SECONDS,
  packStepsForParcel,
  innerOf,
  isWorkAreaStep,
  orderColor,
  profileFor,
  sceneMode,
  selectParcel,
  sortedPlacements,
  stepLabel,
  actionNote,
  workAreaFor,
  type SceneMode,
} from '../../utils/packing-layout'
import { sharedOrderCodes } from '../../lib/parcel-order-display'
import { bubbleWrapFor, closeNote } from '../../utils/packing-materials'
import { formatDimsMmAsCm } from '../../utils/units'
import { categoryLabel } from './product-models'
import { PackingScene } from './scene/PackingScene'
import { StepCamera, type CameraFocus } from './scene/StepCamera'

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function ModeMessage({
  mode,
  parcel,
  vi,
}: {
  mode: Exclude<SceneMode, 'scene'>
  parcel: PackingPlanParcel | undefined
  vi: boolean
}): ReactNode {
  const items = parcel ? sortedPlacements(parcel) : []
  const title =
    mode === 'no-plan'
      ? vi
        ? 'Chưa có kế hoạch đóng gói'
        : 'No packing plan yet'
      : mode === 'computing'
        ? vi
          ? 'Đang tính phương án đóng gói…'
          : 'Computing the packing plan…'
        : mode === 'failed'
          ? vi
            ? 'Không tính được phương án — kiểm tra hồ sơ SKU'
            : 'Plan failed — check SKU profiles'
          : vi
            ? 'Kiện xếp tay — không có hình 3D'
            : 'Manual parcel — no 3D layout'
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      {mode === 'computing' ? (
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      ) : mode === 'failed' ? (
        <AlertTriangle className="h-8 w-8 text-amber-500" />
      ) : (
        <Package className="h-8 w-8 text-slate-400" />
      )}
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      {mode === 'list' && items.length > 0 ? (
        <ul className="max-h-40 w-full max-w-xs overflow-y-auto text-left text-xs text-slate-300">
          {items.map((p) => (
            <li key={p.itemKey} className="border-b border-white/10 py-1 font-mono">
              {p.sku}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Trình phát hướng dẫn cho 1 kiện — đặt lại về bước đầu khi đổi kiện / kế hoạch (qua `key`). */
function ParcelGuidePlayer({
  plan,
  parcel,
  autoRotate,
  vi,
  onOpenDetail,
  stepIndex,
  onStepIndexChange,
  showCaption,
}: {
  plan: PackingPlan
  parcel: PackingPlanParcel
  autoRotate: boolean
  vi: boolean
  onOpenDetail?: () => void
  stepIndex?: number
  onStepIndexChange?: (index: number) => void
  showCaption: boolean
}): ReactNode {
  const { placements, steps, mailer } = useMemo(
    () => packStepsForParcel(parcel, plan.itemProfiles, bubbleWrapFor(parcel.materials)),
    [parcel, plan.itemProfiles],
  )
  const orderIds = parcel.orderIds
  const shared = (orderIds?.length ?? 0) >= 2
  const orderCodes = sharedOrderCodes(parcel)
  const slipColors = useMemo(() => (orderIds ?? []).map((_, i) => orderColor(i)), [orderIds])
  const tintOf = useMemo(() => {
    if (!shared) return undefined
    return (p: PackingPlacement): string | undefined => {
      const at = orderIds?.indexOf(p.orderId ?? parcel.orderId ?? '') ?? -1
      return at >= 0 ? orderColor(at) : undefined
    }
  }, [shared, orderIds, parcel.orderId])
  const [localIndex, setLocalIndex] = useState(0)
  // Có onStepIndexChange thì bước do ngoài giữ (đồng bộ với danh sách bước chữ).
  const index = Math.min(steps.length - 1, Math.max(0, onStepIndexChange ? (stepIndex ?? 0) : localIndex))
  const setIndex = useCallback(
    (next: (i: number) => number): void => {
      const value = next(index)
      if (onStepIndexChange) onStepIndexChange(value)
      else setLocalIndex(value)
    },
    [index, onStepIndexChange],
  )
  const [playing, setPlaying] = useState(false)
  const [viewKey, setViewKey] = useState(0)

  const last = steps.length - 1
  const current = steps[index]

  useEffect(() => {
    if (!playing || !current) return
    if (index >= last) {
      const stop = window.setTimeout(() => setPlaying(false), 0)
      return () => window.clearTimeout(stop)
    }
    const wait = (STEP_SECONDS[current.kind] + 0.7) * 1000
    const timer = window.setTimeout(() => setIndex((i) => Math.min(last, i + 1)), wait)
    return () => window.clearTimeout(timer)
  }, [playing, index, last, current, setIndex])

  const placement = current?.item != null ? placements[current.item] : undefined
  const profile = placement ? profileFor(plan.itemProfiles, placement.sku) : undefined
  const guideStep = placement ? parcel.guide?.steps.find((s) => s.step === placement.step) : undefined
  const inner = innerOf(parcel)
  const outer = parcel.box.outerMm
  const span = Math.max(outer.lengthMm, outer.widthMm, outer.heightMm) / 1000
  // Khung hình gồm thùng/túi + khu chuẩn bị (túi còn nằm ở phía kia trước khi trượt vào).
  const area = workAreaFor(outer, inner, mailer)
  const alongX = inner.lengthMm > inner.widthMm
  // Túi trải phẳng chừa thêm lề trái để không chạm mép khung ở góc gần camera.
  const minX = -outer.lengthMm / 2000 - (mailer ? 0.16 : 0)
  const maxX = Math.max(area.center[0] + area.size / 2, mailer && alongX ? (outer.lengthMm * 1.5) / 1000 : outer.lengthMm / 2000)
  const minZ = -Math.max(outer.widthMm / 2000, area.size / 2)
  const maxZ = Math.max(area.center[1] + area.size / 2, mailer && !alongX ? (outer.widthMm * 1.5) / 1000 : outer.widthMm / 2000)
  const reach = Math.max(maxX - minX, maxZ - minZ)
  const onWorkArea = isWorkAreaStep(current?.kind)
  const [areaX, areaZ] = area.center
  // Nắp thùng mở choãi ra ngoài thân thùng: khung toàn cảnh phải chứa cả phần này.
  const flap = mailer ? 0 : Math.min(outer.lengthMm, outer.widthMm) / 2000
  const fullMinX = minX - flap
  // AOFP-350: mọi bước trên khu chuẩn bị giữ CÙNG một khung — trước đây zip/gập đôi sáp lại 60% nên mỗi lần
  // bấm tiếp camera giật vào, và gói còn trải rộng bị cắt khỏi khung. Chuyển động là của món hàng, không phải camera.
  const areaView = area.size
  const focus = useMemo<CameraFocus>(
    () =>
      onWorkArea
        ? { center: [areaX, areaZ], width: areaView, depth: areaView, height: 0.12 }
        : {
            center: [(fullMinX + maxX) / 2, (minZ + maxZ) / 2],
            width: maxX - fullMinX,
            depth: maxZ - minZ,
            height: outer.heightMm / 1000 + flap,
          },
    [onWorkArea, areaX, areaZ, areaView, fullMinX, maxX, minZ, maxZ, outer.heightMm, flap],
  )
  const placementOrder = placement && shared ? tintOf?.(placement) : undefined
  const placementOrderCode = placement
    ? orderCodes[orderIds?.indexOf(placement.orderId ?? parcel.orderId ?? '') ?? -1]
    : undefined

  const go = (delta: number): void => {
    setPlaying(false)
    setIndex((i) => Math.min(last, Math.max(0, i + delta)))
  }

  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col outline-none"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(1)
        if (event.key === 'ArrowLeft') go(-1)
      }}
    >
      {/* Cảnh 3D chiếm trọn phần giữa; thông tin + điều khiển nằm ở hai dải trên/dưới, không đè lên hàng. */}
      <div className="relative min-h-0 w-full flex-1 cursor-grab active:cursor-grabbing">
        <Canvas camera={{ position: [reach, reach, reach], fov: 40, near: 0.01, far: 50 }}>
          <Suspense fallback={null}>
            <PackingScene
              boxCode={parcel.box.code}
              innerMm={inner}
              outerMm={outer}
              placements={placements}
              profiles={plan.itemProfiles}
              steps={steps}
              index={index}
              mailer={mailer}
              tintOf={tintOf}
              slipColors={shared ? slipColors : undefined}
              materials={parcel.materials}
            />
          </Suspense>
          <StepCamera focus={focus} resetKey={viewKey} />
          <OrbitControls
            key={viewKey}
            makeDefault
            enablePan={false}
            minDistance={span * 0.8}
            maxDistance={reach * 3}
            maxPolarAngle={Math.PI / 2.05}
            autoRotate={autoRotate && !playing && (current?.kind === 'prepare' || current?.kind === 'close' || current?.kind === 'label')}
            autoRotateSpeed={1.2}
          />
        </Canvas>
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
        {onOpenDetail ? (
          <button
            type="button"
            onClick={onOpenDetail}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/25 text-white/90 hover:bg-black/40 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            title={vi ? 'Xem chi tiết' : 'View details'}
            aria-label={vi ? 'Xem chi tiết' : 'View details'}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setViewKey((k) => k + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/25 text-white/90 hover:bg-black/40 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          title={vi ? 'Đặt lại góc nhìn' : 'Reset view'}
          aria-label={vi ? 'Đặt lại góc nhìn' : 'Reset view'}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Lời bước dài/ngắn khác nhau: giới hạn chiều cao + cuộn để thẻ không phình che cảnh 3D. */}
        {showCaption ? (
        <div className="max-h-28 min-h-[3.25rem] overflow-y-auto overscroll-contain px-3 pt-2.5 pb-2" aria-live="polite">
            {current?.kind === 'prepare' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {parcel.box.name} ({parcel.box.code}) — {formatDimsMmAsCm(inner.lengthMm, inner.widthMm, inner.heightMm)}{mailer ? (vi ? ' sau khi nhồi' : ' when filled') : ''}{boxCutNote(parcel.box, vi)}
                {parcel.materials.length > 0
                  ? ` · ${parcel.materials.map((m) => `${m.name} × ${String(m.quantity)}`).join(', ')}`
                  : ''}
              </p>
            ) : current?.kind === 'close' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">{closeNote(parcel.materials, vi)}</p>
            ) : current?.kind === 'slip' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {vi ? 'Đặt phiếu đóng gói của từng đơn lên chồng hàng' : 'Place each order\'s packing slip on the stack'}
                {orderCodes.length > 0 ? `: ${orderCodes.join(', ')}` : ''}
              </p>
            ) : current && (current.kind === 'bagIn' || current.kind === 'seal' || current.kind === 'label') ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">{actionNote(current.kind, vi)}</p>
            ) : placement ? (
              <>
                <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                  <span className="font-mono font-semibold">{placement.sku}</span>
                  {' · '}
                  {categoryLabel(profile?.productCategory, vi)}
                  {placement.folded ? ((placement.foldCount ?? 1) > 1 ? (vi ? ' · gập tư' : ' · folded in quarters') : vi ? ' · gập đôi' : ' · folded in half') : ''}
                  {profile?.zipBagCode ? ` · ${vi ? 'túi' : 'bag'} ${profile.zipBagCode}` : ''}
                  {placementOrderCode ? (
                    <span className="font-semibold" style={{ color: placementOrder }}>
                      {' · '}
                      {vi ? 'đơn' : 'order'} {placementOrderCode}
                    </span>
                  ) : null}
                </p>
                {current?.kind === 'wrap' ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {vi
                      ? 'Trải tấm xốp hơi, đặt món vào giữa, gập 2 mép dài lên rồi 2 mép ngắn phủ kín mặt trên.'
                      : 'Lay the bubble wrap flat, put the item in the middle, fold the long sides up, then the short sides over the top.'}
                  </p>
                ) : current?.kind === 'tape' ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {vi
                      ? 'Dán băng keo ngang mặt trên, kéo rủ xuống hai bên để giữ chặt lớp xốp.'
                      : 'Tape across the top and down both sides to hold the wrap.'}
                  </p>
                ) : null}
                {guideStep ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {guideStep.instruction}
                    {guideStep.tip ? ` — ${guideStep.tip}` : ''}
                  </p>
                ) : null}
              </>
            ) : null}
            {shared && orderCodes.length > 0 ? (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                {orderCodes.map((code, i) => (
                  <span key={code} className="inline-flex items-center gap-1 font-mono">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: orderColor(i) }} />
                    {code}
                  </span>
                ))}
              </p>
            ) : null}
        </div>
        ) : null}
        {/* Thanh điều khiển neo đáy thẻ: nút không xê dịch khi đổi bước. */}
        <div className={`flex items-center justify-between gap-3 px-3 py-1.5 ${showCaption ? 'border-t border-slate-200/80 dark:border-slate-800' : ''}`}>
          <p className="min-w-0 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
            <span className="tabular-nums">
              {vi ? 'Bước' : 'Step'} {index + 1}/{steps.length}
            </span>
            {current ? <span className="font-medium text-slate-700 dark:text-slate-300"> · {stepLabel(current.kind, vi, mailer)}</span> : null}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40"
              aria-label={vi ? 'Bước trước' : 'Previous step'}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (index >= last) setIndex(() => 0)
                setPlaying((p) => !p)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#152d35] text-white"
              aria-label={playing ? (vi ? 'Tạm dừng' : 'Pause') : vi ? 'Tự chạy' : 'Play'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index >= last}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40"
              aria-label={vi ? 'Bước sau' : 'Next step'}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Packing3DBoxViewer({
  plan,
  parcelNo,
  onParcelChange,
  className,
  autoRotate = false,
  onOpenDetail,
  stepIndex,
  onStepIndexChange,
  showCaption = true,
}: {
  plan: PackingPlan | null
  /** Kiện đang xem; không truyền = kiện đầu tiên. */
  parcelNo?: number | null
  onParcelChange?: (parcelNo: number) => void
  /** Override chiều cao mặc định — dùng `h-full` khi đồng bộ với ô Hàng đợi */
  className?: string
  /** Xoay tự động ở bước chuẩn bị / gập nắp khi không tự chạy */
  autoRotate?: boolean
  /** Nút phóng to mở màn chi tiết */
  onOpenDetail?: () => void
  /** Bước đang xem do ngoài giữ — để danh sách bước chữ tô sáng và bấm nhảy tới. */
  stepIndex?: number
  onStepIndexChange?: (index: number) => void
  /** false khi bên cạnh đã có danh sách bước chữ: chỉ giữ thanh điều khiển, không che cảnh 3D. */
  showCaption?: boolean
}): ReactNode {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [localNo, setLocalNo] = useState<number | null>(null)
  const webgl = useMemo(() => hasWebGL(), [])

  const activeNo = onParcelChange ? parcelNo : (localNo ?? parcelNo)
  const parcel = selectParcel(plan, activeNo)
  const mode = sceneMode(plan, parcel)
  const parcels = plan?.parcels ?? []

  const pick = (no: number): void => {
    if (onParcelChange) onParcelChange(no)
    else setLocalNo(no)
  }

  const inner = parcel ? innerOf(parcel) : null
  const label = parcel
    ? `${parcel.box.name}${inner ? ` · ${formatDimsMmAsCm(inner.lengthMm, inner.widthMm, inner.heightMm)}` : ''}`
    : vi
      ? 'Hướng dẫn đóng gói 3D'
      : '3D packing guide'
  const sub = parcel
    ? `${vi ? 'Kiện' : 'Parcel'} ${String(parcel.parcelNo)}/${String(parcels.length)}${
        parcel.fillRatio != null ? ` · ${vi ? 'lấp đầy' : 'fill'} ${String(Math.round(parcel.fillRatio * 100))}%` : ''
      }`
    : ''
  // Thùng rộng hơn hàng vì danh mục thiếu cỡ — nói rõ lý do thay vì để con số "lấp đầy" thấp đứng một mình.
  const hint = parcel?.fillHint
  const hintDims = hint
    ? formatDimsMmAsCm(hint.suggestInnerMm.lengthMm, hint.suggestInnerMm.widthMm, hint.suggestInnerMm.heightMm)
    : ''
  const hintPct = hint ? String(Math.round(hint.suggestFill * 100)) : ''

  return (
    <div
      className={
        className ??
        'relative h-[380px] w-full select-none overflow-hidden rounded-2xl border border-slate-700 bg-[#24363f] sm:h-[420px]'
      }
    >
      <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={label}>
          {label}
          {sub ? <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-300">{sub}</span> : null}
        </p>
        {hint ? (
          <span
            className="shrink-0 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-200"
            title={
              vi
                ? `Danh mục không có thùng nhỏ hơn chứa vừa kiện này. Thùng lòng ${hintDims} sẽ đầy ${hintPct}% — nên nhập thêm cỡ này.`
                : `No smaller box in the catalogue fits this parcel. A ${hintDims} box would be ${hintPct}% full — consider stocking that size.`
            }
          >
            {vi ? `Thiếu thùng sát hơn · vừa nhất ${hintDims}` : `No tighter box · best fit ${hintDims}`}
          </span>
        ) : null}
      {parcels.length > 1 ? (
        <div className="flex shrink-0 flex-wrap gap-1">
          {parcels.map((p) => (
            <button
              key={p.parcelNo}
              type="button"
              onClick={() => pick(p.parcelNo)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-medium shadow-sm ${
                p.parcelNo === parcel?.parcelNo
                  ? 'border-[#152d35] bg-[#152d35] text-white'
                  : 'border-slate-200 bg-white/95 text-slate-700'
              }`}
            >
              {vi ? 'Kiện' : 'Parcel'} {p.parcelNo}
            </button>
          ))}
        </div>
      ) : null}
      </div>

      {mode === 'scene' && plan && parcel ? (
        webgl ? (
          <ParcelGuidePlayer
            key={`${plan.id}:${String(plan.version)}:${String(parcel.parcelNo)}`}
            plan={plan}
            parcel={parcel}
            autoRotate={autoRotate}
            vi={vi}
            onOpenDetail={onOpenDetail}
            stepIndex={stepIndex}
            onStepIndexChange={onStepIndexChange}
            showCaption={showCaption}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-300">
            {vi
              ? 'Trình duyệt không hỗ trợ WebGL — xem các bước ở danh sách hướng dẫn.'
              : 'WebGL is not available — use the step list instead.'}
          </div>
        )
      ) : (
        <div className="min-h-0 flex-1">
          <ModeMessage mode={mode === 'scene' ? 'list' : mode} parcel={parcel} vi={vi} />
        </div>
      )}
      </div>
    </div>
  )
}
