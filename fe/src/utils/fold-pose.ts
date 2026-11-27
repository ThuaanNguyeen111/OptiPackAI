import { itemRole, type PackStep, type Vec3 } from './packing-layout'

/**
 * AOFP-349: dáng gập của một món trong cảnh 3D — hàm thuần, tách khỏi PackingScene để kiểm thử.
 * `size` là khối đo SAU mọi lần gập. Trước đó món còn "trải" k lần (k = số lần gập còn lại):
 * mỗi lần trải nhân đôi cạnh ngắn hơn, mỏng đi một nửa, đáy luôn sát sàn.
 */
export type FoldBend = { axis: 0 | 1; hingeA: number; hingeY: number; angle: number }
export type FoldPose = { scale: Vec3; position: Vec3; bend: FoldBend | null }

const isFold = (s: PackStep): boolean => s.kind === 'halfFold' || s.kind === 'zipFold'

/** Hệ số trải [x, _, z] sau khi mở k lần gập đôi: mỗi lần nhân đôi cạnh đang ngắn hơn. */
export function unfolded(size: Vec3, k: number): Vec3 {
  const f: Vec3 = [1, 1, 1]
  for (let i = 0; i < k; i++) {
    if (size[0] * f[0] <= size[2] * f[2]) f[0] *= 2
    else f[2] *= 2
  }
  return f
}

/** Dáng gập của món `item` khi xem bước `index`, tiến độ bước `progress` (0–1, đã easing). */
export function foldPoseAt(steps: PackStep[], index: number, item: number, size: Vec3, progress: number): FoldPose {
  const role = itemRole(steps, index, item)
  const current = steps[index]
  const totalFolds = steps.filter((s) => s.item === item && isFold(s)).length
  const pending = steps.filter((s, j) => j > index && s.item === item && isFold(s)).length
  const folding = role === 'staged' && current !== undefined && isFold(current)
  const remain = role === 'staged' ? pending : 0
  // Đã gập xong (kể cả khi đang đặt / đã nằm trong thùng) thì GIỮ dáng gập lần cuối — không bung lại.
  if (folding) return bentPose(size, remain, progress)
  if (remain === 0 && totalFolds > 0) return bentPose(size, 0, 1)
  const after = unfolded(size, remain)
  const h = size[1]
  return {
    scale: [after[0], 1 / 2 ** remain, after[2]],
    position: [0, -(h / 2) * (1 - 1 / 2 ** remain), 0],
    bend: null,
  }
}

/** Gập thật: gói trải trên sàn, nửa phía + uốn quanh bản lề giữa gói lật `180° × e` đè lên nửa kia. */
function bentPose(size: Vec3, remain: number, e: number): FoldPose {
  const h = size[1]
  const after = unfolded(size, remain)
  const before = unfolded(size, remain + 1)
  const ax = before[0] !== after[0] ? 0 : 2
  const thickPre = h / 2 ** (remain + 1)
  // Gói trượt dần để gập xong nằm đúng tâm khu chuẩn bị.
  const c = ((size[ax] * after[ax]) / 2) * e
  return {
    scale: [before[0], 1 / 2 ** (remain + 1), before[2]],
    position: [ax === 0 ? c : 0, -h / 2 + thickPre / 2, ax === 2 ? c : 0],
    bend: { axis: ax === 0 ? 0 : 1, hingeA: c, hingeY: -h / 2 + thickPre, angle: Math.PI * e },
  }
}

/** AOFP-350: hệ số trải lớn nhất trên mặt sàn của dáng `pose` — khu chuẩn bị trong hệ toạ độ của mô hình = cạnh khu ÷ số này. */
export function stagedSpread(pose: FoldPose): number {
  return Math.max(1, pose.scale[0], pose.scale[2])
}

/**
 * Đợt 2 (PRODUCT_3D_MODELS §8) — gập tự động cho file quần áo trải phẳng không có xương gập.
 * Bước 'fold': hai mép (mỗi bên 1/4 bề rộng) lật 180° vào giữa, mép trái nửa đầu bước, mép phải nửa sau.
 * Gập đôi / gập tư sau đó dùng chung foldPoseAt. Trả góc lật [trái, phải] (radian).
 */
export function sideFoldAt(steps: PackStep[], index: number, item: number, progress: number): [number, number] {
  const at = steps.findIndex((s) => s.item === item && s.kind === 'fold')
  if (at < 0 || index > at) return [Math.PI, Math.PI]
  if (index < at) return [0, 0]
  const clamp = (v: number): number => Math.min(1, Math.max(0, v))
  return [Math.PI * clamp(progress * 2), Math.PI * clamp(progress * 2 - 1)]
}

/**
 * Trục gập hai mép (0 = x, 2 = z): trục ngắn hơn của món khi đã trải hết các lần gập đôi —
 * trải mép ra (×2 trục này) thì mặt áo trải gần vuông nhất.
 */
export function sideFoldAxis(size: Vec3, totalHalfFolds: number): 0 | 2 {
  const f = unfolded(size, totalHalfFolds)
  return size[0] * f[0] <= size[2] * f[2] ? 0 : 2
}
