import { Component, useMemo, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Color, Euler, Mesh, MeshStandardMaterial, Vector3, type Material, type Object3D } from 'three'
import type { ModelSpec } from './product-models'

type GlbSpec = Extract<ModelSpec, { kind: 'glb' }>

/**
 * Hình 3D đại diện theo loại sản phẩm (21/09/2026) — CHỈ để minh hoạ.
 * Hình học thật vẫn là khối engine tính; mô hình được xoay theo hướng
 * vừa khối nhất. Hàng cứng thu phóng ĐỀU (không méo); hàng mềm (`stretch`,
 * 22/09/2026) kéo giãn theo từng trục cho khít khối — gói vải gấp vốn nén được.
 * Nguồn + giấy phép: public/models/CREDITS.md.
 */

// Các hướng xoay vuông góc cần thử để trục dài của mô hình khớp trục dài của khối.
const CANDIDATE_ROTATIONS: [number, number, number][] = [
  [0, 0, 0],
  [0, Math.PI / 2, 0],
  [Math.PI / 2, 0, 0],
  [0, 0, Math.PI / 2],
  [Math.PI / 2, Math.PI / 2, 0],
  [Math.PI / 2, 0, Math.PI / 2],
]

function rotatedSize(size: Vector3, rotation: [number, number, number]): Vector3 {
  const v = size.clone().applyEuler(new Euler(...rotation))
  return new Vector3(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z))
}

/**
 * Mô hình của 1 món, đặt tâm tại gốc toạ độ cục bộ, nằm trong khối kích
 * thước `size` (đơn vị scene). `fill` < 1 chừa khoảng cho lớp túi/hộp.
 */
export function ProductModel({ spec, size, fill = 0.9 }: { spec: GlbSpec; size: Vector3; fill?: number }) {
  const { scene } = useGLTF(spec.url)

  const { object, rotation, scale, offset } = useMemo(() => {
    const clone: Object3D = scene.clone(true)
    if (spec.tint) {
      clone.traverse((node) => {
        if (node instanceof Mesh) {
          const tintMaterial = (m: Material): Material => {
            const copy = m.clone()
            if (copy instanceof MeshStandardMaterial) copy.color = new Color(spec.tint)
            return copy
          }
          node.material = Array.isArray(node.material) ? node.material.map(tintMaterial) : tintMaterial(node.material)
        }
      })
    }
    const bbox = new Box3().setFromObject(clone)
    const modelSize = bbox.getSize(new Vector3())
    const center = bbox.getCenter(new Vector3())

    let best = { rotation: CANDIDATE_ROTATIONS[0] ?? [0, 0, 0], rotated: modelSize, scale: 0 }
    for (const candidate of CANDIDATE_ROTATIONS) {
      const r = rotatedSize(modelSize, candidate)
      const s = Math.min(size.x / r.x, size.y / r.y, size.z / r.z)
      if (s > best.scale) best = { rotation: candidate, rotated: r, scale: s }
    }
    // Hàng mềm: kéo giãn từng trục (theo trục thế giới, SAU khi xoay) cho khít khối.
    const scaleVec: [number, number, number] = spec.stretch
      ? [(size.x / best.rotated.x) * fill, (size.y / best.rotated.y) * fill, (size.z / best.rotated.z) * fill]
      : [best.scale * fill, best.scale * fill, best.scale * fill]
    return { object: clone, rotation: best.rotation, scale: scaleVec, offset: center.multiplyScalar(-1) }
  }, [scene, spec.tint, spec.stretch, size, fill])

  // Scale ở group NGOÀI (trục thế giới), xoay ở group trong — để kéo giãn
  // đúng theo trục của khối sau khi đã xoay mô hình.
  return (
    <group scale={scale}>
      <group rotation={rotation}>
        <primitive object={object} position={offset} />
      </group>
    </group>
  )
}

/** Mô hình tải lỗi (mất mạng, file hỏng) → hiện hình dự phòng, không làm sập canvas. */
export class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
