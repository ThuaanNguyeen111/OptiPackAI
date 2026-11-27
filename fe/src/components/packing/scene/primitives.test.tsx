import { Box3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { orientedFit } from './model-rigs'
import { buildPrimitive, type PrimitiveSpec } from './primitives'

const base: PrimitiveSpec = {
  shape: 'box',
  corner_radius_pct: 0,
  cap_height_pct: null,
  shoulder_pct: null,
  neck_height_pct: null,
  neck_diameter_pct: null,
  crimp_pct: null,
  body_color: '#e2e8f0',
  cap_color: null,
}

function sizeOf(spec: PrimitiveSpec): number[] {
  return new Box3().setFromObject(buildPrimitive(spec)).getSize(new Vector3()).toArray()
}

describe('AOFP-352 — buildPrimitive dựng đúng khối đơn vị', () => {
  const cases: PrimitiveSpec[] = [
    base,
    { ...base, corner_radius_pct: 15 },
    { ...base, shape: 'cylinder', cap_height_pct: 10 },
    { ...base, shape: 'bottle', shoulder_pct: 15, neck_height_pct: 20, neck_diameter_pct: 40, cap_height_pct: 8 },
    { ...base, shape: 'bottle', shoulder_pct: 30, neck_height_pct: 40, neck_diameter_pct: 80, cap_height_pct: 20 },
    { ...base, shape: 'tube', cap_height_pct: 12, crimp_pct: 8 },
  ]
  it.each(cases)('$shape khít 1×1×1', (spec) => {
    for (const v of sizeOf(spec)) expect(v).toBeCloseTo(1, 2)
  })
})

describe('AOFP-352 — orientedFit theo orientation của bộ giải', () => {
  // Chai: cao (Y) 0,2 m, đáy 0,06 × 0,06.
  const bottle = new Box3(new Vector3(-0.03, -0.1, -0.03), new Vector3(0.03, 0.1, 0.03))

  function placed(box: Box3, size: [number, number, number], orientation: string): number[] {
    const fit = orientedFit(box, size, orientation)
    const out = new Box3()
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const p = new Vector3(x, y, z).add(fit.offset).applyQuaternion(fit.quaternion).multiply(fit.scale)
          out.expandByPoint(p)
        }
      }
    }
    return out.getSize(new Vector3()).toArray()
  }

  it('LWH: chai đứng, giãn khớp khối', () => {
    const s = placed(bottle, [0.06, 0.2, 0.06], 'LWH')
    expect(s[0]).toBeCloseTo(0.06)
    expect(s[1]).toBeCloseTo(0.2)
    expect(s[2]).toBeCloseTo(0.06)
  })

  it('HLW: chai nằm ngang theo trục x của thùng', () => {
    // BE: x = H (0,2), y = L (0,06), z = W (0,06) → cảnh [x, y↑, z] = [0,2, 0,06, 0,06]
    const s = placed(bottle, [0.2, 0.06, 0.06], 'HLW')
    expect(s[0]).toBeCloseTo(0.2)
    expect(s[1]).toBeCloseTo(0.06)
    expect(s[2]).toBeCloseTo(0.06)
  })

  it('giãn từng trục: số đo SKU khác tỉ lệ mô hình vẫn khít', () => {
    const s = placed(bottle, [0.1, 0.15, 0.04], 'LWH')
    expect(s).toEqual([expect.closeTo(0.1), expect.closeTo(0.15), expect.closeTo(0.04)])
  })
})
