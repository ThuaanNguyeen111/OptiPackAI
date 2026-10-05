import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import type { Group } from 'three'
import type { PlanMaterial } from '../../types/packing-plan'

/**
 * Vật tư chèn (05/10/2026): túi khí / giấy chèn rải quanh thành thùng, góc
 * xốp ở 4 góc trên. Số lượng lấy từ kế hoạch; VỊ TRÍ CHỈ ĐỂ MINH HOẠ vì vật tư
 * là ước lượng theo luật, bộ giải không xếp chúng vào hình học.
 */
type Props = {
  materials: PlanMaterial[]
  inner: { x: number; y: number; z: number }
  /** Mặt trên cao nhất của hàng trong thùng (m). */
  top: number
  /** 0 = chưa chèn, 1 = đã chèn xong (thả lần lượt), đọc mỗi khung hình. */
  progress: { current: number }
}

type Piece = { kind: 'pillow' | 'corner'; x: number; y: number; z: number; ry: number }

export function Materials3D({ materials, inner, top, progress }: Props) {
  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = []
    const corners = materials.filter((m) => m.type === 'foam_corner').reduce((n, m) => n + m.quantity, 0)
    const pillows = Math.min(
      12,
      materials.filter((m) => m.type === 'air_pillow' || m.type === 'bubble_wrap').reduce((n, m) => n + m.quantity, 0),
    )
    const cx = inner.x / 2 - 0.0455
    const cz = inner.z / 2 - 0.045
    const cornerSpots: [number, number][] = [
      [-cx, -cz],
      [cx, -cz],
      [cx, cz],
      [-cx, cz],
    ]
    for (let i = 0; i < Math.min(corners, 4); i += 1) {
      const [x, z] = cornerSpots[i] ?? [0, 0]
      out.push({ kind: 'corner', x, y: Math.min(top, inner.y) - 0.02, z, ry: (i * Math.PI) / 2 })
    }
    const y = Math.min(Math.max(top, 0.03), inner.y) - 0.015
    for (let i = 0; i < pillows; i += 1) {
      // Rải đều theo chu vi, lệch nhẹ cho tự nhiên.
      const u = (i + 0.5) / pillows
      const per = 2 * (inner.x + inner.z)
      let d = u * per
      let x: number
      let z: number
      if (d < inner.x) {
        x = -inner.x / 2 + d
        z = -inner.z / 2 + 0.04
      } else if ((d -= inner.x) < inner.z) {
        x = inner.x / 2 - 0.045
        z = -inner.z / 2 + d
      } else if ((d -= inner.z) < inner.x) {
        x = inner.x / 2 - d
        z = inner.z / 2 - 0.04
      } else {
        d -= inner.x
        x = -inner.x / 2 + 0.045
        z = inner.z / 2 - d
      }
      out.push({ kind: 'pillow', x, y: y + (i % 2) * 0.008, z, ry: (i * 0.7) % 1.2 })
    }
    return out
  }, [materials, inner.x, inner.y, inner.z, top])

  return (
    <group>
      {pieces.map((piece, i) => (
        <PieceMesh key={i} piece={piece} progress={progress} order={i / Math.max(pieces.length, 1)} dropFrom={inner.y + 0.15} />
      ))}
    </group>
  )
}

function PieceMesh({ piece, progress, order, dropFrom }: { piece: Piece; progress: { current: number }; order: number; dropFrom: number }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const k = Math.min(1, Math.max(0, (progress.current - order * 0.6) / 0.4))
    g.visible = k > 0
    const e = 1 - (1 - k) ** 3
    g.position.set(piece.x, dropFrom + (piece.y - dropFrom) * e, piece.z)
  })
  return (
    <group ref={ref} rotation-y={piece.ry} visible={false}>
      {piece.kind === 'pillow' ? (
        <RoundedBox args={[0.07, 0.022, 0.045]} radius={0.01} smoothness={3}>
          <meshPhysicalMaterial color="#f8fafc" transparent opacity={0.55} roughness={0.15} clearcoat={1} />
        </RoundedBox>
      ) : (
        <group>
          <mesh position={[0.012, 0, 0]}>
            <boxGeometry args={[0.04, 0.04, 0.012]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.012, 0.04, 0.04]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.95} />
          </mesh>
        </group>
      )}
    </group>
  )
}
