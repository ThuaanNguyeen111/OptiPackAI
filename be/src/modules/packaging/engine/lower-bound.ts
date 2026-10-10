import { foldUnit, orientedDims } from './units';
import type { BoxSpec, PackingUnit } from './types';

/**
 * ===================================================================
 * Cận dưới số kiện (Bước 1; siết thêm ở Bước 2)
 * ===================================================================
 * Bin packing 3D là NP-khó nên không chứng minh được "tối ưu". Thay vào đó đo
 * khoảng cách tới một CẬN DƯỚI chắc chắn đúng: số kiện không thể ít hơn
 *   - tổng thể tích hàng ÷ thể tích lòng thùng lớn nhất, và
 *   - tổng khối lượng hàng ÷ tải tối đa của thùng nặng nhất, và
 *   - (Bước 2) khi MỌI món đều không chịu được tải đè: tổng diện tích đáy nhỏ
 *     nhất ÷ diện tích sàn thùng lớn nhất (không món nào được nằm trên món
 *     khác nên tất cả phải nằm sát sàn).
 * Gập đôi giữ nguyên thể tích (chỉ làm tròn lên) nên cận thể tích vẫn đúng.
 * Không tính tồn kho (tồn chỉ có thể làm số kiện thực tế LỚN hơn cận).
 * ===================================================================
 */

/** Diện tích đáy nhỏ nhất món có thể chiếm (xét mọi hướng được phép, và dạng gập nếu gập được). */
function minFootprint(unit: PackingUnit): number {
  const variants = [unit];
  if (unit.foldable === true && unit.folded !== true)
    variants.push(foldUnit(unit));
  let best = Number.POSITIVE_INFINITY;
  for (const v of variants) {
    for (const o of v.orientations) {
      const [dx, dy] = orientedDims(v, o);
      best = Math.min(best, dx * dy);
    }
  }
  return best;
}

/**
 * Món KHÔNG THỂ chịu bất kỳ món nào khác đặt lên: dễ vỡ, không cho chồng, hoặc
 * sức chịu nhỏ hơn cả món nhẹ nhất của đơn (đặt gì lên cũng vượt).
 */
function cannotBearAnything(unit: PackingUnit, lightestG: number): boolean {
  return (
    unit.is_fragile ||
    unit.max_stack_load_g === null ||
    unit.max_stack_load_g < lightestG
  );
}

export function lowerBoundCartons(
  units: PackingUnit[],
  boxes: BoxSpec[],
): number {
  if (units.length === 0 || boxes.length === 0) return 0;
  const maxInner = Math.max(
    ...boxes.map(
      (b) => b.inner.length_mm * b.inner.width_mm * b.inner.height_mm,
    ),
  );
  const maxLoad = Math.max(...boxes.map((b) => b.max_load_g));
  const totalVolume = units.reduce(
    (sum, u) => sum + u.length_mm * u.width_mm * u.height_mm,
    0,
  );
  const totalWeight = units.reduce((sum, u) => sum + u.weight_g, 0);
  const byVolume = maxInner > 0 ? Math.ceil(totalVolume / maxInner) : 1;
  const byWeight = maxLoad > 0 ? Math.ceil(totalWeight / maxLoad) : 1;

  let byFloor = 1;
  const lightest = Math.min(...units.map((u) => u.weight_g));
  if (units.every((u) => cannotBearAnything(u, lightest))) {
    const maxFloor = Math.max(
      ...boxes.map((b) => b.inner.length_mm * b.inner.width_mm),
    );
    const totalFootprint = units.reduce((sum, u) => sum + minFootprint(u), 0);
    if (maxFloor > 0) byFloor = Math.ceil(totalFootprint / maxFloor);
  }
  return Math.max(1, byVolume, byWeight, byFloor);
}
