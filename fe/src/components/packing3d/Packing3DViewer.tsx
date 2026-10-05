import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, N8AO, Outline, SMAA, Selection } from '@react-three/postprocessing'
import { AlertTriangle, Boxes, Eye, Layers, Maximize2, Shirt, Sparkles } from 'lucide-react'
import { Vector3 } from 'three'
import { ErrorBoundary } from '../ErrorBoundary'
import type { PlanItemProfile, PlanParcel } from '../../types/packing-plan'
import { preloadCategoryModels } from '../packing/product-models'
import { Carton } from './Carton'
import { HIGHLIGHT, itemColor } from './colors'
import { ParcelItem } from './ParcelItem'
import { ActiveItem } from './ActiveItem'
import { Materials3D } from './Materials3D'
import { PackingStage, STAGE_MAT_THICKNESS } from './PackingStage'
import { PackageModel, garmentFlatSize } from './cloth/cloth-sim'
import { ACTION_SECONDS, type PackActionKind, type PackTimeline } from './timeline'

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
  /** Món đang làm nổi (viền sáng + nhãn). */
  focusItemKey?: string | null
  /** Xem từng bước: dòng thời gian + trạng thái trình phát. Bỏ trống = xem kết quả xếp. */
  steps?: StepsState
  /** Phần tử nổi ở đáy khung (thanh điều khiển từng bước). */
  overlay?: ReactNode
  /** Phần tử nổi góc trên trái (lời hướng dẫn bước hiện tại). */
  caption?: ReactNode
  onSelectItem?: (itemKey: string | null) => void
  className?: string
}

export type StepsState = {
  timeline: PackTimeline
  index: number
  playing: boolean
  speed: number
  onActionDone: (index: number) => void
  /** Tăng lên để chạy lại animation của bước hiện tại. */
  replay?: number
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

/** Trình duyệt/máy có tạo được WebGL không — không có thì hiện thông báo thay vì khung trống. */
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

type Focus = { key: string; target: [number, number, number]; dist: number; elevation: number }

/** Camera tự bay tới vùng đang thao tác (thảm gấp / thùng / nắp); vẫn xoay tay được. */
function CameraRig({ focus, limit, resetToken }: { focus: Focus; limit: number; resetToken: number }) {
  const controls = useRef<CameraControls>(null)
  const first = useRef(true)
  const [tx, ty, tz] = focus.target
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const d = focus.dist
    const h = Math.sin(focus.elevation) * d
    const f = Math.cos(focus.elevation) * d
    void c.setLookAt(tx + f * 0.42, ty + h, tz + f * 0.9, tx, ty, tz, !first.current)
    first.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ bay lại khi đổi vùng nhìn
  }, [focus.key, resetToken])
  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={limit * 0.5}
      maxDistance={limit * 7}
      maxPolarAngle={Math.PI * 0.47}
      dollySpeed={0.5}
      smoothTime={0.45}
    />
  )
}

/** Tiến độ 3 bước cuối kiện, đọc mỗi khung hình (không qua state React để khỏi vẽ lại cây). */
class FinishState {
  current = { closed: 0, taped: 0 }
  fill = { current: 0 }
  update(fill: number, closed: number, taped: number): void {
    this.fill.current = fill
    this.current.closed = closed
    this.current.taped = taped
  }
}

/** Mô hình vải theo món, giữ lại khi lùi/tiến bước. */
class ModelCache {
  private readonly map = new Map<string, PackageModel>()
  get(key: string, build: () => PackageModel): PackageModel {
    const hit = this.map.get(key)
    if (hit) return hit
    const m = build()
    this.map.set(key, m)
    return m
  }
}

/** Bộ đếm cho 3 bước cuối kiện (chèn vật tư, đóng nắp, dán băng keo). */
function FinishDriver({ steps, finish }: { steps: StepsState; finish: FinishState }) {
  const clock = useRef(0)
  const done = useRef(false)
  const { timeline, index, playing, speed, onActionDone, replay } = steps
  const kind = timeline.actions[index]?.kind
  useEffect(() => {
    clock.current = 0
    done.current = false
  }, [index, replay])
  useFrame((_, delta) => {
    const animated = kind === 'fill' || kind === 'close_flaps' || kind === 'tape'
    if (animated && playing) clock.current += (Math.min(delta, 1 / 30) * speed) / ACTION_SECONDS[kind]
    const t = Math.min(clock.current, 1)
    const stage = (at: number) => (index > at ? 1 : index === at ? t : 0)
    finish.update(stage(timeline.fillIndex), stage(timeline.closeIndex), stage(timeline.tapeIndex))
    if (animated && !done.current && clock.current >= 1.25) {
      done.current = true
      onActionDone(index)
    }
  })
  return null
}

const STATION_KINDS = new Set<PackActionKind>([
  'lay_flat',
  'fold_sides',
  'fold_body',
  'bag_insert',
  'bag_seal',
  'bag_fold',
  'fold_half',
  'pick',
])

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
  focusItemKey = null,
  steps,
  overlay,
  caption,
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
  const [webgl] = useState(detectWebGL)

  const inner = parcel.box.innerMm
  const size = { x: inner.lengthMm / 1000, y: inner.heightMm / 1000, z: inner.widthMm / 1000 }
  const wall = Math.min(Math.max((parcel.box.outerMm.lengthMm - inner.lengthMm) / 2000, 0.003), 0.012)
  const profiles = useMemo(() => new Map(itemProfiles.map((p) => [p.sku, p])), [itemProfiles])
  const ordered = useMemo(() => [...parcel.placements].sort((a, b) => a.step - b.step), [parcel.placements])
  const levels = useMemo(() => [...new Set(ordered.map((p) => p.z))].sort((a, b) => a - b), [ordered])
  const stepping = steps !== undefined
  // Đang xem từng bước thì bỏ tách lớp/lọc lớp (không còn nghĩa khi hàng đang được xếp dần).
  const layerCut = !stepping && layer !== null && layer < levels.length ? (levels[layer] ?? null) : null
  const showExploded = exploded && !stepping
  const physics = quality === 'high' && !reducedMotion
  const surface = -wall
  const timeline = steps?.timeline

  // Các pha thao tác của từng món (bỏ "lấy" và "đặt") — để dựng mô hình vải.
  const phaseKinds = useMemo(() => {
    const map = new Map<string, PackActionKind[]>()
    if (!timeline) return map
    for (const a of timeline.actions) {
      if (!a.itemKey || a.kind === 'place' || a.kind === 'pick') continue
      const list = map.get(a.itemKey) ?? []
      list.push(a.kind)
      map.set(a.itemKey, list)
    }
    return map
  }, [timeline])

  // Thảm gấp đặt bên trái thùng, đủ rộng cho món trải phẳng lớn nhất.
  const mat = useMemo(() => {
    if (!timeline) return null
    let w = 0.42
    let d = 0.36
    for (const item of timeline.items) {
      const f = garmentFlatSize(item, phaseKinds.get(item.placement.itemKey) ?? [])
      w = Math.max(w, f.w + 0.12)
      d = Math.max(d, f.d + 0.12)
    }
    return { x: -(size.x / 2 + wall + 0.09 + w / 2), z: 0, w, d }
  }, [timeline, phaseKinds, size.x, wall])
  const tableBounds: [number, number, number, number] = mat
    ? [
        mat.x - mat.w / 2 - 0.08,
        size.x / 2 + wall + 0.14,
        -Math.max(mat.d, size.z) / 2 - 0.14,
        Math.max(mat.d, size.z) / 2 + 0.14,
      ]
    : [-size.x / 2 - 0.16, size.x / 2 + 0.16, -size.z / 2 - 0.16, size.z / 2 + 0.16]

  const action = steps ? steps.timeline.actions[steps.index] : undefined
  const activeItem = steps && action && action.itemIndex >= 0 ? steps.timeline.items[action.itemIndex] : undefined
  // Mô hình vải dựng theo món, giữ lại khi lùi/tiến; đổi kế hoạch (dòng thời gian mới) thì dựng lại.
  const models = useMemo(() => {
    void timeline
    return new ModelCache()
  }, [timeline])
  const activeModel = useMemo(() => {
    if (!activeItem || activeItem.shape === null) return null
    const key = activeItem.placement.itemKey
    return models.get(key, () => new PackageModel(activeItem, phaseKinds.get(key) ?? []))
  }, [activeItem, phaseKinds, models])
  const activePhase = activeModel && action ? activeModel.phases.findIndex((ph) => ph.kind === action.kind) : 0

  const [finish] = useState(() => new FinishState())
  const topOfLoad = useMemo(() => ordered.reduce((m, p) => Math.max(m, (p.z + p.dz) / 1000), 0), [ordered])

  const d = Math.max(size.x, size.y, size.z)
  let focus: Focus = { key: `result-${String(parcel.parcelNo)}`, target: [0, size.y * 0.3, 0], dist: d * 3.6, elevation: 0.62 }
  if (steps && action) {
    if (mat && STATION_KINDS.has(action.kind))
      focus = {
        key: `station-${action.itemKey ?? ''}`,
        target: [mat.x, surface + 0.02, 0],
        dist: Math.max(mat.w, mat.d) * 2.5,
        elevation: 0.9,
      }
    else if (action.kind === 'place' && mat)
      focus = {
        key: `place-${action.itemKey ?? ''}`,
        target: [mat.x / 2, size.y * 0.4, 0],
        dist: (Math.abs(mat.x) + size.x) * 1.45,
        elevation: 0.72,
      }
    else if (action.kind === 'close_flaps' || action.kind === 'tape')
      focus = { key: 'seal', target: [0, size.y * 0.6, 0], dist: d * 3.1, elevation: 1.0 }
    else focus = { key: 'carton', target: [0, size.y * 0.35, 0], dist: d * 3.2, elevation: 0.85 }
  }

  const station = useMemo(
    () => new Vector3(mat?.x ?? 0, surface + STAGE_MAT_THICKNESS, mat?.z ?? 0),
    [mat, surface],
  )
  const dest = useMemo(() => {
    if (!activeItem) return null
    const p = activeItem.placement
    return {
      center: new Vector3(
        (p.x + p.dx / 2 - inner.lengthMm / 2) / 1000,
        (p.z + p.dz / 2) / 1000,
        (p.y + p.dy / 2 - inner.widthMm / 2) / 1000,
      ),
      size: new Vector3(p.dx / 1000, p.dz / 1000, p.dy / 1000),
    }
  }, [activeItem, inner.lengthMm, inner.widthMm])

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

  const renderUnavailable = (detail: string, retry?: () => void) => (
    <div role="alert" className="absolute inset-0 flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
        <p className="mt-2 text-sm font-medium text-ink">
          {vi ? 'Không hiển thị được khung 3D trên máy này' : '3D view is unavailable on this device'}
        </p>
        <p className="mt-1 break-words font-mono text-xs text-ink-subtle">{detail}</p>
        <div className="mt-3 flex justify-center gap-2">
          {retry && quality === 'high' && (
            <button type="button" onClick={() => setQualityPersist('low')} className={toggle(true)}>
              {vi ? 'Thử chế độ Nhẹ' : 'Try Lite mode'}
            </button>
          )}
          {retry && (
            <button type="button" onClick={retry} className={toggle(false)}>
              {vi ? 'Thử lại' : 'Retry'}
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className={`relative isolate overflow-hidden rounded-xl border border-hairline ${className}`}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_30%,var(--app-surface-1),var(--app-canvas)_78%)]"
      />
      {/* WebGL hỏng/thiếu, hoặc hiệu ứng hậu kỳ lỗi trên máy yếu: chỉ mất khung 3D,
          phần còn lại của trang vẫn dùng được. Đổi kiện / chất lượng thì thử lại. */}
      {!webgl ? (
        renderUnavailable(
          vi
            ? 'Trình duyệt không bật WebGL (tăng tốc phần cứng). Bật lại trong cài đặt trình duyệt hoặc dùng Chrome/Edge bản mới.'
            : 'WebGL is not available. Enable hardware acceleration or use a recent Chrome/Edge.',
        )
      ) : (
        <ErrorBoundary
          resetKey={`${String(parcel.parcelNo)}-${quality}`}
          fallback={(error, retry) => renderUnavailable(error.message, retry)}
        >
          <Canvas
            frameloop={stepping ? 'always' : 'demand'}
            dpr={quality === 'high' ? [1, 2] : [1, 1.25]}
            gl={{ antialias: quality === 'low', alpha: true, powerPreference: 'high-performance' }}
            camera={{ fov: 30, near: 0.01, far: 40, position: [1, 1, 1] }}
            onPointerMissed={() => onSelectItem?.(null)}
            aria-label={vi ? 'Hình 3D cách xếp kiện' : '3D view of the parcel'}
          >
            <Selection>
              <StudioLights />
              <PackingStage surface={surface} bounds={tableBounds} mat={mat} />
              <Carton inner={size} wall={wall} xray={xray} hidden={showExploded} seal={finish} />
              {ordered.map((p) => {
                const placedAt = steps?.timeline.placeIndex.get(p.itemKey) ?? -1
                const placed = !steps || placedAt < steps.index
                const visible = placed && (layerCut === null || p.z <= layerCut)
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
                    muted={false}
                    drop={false}
                    exploded={showExploded}
                    showModel={showModels}
                    outline={quality === 'high'}
                    label={
                      !stepping && (focused || hovered)
                        ? `${String(p.step)}. ${p.sku}${p.folded ? (vi ? ' · gập đôi' : ' · folded') : ''}`
                        : null
                    }
                    onSelect={onSelectItem}
                    onHover={setHoverKey}
                  />
                )
              })}
              {steps && activeItem && action && dest && (
                <ActiveItem
                  key={`${activeItem.placement.itemKey}-${String(steps.index)}-${String(steps.replay ?? 0)}`}
                  item={activeItem}
                  model={activeModel}
                  kind={action.kind}
                  phase={Math.max(0, activePhase)}
                  speed={steps.speed}
                  playing={steps.playing}
                  physics={physics}
                  station={station}
                  dest={dest}
                  liftHeight={size.y + 0.1}
                  color={itemColor(activeItem.placement.sku, activeItem.profile?.productCategory)}
                  onDone={() => steps.onActionDone(steps.index)}
                />
              )}
              {steps && (
                <>
                  <FinishDriver steps={steps} finish={finish} />
                  <Materials3D materials={parcel.materials} inner={size} top={topOfLoad} progress={finish.fill} />
                </>
              )}
              <ContactShadows
                position={[0, surface + 0.0005, 0]}
                scale={Math.max(tableBounds[1] - tableBounds[0], tableBounds[3] - tableBounds[2]) * 1.1}
                blur={2.4}
                far={size.y + 0.25}
                opacity={0.42}
                resolution={quality === 'high' ? 1024 : 512}
                frames={stepping && quality === 'high' ? Infinity : 1}
                color="#3b2a1a"
              />
              <CameraRig focus={focus} limit={d} resetToken={resetToken} />
              {quality === 'high' ? (
                <EffectComposer multisampling={0} autoClear={false}>
                  <N8AO aoRadius={0.05} distanceFalloff={0.6} intensity={1.8} quality="medium" halfRes />
                  <Outline visibleEdgeColor={HIGHLIGHT} hiddenEdgeColor={HIGHLIGHT} edgeStrength={8} blur xRay />
                  <SMAA />
                </EffectComposer>
              ) : (
                <></>
              )}
            </Selection>
          </Canvas>
        </ErrorBoundary>
      )}

      {/* Công cụ xem */}
      <div className="absolute top-3 right-3 flex flex-wrap items-center justify-end gap-0.5 rounded-lg border border-hairline bg-surface-1/90 p-1 shadow-sm backdrop-blur">
        <button type="button" onClick={() => setXray((v) => !v)} aria-pressed={xray} className={toggle(xray)}>
          <Eye className="h-3.5 w-3.5" />
          X-ray
        </button>
        {!stepping && (
          <button
            type="button"
            onClick={() => setExploded((v) => !v)}
            aria-pressed={exploded}
            className={toggle(exploded)}
          >
            <Layers className="h-3.5 w-3.5" />
            {vi ? 'Tách lớp' : 'Explode'}
          </button>
        )}
        {!stepping && (
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
        )}
        <button
          type="button"
          onClick={() => setQualityPersist(quality === 'high' ? 'low' : 'high')}
          aria-pressed={quality === 'high'}
          className={toggle(quality === 'high')}
          title={
            vi
              ? 'Đẹp: mô phỏng vải, bóng mềm, viền sáng. Nhẹ: tắt cho máy yếu'
              : 'High: cloth physics and effects. Lite: for slow devices'
          }
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

      {caption && <div className="pointer-events-none absolute top-3 left-3 max-w-[min(26rem,calc(100%-14rem))]">{caption}</div>}
      {overlay && <div className="pointer-events-none absolute inset-x-3 bottom-3">{overlay}</div>}

      {/* Thùng + thanh lớp (chế độ kết quả) */}
      {!stepping && (
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
      )}
    </div>
  )
}
