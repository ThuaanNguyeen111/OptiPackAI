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
import type { PackingPlan, PackingPlanParcel } from '../../types/packing-plan'
import {
  STEP_SECONDS,
  buildPackSteps,
  innerOf,
  profileFor,
  sceneMode,
  selectParcel,
  sortedPlacements,
  stepLabel,
  type SceneMode,
} from '../../utils/packing-layout'
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
  const steps = useMemo(
    () => buildPackSteps(placements, plan.itemProfiles),
    [placements, plan.itemProfiles],
  )
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
  const camera: [number, number, number] = [span * 1.35, span * 1.45, span * 1.75]
  const target: [number, number, number] = [0, (outer.heightMm / 1000) * 0.85, 0]

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
            />
          </Suspense>
          <OrbitControls
            key={viewKey}
            target={target}
            enablePan={false}
            minDistance={span * 0.8}
            maxDistance={span * 5}
            maxPolarAngle={Math.PI / 2.05}
            autoRotate={autoRotate && !playing && (current?.kind === 'prepare' || current?.kind === 'close')}
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
              {current ? ` · ${stepLabel(current.kind, vi)}` : ''}
            </p>
            {current?.kind === 'prepare' ? (
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {parcel.box.name} ({parcel.box.code}) — {cm(inner.lengthMm)} × {cm(inner.widthMm)} ×{' '}
                {cm(inner.heightMm)} cm
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
            ) : placement ? (
              <>
                <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                  <span className="font-mono font-semibold">{placement.sku}</span>
                  {' · '}
                  {categoryLabel(profile?.productCategory, vi)}
                  {placement.folded ? (vi ? ' · gập đôi' : ' · folded in half') : ''}
                  {profile?.zipBagCode ? ` · ${vi ? 'túi' : 'bag'} ${profile.zipBagCode}` : ''}
                </p>
                {guideStep ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {guideStep.instruction}
                    {guideStep.tip ? ` — ${guideStep.tip}` : ''}
                  </p>
                ) : null}
              </>
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
