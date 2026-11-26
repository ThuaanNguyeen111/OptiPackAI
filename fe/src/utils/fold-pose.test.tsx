import { describe, expect, it } from 'vitest'
import type { PackingItemProfile, PackingPlacement } from '../types/packing-plan'
import { foldPoseAt, stagedSpread, type FoldPose } from './fold-pose'
import { buildPackSteps, type PackStep, type Vec3 } from './packing-layout'

/**
 * AOFP-349 — chặn tái phạm "áo gập xong sang bước sau bung lại nguyên chiếc".
 * Chạy trên chuỗi bước THẬT (buildPackSteps) cho mọi kiểu gập: gập đôi, gập tư, túi zip gập sẵn.
 */
const placement = (folded: boolean, foldCount?: number): PackingPlacement => ({
  itemKey: 'A#1',
  sku: 'A',
  step: 1,
  x: 0,
  y: 0,
  z: 0,
  dx: 120,
  dy: 30,
  dz: 180,
  orientation: 'LWH',
  folded,
  foldCount,
})
const profile = (zipBagFolded: boolean): PackingItemProfile => ({
  sku: 'A',
  productCategory: 't_shirt',
  zipBagCode: 'ZIP-S',
  zipBagFolded,
})
const SIZE: Vec3 = [0.12, 0.03, 0.18]

/** Khối nhìn thấy: thước × hệ số; uốn 180° thì cạnh gập còn nửa, dày gấp đôi. */
function visible(pose: FoldPose): Vec3 {
  const v: Vec3 = [SIZE[0] * pose.scale[0], SIZE[1] * pose.scale[1], SIZE[2] * pose.scale[2]]
  if (pose.bend && Math.abs(pose.bend.angle - Math.PI) < 1e-9) {
    v[pose.bend.axis === 0 ? 0 : 2] /= 2
    v[1] *= 2
  }
  return v
}

const CASES: [string, PackingPlacement, PackingItemProfile][] = [
  ['gập đôi', placement(true, 1), profile(false)],
  ['gập tư', placement(true, 2), profile(false)],
  ['túi zip gập sẵn', placement(false), profile(true)],
  ['túi zip gập sẵn + gập đôi', placement(true, 1), profile(true)],
]

describe('foldPoseAt — dáng gập giữ liên tục qua các bước', () => {
  it.each(CASES)('%s: đã gập xong thì mọi bước sau vẫn ở dáng gập (không bung lại)', (_, p, prof) => {
    const steps: PackStep[] = buildPackSteps([p], [prof])
    const lastFold = steps.map((s) => s.kind).lastIndexOf(p.folded ? 'halfFold' : 'zipFold')
    expect(lastFold).toBeGreaterThan(0)
    for (let i = lastFold + 1; i < steps.length; i++) {
      for (const t of [0, 0.5, 1]) {
        const pose = foldPoseAt(steps, i, 0, SIZE, t)
        if (steps[i]?.kind === 'prepare') continue
        expect(pose.bend?.angle, `bước ${String(i)} (${String(steps[i]?.kind)}) t=${String(t)}`).toBeCloseTo(Math.PI)
        expect(visible(pose).map((n) => +n.toFixed(9))).toEqual(SIZE.map((n) => +n.toFixed(9)))
      }
    }
  })

  it.each(CASES)('%s: khung cuối bước này trùng khung đầu bước sau (không giật cỡ)', (_, p, prof) => {
    const steps = buildPackSteps([p], [prof])
    const first = steps.findIndex((s) => s.item === 0)
    for (let i = first; i < steps.length - 1; i++) {
      const end = visible(foldPoseAt(steps, i, 0, SIZE, 1))
      const start = visible(foldPoseAt(steps, i + 1, 0, SIZE, 0))
      expect(start.map((n) => +n.toFixed(9)), `${String(steps[i]?.kind)} → ${String(steps[i + 1]?.kind)}`).toEqual(
        end.map((n) => +n.toFixed(9)),
      )
    }
  })

  it('món không gập thì không uốn ở bước nào', () => {
    const steps = buildPackSteps([placement(false)], [{ ...profile(false), zipBagCode: null }])
    steps.forEach((_, i) => expect(foldPoseAt(steps, i, 0, SIZE, 1).bend).toBeNull())
  })

  it.each(CASES)('%s: khu chuẩn bị của mô hình × hệ số trải = đúng tấm thảm ở mọi bước (AOFP-350, quần không phình)', (_, p, prof) => {
    const steps = buildPackSteps([p], [prof])
    const AREA = 0.5
    steps.forEach((step, i) => {
      const pose = foldPoseAt(steps, i, 0, SIZE, 0)
      const spread = stagedSpread(pose)
      // Gói trải trên sàn lớn nhất = hệ số trải; vùng mô hình được co vào nhân lại phải đúng bằng tấm thảm.
      expect(spread).toBeGreaterThanOrEqual(Math.max(pose.scale[0], pose.scale[2]))
      expect((AREA / spread) * Math.max(pose.scale[0], pose.scale[2])).toBeLessThanOrEqual(AREA + 1e-12)
      if (step.kind === 'fold') expect(spread, 'bước gấp còn các lần gập phía sau → gói đang trải').toBeGreaterThan(1)
    })
  })
})

