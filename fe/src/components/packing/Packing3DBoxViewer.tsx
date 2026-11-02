import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
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
import {
  STEP_SECONDS,
  buildPackSteps,
  innerOf,
  orderColor,
  profileFor,
  sceneMode,
  selectParcel,
  sortedPlacements,
  stepLabel,
  workAreaFor,
  type SceneMode,
} from '../../utils/packing-layout'
import { sharedOrderCodes } from '../../lib/parcel-order-display'
import { categoryLabel } from './product-models'
import { PackingScene } from './scene/PackingScene'

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function cm(mm: number): string {
  return String(Math.round(mm / 10))
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
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {mode === 'list' && items.length > 0 ? (
        <ul className="max-h-40 w-full max-w-xs overflow-y-auto text-left text-xs text-slate-600 dark:text-slate-300">
          {items.map((p) => (
            <li key={p.itemKey} className="border-b border-slate-100 py-1 font-mono dark:border-slate-800">
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
}: {
  plan: PackingPlan
  parcel: PackingPlanParcel
  autoRotate: boolean
  vi: boolean
  onOpenDetail?: () => void
}): ReactNode {
  const placements = useMemo(() => sortedPlacements(parcel), [parcel])
  const mailer = parcel.box.kind === 'mailer'
  const orderIds = parcel.orderIds
  const shared = (orderIds?.length ?? 0) >= 2
  const orderCodes = sharedOrderCodes(parcel)
  const steps = useMemo(
    () => buildPackSteps(placements, plan.itemProfiles, { mailer, shared }),
    [placements, plan.itemProfiles, mailer, shared],
  )
  const slipColors = useMemo(() => (orderIds ?? []).map((_, i) => orderColor(i)), [orderIds])
  const tintOf = useMemo(() => {
    if (!shared) return undefined
    return (p: PackingPlacement): string | undefined => {
      const at = orderIds?.indexOf(p.orderId ?? parcel.orderId ?? '') ?? -1
      return at >= 0 ? orderColor(at) : undefined
    }
  }, [shared, orderIds, parcel.orderId])
  const [index, setIndex] = useState(0)
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
    const wait = (STEP_SECONDS[current.kind] + 1.2) * 1000
    const timer = window.setTimeout(() => setIndex((i) => Math.min(last, i + 1)), wait)
    return () => window.clearTimeout(timer)
  }, [playing, index, last, current])

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
  // Bảng hướng dẫn che phần dưới khung: nhìn lệch về phía người xem để cảnh nằm cao hơn.
  const target: [number, number, number] = [(minX + maxX) / 2, 0.06, (minZ + maxZ) / 2 + reach * 0.14]
  const camera: [number, number, number] = [target[0] + reach * 0.3, reach * 1.05, target[2] + reach * 1.05]
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
      className="relative h-full w-full outline-none"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(1)
        if (event.key === 'ArrowLeft') go(-1)
      }}
    >
      <div className="h-full w-full cursor-grab active:cursor-grabbing">
        <Canvas camera={{ position: camera, fov: 40, near: 0.01, far: 50 }}>
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
            />
          </Suspense>
          <OrbitControls
            key={viewKey}
            target={target}
            enablePan={false}
            minDistance={span * 0.8}
            maxDistance={reach * 3}
            maxPolarAngle={Math.PI / 2.05}
            autoRotate={autoRotate && !playing && (current?.kind === 'prepare' || current?.kind === 'close' || current?.kind === 'label')}
            autoRotateSpeed={1.2}
          />
        </Canvas>
      </div>

      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {onOpenDetail ? (
          <button
            type="button"
            onClick={onOpenDetail}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white/95 text-slate-700 shadow-sm hover:text-blue-600"
            title={vi ? 'Xem chi tiết' : 'View details'}
            aria-label={vi ? 'Xem chi tiết' : 'View details'}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setViewKey((k) => k + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white/95 text-slate-700 shadow-sm hover:text-blue-600"
          title={vi ? 'Đặt lại góc nhìn' : 'Reset view'}
          aria-label={vi ? 'Đặt lại góc nhìn' : 'Reset view'}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="absolute right-3 bottom-3 left-3 z-20 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              {vi ? 'Bước' : 'Step'} {index + 1}/{steps.length}
              {current ? ` · ${stepLabel(current.kind, vi, mailer)}` : ''}
            </p>
            {current?.kind === 'prepare' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {parcel.box.name} ({parcel.box.code}) — {cm(inner.lengthMm)} × {cm(inner.widthMm)} ×{' '}
                {cm(inner.heightMm)} cm{mailer ? (vi ? ' sau khi nhồi' : ' when filled') : ''}
                {parcel.materials.length > 0
                  ? ` · ${parcel.materials.map((m) => `${m.name} × ${String(m.quantity)}`).join(', ')}`
                  : ''}
              </p>
            ) : current?.kind === 'close' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {vi
                  ? 'Chèn vật tư vào khoảng trống, gập 2 nắp ngắn rồi 2 nắp dài, dán băng keo.'
                  : 'Fill gaps with materials, fold short flaps then long flaps, tape the box.'}
              </p>
            ) : current?.kind === 'slip' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {vi ? 'Đặt phiếu đóng gói của từng đơn lên chồng hàng' : 'Place each order\'s packing slip on the stack'}
                {orderCodes.length > 0 ? `: ${orderCodes.join(', ')}` : ''}
              </p>
            ) : current?.kind === 'bagIn' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {vi
                  ? 'Cho cả chồng hàng vào túi, món lớn và nặng nằm dưới.'
                  : 'Slide the whole stack into the mailer, large and heavy items at the bottom.'}
              </p>
            ) : current?.kind === 'seal' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {vi
                  ? 'Ép bớt không khí, bóc lớp giấy bảo vệ keo, gập nắp dán kín. Không cần băng keo.'
                  : 'Press out the air, peel the adhesive strip and seal the flap. No tape needed.'}
              </p>
            ) : current?.kind === 'label' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {vi ? 'Dán tem vận đơn lên mặt phẳng lớn của túi.' : 'Apply the shipping label on the large flat side.'}
              </p>
            ) : placement ? (
              <>
                <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                  <span className="font-mono font-semibold">{placement.sku}</span>
                  {' · '}
                  {categoryLabel(profile?.productCategory, vi)}
                  {placement.folded ? (vi ? ' · gập đôi' : ' · folded in half') : ''}
                  {profile?.zipBagCode ? ` · ${vi ? 'túi' : 'bag'} ${profile.zipBagCode}` : ''}
                  {placementOrderCode ? (
                    <span className="font-semibold" style={{ color: placementOrder }}>
                      {' · '}
                      {vi ? 'đơn' : 'order'} {placementOrderCode}
                    </span>
                  ) : null}
                </p>
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
            {parcel.guide ? (
              <p className="mt-1 text-[10px] text-slate-400">
                {parcel.guide.source === 'ai'
                  ? `AI · ${parcel.guide.model ?? ''}`
                  : vi
                    ? 'Câu mẫu'
                    : 'Template text'}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40"
              aria-label={vi ? 'Bước trước' : 'Previous step'}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (index >= last) setIndex(0)
                setPlaying((p) => !p)
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#152d35] text-white"
              aria-label={playing ? (vi ? 'Tạm dừng' : 'Pause') : vi ? 'Tự chạy' : 'Play'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index >= last}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40"
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
    ? `${parcel.box.name}${inner ? ` · ${cm(inner.lengthMm)} × ${cm(inner.widthMm)} × ${cm(inner.heightMm)} cm` : ''}`
    : vi
      ? 'Hướng dẫn đóng gói 3D'
      : '3D packing guide'
  const sub = parcel
    ? `${vi ? 'Kiện' : 'Parcel'} ${String(parcel.parcelNo)}/${String(parcels.length)}${
        parcel.fillRatio != null ? ` · ${vi ? 'lấp đầy' : 'fill'} ${String(Math.round(parcel.fillRatio * 100))}%` : ''
      }`
    : ''

  return (
    <div
      className={
        className ??
        'relative h-[380px] w-full select-none overflow-hidden rounded-2xl border border-slate-100 bg-[#f8faff] sm:h-[420px] dark:border-slate-800 dark:bg-slate-900/40'
      }
    >
      <div className="pointer-events-none absolute top-3 left-3 z-20 max-w-[60%] rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
        <p className="truncate text-xs font-bold text-slate-800 sm:text-sm dark:text-slate-100">{label}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
      </div>

      {parcels.length > 1 ? (
        <div className="absolute top-[4.25rem] left-3 z-20 flex flex-wrap gap-1">
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

      {mode === 'scene' && plan && parcel ? (
        webgl ? (
          <ParcelGuidePlayer
            key={`${plan.id}:${String(plan.version)}:${String(parcel.parcelNo)}`}
            plan={plan}
            parcel={parcel}
            autoRotate={autoRotate}
            vi={vi}
            onOpenDetail={onOpenDetail}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-600">
            {vi
              ? 'Trình duyệt không hỗ trợ WebGL — xem các bước ở danh sách hướng dẫn.'
              : 'WebGL is not available — use the step list instead.'}
          </div>
        )
      ) : (
        <ModeMessage mode={mode === 'scene' ? 'list' : mode} parcel={parcel} vi={vi} />
      )}
    </div>
  )
}
