import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, useGLTF } from '@react-three/drei'
import { MathUtils, Vector3, type Group } from 'three'
import type { PackingItemProfile, PackingMm, PackingPlacement } from '../../../types/packing-plan'
import {
  FOLD_CLIP_SHARE,
  MM,
  STEP_SECONDS,
  boxSize,
  itemRole,
  workAreaFor,
  placementToThree,
  profileFor,
  type ItemRole,
  type PackStep,
  type PackStepKind,
  type Vec3,
  type WorkArea,
} from '../../../utils/packing-layout'
import { MAILER_MODEL, boxModelFor, categoryColor, itemModelFor, type ItemModel } from '../product-models'
import { CartonRig, ItemRig, MailerRig, StepClock, easeInOut, fitToBlock } from './model-rigs'

/** Lỗi tải 1 file GLB chỉ làm món đó thành khối màu, không làm hỏng cả cảnh. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function Block({ size, color, wire = false }: { size: Vec3; color: string; wire?: boolean }): ReactNode {
  return (
    <mesh>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={wire ? 0.25 : 0.85} />
      <Edges color="#334155" />
    </mesh>
  )
}

/** Trạng thái clip khi xem bước `kind` của chính món đó (đã đặt/đang đặt = trạng thái cuối). */
function clipRange(rig: ItemRig, role: ItemRole, kind: PackStepKind | undefined): [number, number] {
  const { foldEnd, bagEnd, end } = rig.phases
  if (role !== 'staged') return [rig.finalTime, rig.finalTime]
  switch (kind) {
    case 'fold':
      return [0, foldEnd]
    case 'halfFold':
      return [foldEnd, foldEnd]
    case 'zip':
      return [foldEnd, bagEnd]
    case 'zipFold':
      return [bagEnd, bagEnd]
    case 'bagPrep':
      return [0, end]
    default:
      return [rig.finalTime, rig.finalTime]
  }
}

function ModelBody({
  model,
  size,
  withZip,
  role,
  kind,
  index,
  areaSize,
}: {
  model: ItemModel
  size: Vec3
  /** Cạnh khu chuẩn bị: hàng trải phẳng lớn hơn thì co lại, gấp xong về đúng cỡ. */
  areaSize: number
  withZip: boolean
  role: ItemRole
  kind: PackStepKind | undefined
  index: number
}): ReactNode {
  const gltf = useGLTF(model.path)
  const [sx, sy, sz] = size
  const rig = useMemo(
    () => new ItemRig(gltf.scene, gltf.animations[0], model.kind, withZip),
    [gltf, model.kind, withZip],
  )
  const fit = useMemo(
    () => fitToBlock(rig.finalBox, [sx, sy, sz], model.kind === 'rigid'),
    [rig, sx, sy, sz, model.kind],
  )
  const clock = useMemo(() => new StepClock(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])

  const offsetRef = useRef<Group>(null)
  const stageRef = useRef<Group>(null)
  const drift = useMemo(() => new Vector3(), [])
  const startScale = useMemo(() => {
    if (model.kind !== 'garment' || rig.flatBox.isEmpty()) return 1
    const flat = rig.flatBox.getSize(new Vector3()).applyQuaternion(fit.quaternion)
    const widest = Math.max(Math.abs(flat.x) * fit.scale.x, Math.abs(flat.z) * fit.scale.z)
    return Math.min(1, areaSize / Math.max(widest, 1e-6))
  }, [model.kind, rig, fit, areaSize])
  const flipAlongX = sx >= sz

  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    const [from, to] = clipRange(rig, role, kind)
    const seconds = kind ? STEP_SECONDS[kind] : 0
    const folding = role === 'staged' && kind === 'fold'
    const clipSeconds = folding ? seconds * FOLD_CLIP_SHARE : seconds
    const p = clipSeconds > 0 ? Math.min(1, elapsed / clipSeconds) : 1
    rig.setTime(from + (to - from) * p)
    offsetRef.current?.position.copy(fit.offset).sub(rig.driftInto(drift))

    const stage = stageRef.current
    if (!stage) return
    if (!folding) {
      stage.rotation.set(0, 0, 0)
      stage.scale.setScalar(1)
      stage.position.set(0, 0, 0)
      return
    }
    // Áo gấp úp mặt: các nếp gập về phía sau lưng nên phải hướng lên, không xuyên sàn. Gấp xong lật lại.
    const flip = MathUtils.clamp((elapsed / seconds - FOLD_CLIP_SHARE) / (1 - FOLD_CLIP_SHARE), 0, 1)
    const angle = Math.PI * (1 - easeInOut(flip))
    const s = MathUtils.lerp(startScale, 1, easeInOut(p))
    stage.rotation.set(flipAlongX ? angle : 0, 0, flipAlongX ? 0 : angle)
    stage.scale.setScalar(s)
    stage.position.set(0, -(sy / 2) * (1 - s) + Math.sin(Math.PI * flip) * (Math.min(sx, sz) / 2), 0)
  })

  return (
    <group ref={stageRef}>
      <group scale={fit.scale}>
        <group quaternion={fit.quaternion}>
          <group ref={offsetRef} position={fit.offset}>
            <primitive object={rig.root} />
          </group>
        </group>
      </group>
    </group>
  )
}

function PlacedItem({
  placement,
  profile,
  inner,
  role,
  kind,
  index,
  tint,
  area,
  floorY,
}: {
  placement: PackingPlacement
  profile: PackingItemProfile | undefined
  inner: PackingMm
  role: ItemRole
  kind: PackStepKind | undefined
  index: number
  /** Kiện gộp: màu của đơn chứa món này. */
  tint?: string
  area: WorkArea
  floorY: number
}): ReactNode {
  const { size, center } = placementToThree(placement, inner)
  const staged: Vec3 = [area.center[0], size[1] / 2 + 0.004 - floorY, area.center[1]]
  const motionRef = useRef<Group>(null)
  const squashRef = useRef<Group>(null)
  const clock = useMemo(() => new StepClock(), [])
  const from = useMemo(() => new Vector3(), [])
  const to = useMemo(() => new Vector3(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])

  const longAxis = size[0] >= size[2] ? 0 : 2
  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    const g = motionRef.current
    const s = squashRef.current
    if (!g || !s) return
    g.visible = role !== 'hidden'
    if (role === 'placing') {
      from.set(staged[0], staged[1], staged[2])
      to.set(center[0], center[1], center[2])
      const e = easeInOut(elapsed / STEP_SECONDS.place)
      g.position.lerpVectors(from, to, e)
      // Nhấc qua miệng thùng theo đường vòng, không cắt ngang vách và nắp.
      g.position.y += Math.sin(Math.PI * e) * area.clearance
    } else if (role === 'placed') {
      g.position.set(center[0], center[1], center[2])
    } else {
      g.position.set(staged[0], staged[1], staged[2])
    }
    // Gập đôi: trải dài gấp 2 rồi thu về đúng khối đã đo.
    if (role === 'staged' && (kind === 'halfFold' || kind === 'zipFold')) {
      const f = 2 - easeInOut(elapsed / STEP_SECONDS[kind])
      s.scale.set(longAxis === 0 ? f : 1, 1 / f, longAxis === 2 ? f : 1)
    } else {
      s.scale.set(1, 1, 1)
    }
  })

  const model = itemModelFor(profile?.productCategory)
  const color = tint ?? categoryColor(profile?.productCategory)
  const initial = role === 'placed' ? center : staged

  return (
    <group ref={motionRef} position={initial} visible={role !== 'hidden'}>
      <group ref={squashRef}>
        {model ? (
          <ModelBoundary fallback={<Block size={size} color={color} />}>
            <Suspense fallback={<Block size={size} color={color} wire />}>
              <ModelBody
                model={model}
                size={size}
                withZip={Boolean(profile?.zipBagCode)}
                role={role}
                kind={kind}
                index={index}
                areaSize={area.size}
              />
            </Suspense>
          </ModelBoundary>
        ) : (
          <Block size={size} color={color} />
        )}
        {tint && model && (role === 'placed' || role === 'placing') ? (
          <mesh>
            <boxGeometry args={size} />
            <meshBasicMaterial color={tint} transparent opacity={0.22} depthWrite={false} />
            <Edges color={tint} />
          </mesh>
        ) : null}
        {role === 'placing' || (role === 'staged' && kind !== 'fold') ? (
          <mesh>
            <boxGeometry args={size} />
            <meshBasicMaterial color="#2563eb" wireframe transparent opacity={0.35} />
          </mesh>
        ) : null}
      </group>
    </group>
  )
}

function CartonFromModel({
  path,
  outer,
  closing,
  index,
}: {
  path: string
  outer: Vec3
  closing: boolean
  index: number
}): ReactNode {
  const gltf = useGLTF(path)
  const [ox, oy, oz] = outer
  const rig = useMemo(() => new CartonRig(gltf.scene, [ox, oy, oz], 0.5), [gltf, ox, oy, oz])
  const clock = useMemo(() => new StepClock(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])
  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    rig.setClose(closing ? easeInOut(elapsed / STEP_SECONDS.close) : 0)
  })
  return (
    <group scale={rig.scale}>
      <group position={rig.offset}>
        <primitive object={rig.root} />
      </group>
    </group>
  )
}

/** Thùng không có file (mã kho tự tạo): vẽ 5 mặt theo lòng thùng, nắp hiện dần khi đóng. */
function CartonFromCode({
  inner,
  outer,
  closing,
  index,
}: {
  inner: Vec3
  outer: Vec3
  closing: boolean
  index: number
}): ReactNode {
  const [ix, iy, iz] = inner
  const [ox, oy, oz] = outer
  const wx = Math.max(0.002, (ox - ix) / 2)
  const wz = Math.max(0.002, (oz - iz) / 2)
  const floor = Math.max(0.002, (oy - iy) / 2)
  const lidRef = useRef<Group>(null)
  const clock = useMemo(() => new StepClock(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])
  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    const lid = lidRef.current
    if (!lid) return
    const p = closing ? easeInOut(elapsed / STEP_SECONDS.close) : 0
    lid.visible = p > 0.01
    lid.scale.set(1, 1, Math.max(0.001, p))
  })
  const wall = (pos: Vec3, dims: Vec3, key: string): ReactNode => (
    <mesh key={key} position={pos}>
      <boxGeometry args={dims} />
      <meshStandardMaterial color="#c8a27a" transparent opacity={0.45} depthWrite={false} />
      <Edges color="#8b6b4a" />
    </mesh>
  )
  return (
    <group>
      {wall([0, floor / 2, 0], [ox, floor, oz], 'floor')}
      {wall([-(ox - wx) / 2, oy / 2, 0], [wx, oy, oz], 'left')}
      {wall([(ox - wx) / 2, oy / 2, 0], [wx, oy, oz], 'right')}
      {wall([0, oy / 2, -(oz - wz) / 2], [ox, oy, wz], 'back')}
      {wall([0, oy / 2, (oz - wz) / 2], [ox, oy, wz], 'front')}
      <group ref={lidRef} position={[0, oy, -oz / 2]} visible={false}>
        <mesh position={[0, 0, oz / 2]}>
          <boxGeometry args={[ox, floor, oz]} />
          <meshStandardMaterial color="#b88c5e" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

const MAILER_MARGIN_LONG = 0.05
const MAILER_MARGIN_SHORT = 0.024
const MAILER_MARGIN_THICK = 0.008

/** Túi niêm phong: nằm cạnh chồng hàng, trượt vào rồi phồng, dán nắp, dán tem. */
function MailerFromModel({
  inner,
  steps,
  index,
}: {
  inner: Vec3
  steps: PackStep[]
  index: number
}): ReactNode {
  const gltf = useGLTF(MAILER_MODEL)
  const rig = useMemo(() => new MailerRig(gltf.scene, gltf.animations[0]), [gltf])
  const [ix, iy, iz] = inner
  const alongX = ix > iz
  // API chỉ trả kích thước sau nhồi, chưa có khổ túi trải phẳng: chừa lề để chồng hàng nằm lọt trong túi.
  const longSide = Math.max(ix, iz) + MAILER_MARGIN_LONG
  const shortSide = Math.min(ix, iz) + MAILER_MARGIN_SHORT
  const sy = (iy + MAILER_MARGIN_THICK) / rig.size.y
  const moveRef = useRef<Group>(null)
  const clock = useMemo(() => new StepClock(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])
  const bagInAt = steps.findIndex((s) => s.kind === 'bagIn')
  const kind = steps[index]?.kind
  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    let time = 0
    let slide = 1
    if (kind === 'bagIn') {
      const p = easeInOut(elapsed / STEP_SECONDS.bagIn)
      time = rig.flapStart * p
      slide = 1 - p
    } else if (kind === 'seal') {
      time = rig.flapStart + (rig.flapEnd - rig.flapStart) * easeInOut(elapsed / STEP_SECONDS.seal)
      slide = 0
    } else if (kind === 'label') {
      time = rig.labelStart + (rig.end - rig.labelStart) * easeInOut(elapsed / STEP_SECONDS.label)
      slide = 0
    } else if (bagInAt >= 0 && index > bagInAt) {
      time = rig.end
      slide = 0
    }
    rig.setTime(time)
    const g = moveRef.current
    if (!g) return
    // Miệng túi ở phía -z của file: túi đứng phía + rồi trượt về tâm, chồng hàng lọt vào miệng.
    const away = (longSide + 0.06) * slide
    g.position.set(alongX ? away : 0, (rig.thickness() * sy) / 2, alongX ? 0 : away)
  })
  return (
    <group ref={moveRef}>
      <group rotation={[0, alongX ? Math.PI / 2 : 0, 0]}>
        <group scale={[shortSide / rig.size.x, sy, longSide / rig.size.z]}>
          <primitive object={rig.root} />
        </group>
      </group>
    </group>
  )
}

/** Thân túi phồng dạng gối, mép mỏng: ẩn chồng hàng khi túi gần trượt tới nơi để hàng không nhô qua mép. */
const STACK_HIDE_AT = 0.72

function MailerStack({ kind, index, children }: { kind: PackStepKind | undefined; index: number; children: ReactNode }): ReactNode {
  const ref = useRef<Group>(null)
  const clock = useMemo(() => new StepClock(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])
  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    if (ref.current) ref.current.visible = kind !== 'bagIn' || elapsed < STEP_SECONDS.bagIn * STACK_HIDE_AT
  })
  return <group ref={ref}>{children}</group>
}

/** Phiếu đóng gói của từng đơn đặt lên chồng hàng (kiện gộp). */
function PackingSlips({ colors, inner, top }: { colors: string[]; inner: Vec3; top: number }): ReactNode {
  const w = Math.min(0.15, inner[0] * 0.6)
  const d = Math.min(0.21, inner[2] * 0.6)
  return (
    <group position={[0, top, 0]}>
      {colors.map((c, i) => (
        <mesh key={c + String(i)} position={[i * 0.012, 0.001 + i * 0.0012, i * 0.012]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#ffffff" />
          <Edges color={c} />
        </mesh>
      ))}
    </group>
  )
}

export function PackingScene({
  boxCode,
  innerMm,
  outerMm,
  placements,
  profiles,
  steps,
  index,
  mailer = false,
  tintOf,
  slipColors,
}: {
  boxCode: string
  innerMm: PackingMm
  outerMm: PackingMm
  placements: PackingPlacement[]
  profiles: PackingItemProfile[] | undefined
  steps: PackStep[]
  index: number
  /** Kiện là túi niêm phong: không vẽ thùng, không có bước gập nắp. */
  mailer?: boolean
  /** Kiện gộp: màu theo đơn của từng món. */
  tintOf?: (placement: PackingPlacement) => string | undefined
  /** Kiện gộp: mỗi đơn 1 phiếu đóng gói. */
  slipColors?: string[]
}): ReactNode {
  const inner = boxSize(innerMm)
  const outer = boxSize(outerMm)
  const floorY = Math.max(0, (outer[1] - inner[1]) / 2)
  const current = steps[index]
  const closing = current?.kind === 'close'
  const path = boxModelFor(boxCode)
  const area = useMemo(() => workAreaFor(outerMm, innerMm, mailer), [outerMm, innerMm, mailer])
  const sealedAt = steps.findIndex((s) => s.kind === 'seal')
  // Từ lúc dán nắp, hàng đã nằm kín trong túi.
  const itemsHidden = sealedAt >= 0 && index >= sealedAt
  const slipAt = steps.findIndex((s) => s.kind === 'slip')
  const showSlips = slipAt >= 0 && index >= slipAt && !itemsHidden && !closing
  const stackTop = placements.reduce((top, p) => Math.max(top, (p.z + p.dz) * MM), 0)
  const carton = mailer ? (
    <ModelBoundary fallback={<Block size={[inner[0], Math.max(inner[1], 0.01), inner[2]]} color="#f1f5f9" />}>
      <Suspense fallback={null}>
        <MailerFromModel inner={inner} steps={steps} index={index} />
      </Suspense>
    </ModelBoundary>
  ) : path ? (
    <ModelBoundary
      fallback={<CartonFromCode inner={inner} outer={outer} closing={closing} index={index} />}
    >
      <Suspense fallback={<CartonFromCode inner={inner} outer={outer} closing={false} index={index} />}>
        <CartonFromModel path={path} outer={outer} closing={closing} index={index} />
      </Suspense>
    </ModelBoundary>
  ) : (
    <CartonFromCode inner={inner} outer={outer} closing={closing} index={index} />
  )

  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, 4, 3]} intensity={1.8} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#bfdbfe" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <planeGeometry args={[Math.max(outer[0], outer[2]) * 10, Math.max(outer[0], outer[2]) * 10]} />
        <meshStandardMaterial color={mailer ? '#c9d2dc' : '#d7dee6'} />
      </mesh>
      {/* Khu chuẩn bị: gấp, cho vào túi zip ở đây rồi mới đặt vào thùng. */}
      <group position={[area.center[0], 0.001, area.center[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <planeGeometry args={[area.size, area.size]} />
          <meshStandardMaterial color={mailer ? '#e2e8f0' : '#f8fafc'} />
          <Edges color="#94a3b8" />
        </mesh>
      </group>
      {carton}
      <group position={[0, floorY, 0]}>
        <MailerStack kind={current?.kind} index={index}>
        {showSlips && slipColors ? <PackingSlips colors={slipColors} inner={inner} top={stackTop} /> : null}
        {placements.map((placement, item) => {
          const role = itemsHidden ? 'hidden' : itemRole(steps, index, item)
          return (
            <PlacedItem
              key={placement.itemKey}
              placement={placement}
              profile={profileFor(profiles, placement.sku)}
              inner={innerMm}
              role={role}
              kind={current?.item === item ? current.kind : undefined}
              index={index}
              tint={tintOf?.(placement)}
              area={area}
              floorY={floorY}
            />
          )
        })}
        </MailerStack>
      </group>
    </>
  )
}
