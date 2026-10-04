import type { BoxSpec, PackingUnit } from '../../packaging/engine/types';
import type { ProofLabel, SolvedParcel, Variant } from './types';

/**
 * ===================================================================
 * Chứng minh "tối ưu toàn cục" (optimal_global) bằng ĐIỀU KIỆN CẦN
 * ===================================================================
 * Phương án dùng k kiện với tổng giá thùng C. Nó tối ưu (về số kiện rồi giá
 * thùng) nếu:
 *   1. k = cận dưới (không thể ít kiện hơn — tính ở lower-bound.ts), và
 *   2. MỌI tổ hợp k thùng (còn tồn) có giá < C đều vi phạm ít nhất một điều
 *      kiện cần: có món không vừa thùng nào trong tổ hợp, tổng thể tích /
 *      tổng cân vượt sức chứa, hoặc (khi mọi món không chịu tải) tổng diện
 *      tích đáy vượt tổng diện tích sàn.
 * Các điều kiện này đúng với MỌI cách xếp nên kết luận không phụ thuộc
 * mô hình. Tổ hợp rẻ hơn mà vượt qua được điều kiện cần → CHƯA chứng minh
 * được (để CP-SAT ở đợt 2 trả lời) → nhãn heuristic.
 * Giá vật tư không thuộc phần chứng minh (vật tư là ước lượng theo luật).
 * ===================================================================
 */

/** Trần số tổ hợp duyệt — vượt thì không kết luận (heuristic). */
const MAX_MULTISETS = 5000;

export interface ProofResult {
  label: ProofLabel;
  explanation: string[];
  /** Tổ hợp rẻ hơn chưa loại được — đầu vào cho CP-SAT (đợt 2). */
  openCandidates: BoxSpec[][];
}

const innerVol = (b: BoxSpec): number =>
  b.inner.length_mm * b.inner.width_mm * b.inner.height_mm;
const unitVol = (u: PackingUnit): number =>
  u.length_mm * u.width_mm * u.height_mm;
const cost = (b: BoxSpec): number =>
  b.price_vnd ??
  (b.outer.length_mm * b.outer.width_mm * b.outer.height_mm) / 1e6;

function fits(variants: Variant[], u: PackingUnit, box: BoxSpec): boolean {
  return (
    u.weight_g <= box.max_load_g &&
    variants.some(
      (v) =>
        v.dx <= box.inner.length_mm &&
        v.dy <= box.inner.width_mm &&
        v.dz <= box.inner.height_mm,
    )
  );
}

/** Lý do tổ hợp KHÔNG THỂ chứa đơn (điều kiện cần bị vi phạm), hoặc null nếu chưa loại được. */
export function cheapReject(
  units: PackingUnit[],
  variants: Variant[][],
  combo: BoxSpec[],
): string | null {
  for (const [i, u] of units.entries()) {
    if (!combo.some((b) => fits(variants[i] ?? [], u, b)))
      return `món ${u.sku} không vừa thùng nào trong tổ hợp`;
  }
  const vol = units.reduce((s, u) => s + unitVol(u), 0);
  if (vol > combo.reduce((s, b) => s + innerVol(b), 0))
    return 'tổng thể tích hàng vượt tổng lòng thùng';
  const weight = units.reduce((s, u) => s + u.weight_g, 0);
  if (weight > combo.reduce((s, b) => s + b.max_load_g, 0))
    return 'tổng cân hàng vượt tổng tải thùng';
  const lightest = Math.min(...units.map((u) => u.weight_g));
  const nonBearing = units.every(
    (u) =>
      u.is_fragile ||
      u.max_stack_load_g === null ||
      u.max_stack_load_g < lightest,
  );
  if (nonBearing) {
    const footprint = units.reduce(
      (s, _u, i) =>
        s + Math.min(...(variants[i] ?? []).map((v) => v.dx * v.dy)),
      0,
    );
    const floor = combo.reduce(
      (s, b) => s + b.inner.length_mm * b.inner.width_mm,
      0,
    );
    if (footprint > floor)
      return 'mọi món không chịu được tải đè và tổng diện tích đáy vượt diện tích sàn';
  }
  return null;
}

/** Liệt kê tổ hợp (multiset) k thùng có tổng giá < `limit`, tôn trọng tồn. */
function cheaperMultisets(
  boxes: BoxSpec[],
  k: number,
  limit: number,
  stock: Map<string, number> | undefined,
): BoxSpec[][] | null {
  const sorted = [...boxes].sort((a, b) => cost(a) - cost(b));
  const out: BoxSpec[][] = [];
  // Cờ trong object: TS không theo dõi được phép gán bên trong hàm lồng.
  const state = { overflow: false };
  const walk = (start: number, picked: BoxSpec[], total: number): void => {
    if (state.overflow) return;
    if (picked.length === k) {
      out.push([...picked]);
      if (out.length > MAX_MULTISETS) state.overflow = true;
      return;
    }
    for (let i = start; i < sorted.length; i += 1) {
      const b = sorted[i];
      if (!b) continue;
      // Tổng giá tối thiểu khi lấp phần còn lại bằng chính thùng này (đã sắp tăng dần).
      if (total + cost(b) * (k - picked.length) >= limit) break;
      const usedSame = picked.filter((x) => x.code === b.code).length;
      if (stock && usedSame + 1 > (stock.get(b.code) ?? 0)) continue;
      picked.push(b);
      walk(i, picked, total + cost(b));
      picked.pop();
    }
  };
  walk(0, [], 0);
  return state.overflow ? null : out;
}

export function proveOptimality(
  units: PackingUnit[],
  variants: Variant[][],
  boxes: BoxSpec[],
  stock: Map<string, number> | undefined,
  chosen: SolvedParcel[],
  lowerBound: number,
): ProofResult {
  const k = chosen.length;
  const explanation: string[] = [];
  if (k === 0) return { label: 'heuristic', explanation, openCandidates: [] };
  if (k > lowerBound) {
    explanation.push(
      `Cận dưới là ${String(lowerBound)} kiện; phương án dùng ${String(k)} kiện — chưa chứng minh được là ít nhất.`,
    );
    return { label: 'heuristic', explanation, openCandidates: [] };
  }
  explanation.push(
    `Không thể dùng ít hơn ${String(k)} kiện (cận dưới theo thể tích, cân và diện tích sàn).`,
  );
  const chosenCost = chosen.reduce((s, p) => s + cost(p.box), 0);
  const combos = cheaperMultisets(boxes, k, chosenCost, stock);
  if (combos === null) {
    explanation.push('Quá nhiều tổ hợp thùng rẻ hơn để kiểm tra nhanh.');
    return { label: 'heuristic', explanation, openCandidates: [] };
  }
  const open: BoxSpec[][] = [];
  for (const combo of combos) {
    const reason = cheapReject(units, variants, combo);
    const name = combo.map((b) => b.code).join(' + ');
    if (reason) explanation.push(`${name}: không thể — ${reason}.`);
    else open.push(combo);
  }
  if (open.length > 0) {
    explanation.push(
      `${String(open.length)} tổ hợp rẻ hơn chưa loại được bằng kiểm tra nhanh (vd ${open[0]?.map((b) => b.code).join(' + ') ?? ''}).`,
    );
    return { label: 'heuristic', explanation, openCandidates: open };
  }
  explanation.push('Mọi tổ hợp thùng rẻ hơn đều không thể chứa đơn → tối ưu về số kiện và giá thùng.');
  return { label: 'optimal_global', explanation, openCandidates: [] };
}
