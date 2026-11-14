import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  CanvasTexture,
  DoubleSide,
  FrontSide,
  MathUtils,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Group,
  type Mesh,
} from 'three'
import type { PackingMm, PackingPlacement } from '../../../types/packing-plan'
import { MM, STEP_SECONDS, type Vec3, type WorkArea } from '../../../utils/packing-layout'
import {
  dividerSpot,
  freeFloorCells,
  type MaterialKind,
} from '../../../utils/packing-materials'
import { MATERIAL_MODELS, TAPE_ROLL_MODEL } from '../product-models'
import { StepClock, easeInOut } from './model-rigs'

/**
 * Vật tư chèn trong cảnh 3D (model tự dựng bằng Blender, xem fe/blender/make_packing_materials.py).
 * Vật tư chỉ minh hoạ, không chiếm thể tích trong tính toán xếp hàng của BE.
 *  - Bước chuẩn bị: bày trên khu chuẩn bị (`PrepareTray`).
 *  - Món dễ vỡ: bọc xốp hơi (`BubbleSleeve`).
 *  - Bước gập nắp: lấp gối hơi / giấy vò vào chỗ trống, đặt vách ngăn, giấy lót, dán tem (`CloseMaterials`).
 */

/** Lỗi tải 1 file vật tư chỉ làm mất vật tư đó, không làm hỏng cả cảnh. */
class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/** Kích thước tự nhiên của từng model (m) — khớp script Blender. */
const NATURAL = {
  bubble_wrap: [0.3, 0.2],
  corrugated_divider: [0.3, 0.2],
  tissue_paper: [0.25, 0.18],
  air_pillow: [0.128, 0.08],
  fragile_tape: [0.08, 0.05],
  foam_corner: [0.05, 0.05],
  kraft_paper: [0.1, 0.1],
  tape_roll: [0.076, 0.076],
} as const

type ModelKey = keyof typeof NATURAL

function pathOf(key: ModelKey): string {
  return key === 'tape_roll' ? TAPE_ROLL_MODEL : (MATERIAL_MODELS[key] ?? '')
}

function Piece({
  kind,
  position,
  scale = 1,
  rotation,
}: {
  kind: ModelKey
  position: Vec3
  scale?: number | Vec3
  rotation?: Vec3
}): ReactNode {
  const gltf = useGLTF(pathOf(kind))
  const object = useMemo(() => gltf.scene.clone(true), [gltf])
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={object} />
    </group>
  )
}

/** Hiện dần + rơi nhẹ từ trên xuống sau `delay` giây của bước. */
function Drop({
  delay,
  index,
  children,
  height = 0.07,
}: {
  delay: number
  index: number
  children: ReactNode
  height?: number
}): ReactNode {
  const ref = useRef<Group>(null)
  const clock = useMemo(() => new StepClock(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])
  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    const g = ref.current
    if (!g) return
    const p = Math.min(1, Math.max(0, (elapsed - delay) / 0.45))
    g.visible = elapsed >= delay
    g.position.y = (1 - easeInOut(p)) * height
  })
  return <group ref={ref}>{children}</group>
}

// ---------------------------------------------------------------------------
// Bước chuẩn bị: bày vật tư trên khu chuẩn bị
// ---------------------------------------------------------------------------

type Slot = { kind: ModelKey; w: number; d: number; scale: number }

/** Xếp lần lượt từng hàng (shelf), co đều cả cụm nếu vượt khu chuẩn bị. */
function layoutTray(counts: Map<MaterialKind, number>, mailer: boolean): Slot[] {
  const slots: Slot[] = []
  const push = (kind: ModelKey, n: number): void => {
    const [w, d] = NATURAL[kind]
    for (let i = 0; i < n; i += 1) slots.push({ kind, w, d, scale: 1 })
  }
  if (counts.has('bubble_wrap')) push('bubble_wrap', 1)
  if (counts.has('corrugated_divider')) push('corrugated_divider', 1)
  if (counts.has('tissue_paper')) push('tissue_paper', 1)
  if (counts.has('air_pillow')) push('air_pillow', Math.min(counts.get('air_pillow') ?? 0, 4))
  if (counts.has('foam_corner')) push('foam_corner', Math.min(counts.get('foam_corner') ?? 0, 4))
  if (counts.has('kraft_paper')) push('kraft_paper', Math.min(counts.get('kraft_paper') ?? 0, 2))
  if (counts.has('fragile_tape')) push('fragile_tape', 1)
  if (!mailer) push('tape_roll', 1)
  return slots
}

export function PrepareTray({
  counts,
  area,
  mailer,
}: {
  counts: Map<MaterialKind, number>
  area: WorkArea
  mailer: boolean
}): ReactNode {
  const placed = useMemo(() => {
    const slots = layoutTray(counts, mailer)
    const gap = 0.02
    const usable = area.size * 0.92
    const rows: Slot[][] = [[]]
    let rowWidth = 0
    for (const slot of slots) {
      if (rowWidth > 0 && rowWidth + slot.w + gap > usable) {
        rows.push([])
        rowWidth = 0
      }
      rows[rows.length - 1]?.push(slot)
      rowWidth += slot.w + gap
    }
    const rowDepth = rows.map((row) => Math.max(...row.map((s) => s.d)))
    const totalDepth = rowDepth.reduce((s, d) => s + d + gap, 0) - gap
    const out: { kind: ModelKey; x: number; z: number }[] = []
    let z = -totalDepth / 2
    rows.forEach((row, r) => {
      const width = row.reduce((s, slot) => s + slot.w + gap, 0) - gap
      let x = -width / 2
      const depth = rowDepth[r] ?? 0
      for (const slot of row) {
        out.push({ kind: slot.kind, x: x + slot.w / 2, z: z + depth / 2 })
        x += slot.w + gap
      }
      z += depth + gap
    })
    const widest = Math.max(...rows.map((row) => row.reduce((s, slot) => s + slot.w + gap, 0) - gap), 0.001)
    return { out, scale: Math.min(1, usable / widest, usable / Math.max(totalDepth, 0.001)) }
  }, [counts, area.size, mailer])

  return (
    <group position={[area.center[0], 0.0016, area.center[1]]} scale={placed.scale}>
      {placed.out.map((p, i) => (
        <SilentBoundary key={`${p.kind}-${String(i)}`}>
          <Suspense fallback={null}>
            <Piece kind={p.kind} position={[p.x, 0, p.z]} />
          </Suspense>
        </SilentBoundary>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Bọc xốp hơi quanh món dễ vỡ (vẽ bằng texture bong bóng, nhẹ cho điện thoại)
// ---------------------------------------------------------------------------

const BUBBLE_TILE_M = 0.064 // 4 bong bóng, mỗi bong bóng cách nhau 16 mm

function makeBubbleTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, 128, 128)
  for (let ix = 0; ix < 4; ix += 1) {
    for (let iy = 0; iy < 4; iy += 1) {
      const cx = 16 + ix * 32
      const cy = 16 + iy * 32
      const g = ctx.createRadialGradient(cx - 5, cy - 5, 1, cx, cy, 15)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(0.55, 'rgba(205,232,247,0.55)')
      g.addColorStop(1, 'rgba(150,200,230,0.75)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, 14.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  return texture
}

let sharedBubbleTexture: CanvasTexture | null | undefined

function bubbleTexture(): CanvasTexture | null {
  if (sharedBubbleTexture === undefined) sharedBubbleTexture = makeBubbleTexture()
  return sharedBubbleTexture
}

/** Vật liệu xốp hơi cho 1 mặt kích thước u × v (m): lặp texture bong bóng theo cạnh thật. */
function makeBubbleMaterial(u: number, v: number, doubleSided = false): MeshStandardMaterial {
  const base = bubbleTexture()
  const map = base ? base.clone() : null
  if (map) {
    map.needsUpdate = true
    map.repeat.set(Math.max(1, u / BUBBLE_TILE_M), Math.max(1, v / BUBBLE_TILE_M))
  }
  return new MeshStandardMaterial({
    color: '#e8f4fb',
    map,
    transparent: true,
    opacity: 0.88,
    roughness: 0.15,
    depthWrite: false,
    side: doubleSided ? DoubleSide : FrontSide,
  })
}

/** Lớp xốp hơi bọc kín món (6 mặt, mỗi mặt lặp texture theo cạnh thật). */
export function BubbleSleeve({ size }: { size: Vec3 }): ReactNode {
  const pad = 0.004
  const dims: Vec3 = [size[0] + pad * 2, size[1] + pad * 2, size[2] + pad * 2]
  const materials = useMemo(() => {
    const face = (u: number, v: number): MeshStandardMaterial => makeBubbleMaterial(u, v)
    const [x, y, z] = dims
    // Thứ tự mặt của BoxGeometry: +x, -x, +y, -y, +z, -z.
    return [face(z, y), face(z, y), face(x, z), face(x, z), face(x, y), face(x, y)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims[0], dims[1], dims[2]])
  useEffect(
    () => () => {
      for (const m of materials) {
        m.map?.dispose()
        m.dispose()
      }
    },
    [materials],
  )
  return (
    <mesh material={materials}>
      <boxGeometry args={dims} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Bọc xốp hơi + dán băng keo quanh món dễ vỡ (hoạt ảnh từng bước)
// ---------------------------------------------------------------------------

type FlapSpec = {
  key: string
  position: Vec3
  /** Quay quanh trục dọc để hướng +x cục bộ của nếp gập ra ngoài theo cạnh tương ứng. */
  rotY: number
  /** Chiều dài mép dọc theo bản lề (m). */
  edge: number
  /** Chiều dài đoạn phủ lên mặt trên (m). */
  top: number
  /** 0 = 2 nếp dọc (gập trước), 1 = 2 nếp ngang (gập sau, nằm đè lên). */
  group: 0 | 1
}

/**
 * Bọc món bằng 1 tấm xốp hơi: tấm trải phẳng dưới món, 2 mép dọc gập lên rồi phủ lên mặt trên, tiếp theo 2 mép
 * ngang. Bước dán băng keo giữ nguyên lớp bọc đã gập và kéo 1 dải băng keo ngang mặt trên.
 * Gốc toạ độ = tâm món (khối `size` theo hệ three: dài, cao, sâu).
 */
export function WrapAnimation({
  size,
  index,
  mode,
}: {
  size: Vec3
  index: number
  mode: 'wrap' | 'tape'
}): ReactNode {
  const [sx, sy, sz] = size
  const pad = 0.003
  const side = sy + pad * 2
  const bottom = -sy / 2 + 0.0004

  const flaps = useMemo<FlapSpec[]>(
    () => [
      { key: 'px', position: [sx / 2 + pad, bottom, 0], rotY: 0, edge: sz + pad * 2, top: sx / 2 + 0.006, group: 0 },
      { key: 'nx', position: [-sx / 2 - pad, bottom, 0], rotY: Math.PI, edge: sz + pad * 2, top: sx / 2 + 0.006, group: 0 },
      { key: 'pz', position: [0, bottom + 0.0012, sz / 2 + pad], rotY: -Math.PI / 2, edge: sx + pad * 2, top: sz / 2 + 0.006, group: 1 },
      { key: 'nz', position: [0, bottom + 0.0012, -sz / 2 - pad], rotY: Math.PI / 2, edge: sx + pad * 2, top: sz / 2 + 0.006, group: 1 },
    ],
    [sx, sz, pad, bottom],
  )

  const materials = useMemo(
    () => ({
      base: makeBubbleMaterial(sx + pad * 2, sz + pad * 2, true),
      side: flaps.map((f) => makeBubbleMaterial(side, f.edge, true)),
      top: flaps.map((f) => makeBubbleMaterial(f.top, f.edge, true)),
      tape: new MeshStandardMaterial({ color: '#d9b36c', transparent: true, opacity: 0.85, roughness: 0.3 }),
    }),
    [flaps, sx, sz, side],
  )
  useEffect(
    () => () => {
      materials.base.map?.dispose()
      materials.base.dispose()
      for (const m of [...materials.side, ...materials.top]) {
        m.map?.dispose()
        m.dispose()
      }
      materials.tape.dispose()
    },
    [materials],
  )

  const sideRefs = useRef<(Group | null)[]>([])
  const topRefs = useRef<(Group | null)[]>([])
  const tapeTop = useRef<Mesh>(null)
  const tapeDrops = useRef<Group>(null)
  const clock = useMemo(() => new StepClock(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])

  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    const wrapP = mode === 'wrap' ? Math.min(1, elapsed / STEP_SECONDS.wrap) : 1
    const tapeP = mode === 'tape' ? Math.min(1, elapsed / STEP_SECONDS.tape) : 0
    flaps.forEach((flap, i) => {
      const from = flap.group === 0 ? 0.1 : 0.52
      const t = easeInOut(MathUtils.clamp((wrapP - from) / 0.36, 0, 1))
      // Nửa đầu: mép dựng đứng quanh thân món; nửa sau: gập phủ lên mặt trên.
      const sideAngle = (Math.PI / 2) * Math.min(1, t * 2)
      const topAngle = (Math.PI / 2) * Math.max(0, t * 2 - 1)
      const s = sideRefs.current[i]
      const tp = topRefs.current[i]
      if (s) s.rotation.z = sideAngle
      if (tp) tp.rotation.z = topAngle
    })
    const strip = tapeTop.current
    if (strip) {
      strip.visible = tapeP > 0.01
      strip.scale.y = Math.max(0.001, easeInOut(Math.min(1, tapeP / 0.7)))
    }
    if (tapeDrops.current) tapeDrops.current.visible = tapeP > 0.7
  })

  // Băng keo quấn ngang qua cạnh NGẮN của món (dải chạy theo cạnh ngắn, rủ xuống ở hai đầu).
  const tapeAlongX = sx < sz
  const topLen = (tapeAlongX ? sx : sz) + pad * 2 + 0.01
  const tapeY = sy / 2 + pad * 2 + 0.0016
  return (
    <group>
      {/* Tấm xốp trải dưới món. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, bottom, 0]} material={materials.base}>
        <planeGeometry args={[sx + pad * 2, sz + pad * 2]} />
      </mesh>
      {flaps.map((flap, i) => (
        <group key={flap.key} position={flap.position} rotation={[0, flap.rotY, 0]}>
          <group
            ref={(g) => {
              sideRefs.current[i] = g
            }}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[side / 2, 0, 0]} material={materials.side[i]}>
              <planeGeometry args={[side, flap.edge]} />
            </mesh>
            <group
              position={[side, 0, 0]}
              ref={(g) => {
                topRefs.current[i] = g
              }}
            >
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[flap.top / 2, 0, 0]} material={materials.top[i]}>
                <planeGeometry args={[flap.top, flap.edge]} />
              </mesh>
            </group>
          </group>
        </group>
      ))}
      {mode === 'tape' ? (
        <>
          {/* Dải băng keo kéo ngang mặt trên rồi rủ xuống hai bên. */}
          <group rotation={[0, tapeAlongX ? Math.PI / 2 : 0, 0]}>
            <mesh ref={tapeTop} rotation={[-Math.PI / 2, 0, 0]} position={[0, tapeY, 0]} material={materials.tape}>
              <planeGeometry args={[0.016, topLen]} />
            </mesh>
            <group ref={tapeDrops} visible={false}>
              {[1, -1].map((dir) => (
                <mesh
                  key={dir}
                  position={[0, tapeY - (sy * 0.7) / 2, dir * (topLen / 2)]}
                  material={materials.tape}
                >
                  <planeGeometry args={[0.016, sy * 0.7]} />
                </mesh>
              ))}
            </group>
          </group>
          <SilentBoundary>
            <Suspense fallback={null}>
              <Piece kind="tape_roll" position={[sx / 2 + 0.07, bottom, 0.02]} />
            </Suspense>
          </SilentBoundary>
        </>
      ) : null}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Bước gập nắp: lấp chỗ trống, vách ngăn, giấy lót, dán tem
// ---------------------------------------------------------------------------

export function CloseMaterials({
  counts,
  placements,
  inner,
  innerSize,
  outerSize,
  floorY,
  index,
}: {
  counts: Map<MaterialKind, number>
  placements: PackingPlacement[]
  inner: PackingMm
  innerSize: Vec3
  outerSize: Vec3
  /** Độ dày đáy thùng: lòng thùng nằm cao hơn mặt bàn chừng đó. */
  floorY: number
  index: number
}): ReactNode {
  const stackTop = useMemo(
    () => placements.reduce((top, p) => Math.max(top, (p.z + p.dz) * MM), 0),
    [placements],
  )

  const fills = useMemo(() => {
    const pillows = Math.min(counts.get('air_pillow') ?? 0, 8)
    const kraft = Math.min(counts.get('kraft_paper') ?? 0, 3)
    const wanted: ModelKey[] = [
      ...Array.from({ length: pillows }, () => 'air_pillow' as const),
      ...Array.from({ length: kraft }, () => 'kraft_paper' as const),
    ]
    if (wanted.length === 0) return []
    const cells = freeFloorCells(placements, inner, { length: 120, width: 80 })
    return wanted.map((kind, i) => {
      const [nw, nd] = NATURAL[kind]
      const cell = cells[i]
      if (cell) {
        const s = Math.min(1, cell.size[0] / nw, cell.size[1] / nd)
        return { kind, position: cell.center, scale: s }
      }
      // Hết chỗ trống: xếp lên mặt chồng hàng, dàn đều theo chiều dài thùng.
      const k = i - cells.length
      const x = (((k % 4) + 0.5) / 4 - 0.5) * innerSize[0] * 0.8
      return { kind, position: [x, stackTop, 0] as Vec3, scale: Math.min(1, (innerSize[0] * 0.2) / nw) }
    })
  }, [counts, placements, inner, innerSize, stackTop])

  const divider = useMemo(
    () => (counts.has('corrugated_divider') ? dividerSpot(placements, inner) : null),
    [counts, placements, inner],
  )

  const tissueScale = Math.min(1, (innerSize[0] * 0.95) / NATURAL.tissue_paper[0], (innerSize[2] * 0.95) / NATURAL.tissue_paper[1])

  const labelRef = useRef<Group>(null)
  const clock = useMemo(() => new StepClock(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])
  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    if (labelRef.current) labelRef.current.visible = elapsed / STEP_SECONDS.close > 0.7
  })

  const labelScale = Math.min(1, (outerSize[0] * 0.4) / NATURAL.fragile_tape[0])

  return (
    <>
      {/* Vật tư nằm trong lòng thùng (hệ gốc = tâm đáy lòng thùng). */}
      <group position={[0, floorY, 0]}>
        {divider ? (
          <SilentBoundary>
            <Suspense fallback={null}>
              <Drop delay={0.1} index={index}>
                <DividerPiece spot={divider} />
              </Drop>
            </Suspense>
          </SilentBoundary>
        ) : null}
        {fills.map((f, i) => (
          <SilentBoundary key={`${f.kind}-${String(i)}`}>
            <Suspense fallback={null}>
              <Drop delay={0.15 + i * 0.12} index={index}>
                <Piece kind={f.kind} position={f.position} scale={f.scale} />
              </Drop>
            </Suspense>
          </SilentBoundary>
        ))}
        {counts.has('tissue_paper') ? (
          <SilentBoundary>
            <Suspense fallback={null}>
              <Drop delay={0.3} index={index}>
                <Piece kind="tissue_paper" position={[0, stackTop + 0.001, 0]} scale={tissueScale} />
              </Drop>
            </Suspense>
          </SilentBoundary>
        ) : null}
      </group>
      {/* Tem dán lên nắp thùng khi đã gập (hệ cảnh, không tính cao đáy). */}
      {counts.has('fragile_tape') ? (
        <group ref={labelRef} visible={false} position={[0, outerSize[1] + 0.0008, outerSize[2] * 0.2]}>
          <SilentBoundary>
            <Suspense fallback={null}>
              <Piece kind="fragile_tape" position={[0, 0, 0]} scale={labelScale} />
            </Suspense>
          </SilentBoundary>
        </group>
      ) : null}
    </>
  )
}

function DividerPiece({ spot }: { spot: NonNullable<ReturnType<typeof dividerSpot>> }): ReactNode {
  const [nw, nd] = NATURAL.corrugated_divider
  const [sx, sy, sz] = spot.size
  if (spot.facing === 'h') {
    return <Piece kind="corrugated_divider" position={spot.position} scale={[sx / nw, 1, sz / nd]} />
  }
  if (spot.facing === 'x') {
    // Tấm đứng, vuông góc trục x: cạnh dài của model chạy theo chiều cao.
    return (
      <Piece
        kind="corrugated_divider"
        position={spot.position}
        rotation={[0, 0, Math.PI / 2]}
        scale={[sy / nw, 1, sz / nd]}
      />
    )
  }
  return (
    <Piece
      kind="corrugated_divider"
      position={spot.position}
      rotation={[Math.PI / 2, 0, 0]}
      scale={[sx / nw, 1, sy / nd]}
    />
  )
}
