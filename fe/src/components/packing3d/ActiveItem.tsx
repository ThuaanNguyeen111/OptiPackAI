import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Object3D,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
} from 'three'
import { ACTION_SECONDS, type PackActionKind, type ItemPlan } from './timeline'
import { ClothSim, type PackageModel, type Sheet } from './cloth/cloth-sim'
import { weaveTexture } from './textures'

/**
 * Món đang thao tác trên bàn (05/10/2026): vải mô phỏng đang gấp / túi zip
 * đang trùm, kéo khoá, gập — hoặc hộp giày; bước "đặt vào thùng" thì nhấc cả
 * gói theo đường vòng cung vào đúng ô bộ giải đã tính.
 * Mỗi action gắn một bộ đếm riêng (component được tạo lại theo chỉ số action),
 * bắt đầu từ đúng vị trí cuối của action trước → lùi/tiến luôn khớp.
 */
const SETTLE_SECONDS = 0.35

type Dest = { center: Vector3; size: Vector3 }

type Props = {
  item: ItemPlan
  model: PackageModel | null
  kind: PackActionKind
  /** Chỉ số pha trong model (bỏ qua khi kind = place / pick). */
  phase: number
  speed: number
  playing: boolean
  physics: boolean
  station: Vector3
  dest: Dest
  liftHeight: number
  color: string
  onDone: () => void
}

function geometryFor(sheet: Sheet, uvScale: number): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(sheet.rest), 3))
  const uv = new Float32Array(sheet.uv.length)
  for (let i = 0; i < uv.length; i += 1) uv[i] = (sheet.uv[i] ?? 0) * uvScale
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(new BufferAttribute(sheet.index, 1))
  g.computeVertexNormals()
  return g
}

function writeSlice(geometry: BufferGeometry, src: Float32Array, offset: number, count: number): void {
  const attr = geometry.getAttribute('position') as BufferAttribute
  const arr = attr.array as Float32Array
  arr.set(src.subarray(offset * 3, (offset + count) * 3))
  attr.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

export function ActiveItem(props: Props) {
  return props.model ? <SoftItem {...props} model={props.model} /> : <RigidItem {...props} />
}

function SoftItem({ item, model, kind, phase, speed, playing, physics, station, dest, liftHeight, color, onDone }: Props & { model: PackageModel }) {
  const outer = useRef<Group>(null)
  const garmentMesh = useRef<Mesh>(null)
  const bagBottomMesh = useRef<Mesh>(null)
  const bagTopMesh = useRef<Mesh>(null)
  const zipper = useRef<InstancedMesh>(null)
  const slider = useRef<Mesh>(null)
  const clock = useRef(0)
  const done = useRef(false)
  const placing = kind === 'place'
  const phaseIndex = placing ? model.phases.length : phase

  const size = Math.max(item.placement.dx, item.placement.dy) / 1000
  const garmentGeo = useMemo(() => geometryFor(model.garment, Math.max(2, size * 18)), [model, size])
  const bagBottomGeo = useMemo(() => (model.bagBottom ? geometryFor(model.bagBottom, 1) : null), [model])
  const bagTopGeo = useMemo(() => (model.bagTop ? geometryFor(model.bagTop, 1) : null), [model])
  useEffect(
    () => () => {
      garmentGeo.dispose()
      bagBottomGeo?.dispose()
      bagTopGeo?.dispose()
    },
    [garmentGeo, bagBottomGeo, bagTopGeo],
  )

  const targets = useMemo(() => new Float32Array(model.count * 3), [model])
  const garmentSim = useMemo(
    () => new ClothSim(model.garmentCount, model.garment.edges, model.garment.restLen, 0.32, model.layer * 0.45),
    [model],
  )
  const bagCount = model.bagBottom ? model.bagBottom.count : 0
  const bagSims = useMemo(
    () =>
      model.bagBottom && model.bagTop
        ? [
            new ClothSim(bagCount, model.bagBottom.edges, model.bagBottom.restLen, 0.55, 0.0003),
            new ClothSim(bagCount, model.bagTop.edges, model.bagTop.restLen, 0.55, 0.0003),
          ]
        : [],
    [model, bagCount],
  )
  // Hàng mép miệng túi (lớp trên) — chỗ chạy khoá kéo.
  const zipperRow = useMemo(() => {
    const top = model.bagTop
    if (!top) return []
    const ids: number[] = []
    for (let i = 0; i < top.count; i += 1) if ((top.rest[i * 3 + 2] ?? 0) > 0.499) ids.push(i)
    return ids.sort((a, b) => (top.rest[a * 3] ?? 0) - (top.rest[b * 3] ?? 0))
  }, [model])

  // Bước đặt: khung bao của gói đã gấp xong → toạ độ bắt đầu/kết thúc + tỉ lệ khít ô.
  const placeInfo = useMemo(() => {
    const fin = model.final()
    const upTo = model.bagVisible(model.phases.length - 1) ? model.count : model.garmentCount
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < upTo; i += 1) {
      const x = fin[i * 3] ?? 0
      const y = fin[i * 3 + 1] ?? 0
      const z = fin[i * 3 + 2] ?? 0
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    const c = new Vector3((minX + maxX) / 2, minY, (minZ + maxZ) / 2)
    const s = new Vector3(Math.max(maxX - minX, 1e-3), Math.max(maxY - minY + model.layer, 1e-3), Math.max(maxZ - minZ, 1e-3))
    const clamp = (v: number) => Math.min(Math.max(v, 0.3), 4)
    const scale = new Vector3(clamp(dest.size.x / s.x), clamp(dest.size.y / s.y), clamp(dest.size.z / s.z))
    return { c, scale }
  }, [model, dest.size])

  const dummy = useMemo(() => new Object3D(), [])
  const fabric = useMemo(() => new Color(color), [color])

  useEffect(() => {
    clock.current = 0
    done.current = false
    if (placing) targets.set(model.final())
    else model.targetsAt(phaseIndex, 0, targets)
    garmentSim.reset(targets, 0)
    bagSims[0]?.reset(targets, model.garmentCount)
    bagSims[1]?.reset(targets, model.garmentCount + bagCount)
  }, [model, phaseIndex, placing, targets, garmentSim, bagSims, bagCount])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    if (playing) clock.current += (dt * speed) / ACTION_SECONDS[kind]
    const t = Math.min(clock.current, 1)
    if (placing) targets.set(model.final())
    else model.targetsAt(phaseIndex, t, targets)

    let garmentPos: Float32Array = targets
    let bottomPos: Float32Array = targets
    let topPos: Float32Array = targets
    let gOff = 0
    let bOff = model.garmentCount
    let tOff = model.garmentCount + bagCount
    if (physics && !placing) {
      garmentSim.step(targets, 0, dt)
      garmentPos = garmentSim.pos
      gOff = 0
      const [simB, simT] = bagSims
      if (simB && simT) {
        simB.step(targets, model.garmentCount, dt)
        simT.step(targets, model.garmentCount + bagCount, dt)
        bottomPos = simB.pos
        topPos = simT.pos
        bOff = 0
        tOff = 0
      }
    }
    writeSlice(garmentGeo, garmentPos, gOff, model.garmentCount)
    const bagShown = model.bagVisible(placing ? model.phases.length - 1 : phaseIndex)
    if (bagBottomGeo && bagTopGeo) {
      if (bagShown) {
        writeSlice(bagBottomGeo, bottomPos, bOff, bagCount)
        writeSlice(bagTopGeo, topPos, tOff, bagCount)
      }
      if (bagBottomMesh.current) bagBottomMesh.current.visible = bagShown
      if (bagTopMesh.current) bagTopMesh.current.visible = bagShown
    }
    const z = zipper.current
    if (z) {
      z.visible = bagShown
      zipperRow.forEach((idx, n) => {
        const j = (tOff + idx) * 3
        dummy.position.set(topPos[j] ?? 0, (topPos[j + 1] ?? 0) + 0.0008, (topPos[j + 2] ?? 0) - 0.004)
        dummy.updateMatrix()
        z.setMatrixAt(n, dummy.matrix)
      })
      z.instanceMatrix.needsUpdate = true
    }
    const s = slider.current
    if (s && model.bag) {
      const sealing = kind === 'bag_seal'
      s.visible = bagShown && (sealing || model.phases[phaseIndex]?.kind === 'bag_insert')
      const sx = sealing ? model.sliderX(t) : model.bag.minX
      // Con trượt bám theo mép túi gần nhất.
      let best = zipperRow[0] ?? 0
      let bestD = Infinity
      for (const idx of zipperRow) {
        const d = Math.abs((topPos[(tOff + idx) * 3] ?? 0) - sx)
        if (d < bestD) {
          bestD = d
          best = idx
        }
      }
      const j = (tOff + best) * 3
      s.position.set(topPos[j] ?? 0, (topPos[j + 1] ?? 0) + 0.003, (topPos[j + 2] ?? 0) - 0.004)
    }

    const g = outer.current
    if (g) {
      if (placing) {
        const e = ease(t)
        const from = new Vector3(station.x + placeInfo.c.x, station.y, station.z + placeInfo.c.z)
        const to = new Vector3(dest.center.x, dest.center.y - dest.size.y / 2, dest.center.z)
        g.position.lerpVectors(from, to, e)
        g.position.y += Math.sin(Math.PI * e) * liftHeight
        g.scale.set(1 + (placeInfo.scale.x - 1) * e, 1 + (placeInfo.scale.y - 1) * e, 1 + (placeInfo.scale.z - 1) * e)
      } else {
        g.position.set(station.x + placeInfo.c.x, station.y, station.z + placeInfo.c.z)
        g.scale.set(1, 1, 1)
      }
    }
    if (!done.current && clock.current >= 1 + SETTLE_SECONDS / ACTION_SECONDS[kind]) {
      done.current = true
      onDone()
    }
  })

  return (
    <group ref={outer}>
      <group position={[-placeInfo.c.x, -placeInfo.c.y, -placeInfo.c.z]}>
        <mesh ref={garmentMesh} geometry={garmentGeo} castShadow>
          <meshPhysicalMaterial
            color={fabric}
            map={weaveTexture()}
            roughness={0.92}
            sheen={1}
            sheenRoughness={0.7}
            sheenColor="#ffffff"
            side={DoubleSide}
          />
        </mesh>
        {bagBottomGeo && bagTopGeo && (
          <>
            <mesh ref={bagBottomMesh} geometry={bagBottomGeo} renderOrder={2}>
              <meshPhysicalMaterial color="#e0f2fe" transparent opacity={0.3} roughness={0.08} clearcoat={1} clearcoatRoughness={0.05} side={DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={bagTopMesh} geometry={bagTopGeo} renderOrder={3}>
              <meshPhysicalMaterial color="#e0f2fe" transparent opacity={0.34} roughness={0.06} clearcoat={1} clearcoatRoughness={0.04} side={DoubleSide} depthWrite={false} />
            </mesh>
            <instancedMesh ref={zipper} args={[undefined, undefined, Math.max(zipperRow.length, 1)]}>
              <boxGeometry args={[0.012, 0.0018, 0.004]} />
              <meshStandardMaterial color="#2563eb" roughness={0.35} />
            </instancedMesh>
            <mesh ref={slider}>
              <boxGeometry args={[0.012, 0.005, 0.01]} />
              <meshStandardMaterial color="#1e3a8a" metalness={0.4} roughness={0.3} />
            </mesh>
          </>
        )}
      </group>
    </group>
  )
}

function RigidItem({ item, kind, speed, playing, station, dest, liftHeight, color, onDone }: Props) {
  const group = useRef<Group>(null)
  const clock = useRef(0)
  const done = useRef(false)
  const p = item.placement
  const size = useMemo(() => new Vector3(p.dx / 1000, p.dz / 1000, p.dy / 1000), [p.dx, p.dy, p.dz])
  const isShoeBox = item.profile?.productCategory === 'shoes'
  const base = useMemo(() => new Color(color), [color])

  useEffect(() => {
    clock.current = 0
    done.current = false
  }, [kind])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    if (playing) clock.current += (dt * speed) / ACTION_SECONDS[kind]
    const e = ease(Math.min(clock.current, 1))
    const g = group.current
    if (g) {
      const rest = new Vector3(station.x, station.y + size.y / 2, station.z)
      if (kind === 'place') {
        g.position.lerpVectors(rest, dest.center, e)
        g.position.y += Math.sin(Math.PI * e) * liftHeight
      } else {
        g.position.copy(rest)
        g.position.y += (1 - e) * 0.22
      }
    }
    if (!done.current && clock.current >= 1 + SETTLE_SECONDS / ACTION_SECONDS[kind]) {
      done.current = true
      onDone()
    }
  })

  const stripe = Math.max(size.y * 0.05, 0.0015)
  return (
    <group ref={group}>
      <RoundedBox args={[size.x, size.y, size.z]} radius={Math.min(size.x, size.y, size.z) * 0.08} smoothness={3} castShadow>
        <meshStandardMaterial color={base} roughness={isShoeBox ? 0.55 : 0.8} />
      </RoundedBox>
      {isShoeBox && (
        <mesh position={[0, size.y / 2 - size.y * 0.2, 0]}>
          <boxGeometry args={[size.x * 1.005, stripe, size.z * 1.005]} />
          <meshStandardMaterial color={base.clone().multiplyScalar(0.72)} roughness={0.6} />
        </mesh>
      )}
    </group>
  )
}
