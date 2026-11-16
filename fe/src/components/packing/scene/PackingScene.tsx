import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { ContactShadows, Edges, useGLTF } from '@react-three/drei'
import { Box3, MathUtils, Matrix4, Mesh, Quaternion, Vector3, type Group, type Material } from 'three'
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
/** Phần cuối bước chuẩn bị: cụm đã gọn, phóng về đúng cỡ khối. */
const PREP_SETTLE_FROM = 0.82

/**
 * Gập đôi thật: uốn hình học quanh một bản lề trong khung của món (vertex shader), áp cho mọi lưới của
 * mô hình — áo, túi zip — nên nửa bị gập mang đúng vải/túi chứ không phải tấm giả.
 * Khung món = group chuyển động; bản lề là đường thẳng (a = hingeA, y = hingeY) vuông góc trục gập.
 */
type BendUniforms = {
  uBendOn: { value: number }
  uBendAxis: { value: number }
  uHingeA: { value: number }
  uHingeY: { value: number }
  uAngle: { value: number }
  uToItem: { value: Matrix4 }
  uFromItem: { value: Matrix4 }
}

const BEND_DECL = `
uniform float uBendOn;
uniform float uBendAxis;
uniform float uHingeA;
uniform float uHingeY;
uniform float uAngle;
uniform mat4 uToItem;
uniform mat4 uFromItem;
`

const BEND_PROJECT = `
vec4 bendWorld = modelMatrix * vec4( transformed, 1.0 );
if ( uBendOn > 0.5 ) {
  vec3 bp = ( uToItem * bendWorld ).xyz;
  float ba = uBendAxis < 0.5 ? bp.x : bp.z;
  if ( ba > uHingeA ) {
    float bc = cos( uAngle );
    float bs = sin( uAngle );
    float ra = ba - uHingeA;
    float ry = bp.y - uHingeY;
    float na = uHingeA + ra * bc - ry * bs;
    // Nhích lên rất nhẹ để nửa gập không trùng mặt (z-fighting) với nửa nằm dưới.
    float ny = uHingeY + ra * bs + ry * bc + 0.0006 * ( uAngle / 3.14159265 );
    if ( uBendAxis < 0.5 ) bp.x = na; else bp.z = na;
    bp.y = ny;
    bendWorld = uFromItem * vec4( bp, 1.0 );
    #ifndef FLAT_SHADED
      vec3 bn = mat3( uToItem ) * normalize( mat3( modelMatrix ) * objectNormal );
      float bna = uBendAxis < 0.5 ? bn.x : bn.z;
      float nna = bna * bc - bn.y * bs;
      float nny = bna * bs + bn.y * bc;
      if ( uBendAxis < 0.5 ) bn.x = nna; else bn.z = nna;
      bn.y = nny;
      vNormal = normalize( mat3( viewMatrix ) * ( mat3( uFromItem ) * bn ) );
    #endif
  }
}
vec4 mvPosition = viewMatrix * bendWorld;
gl_Position = projectionMatrix * mvPosition;
`

function makeBendUniforms(): BendUniforms {
  return {
    uBendOn: { value: 0 },
    uBendAxis: { value: 0 },
    uHingeA: { value: 0 },
    uHingeY: { value: 0 },
    uAngle: { value: 0 },
    uToItem: { value: new Matrix4() },
    uFromItem: { value: new Matrix4() },
  }
}

/** Cập nhật uniform mỗi khung hình (null = tắt uốn). Đặt ngoài component để không đụng luật bất biến của React. */
function setBend(
  bend: BendUniforms,
  next: { axis: number; hingeA: number; hingeY: number; angle: number; item: Group } | null,
): void {
  bend.uBendOn.value = next ? 1 : 0
  if (!next) return
  bend.uBendAxis.value = next.axis
  bend.uHingeA.value = next.hingeA
  bend.uHingeY.value = next.hingeY
  bend.uAngle.value = next.angle
  bend.uFromItem.value.copy(next.item.matrixWorld)
  bend.uToItem.value.copy(next.item.matrixWorld).invert()
}

function withBend(material: Material, bend: BendUniforms): Material {
  const patched = material.clone()
  patched.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, bend)
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${BEND_DECL}\nvoid main() {`)
      .replace('#include <project_vertex>', BEND_PROJECT)
  }
  patched.customProgramCacheKey = () => 'pack-fold-bend'
  return patched
}

function clipRange(
  rig: ItemRig,
  role: ItemRole,
  kind: PackStepKind | undefined,
  withZip: boolean,
): [number, number] {
  const { foldEnd, bagEnd, end } = rig.phases
  if (role !== 'staged') return [rig.finalTime, rig.finalTime]
  switch (kind) {
    case 'fold':
      return [0, foldEnd]
    case 'halfFold':
      // Có túi zip thì gập đôi diễn ra sau khi đã vào túi.
      return withZip ? [bagEnd, bagEnd] : [foldEnd, foldEnd]
    case 'zip':
      return [foldEnd, bagEnd]
    case 'zipFold':
      return [bagEnd, bagEnd]
    case 'bagPrep':
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
  areaSize,
  bend,
}: {
  model: ItemModel
  bend: BendUniforms
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
    () => new ItemRig(gltf.scene, gltf.animations[0], model.kind, withZip, Boolean(model.prepStep)),
    [gltf, model.kind, withZip, model.prepStep],
  )
  useEffect(() => {
    rig.root.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const mesh = obj as Mesh
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => withBend(m, bend))
        : withBend(mesh.material, bend)
    })
  }, [rig, bend])
  // Độ lệch của gói lúc bắt đầu cho vào túi: giữ nguyên độ lệch này khi túi nằm yên, gói trượt vào.
  const zipStartDrift = useMemo(() => {
    rig.setTime(rig.phases.foldEnd)
    const v = rig.driftInto(new Vector3())
    rig.setTime(rig.finalTime)
    return v
  }, [rig])
  const fit = useMemo(
    () => fitToBlock(rig.finalBox, [sx, sy, sz], model.kind === 'rigid'),
    [rig, sx, sy, sz, model.kind],
  )
  // Hàng cứng co đều nên thấp hơn khối được cấp: hạ xuống sát đáy khối để không lơ lửng giữa không trung.
  const sink = useMemo(() => {
    if (model.kind !== 'rigid' || rig.finalBox.isEmpty()) return 0
    const { min, max } = rig.finalBox
    const turned = new Box3()
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          turned.expandByPoint(new Vector3(x, y, z).applyQuaternion(fit.quaternion).multiply(fit.scale))
        }
      }
    }
    const height = turned.getSize(new Vector3()).y
    return -Math.max(0, sy - height) / 2
  }, [model.kind, rig, fit, sy])
  const clock = useMemo(() => new StepClock(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])

  const offsetRef = useRef<Group>(null)
  const stageRef = useRef<Group>(null)
  const turnRef = useRef<Group>(null)
  const upright = useMemo(() => new Quaternion(), [])
  const drift = useMemo(() => new Vector3(), [])
  const startScale = useMemo(() => {
    if (model.kind !== 'garment' || rig.flatBox.isEmpty()) return 1
    const flat = rig.flatBox.getSize(new Vector3()).applyQuaternion(fit.quaternion)
    const widest = Math.max(Math.abs(flat.x) * fit.scale.x, Math.abs(flat.z) * fit.scale.z)
    return Math.min(1, areaSize / Math.max(widest, 1e-6))
  }, [model.kind, rig, fit, areaSize])
  const flipAlongX = sx >= sz
  // Lúc đầu clip các món nằm trải rộng: thu cả cụm cho vừa khu chuẩn bị, sát sàn; cuối clip về đúng khối.
  // Clip luôn chạy ở tư thế gốc (đáy dưới, nắp trên), kể cả khi món được xếp nghiêng trong thùng.
  const prepFrame = useMemo(() => {
    if (rig.prepBox.isEmpty()) return null
    const area = new Box3()
    const { min, max } = rig.prepBox
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          area.expandByPoint(
            new Vector3(x, y, z).add(fit.offset).multiply(fit.scale),
          )
        }
      }
    }
    const span = area.getSize(new Vector3())
    const scale = Math.min(1, areaSize / Math.max(span.x, span.z, 1e-6))
    return {
      scale,
      x: -((area.min.x + area.max.x) / 2) * scale,
      z: -((area.min.z + area.max.z) / 2) * scale,
      y: -sy / 2 - area.min.y * scale,
    }
  }, [rig, fit, areaSize, sy])

  useFrame((_, dt) => {
    const elapsed = clock.tick(dt)
    const [from, to] = clipRange(rig, role, kind, withZip)
    const seconds = kind ? STEP_SECONDS[kind] : 0
    const folding = role === 'staged' && kind === 'fold'
    const clipSeconds = folding ? seconds * FOLD_CLIP_SHARE : seconds
    const p = clipSeconds > 0 ? Math.min(1, elapsed / clipSeconds) : 1
    rig.setTime(from + (to - from) * p)
    if (role === 'staged' && kind === 'zip') {
      // Túi zip nằm yên, gói trượt vào theo clip; vào xong (30% cuối) cả túi mới dời về giữa khu chuẩn bị.
      const settle = easeInOut((p - 0.7) / 0.3)
      drift.copy(zipStartDrift).multiplyScalar(1 - settle)
      offsetRef.current?.position.copy(fit.offset).sub(drift)
    } else {
      offsetRef.current?.position.copy(fit.offset).sub(rig.driftInto(drift))
    }

    const stage = stageRef.current
    if (!stage) return
    turnRef.current?.quaternion.copy(fit.quaternion)
    if (prepFrame && role === 'staged' && (kind === 'bagPrep' || kind === 'shoeBox')) {
      const settle = 1 - easeInOut((p - PREP_SETTLE_FROM) / (1 - PREP_SETTLE_FROM))
      turnRef.current?.quaternion.slerpQuaternions(upright, fit.quaternion, 1 - settle)
      stage.rotation.set(0, 0, 0)
      stage.scale.setScalar(MathUtils.lerp(1, prepFrame.scale, settle))
      stage.position.set(
        prepFrame.x * settle,
        prepFrame.y * settle + sink * (1 - settle),
        prepFrame.z * settle,
      )
      return
    }
    if (!folding) {
      stage.rotation.set(0, 0, 0)
      stage.scale.setScalar(1)
      stage.position.set(0, sink, 0)
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
        <group ref={turnRef} quaternion={fit.quaternion}>
          <group ref={offsetRef} position={fit.offset}>
            <primitive object={rig.root} />
          </group>
        </group>
      </group>
    </group>
  )
}

/** Hệ số trải [x, _, z] sau khi mở k lần gập đôi: mỗi lần nhân đôi cạnh đang ngắn hơn. */
function unfolded(size: Vec3, k: number): Vec3 {
  const f: Vec3 = [1, 1, 1]
  for (let i = 0; i < k; i++) {
    if (size[0] * f[0] <= size[2] * f[2]) f[0] *= 2
    else f[2] *= 2
  }
  return f
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
  pendingFolds,
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
  /** Số lần gập đôi (halfFold/zipFold) của món này còn ở SAU bước hiện tại. */
  pendingFolds: number
}): ReactNode {
  const { size, center } = placementToThree(placement, inner)
  const staged: Vec3 = [area.center[0], size[1] / 2 + 0.004 - floorY, area.center[1]]
  const motionRef = useRef<Group>(null)
  const squashRef = useRef<Group>(null)
  const bend = useMemo(() => makeBendUniforms(), [])
  const clock = useMemo(() => new StepClock(), [])
  const from = useMemo(() => new Vector3(), [])
  const to = useMemo(() => new Vector3(), [])
  useEffect(() => {
    clock.reset()
  }, [clock, index])

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
    // Khối đo là món SAU mọi lần gập đôi. Trước đó món còn "trải" k lần (k = số lần gập còn lại):
    // mỗi lần trải nhân đôi cạnh ngắn hơn (gập thật xen kẽ hai chiều), mỏng đi một nửa, đáy luôn sát sàn.
    // Nhờ vậy túi zip ôm đúng gói chưa gập, và tới bước gập không có cú "kéo giãn".
    const h = size[1]
    const foldNow = role === 'staged' && (kind === 'halfFold' || kind === 'zipFold')
    const remain = role === 'staged' ? pendingFolds : 0
    const after = unfolded(size, remain)
    if (foldNow && kind) {
      // Gập thật: cả gói trải dài nằm trên sàn, nửa phía + uốn quanh bản lề lật 180° đè lên nửa kia.
      const before = unfolded(size, remain + 1)
      const ax = before[0] !== after[0] ? 0 : 2
      const e = easeInOut(elapsed / STEP_SECONDS[kind])
      const half = size[ax] * after[ax]
      const thickPre = h / 2 ** (remain + 1)
      // Bản lề ở giữa gói; gói trượt dần để gập xong nằm đúng tâm khu chuẩn bị.
      const c = (half / 2) * e
      s.scale.set(before[0], 1 / 2 ** (remain + 1), before[2])
      s.position.set(ax === 0 ? c : 0, -h / 2 + thickPre / 2, ax === 2 ? c : 0)
      g.updateWorldMatrix(true, false)
      setBend(bend, { axis: ax === 0 ? 0 : 1, hingeA: c, hingeY: -h / 2 + thickPre, angle: Math.PI * e, item: g })
    } else {
      s.scale.set(after[0], 1 / 2 ** remain, after[2])
      s.position.set(0, -(h / 2) * (1 - 1 / 2 ** remain), 0)
      setBend(bend, null)
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
                bend={bend}
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
      {/* Nền bàn tối (xanh than) để áo trắng, túi trắng, thùng giấy đều nổi; đèn chính có hướng để mặt vật có khối. */}
      <color attach="background" args={['#24363f']} />
      <hemisphereLight args={['#f1f5f9', '#1e2a31', 0.9]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[2, 4, 3]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#bfdbfe" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <planeGeometry args={[Math.max(outer[0], outer[2]) * 10, Math.max(outer[0], outer[2]) * 10]} />
        <meshStandardMaterial color="#2f4651" roughness={0.95} />
      </mesh>
      <ContactShadows
        position={[0, 0.0005, 0]}
        scale={Math.max(outer[0], outer[2]) * 4}
        opacity={0.55}
        blur={2.4}
        far={Math.max(outer[1], 0.2) * 2}
        resolution={512}
        color="#0b1418"
      />
      {/* Khu chuẩn bị: gấp, cho vào túi zip ở đây rồi mới đặt vào thùng. */}
      <group position={[area.center[0], 0.001, area.center[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <planeGeometry args={[area.size, area.size]} />
          <meshStandardMaterial color="#3b5562" roughness={0.9} />
          <Edges color="#5eead4" />
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
              pendingFolds={steps.filter(
                (step, j) => j > index && step.item === item && (step.kind === 'halfFold' || step.kind === 'zipFold'),
              ).length}
            />
          )
        })}
        </MailerStack>
      </group>
    </>
  )
}
