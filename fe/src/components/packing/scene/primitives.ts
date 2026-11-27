import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  type BufferGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * AOFP-352 — mô hình "dựng từ hình cơ bản" (docs/specs/PRODUCT_3D_MODELS.md §5.3).
 * Dựng trong khối đơn vị 1×1×1 tâm ở gốc, trục cao +Y = chiều cao SKU, X = dài, Z = rộng.
 * Cảnh 3D giãn từng trục cho khớp số đo SKU — dáng chỉ là tỉ lệ, không phải kích thước thật.
 */
export type PrimitiveSpec = {
  shape: 'box' | 'cylinder' | 'bottle' | 'tube'
  corner_radius_pct: number | null
  cap_height_pct: number | null
  shoulder_pct: number | null
  neck_height_pct: number | null
  neck_diameter_pct: number | null
  crimp_pct: number | null
  body_color: string
  cap_color: string | null
}

const pct = (v: number | null, fallback: number): number => (v ?? fallback) / 100

function mesh(geometry: BufferGeometry, color: string, y: number): Mesh {
  const m = new Mesh(geometry, new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }))
  m.position.y = y
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export function buildPrimitive(spec: PrimitiveSpec): Group {
  const group = new Group()
  const body = spec.body_color
  const cap = spec.cap_color ?? '#334155'
  switch (spec.shape) {
    case 'box': {
      const r = Math.min(0.49, pct(spec.corner_radius_pct, 0))
      group.add(mesh(r > 0 ? new RoundedBoxGeometry(1, 1, 1, 4, r) : new BoxGeometry(1, 1, 1), body, 0))
      break
    }
    case 'cylinder': {
      const hc = pct(spec.cap_height_pct, 0)
      const hb = 1 - hc
      group.add(mesh(new CylinderGeometry(0.5, 0.5, hb, 40), body, -0.5 + hb / 2))
      if (hc > 0) group.add(mesh(new CylinderGeometry(0.5, 0.5, hc, 40), cap, 0.5 - hc / 2))
      break
    }
    case 'bottle': {
      const hs = pct(spec.shoulder_pct, 15)
      const hn = pct(spec.neck_height_pct, 20)
      const hc = pct(spec.cap_height_pct, 8)
      const rn = 0.5 * pct(spec.neck_diameter_pct, 40)
      const bodyTop = 0.5 - hc - hn - hs
      const neckTop = 0.5 - hc
      // Mặt cắt nửa chai quay quanh trục Y: đáy → thân → vai thu dần → cổ.
      const profile = [
        new Vector2(0, -0.5),
        new Vector2(0.5, -0.5),
        new Vector2(0.5, bodyTop),
        new Vector2(rn + (0.5 - rn) * 0.35, bodyTop + hs * 0.7),
        new Vector2(rn, bodyTop + hs),
        new Vector2(rn, neckTop),
        new Vector2(0, neckTop),
      ]
      group.add(mesh(new LatheGeometry(profile, 40), body, 0))
      if (hc > 0) {
        const rc = Math.min(0.5, rn * 1.15)
        group.add(mesh(new CylinderGeometry(rc, rc, hc, 32), cap, 0.5 - hc / 2))
      }
      break
    }
    case 'tube': {
      // Tuýp đứng trên nắp: nắp dưới, thân tròn, đầu dán dẹt ở trên.
      const hc = pct(spec.cap_height_pct, 12)
      const hk = pct(spec.crimp_pct, 8)
      const hb = 1 - hc - hk
      group.add(mesh(new CylinderGeometry(0.3, 0.3, hc, 32), cap, -0.5 + hc / 2))
      group.add(mesh(new CylinderGeometry(0.5, 0.42, hb, 40), body, -0.5 + hc + hb / 2))
      group.add(mesh(new BoxGeometry(1, hk, 0.1), body, 0.5 - hk / 2))
      break
    }
  }
  return group
}
