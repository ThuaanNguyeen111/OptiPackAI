import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, useGLTF } from '@react-three/drei'
import { Vector3, type Group } from 'three'
import type { PackingItemProfile, PackingMm, PackingPlacement } from '../../../types/packing-plan'
import {
  MM,
  STEP_SECONDS,
  boxSize,
  itemRole,
  placementToThree,
  profileFor,
  type ItemRole,
  type PackStep,
  type PackStepKind,
  type Vec3,
} from '../../../utils/packing-layout'
import { boxModelFor, categoryColor, itemModelFor, type ItemModel } from '../product-models'
import { CartonRig, ItemRig, StepClock, easeInOut, fitToBlock } from './model-rigs'

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
    case 'shoeBox':
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
}: {
  model: ItemModel
  size: Vec3
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

  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    const [from, to] = clipRange(rig, role, kind)
    const seconds = kind ? STEP_SECONDS[kind] : 0
    const p = seconds > 0 ? Math.min(1, elapsed / seconds) : 1
    rig.setTime(from + (to - from) * p)
  })

  return (
    <group scale={fit.scale}>
      <group quaternion={fit.quaternion}>
        <group position={fit.offset}>
          <primitive object={rig.root} />
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
}: {
  placement: PackingPlacement
  profile: PackingItemProfile | undefined
  inner: PackingMm
  role: ItemRole
  kind: PackStepKind | undefined
  index: number
}): ReactNode {
  const { size, center } = placementToThree(placement, inner)
  const staged: Vec3 = [0, inner.heightMm * MM + 0.06 + size[1], 0]
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
      g.position.lerpVectors(from, to, easeInOut(elapsed / STEP_SECONDS.place))
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
  const color = categoryColor(profile?.productCategory)
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
              />
            </Suspense>
          </ModelBoundary>
        ) : (
          <Block size={size} color={color} />
        )}
        {role === 'staged' || role === 'placing' ? (
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
  const rig = useMemo(() => new CartonRig(gltf.scene, [ox, oy, oz], 0.38), [gltf, ox, oy, oz])
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

export function PackingScene({
  boxCode,
  innerMm,
  outerMm,
  placements,
  profiles,
  steps,
  index,
}: {
  boxCode: string
  innerMm: PackingMm
  outerMm: PackingMm
  placements: PackingPlacement[]
  profiles: PackingItemProfile[] | undefined
  steps: PackStep[]
  index: number
}): ReactNode {
  const inner = boxSize(innerMm)
  const outer = boxSize(outerMm)
  const floorY = Math.max(0, (outer[1] - inner[1]) / 2)
  const current = steps[index]
  const closing = current?.kind === 'close'
  const path = boxModelFor(boxCode)
  const carton = path ? (
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
        <planeGeometry args={[Math.max(outer[0], outer[2]) * 4, Math.max(outer[0], outer[2]) * 4]} />
        <meshStandardMaterial color="#eef2f7" />
      </mesh>
      {carton}
      <group position={[0, floorY, 0]}>
        {placements.map((placement, item) => {
          const role = itemRole(steps, index, item)
          return (
            <PlacedItem
              key={placement.itemKey}
              placement={placement}
              profile={profileFor(profiles, placement.sku)}
              inner={innerMm}
              role={role}
              kind={current?.item === item ? current.kind : undefined}
              index={index}
            />
          )
        })}
      </group>
    </>
  )
}
