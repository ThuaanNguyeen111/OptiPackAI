import { orientedDims } from './units';
import type { BoxSpec, PackingUnit, Placement } from './types';

/**
 * ===================================================================
 * Packer extreme-point có chấm điểm (30/09/2026, Milestone 2)
 * ===================================================================
 * Thay cho first-fit + tích Descartes toàn bộ tọa độ (O(n³) điểm/món):
 *  - điểm thử chỉ là "extreme point": mỗi lần đặt 1 món sinh 3 điểm mới
 *    (sau/bên/trên), loại điểm nằm trong món đã đặt → ~O(n) điểm;
 *  - mỗi (điểm × hướng) hợp lệ được CHẤM ĐIỂM theo chính sách, chọn tốt
 *    nhất thay vì cái đầu tiên;
 *  - tải chồng cập nhật TĂNG DẦN (vật đỡ cố định lúc đặt vì luôn đỡ 100%
 *    diện tích đáy) thay vì tính lại toàn bộ cho mỗi ứng viên;
 *  - sau khi chọn, món được "nén" về phía -x rồi -y nếu vẫn hợp lệ.
 * Kết quả LUÔN được validateCandidate kiểm lại ở packOrder — packer này
 * không phải nguồn sự thật về tính hợp lệ.
 * ===================================================================
 */

export type PlacementPolicy = 'corner' | 'narrow-x' | 'narrow-y';

interface Supporter {
  index: number;
  /** area / tổng diện tích đáy — phần tải truyền xuống vật đỡ này. */
  share: number;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

interface State {
  placed: Placement[];
  /** Tải tối đa được đặt lên trên; null = không cho đặt gì (kể cả dễ vỡ). */
  limits: (number | null)[];
  loads: number[];
  supportersOf: Supporter[][];
}

function footprintArea(a: Placement, b: Placement): number {
  const w = Math.min(a.x + a.dx, b.x + b.dx) - Math.max(a.x, b.x);
  const d = Math.min(a.y + a.dy, b.y + b.dy) - Math.max(a.y, b.y);
  return w > 0 && d > 0 ? w * d : 0;
}

function intervalOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): number {
  const len = Math.min(a1, b1) - Math.max(a0, b0);
  return len > 0 ? len : 0;
}

function intersects(a: Placement, b: Placement): boolean {
  return (
    a.x < b.x + b.dx &&
    b.x < a.x + a.dx &&
    a.y < b.y + b.dy &&
    b.y < a.y + a.dy &&
    a.z < b.z + b.dz &&
    b.z < a.z + a.dz
  );
}

/** Vật đỡ trực tiếp + tỷ lệ; null nếu đáy chưa được đỡ TOÀN BỘ. */
function findSupport(
  candidate: Placement,
  placed: Placement[],
): Supporter[] | null {
  if (candidate.z === 0) return [];
  const raw: { index: number; area: number }[] = [];
  let covered = 0;
  for (let i = 0; i < placed.length; i += 1) {
    const other = placed[i];
    if (!other || other.z + other.dz !== candidate.z) continue;
    const area = footprintArea(candidate, other);
    if (area > 0) {
      raw.push({ index: i, area });
      covered += area;
    }
  }
  if (covered < candidate.dx * candidate.dy) return null;
  return raw.map((r) => ({ index: r.index, share: r.area / covered }));
}

/** Tải thêm truyền xuống toàn bộ chuỗi vật đỡ khi đặt món nặng `weight`. */
function collectDeltas(
  supporters: Supporter[],
  weight: number,
  state: State,
  out: Map<number, number>,
): void {
  for (const s of supporters) {
    const delta = weight * s.share;
    out.set(s.index, (out.get(s.index) ?? 0) + delta);
    const below = state.supportersOf[s.index];
    if (below && below.length > 0) collectDeltas(below, delta, state, out);
  }
}

function loadsAllowed(deltas: Map<number, number>, state: State): boolean {
  for (const [index, delta] of deltas) {
    const limit = state.limits[index] ?? null;
    if (limit === null) return false;
    if ((state.loads[index] ?? 0) + delta > limit) return false;
  }
  return true;
}

function contactScore(
  candidate: Placement,
  state: State,
  box: BoxSpec,
): number {
  const { length_mm: L, width_mm: W, height_mm: H } = box.inner;
  const { x, y, z, dx, dy, dz } = candidate;
  let score = 0;
  if (x === 0) score += dy * dz;
  if (y === 0) score += dx * dz;
  if (x + dx === L) score += dy * dz;
  if (y + dy === W) score += dx * dz;
  if (z + dz === H) score += dx * dy;
  for (const p of state.placed) {
    if (p.x + p.dx === x || x + dx === p.x) {
      score +=
        intervalOverlap(y, y + dy, p.y, p.y + p.dy) *
        intervalOverlap(z, z + dz, p.z, p.z + p.dz);
    }
    if (p.y + p.dy === y || y + dy === p.y) {
      score +=
        intervalOverlap(x, x + dx, p.x, p.x + p.dx) *
        intervalOverlap(z, z + dz, p.z, p.z + p.dz);
    }
    if (z + dz === p.z) score += footprintArea(candidate, p);
  }
  return score;
}

/** Khóa so sánh (nhỏ hơn = tốt hơn) theo chính sách. */
function scoreKey(
  policy: PlacementPolicy,
  c: Placement,
  contact: number,
  orientationIndex: number,
): number[] {
  switch (policy) {
    case 'narrow-x':
      return [c.z, c.x + c.dx, c.y + c.dy, -contact, orientationIndex];
    case 'narrow-y':
      return [c.z, c.y + c.dy, c.x + c.dx, -contact, orientationIndex];
    case 'corner':
    default:
      return [c.z, -contact, c.x, c.y, orientationIndex];
  }
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Kiểm 1 vị trí: không giao, đỡ đủ, tải chồng OK. Trả vật đỡ nếu hợp lệ. */
function evaluate(
  candidate: Placement,
  weight: number,
  state: State,
  box: BoxSpec,
): { supporters: Supporter[]; deltas: Map<number, number> } | null {
  const { length_mm: L, width_mm: W, height_mm: H } = box.inner;
  if (
    candidate.x + candidate.dx > L ||
    candidate.y + candidate.dy > W ||
    candidate.z + candidate.dz > H
  )
    return null;
  for (const p of state.placed) if (intersects(candidate, p)) return null;
  const supporters = findSupport(candidate, state.placed);
  if (supporters === null) return null;
  const deltas = new Map<number, number>();
  if (supporters.length > 0) {
    collectDeltas(supporters, weight, state, deltas);
    if (!loadsAllowed(deltas, state)) return null;
  }
  return { supporters, deltas };
}

/** Kéo món về phía -x rồi -y khi vẫn hợp lệ (gom khe hở, tạo điểm tốt hơn). */
function compact(
  candidate: Placement,
  weight: number,
  state: State,
  box: BoxSpec,
): Placement {
  let current = candidate;
  for (let round = 0; round < 3; round += 1) {
    let moved = false;
    for (const axis of ['x', 'y'] as const) {
      const size = axis === 'x' ? current.dx : current.dy;
      let target = 0;
      for (const p of state.placed) {
        const overlapsOther =
          axis === 'x'
            ? intervalOverlap(
                current.y,
                current.y + current.dy,
                p.y,
                p.y + p.dy,
              ) > 0
            : intervalOverlap(
                current.x,
                current.x + current.dx,
                p.x,
                p.x + p.dx,
              ) > 0;
        const overlapsZ =
          intervalOverlap(current.z, current.z + current.dz, p.z, p.z + p.dz) >
          0;
        if (!overlapsOther || !overlapsZ) continue;
        const edge = axis === 'x' ? p.x + p.dx : p.y + p.dy;
        if (edge <= current[axis] && edge > target) target = edge;
      }
      if (target < current[axis] && size > 0) {
        const slid: Placement = { ...current, [axis]: target };
        if (evaluate(slid, weight, state, box)) {
          current = slid;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return current;
}

/** Packer có trạng thái: đặt lần lượt từng món vào 1 thùng (dùng cho điền thùng đa kiện). */
export interface EPPacker {
  /** Đặt món nếu vừa (hợp lệ theo mọi ràng buộc + tải thùng); null nếu không. */
  tryPlace(unit: PackingUnit): Placement | null;
  placements(): Placement[];
  totalWeight(): number;
}

export function createEPPacker(
  box: BoxSpec,
  policy: PlacementPolicy,
  checkDeadline: () => void,
): EPPacker {
  const { length_mm: L, width_mm: W, height_mm: H } = box.inner;
  const state: State = { placed: [], limits: [], loads: [], supportersOf: [] };
  let points: Point[] = [{ x: 0, y: 0, z: 0 }];
  let weightTotal = 0;

  const tryPlace = (unit: PackingUnit): Placement | null => {
    if (weightTotal + unit.weight_g > box.max_load_g) return null;
    let best: { placement: Placement; key: number[] } | null = null;
    const sorted = [...points].sort(
      (a, b) => a.z - b.z || a.y - b.y || a.x - b.x,
    );

    for (const point of sorted) {
      checkDeadline();
      for (const [
        orientationIndex,
        orientation,
      ] of unit.orientations.entries()) {
        const [dx, dy, dz] = orientedDims(unit, orientation);
        if (point.x + dx > L || point.y + dy > W || point.z + dz > H) continue;
        const candidate: Placement = {
          item_key: unit.item_key,
          sku: unit.sku,
          step: state.placed.length + 1,
          x: point.x,
          y: point.y,
          z: point.z,
          dx,
          dy,
          dz,
          orientation,
          ...(unit.folded === true && { folded: true }),
        };
        if (!evaluate(candidate, unit.weight_g, state, box)) continue;
        const key = scoreKey(
          policy,
          candidate,
          contactScore(candidate, state, box),
          orientationIndex,
        );
        if (!best || compareKeys(key, best.key) < 0)
          best = { placement: candidate, key };
      }
    }

    if (!best) return null;
    const chosen = compact(best.placement, unit.weight_g, state, box);
    const verdict = evaluate(chosen, unit.weight_g, state, box);
    if (!verdict) return null; // không thể xảy ra (compact chỉ nhận vị trí hợp lệ) — phòng thủ

    state.placed.push(chosen);
    state.limits.push(unit.is_fragile ? null : unit.max_stack_load_g);
    state.loads.push(0);
    state.supportersOf.push(verdict.supporters);
    for (const [i, delta] of verdict.deltas)
      state.loads[i] = (state.loads[i] ?? 0) + delta;
    weightTotal += unit.weight_g;

    points = points.filter(
      (p) =>
        !(
          p.x >= chosen.x &&
          p.x < chosen.x + chosen.dx &&
          p.y >= chosen.y &&
          p.y < chosen.y + chosen.dy &&
          p.z >= chosen.z &&
          p.z < chosen.z + chosen.dz
        ),
    );
    const fresh: Point[] = [
      { x: chosen.x + chosen.dx, y: chosen.y, z: chosen.z },
      { x: chosen.x, y: chosen.y + chosen.dy, z: chosen.z },
      { x: chosen.x, y: chosen.y, z: chosen.z + chosen.dz },
    ];
    const seen = new Set(
      points.map((p) => `${String(p.x)},${String(p.y)},${String(p.z)}`),
    );
    for (const p of fresh) {
      if (p.x >= L || p.y >= W || p.z >= H) continue;
      const inside = state.placed.some(
        (q) =>
          p.x >= q.x &&
          p.x < q.x + q.dx &&
          p.y >= q.y &&
          p.y < q.y + q.dy &&
          p.z >= q.z &&
          p.z < q.z + q.dz,
      );
      const key = `${String(p.x)},${String(p.y)},${String(p.z)}`;
      if (inside || seen.has(key)) continue;
      seen.add(key);
      points.push(p);
    }
    return chosen;
  };

  return {
    tryPlace,
    placements: () => state.placed,
    totalWeight: () => weightTotal,
  };
}

/**
 * Xếp `ordered` vào `box` theo chính sách; null nếu có món không đặt được.
 * `step` = thứ tự đặt (gán lúc đặt; compact giữ nguyên).
 */
export function packIntoBoxEP(
  ordered: PackingUnit[],
  box: BoxSpec,
  checkDeadline: () => void,
  policy: PlacementPolicy,
): Placement[] | null {
  const packer = createEPPacker(box, policy, checkDeadline);
  for (const unit of ordered) {
    if (!packer.tryPlace(unit)) return null;
  }
  return packer.placements();
}
