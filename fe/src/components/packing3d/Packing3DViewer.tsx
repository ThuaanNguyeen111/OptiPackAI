import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, N8AO, Outline, SMAA, Selection } from '@react-three/postprocessing'
import { Boxes, Eye, Layers, Maximize2, Shirt, Sparkles } from 'lucide-react'
import type { PlanItemProfile, PlanParcel } from '../../types/packing-plan'
import { preloadCategoryModels } from '../packing/product-models'
import { Carton } from './Carton'
import { HIGHLIGHT } from './colors'
import { ParcelItem } from './ParcelItem'

/**
 * Khung 3D của 1 kiện (04/10/2026, thay PackingAnimation3D).
 *  - Thùng carton mở nắp, vách quay về camera tự mờ; công tắc x-ray.
 *  - Món là khối bo góc màu theo loại hàng; công tắc "mô hình sản phẩm".
 *  - Chất lượng cao: bóng mềm + AO + viền sáng món đang chọn + SMAA;
 *    chất lượng nhẹ: tắt hậu kỳ (máy kho yếu). Chỉ vẽ lại khi có thay đổi.
 *  - Tách lớp + thanh lớp theo độ cao để soi món nằm dưới.
 */

export type Packing3DViewerProps = {
  parcel: PlanParcel
  itemProfiles: PlanItemProfile[]
  vi: boolean
  /** Số món đã đặt (theo thứ tự `step`); bỏ trống = hiện tất cả. */
  visibleCount?: number
  /** Món đang làm nổi (viền sáng + nhãn). */
  focusItemKey?: string | null
  /** Món mới xuất hiện rơi từ trên xuống (chế độ đóng gói). */
  animateDrops?: boolean
  /** Làm nhạt các món không phải món đang làm nổi. */
  muteOthers?: boolean
  onSelectItem?: (itemKey: string | null) => void
  className?: string
}

type Quality = 'high' | 'low'
const QUALITY_KEY = 'optipack.packing3d.quality'

function readQuality(): Quality {
  try {
    return window.localStorage.getItem(QUALITY_KEY) === 'low' ? 'low' : 'high'
  } catch {
    return 'high'
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

preloadCategoryModels()

function CameraRig({ size, resetToken }: { size: { x: number; y: number; z: number }; resetToken: number }) {
  const controls = useRef<CameraControls>(null)
  const d = Math.max(size.x, size.y, size.z)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    void c.setLookAt(d * 1.35, size.y + d * 1.05, d * 1.65, 0, size.y * 0.35, 0, resetToken > 0)
  }, [d, size.y, resetToken])
  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={d * 0.7}
      maxDistance={d * 6}
      maxPolarAngle={Math.PI * 0.48}
      dollySpeed={0.5}
      smoothTime={0.25}
    />
  )
}

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[2, 4, 3]} intensity={1.1} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-4, 2, 2]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[4, 1.5, -2]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="ring" color="#c7d2fe" intensity={0.6} position={[0, 1, 5]} scale={2} />
      </Environment>
    </>
  )
}

export function Packing3DViewer({
  parcel,
  itemProfiles,
  vi,
  visibleCount,
  focusItemKey = null,
  animateDrops = false,
  muteOthers = false,
  onSelectItem,
  className = '',
}: Packing3DViewerProps) {
  const [quality, setQuality] = useState<Quality>(readQuality)
  const [xray, setXray] = useState(false)
  const [exploded, setExploded] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const [layer, setLayer] = useState<number | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState(0)
  const [reducedMotion] = useState(prefersReducedMotion)

  const inner = parcel.box.innerMm
  const size = { x: inner.lengthMm / 1000, y: inner.heightMm / 1000, z: inner.widthMm / 1000 }
  const wall = Math.min(Math.max((parcel.box.outerMm.lengthMm - inner.lengthMm) / 2000, 0.003), 0.012)
  const profiles = useMemo(() => new Map(itemProfiles.map((p) => [p.sku, p])), [itemProfiles])
  const ordered = useMemo(() => [...parcel.placements].sort((a, b) => a.step - b.step), [parcel.placements])
  const levels = useMemo(() => [...new Set(ordered.map((p) => p.z))].sort((a, b) => a - b), [ordered])
  // Đổi kiện thì bỏ lớp đang lọc (mức lớp của kiện cũ không còn nghĩa).
  const layerCut = layer !== null && layer < levels.length ? (levels[layer] ?? null) : null
  const shown = visibleCount ?? ordered.length

  const setQualityPersist = (q: Quality) => {
    setQuality(q)
    try {
      window.localStorage.setItem(QUALITY_KEY, q)
    } catch {
      /* trình duyệt chặn lưu trữ — chỉ mất ghi nhớ lựa chọn */
    }
  }

  const fmt = (n: number) => n.toLocaleString(vi ? 'vi-VN' : 'en-US')
  const toggle = (active: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
      active ? 'bg-primary text-on-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
    }`

  return (
    <div className={`relative isolate overflow-hidden rounded-xl border border-hairline ${className}`}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,var(--app-surface-1),var(--app-canvas)_75%)]"
      />
      <Canvas
        frameloop="demand"
        dpr={quality === 'high' ? [1, 2] : [1, 1.25]}
        gl={{ antialias: quality === 'low', alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 32, near: 0.01, far: 40, position: [1, 1, 1] }}
        onPointerMissed={() => onSelectItem?.(null)}
        aria-label={vi ? 'Hình 3D cách xếp kiện' : '3D view of the parcel'}
      >
        <Selection>
          <StudioLights />
          <Carton inner={size} wall={wall} xray={xray} hidden={exploded} />
          {ordered.map((p, index) => {
            const visible = index < shown && (layerCut === null || p.z <= layerCut)
            const focused = p.itemKey === focusItemKey
            const hovered = p.itemKey === hoverKey
            return (
              <ParcelItem
                key={p.itemKey}
                placement={p}
                profile={profiles.get(p.sku)}
                inner={inner}
                visible={visible}
                focused={focused}
                muted={muteOthers && focusItemKey !== null && !focused}
                drop={animateDrops && !reducedMotion && index === shown - 1}
                exploded={exploded}
                showModel={showModels}
                outline={quality === 'high'}
                label={
                  focused || hovered
                    ? `${String(p.step)}. ${p.sku}${p.folded ? (vi ? ' · gập đôi' : ' · folded') : ''}`
                    : null
                }
                onSelect={onSelectItem}
                onHover={setHoverKey}
              />
            )
          })}
          <ContactShadows
            position={[0, -wall - 0.0005, 0]}
            scale={Math.max(size.x, size.z) * 3.2}
            blur={2.6}
            far={size.y + 0.2}
            opacity={0.5}
            resolution={512}
            color="#1e1b4b"
          />
          <CameraRig size={size} resetToken={resetToken} />
          {quality === 'high' ? (
            <EffectComposer multisampling={0} autoClear={false}>
              <N8AO aoRadius={0.06} distanceFalloff={0.6} intensity={2.2} quality="medium" halfRes />
              <Outline
                visibleEdgeColor={HIGHLIGHT}
                hiddenEdgeColor={HIGHLIGHT}
                edgeStrength={8}
                blur
                xRay
              />
              <SMAA />
            </EffectComposer>
          ) : (
            <></>
          )}
        </Selection>
      </Canvas>

      {/* Công cụ xem */}
      <div className="absolute top-3 right-3 flex flex-wrap items-center justify-end gap-0.5 rounded-lg border border-hairline bg-surface-1/90 p-1 shadow-sm backdrop-blur">
        <button type="button" onClick={() => setXray((v) => !v)} aria-pressed={xray} className={toggle(xray)}>
          <Eye className="h-3.5 w-3.5" />
          X-ray
        </button>
        <button
          type="button"
          onClick={() => setExploded((v) => !v)}
          aria-pressed={exploded}
          className={toggle(exploded)}
        >
          <Layers className="h-3.5 w-3.5" />
          {vi ? 'Tách lớp' : 'Explode'}
        </button>
        <button
          type="button"
          onClick={() => setShowModels((v) => !v)}
          aria-pressed={showModels}
          className={toggle(showModels)}
          title={vi ? 'Hiện mô hình sản phẩm minh hoạ' : 'Show illustrative product models'}
        >
          {showModels ? <Shirt className="h-3.5 w-3.5" /> : <Boxes className="h-3.5 w-3.5" />}
          {vi ? 'Mô hình' : 'Models'}
        </button>
        <button
          type="button"
          onClick={() => setQualityPersist(quality === 'high' ? 'low' : 'high')}
          aria-pressed={quality === 'high'}
          className={toggle(quality === 'high')}
          title={vi ? 'Tắt hiệu ứng nếu máy chạy chậm' : 'Turn effects off on slow devices'}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {quality === 'high' ? (vi ? 'Đẹp' : 'High') : vi ? 'Nhẹ' : 'Lite'}
        </button>
        <button
          type="button"
          onClick={() => setResetToken((n) => n + 1)}
          className={toggle(false)}
          title={vi ? 'Về góc nhìn ban đầu' : 'Reset view'}
          aria-label={vi ? 'Về góc nhìn ban đầu' : 'Reset view'}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Thùng + thanh lớp */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
        <div className="rounded-lg border border-hairline bg-surface-1/90 px-3 py-1.5 text-xs text-ink-muted shadow-sm backdrop-blur">
          <span className="font-medium text-ink">{parcel.box.code}</span>
          <span className="mx-1.5 text-ink-subtle">·</span>
          <span className="tabular-nums">
            {fmt(inner.lengthMm / 10)}×{fmt(inner.widthMm / 10)}×{fmt(inner.heightMm / 10)} cm
          </span>
          <span className="mx-1.5 text-ink-subtle">·</span>
          <span className="tabular-nums">
            {vi ? 'lấp đầy' : 'fill'} {Math.round(parcel.fillRatio * 100)}%
          </span>
        </div>
        {levels.length > 1 && (
          <label className="pointer-events-auto flex items-center gap-2 rounded-lg border border-hairline bg-surface-1/90 px-3 py-1.5 text-xs text-ink-muted shadow-sm backdrop-blur">
            <span className="whitespace-nowrap">
              {vi ? 'Lớp' : 'Layer'}{' '}
              <span className="font-medium tabular-nums text-ink">
                {layerCut === null ? (vi ? 'tất cả' : 'all') : `≤ ${fmt(layerCut / 10)} cm`}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={levels.length}
              step={1}
              value={layer === null ? levels.length : layer}
              onChange={(e) => {
                const v = Number(e.target.value)
                setLayer(v >= levels.length ? null : v)
              }}
              className="w-28 accent-[var(--app-primary)]"
              aria-label={vi ? 'Lọc lớp theo độ cao' : 'Filter layers by height'}
            />
          </label>
        )}
      </div>
    </div>
  )
}
