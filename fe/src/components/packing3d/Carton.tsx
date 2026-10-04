import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { MathUtils, Vector3, type MeshStandardMaterial } from 'three'
import { KRAFT } from './colors'

/**
 * Thùng carton mở nắp (04/10/2026). Đơn vị: mét; gốc toạ độ = giữa đáy TRONG.
 * Bốn vách + bốn nắp gấp ra ngoài. Vách nào quay về phía camera tự mờ đi
 * (cắt lớp) để luôn nhìn thấy hàng bên trong; bật x-ray thì mờ cả bốn vách.
 */
type CartonProps = {
  /** Kích thước trong (m): x = dài, y = cao, z = rộng. */
  inner: { x: number; y: number; z: number }
  /** Độ dày vách (m). */
  wall: number
  xray: boolean
  /** Tách lớp: ẩn hẳn vách để nhìn các lớp hàng tách rời. */
  hidden: boolean
}

type Wall = {
  key: string
  normal: Vector3
  position: [number, number, number]
  size: [number, number, number]
  /** Nắp: vị trí bản lề + trục/chiều xoay ra ngoài. */
  flap: { hinge: [number, number, number]; size: [number, number, number]; axis: 'x' | 'z'; sign: 1 | -1 }
}

const FLAP_ANGLE = 1.95
const FADED = 0.1

export function Carton({ inner, wall, xray, hidden }: CartonProps) {
  const { x: L, y: H, z: W } = inner
  const t = wall
  const flapX = Math.min(W / 2, L / 2) * 0.92
  const walls: Wall[] = [
    {
      key: 'front',
      normal: new Vector3(0, 0, 1),
      position: [0, H / 2, W / 2 + t / 2],
      size: [L + 2 * t, H, t],
      flap: { hinge: [0, H, W / 2 + t], size: [L + 2 * t, W / 2 - 0.002, t * 0.8], axis: 'x', sign: 1 },
    },
    {
      key: 'back',
      normal: new Vector3(0, 0, -1),
      position: [0, H / 2, -W / 2 - t / 2],
      size: [L + 2 * t, H, t],
      flap: { hinge: [0, H, -W / 2 - t], size: [L + 2 * t, W / 2 - 0.002, t * 0.8], axis: 'x', sign: -1 },
    },
    {
      key: 'right',
      normal: new Vector3(1, 0, 0),
      position: [L / 2 + t / 2, H / 2, 0],
      size: [t, H, W],
      flap: { hinge: [L / 2 + t, H, 0], size: [t * 0.8, flapX, W], axis: 'z', sign: -1 },
    },
    {
      key: 'left',
      normal: new Vector3(-1, 0, 0),
      position: [-L / 2 - t / 2, H / 2, 0],
      size: [t, H, W],
      flap: { hinge: [-L / 2 - t, H, 0], size: [t * 0.8, flapX, W], axis: 'z', sign: 1 },
    },
  ]

  const materials = useRef<(MeshStandardMaterial | null)[]>([])
  const center = new Vector3(0, H / 2, 0)
  const toCamera = new Vector3()

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    toCamera.copy(state.camera.position).sub(center).normalize()
    let moving = false
    walls.forEach((w, i) => {
      // Mỗi vách có 2 vật liệu (vách + nắp) nằm liền nhau trong mảng.
      const facing = w.normal.dot(toCamera) > 0.18
      const target = xray ? FADED : facing ? FADED : 1
      for (const material of [materials.current[i * 2], materials.current[i * 2 + 1]]) {
        if (!material) continue
        const next = MathUtils.damp(material.opacity, target, 9, dt)
        material.opacity = Math.abs(next - target) < 0.004 ? target : next
        material.depthWrite = material.opacity > 0.95
        if (material.opacity !== target) moving = true
      }
    })
    if (moving) state.invalidate()
  })

  if (hidden) return null

  return (
    <group>
      {/* Đáy */}
      <mesh position={[0, -t / 2, 0]} receiveShadow>
        <boxGeometry args={[L + 2 * t, t, W + 2 * t]} />
        <meshStandardMaterial color={KRAFT.inner} roughness={0.92} />
      </mesh>
      {walls.map((w, i) => (
        <group key={w.key}>
          <mesh position={w.position}>
            <boxGeometry args={w.size} />
            <meshStandardMaterial
              ref={(m) => {
                materials.current[i * 2] = m
              }}
              color={KRAFT.outer}
              roughness={0.9}
              transparent
            />
            <Edges color={KRAFT.edge} transparent opacity={0.45} />
          </mesh>
          <group
            position={w.flap.hinge}
            rotation={w.flap.axis === 'x' ? [FLAP_ANGLE * w.flap.sign, 0, 0] : [0, 0, FLAP_ANGLE * w.flap.sign]}
          >
            {/* Nắp dựng đứng từ bản lề rồi được xoay ra ngoài. */}
            <mesh position={[0, w.flap.size[1] / 2, 0]}>
              <boxGeometry args={w.flap.size} />
              <meshStandardMaterial
                ref={(m) => {
                  materials.current[i * 2 + 1] = m
                }}
                color={KRAFT.flap}
                roughness={0.9}
                transparent
              />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}
