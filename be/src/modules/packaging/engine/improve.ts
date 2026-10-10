import { packOrder } from './greedy-packer';
import { CheckBudget } from './budget';
import type { BoxSpec, MaterialPlanning, PackOk, PackingUnit } from './types';

/**
 * ===================================================================
 * Cải tiến sau greedy (Bước 2, chất lượng xếp) — giải thể kiện
 * ===================================================================
 * Điền-thùng-theo-thể-tích có thể để lại một kiện nhỏ (vd 1–4 món, lấp
 * 20%) trong khi các kiện khác còn chỗ. Hàm này thử GIẢI THỂ từng kiện nhỏ:
 * lần lượt nhét từng món của nó vào kiện khác (đóng lại kiện đó bằng
 * packOrder — chọn thùng nhỏ nhất vừa, có validator + vật tư). Chỉ nhận khi
 *   - mọi món của kiện bị giải thể đều có chỗ, và
 *   - tổng chi phí thùng + vật tư KHÔNG tăng.
 * Mọi kiện mới đều do packOrder dựng nên luôn đã qua validator độc lập.
 * Xác định: dùng ngân sách đếm lần kiểm tra, không dùng đồng hồ.
 * ===================================================================
 */

export interface ConsolidateOptions {
  /** Tồn thùng lúc BẮT ĐẦU (trước khi trừ bất kỳ kiện nào); bỏ qua = không xét tồn. */
  availability?: Map<string, number>;
  materials?: MaterialPlanning;
  budget: CheckBudget;
  now: () => number;
  /** Đơn có nhiều kiện hơn mức này thì bỏ qua (chi phí tăng theo bình phương). */
  maxCartons?: number;
}

const DEFAULT_MAX_CARTONS = 12;
/** Trần ngân sách (lần kiểm tra) cho CẢ bước giải thể — ≈ 0,6 s với đơn nhỏ. */
const CONSOLIDATE_MAX_CHECKS = 800_000;
/**
 * Chi phí MỖI lần kiểm tra tăng theo số món đã đặt (so với mọi món trong thùng),
 * nên ngân sách co lại theo tổng số món: n món → tối đa WORK/n lần kiểm tra.
 * 250 món → 64k lần (vài chục ms); ≤ 20 món → đủ 800k. Vẫn xác định (không đồng hồ).
 */
const CONSOLIDATE_WORK = 16_000_000;
/** Trần cho MỖI lần thử nhét 1 món vào 1 kiện. */
const TRY_MAX_CHECKS = 40_000;
/** Chỉ thử giải thể tối đa số kiện nhỏ nhất này mỗi vòng. */
const DISSOLVE_CANDIDATES = 6;

const costOf = (c: PackOk): number =>
  (c.box.price_vnd ?? 0) + c.materials_cost_vnd;
const totalCost = (cartons: PackOk[]): number =>
  cartons.reduce((sum, c) => sum + costOf(c), 0);
const volumeOf = (u: PackingUnit): number =>
  u.length_mm * u.width_mm * u.height_mm;

export function consolidateCartons(
  cartons: PackOk[],
  allUnits: PackingUnit[],
  boxes: BoxSpec[],
  options: ConsolidateOptions,
): PackOk[] {
  const maxCartons = options.maxCartons ?? DEFAULT_MAX_CARTONS;
  if (cartons.length < 2 || cartons.length > maxCartons) return cartons;
  // Ngân sách con: bước này tối đa CONSOLIDATE_MAX_CHECKS, phần dùng được cộng lại vào tổng.
  const cap = Math.min(
    CONSOLIDATE_MAX_CHECKS,
    Math.floor(CONSOLIDATE_WORK / Math.max(1, allUnits.length)),
  );
  const sub = new CheckBudget(Math.min(options.budget.remaining, cap));
  try {
    return runConsolidation(cartons, allUnits, boxes, options, sub);
  } finally {
    options.budget.used += sub.used;
  }
}

function runConsolidation(
  cartons: PackOk[],
  allUnits: PackingUnit[],
  boxes: BoxSpec[],
  options: ConsolidateOptions,
  budget: CheckBudget,
): PackOk[] {

  const unitByKey = new Map(allUnits.map((u) => [u.item_key, u]));
  const unitsOf = (carton: PackOk): PackingUnit[] | null => {
    const units: PackingUnit[] = [];
    for (const p of carton.placements) {
      const unit = unitByKey.get(p.item_key);
      if (!unit) return null;
      units.push(unit);
    }
    return units;
  };

  /** Tồn còn lại khi các kiện trong `occupied` đang giữ thùng (kiện bị loại không trừ). */
  const stockWith = (occupied: PackOk[]): Map<string, number> | undefined => {
    if (!options.availability) return undefined;
    const stock = new Map(options.availability);
    for (const c of occupied)
      stock.set(c.box.code, (stock.get(c.box.code) ?? 0) - 1);
    return stock;
  };

  const tryDissolve = (current: PackOk[], index: number): PackOk[] | null => {
    const dissolving = current[index];
    if (!dissolving) return null;
    const pending = unitsOf(dissolving);
    if (!pending) return null;
    pending.sort(
      (a, b) => volumeOf(b) - volumeOf(a) || a.item_key.localeCompare(b.item_key),
    );

    const results = current.filter((_, i) => i !== index);
    const groups: PackingUnit[][] = [];
    for (const c of results) {
      const units = unitsOf(c);
      if (!units) return null;
      groups.push(units);
    }

    for (const unit of pending) {
      let best: { at: number; carton: PackOk; delta: number } | null = null;
      for (let j = 0; j < results.length; j += 1) {
        if (budget.exhausted) return null;
        const existing = results[j];
        const group = groups[j];
        if (!existing || !group) continue;
        const trial = packOrder([...group, unit], boxes, {
          availability: stockWith(results.filter((_, k) => k !== j)),
          materials: options.materials,
          budget,
          maxChecks: Math.min(TRY_MAX_CHECKS, budget.remaining, Math.max(1000, Math.floor(budget.limit / 4))),
          now: options.now,
        });
        if (trial.status !== 'ok') continue;
        const delta = costOf(trial) - costOf(existing);
        if (!best || delta < best.delta) best = { at: j, carton: trial, delta };
        if (delta <= 0) break; // chỗ này không tốn thêm chi phí — nhận ngay, khỏi thử tiếp
      }
      if (!best) return null;
      results[best.at] = best.carton;
      groups[best.at]?.push(unit);
    }

    return totalCost(results) <= totalCost(current) ? results : null;
  };

  let current = cartons;
  let improved = true;
  while (improved && current.length >= 2 && !budget.exhausted) {
    improved = false;
    // Giải thể kiện ÍT MÓN nhất trước (dễ nhét nhất).
    const order = current
      .map((_, i) => i)
      .sort(
        (a, b) =>
          (current[a]?.placements.length ?? 0) -
            (current[b]?.placements.length ?? 0) || a - b,
      );
    for (const i of order.slice(0, DISSOLVE_CANDIDATES)) {
      const next = tryDissolve(current, i);
      if (next) {
        current = next;
        improved = true;
        break;
      }
    }
  }
  return current;
}
