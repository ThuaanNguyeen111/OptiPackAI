import { RoundedBox } from '@react-three/drei'
import type { Vector3 } from 'three'

/**
 * Quần gấp vẽ bằng code (22/09/2026) — thay mô hình GLB nhận nhầm (xe Jeep).
 * Khớp đúng khối engine tính (`size`, đơn vị scene; x = dài, y = cao, z = sâu):
 * 3 lớp vải xếp so le, cạp quần ở một đầu, túi sau và đường gập ở lớp trên.
 */
export function FoldedPants3D({ size, color }: { size: Vector3; color: string }) {
  const L = size.x * 0.96
  const H = size.y * 0.94
  const D = size.z * 0.94
  const layerH = H / 3
  const radius = Math.min(layerH, D, L) * 0.18
  const layers = [
    { y: -H / 2 + layerH / 2, x: 0, w: L },
    { y: -H / 2 + layerH * 1.5, x: L * 0.015, w: L * 0.97 },
    { y: -H / 2 + layerH * 2.5, x: -L * 0.01, w: L * 0.95 },
  ]
  const topY = H / 2
  const waistColor = '#1f2937'

  return (
    <group>
      {layers.map((layer, i) => (
        <RoundedBox
          key={i}
          args={[layer.w, layerH * 0.96, D]}
          radius={radius}
          smoothness={3}
          position={[layer.x, layer.y, 0]}
        >
          <meshStandardMaterial color={color} roughness={0.9} />
        </RoundedBox>
      ))}
      {/* Cạp quần — dải đậm ở một đầu lớp trên cùng */}
      <mesh position={[-L / 2 + L * 0.06, topY - layerH * 0.45, 0]}>
        <boxGeometry args={[L * 0.1, layerH * 0.95, D * 1.01]} />
        <meshStandardMaterial color={waistColor} roughness={0.8} />
      </mesh>
      {/* Túi sau */}
      <mesh position={[L * 0.12, topY + 0.001, -D * 0.18]}>
        <boxGeometry args={[L * 0.18, Math.max(layerH * 0.05, 0.004), D * 0.3]} />
        <meshStandardMaterial color={waistColor} transparent opacity={0.35} />
      </mesh>
      {/* Đường gập giữa */}
      <mesh position={[L * 0.05, topY + 0.001, D * 0.15]}>
        <boxGeometry args={[L * 0.7, Math.max(layerH * 0.03, 0.003), D * 0.02]} />
        <meshStandardMaterial color={waistColor} transparent opacity={0.45} />
      </mesh>
    </group>
  )
}
