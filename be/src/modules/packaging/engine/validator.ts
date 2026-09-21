import { orientedDims } from './units';
import type { BoxSpec, PackingUnit, Placement, Violation } from './types';

type Box3 = Pick<Placement, 'x' | 'y' | 'z' | 'dx' | 'dy' | 'dz'>;

/** Hai khối giao nhau thật sự (chạm mặt KHÔNG tính là giao). */
export function overlaps(a: Box3, b: Box3): boolean {
  return (
    a.x < b.x + b.dx &&
    b.x < a.x + a.dx &&
    a.y < b.y + b.dy &&
    b.y < a.y + a.dy &&
    a.z < b.z + b.dz &&
    b.z < a.z + a.dz
  );
}

/** Diện tích giao của 2 mặt đáy/đỉnh trên mặt phẳng xy (mm²). */
export function footprintOverlapArea(a: Box3, b: Box3): number {
  const w = Math.min(a.x + a.dx, b.x + b.dx) - Math.max(a.x, b.x);
  const d = Math.min(a.y + a.dy, b.y + b.dy) - Math.max(a.y, b.y);
  return w > 0 && d > 0 ? w * d : 0;
}

/**
 * Các vật đỡ trực tiếp của `item`: mặt trên nằm đúng z của đáy item và
 * giao diện tích với đáy. Các vật đỡ không thể chồng footprint lên nhau
 * (nếu có thì chúng giao nhau trong 3D), nên tổng diện tích = độ phủ.
 */
export function directSupporters(item: Box3, others: Box3[]): { index: number; area: number }[] {
  const result: { index: number; area: number }[] = [];
  others.forEach((other, index) => {
    if (other === item || other.z + other.dz !== item.z) return;
    const area = footprintOverlapArea(item, other);
    if (area > 0) result.push({ index, area });
  });
  return result;
}

/** Đáy phải nằm trên sàn thùng hoặc được đỡ TOÀN BỘ diện tích. */
export function isFullySupported(item: Box3, others: Box3[]): boolean {
  if (item.z === 0) return true;
  const covered = directSupporters(item, others).reduce((sum, s) => sum + s.area, 0);
  return covered >= item.dx * item.dy;
}

/**
 * Tải (g) mỗi món phải chịu từ các món phía trên, chia theo tỷ lệ diện
 * tích tiếp xúc. Duyệt từ cao xuống thấp để cộng dồn tải truyền xuống.
 */
export function computeLoadsOnTop(placed: Box3[], weights: number[]): number[] {
  const loads = placed.map(() => 0);
  const order = placed.map((_, i) => i).sort((a, b) => {
    const pa = placed[a];
    const pb = placed[b];
    return (pb ? pb.z : 0) - (pa ? pa.z : 0);
  });
  for (const i of order) {
    const item = placed[i];
    if (!item || item.z === 0) continue;
    const supporters = directSupporters(item, placed);
    const totalArea = supporters.reduce((sum, s) => sum + s.area, 0);
    if (totalArea === 0) continue;
    const transferred = (weights[i] ?? 0) + (loads[i] ?? 0);
    for (const s of supporters) {
      loads[s.index] = (loads[s.index] ?? 0) + (transferred * s.area) / totalArea;
    }
  }
  return loads;
}

/**
 * ===================================================================
 * Validator ĐỘC LẬP với thuật toán tìm kiếm — mọi phương án (engine,
 * nhân viên chọn thùng khác) chỉ được chấp nhận khi trả về [].
 * ===================================================================
 */
export function validateCandidate(
  units: PackingUnit[],
  box: BoxSpec,
  placements: Placement[],
): Violation[] {
  const violations: Violation[] = [];
  if (units.length === 0) {
    return [{ code: 'EMPTY_INPUT', message: 'Không có món hàng nào để đóng gói.' }];
  }

  const unitByKey = new Map(units.map((u) => [u.item_key, u]));
  const seen = new Set<string>();
  for (const p of placements) {
    if (!unitByKey.has(p.item_key)) {
      violations.push({ code: 'UNKNOWN_ITEM', item_key: p.item_key, message: 'Món không thuộc đơn.' });
    }
    if (seen.has(p.item_key)) {
      violations.push({ code: 'DUPLICATE_ITEM', item_key: p.item_key, message: 'Món bị xếp hai lần.' });
    }
    seen.add(p.item_key);
  }
  for (const u of units) {
    if (!seen.has(u.item_key)) {
      violations.push({ code: 'MISSING_ITEM', item_key: u.item_key, message: 'Món chưa được xếp.' });
    }
  }

  const { length_mm: L, width_mm: W, height_mm: H } = box.inner;
  placements.forEach((p, i) => {
    const unit = unitByKey.get(p.item_key);
    if (unit) {
      const [ex, ey, ez] = orientedDims(unit, p.orientation);
      if (!unit.orientations.includes(p.orientation) || ex !== p.dx || ey !== p.dy || ez !== p.dz) {
        violations.push({
          code: 'ORIENTATION_NOT_ALLOWED',
          item_key: p.item_key,
          message: `Hướng ${p.orientation} không được phép hoặc sai kích thước sau xoay.`,
        });
      }
    }
    if (p.x < 0 || p.y < 0 || p.z < 0 || p.x + p.dx > L || p.y + p.dy > W || p.z + p.dz > H) {
      violations.push({ code: 'OUT_OF_BOUNDS', item_key: p.item_key, message: 'Món vượt ra ngoài lòng thùng.' });
    }
    for (let j = i + 1; j < placements.length; j += 1) {
      const other = placements[j];
      if (other && overlaps(p, other)) {
        violations.push({
          code: 'OVERLAP',
          item_key: p.item_key,
          message: `Món giao nhau với ${other.item_key}.`,
        });
      }
    }
    if (!isFullySupported(p, placements)) {
      violations.push({ code: 'NO_SUPPORT', item_key: p.item_key, message: 'Đáy món không được đỡ toàn bộ.' });
    }
  });

  const weights = placements.map((p) => unitByKey.get(p.item_key)?.weight_g ?? 0);
  const loads = computeLoadsOnTop(placements, weights);
  placements.forEach((p, i) => {
    const load = loads[i] ?? 0;
    if (load <= 0) return;
    const limit = unitByKey.get(p.item_key)?.max_stack_load_g ?? null;
    if (limit === null || load > limit) {
      violations.push({
        code: 'STACK_LOAD_EXCEEDED',
        item_key: p.item_key,
        message:
          limit === null
            ? 'Món này không được phép đặt vật lên trên.'
            : `Tải chồng ${String(Math.round(load))} g vượt giới hạn ${String(limit)} g.`,
      });
    }
  });

  const itemsWeight = units.reduce((sum, u) => sum + u.weight_g, 0);
  if (itemsWeight > box.max_load_g) {
    violations.push({
      code: 'BOX_LOAD_EXCEEDED',
      message: `Hàng nặng ${String(itemsWeight)} g vượt tải thùng ${String(box.max_load_g)} g.`,
    });
  }
  return violations;
}
