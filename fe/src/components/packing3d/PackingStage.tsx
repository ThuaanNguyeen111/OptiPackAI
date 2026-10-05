import { useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'
import { matTexture, woodTexture } from './textures'

/**
 * Bàn đóng gói (05/10/2026): mặt gỗ dưới thùng, thảm gấp đồ bên trái khi đang
 * xem từng bước. `surface` = cao độ mặt bàn (m), trùng đáy ngoài của thùng.
 */
type Props = {
  surface: number
  /** Khung bao vùng làm việc trên bàn: [minX, maxX, minZ, maxZ]. */
  bounds: [number, number, number, number]
  mat: { x: number; z: number; w: number; d: number } | null
}

const TABLE_THICKNESS = 0.035

export function PackingStage({ surface, bounds, mat }: Props) {
  const [x0, x1, z0, z1] = bounds
  const w = x1 - x0
  const d = z1 - z0
  const wood = useMemo(() => {
    const t = woodTexture().clone()
    t.repeat.set(Math.max(1, w / 0.9), Math.max(1, d / 0.9))
    t.needsUpdate = true
    return t
  }, [w, d])
  const grid = useMemo(() => {
    if (!mat) return null
    const t = matTexture().clone()
    t.repeat.set(mat.w / 0.4, mat.d / 0.4)
    t.needsUpdate = true
    return t
  }, [mat])

  return (
    <group>
      <RoundedBox
        args={[w, TABLE_THICKNESS, d]}
        radius={0.012}
        smoothness={3}
        position={[(x0 + x1) / 2, surface - TABLE_THICKNESS / 2 - 0.0005, (z0 + z1) / 2]}
        receiveShadow
      >
        <meshStandardMaterial map={wood} roughness={0.62} metalness={0} />
      </RoundedBox>
      {mat && grid && (
        <RoundedBox
          args={[mat.w, 0.003, mat.d]}
          radius={0.0012}
          smoothness={2}
          position={[mat.x, surface + 0.0012, mat.z]}
          receiveShadow
        >
          <meshStandardMaterial map={grid} roughness={0.85} />
        </RoundedBox>
      )}
    </group>
  )
}

export const STAGE_MAT_THICKNESS = 0.003
