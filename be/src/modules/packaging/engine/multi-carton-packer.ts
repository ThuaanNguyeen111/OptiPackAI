import { createEPPacker, type PlacementPolicy } from './ep-packer';
import { validateCandidate } from './validator';
import {
  FRAGILE_LAST_ORDERING,
  buildOk,
  classifyUnfittable,
  orderUnits,
  packOrder,
  sortBoxesByPreference,
} from './greedy-packer';
import { foldUnit } from './units';
import { lowerBoundCartons } from './lower-bound';
import { consolidateCartons } from './improve';
import {
  CheckBudget,
  DEFAULT_MULTI_MAX_CHECKS,
  SAFETY_WALL_CLOCK_MS,
} from './budget';
import type {
  BoxSpec,
  MaterialPlanning,
  NoFitCode,
  PackOk,
  PackingUnit,
  Placement,
} from './types';

export interface MultiCartonOptions {
  availability?: Map<string, number>;
  materials?: MaterialPlanning;
  maxCartons?: number;
  /** Chốt chặn đồng hồ tường (ms) — chỉ chống treo; giới hạn chính là `maxChecks`. */
  timeBudgetMs?: number;
  /** Tổng số lần kiểm tra vị trí cho cả đơn đa kiện (xác định). */
  maxChecks?: number;
  now?: () => number;
  /** Cân bằng khối lượng giữa các kiện sau khi chia (mặc định bật). */
  balanceLoad?: boolean;
  /** Giải thể kiện nhỏ nhét vào kiện khác để giảm số kiện (mặc định bật). */
  consolidate?: boolean;
}

export interface UnplacedUnit {
  item_key: string;
  code: NoFitCode;
  reason: string;
}

export interface MultiCartonPlan {
  /** ok = mọi món đã có kiện; partial = xếp được một phần; no_fit = không xếp được món nào. */
  status: 'ok' | 'partial' | 'no_fit';
  cartons: PackOk[];
  unplaced: UnplacedUnit[];
  /** Tương thích ngược — cùng nội dung với `unplaced` nhưng chỉ khóa món. */
  unplacedItemKeys: string[];
  totalPackagingCostVnd: number;
  totalPackageWeightG: number;
  computationTimeMs: number;
  /**
   * Cận dưới số kiện (thể tích/cân) tính trên các món đã xếp được vào kiện;
   * `cartons.length - lowerBound` = khoảng cách tới cận dưới (0 = chắc chắn tối ưu).
   */
  lowerBound: number;
  /** Số lần kiểm tra vị trí đã dùng (xác định; để hiệu chỉnh ngân sách). */
  checksUsed: number;
}

class Timeout extends Error {
  constructor(readonly kind: 'budget' | 'wall') {
    super(kind);
  }
}

/** Thứ tự + chính sách thử khi điền 1 thùng (đủ đa dạng, vẫn xác định). */
const FILL_CONFIGS: { ordering: number; policy: PlacementPolicy }[] = [
  { ordering: FRAGILE_LAST_ORDERING, policy: 'corner' },
  { ordering: FRAGILE_LAST_ORDERING, policy: 'narrow-x' },
  { ordering: 0, policy: 'corner' },
  { ordering: 0, policy: 'narrow-y' },
];

const volumeOf = (u: PackingUnit): number =>
  u.length_mm * u.width_mm * u.height_mm;

/** Chữ ký món: các món giống hệt nhau (cùng SKU/kích thước/ràng buộc) chia sẻ kết quả thất bại. */
function signature(u: PackingUnit): string {
  return [
    u.sku,
    u.length_mm,
    u.width_mm,
    u.height_mm,
    u.weight_g,
    u.is_fragile ? 1 : 0,
    u.max_stack_load_g ?? 'n',
    u.orientations.join(''),
    u.foldable === true ? 1 : 0,
  ].join('|');
}

interface Fill {
  box: BoxSpec;
  keys: Set<string>;
  volume: number;
  complete: boolean;
  /** Món đúng dạng đã đặt (đã gập nếu phải gập) + tọa độ — để dựng kiện khi packOrder không tái lập được. */
  usedUnits: PackingUnit[];
  placements: Placement[];
}

/**
 * Điền MỘT thùng bằng packer extreme-point có trạng thái: đi qua danh sách món
 * theo thứ tự, món nào vừa thì đặt, không vừa thì bỏ qua (khác packOrder — bắt
 * buộc đủ mọi món). Món gập được mà không vừa nguyên trạng thì thử dạng gập.
 * Kết quả thất bại của món giống hệt được dùng lại cho tới khi có món mới được
 * đặt (trạng thái thùng đổi → có thể xuất hiện chỗ mới).
 */
function fillCarton(
  ordered: PackingUnit[],
  box: BoxSpec,
  policy: PlacementPolicy,
  checkDeadline: () => void,
): Fill {
  const packer = createEPPacker(box, policy, checkDeadline);
  const keys = new Set<string>();
  const usedUnits: PackingUnit[] = [];
  let failed = new Set<string>();
  let volume = 0;
  for (const unit of ordered) {
    const sig = signature(unit);
    if (failed.has(sig)) continue;
    let used: PackingUnit | null = null;
    if (packer.tryPlace(unit)) {
      used = unit;
    } else if (unit.foldable === true && unit.folded !== true) {
      const folded = foldUnit(unit);
      if (packer.tryPlace(folded)) used = folded;
    }
    if (used) {
      keys.add(unit.item_key);
      usedUnits.push(used);
      volume += volumeOf(used);
      failed = new Set<string>();
    } else {
      failed.add(sig);
    }
  }
  return {
    box,
    keys,
    volume,
    complete: keys.size === ordered.length,
    usedUnits,
    placements: packer.placements().map((p) => ({ ...p })),
  };
}

/** Thể tích hàng (mm³) trong 1 kiện — tính từ khối đã đặt (đã gồm phần gập). */
const cartonVolumeOf = (c: PackOk): number =>
  c.placements.reduce((sum, p) => sum + p.dx * p.dy * p.dz, 0);
/**
 * Độ lệch tải CHUẨN HÓA (cân + thể tích, mỗi thứ chia cho tổng của đơn): 0 =
 * các kiện đều nhau cả về cân lẫn độ đầy. Dùng để so hai cách chia cùng số kiện.
 */
const imbalanceOf = (cartons: PackOk[]): number => {
  const weights = cartons.map((c) => c.items_weight_g);
  const volumes = cartons.map(cartonVolumeOf);
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const totalV = volumes.reduce((a, b) => a + b, 0) || 1;
  return (
    (Math.max(...weights) - Math.min(...weights)) / totalW +
    (Math.max(...volumes) - Math.min(...volumes)) / totalV
  );
};
const packagingCostOf = (cartons: PackOk[]): number =>
  cartons.reduce(
    (sum, c) => sum + (c.box.price_vnd ?? 0) + c.materials_cost_vnd,
    0,
  );

/**
 * ===================================================================
 * Cân bằng tải giữa các kiện (30/09/2026, cải tiến sau M4)
 * ===================================================================
 * Điền-thùng-theo-thể-tích để kiện đầu nặng còn kiện cuối nhẹ. Sau khi đã biết
 * số kiện N, chia lại toàn bộ món cho N kiện theo LPT (món nặng nhất vào kiện
 * đang nhẹ nhất), rồi ĐÓNG LẠI từng kiện bằng packOrder (chọn thùng nhỏ nhất
 * vừa, có validator). Chỉ nhận kết quả khi: vẫn N kiện, mọi kiện hợp lệ và có
 * hàng, độ lệch khối lượng giữa kiện nặng nhất/nhẹ nhất GIẢM thật, và chi phí
 * thùng+vật tư KHÔNG tăng. Không đạt → giữ kế hoạch cũ.
 * ===================================================================
 */
function rebalanceCartons(
  current: PackOk[],
  allUnits: PackingUnit[],
  boxes: BoxSpec[],
  initialStock: Map<string, number> | undefined,
  options: MultiCartonOptions,
  budget: CheckBudget,
  now: () => number,
): PackOk[] {
  const n = current.length;
  if (n < 2 || imbalanceOf(current) === 0) return current;

  const byKey = new Map(allUnits.map((u) => [u.item_key, u]));
  const placed = current.flatMap((c) => c.placements.map((p) => p.item_key));
  const units = placed
    .map((key) => byKey.get(key))
    .filter((u): u is PackingUnit => u !== undefined);
  if (units.length !== placed.length) return current;

  // LPT trên TẢI CHUẨN HÓA (cân/tổng cân + thể tích/tổng thể tích): món "nặng ký
  // hoặc cồng kềnh" trước, mỗi món vào kiện đang nhẹ nhất. Nhờ vậy cân bằng cả
  // khối lượng lẫn độ đầy (trước đây chỉ cân bằng khối lượng).
  const totalW = units.reduce((sum, u) => sum + u.weight_g, 0) || 1;
  const totalV = units.reduce((sum, u) => sum + volumeOf(u), 0) || 1;
  const loadOf = (u: PackingUnit): number =>
    u.weight_g / totalW + volumeOf(u) / totalV;
  const sorted = [...units].sort(
    (a, b) => loadOf(b) - loadOf(a) || a.item_key.localeCompare(b.item_key),
  );
  const bins: PackingUnit[][] = Array.from({ length: n }, () => []);
  const binLoad = new Array<number>(n).fill(0);
  for (const unit of sorted) {
    let target = 0;
    for (let i = 1; i < n; i += 1) {
      if ((binLoad[i] ?? 0) < (binLoad[target] ?? 0)) target = i;
    }
    bins[target]?.push(unit);
    binLoad[target] = (binLoad[target] ?? 0) + loadOf(unit);
  }
  if (bins.some((b) => b.length === 0)) return current;

  const stock = initialStock ? new Map(initialStock) : undefined;
  const rebuilt: PackOk[] = [];
  for (const bin of bins) {
    const result = packOrder(bin, boxes, {
      availability: stock,
      materials: options.materials,
      budget,
      maxChecks: Math.ceil(budget.limit * 0.04),
      now,
    });
    if (result.status !== 'ok') return current;
    rebuilt.push(result);
    if (stock)
      stock.set(result.box.code, (stock.get(result.box.code) ?? 0) - 1);
  }
  if (imbalanceOf(rebuilt) >= imbalanceOf(current)) return current;
  if (packagingCostOf(rebuilt) > packagingCostOf(current)) return current;
  return rebuilt;
}

/**
 * ===================================================================
 * Đa kiện (30/09/2026, Milestone 3) — viết lại
 * ===================================================================
 * 1. Món không bao giờ vào được thùng nào (quá cỡ/quá nặng) tách ra khỏi
 *    bài toán, ghi lý do có mã.
 * 2. Thử 1 kiện trước (ít kiện nhất luôn ưu tiên).
 * 3. Không được: lặp "điền thùng" — với mỗi thùng còn hàng, điền tối đa món
 *    có thể; chọn thùng nhỏ nhất chứa được TOÀN BỘ phần còn lại, nếu không có
 *    thì thùng xếp được nhiều thể tích nhất. Kiện đã chọn được đóng lại bằng
 *    packOrder (thùng nhỏ nhất vừa đúng nhóm món đó, có validator + vật tư).
 * 4. Trừ tồn thùng theo từng kiện; lặp tới hết món, hết thùng hoặc hết giờ.
 * ===================================================================
 */
export function packIntoMultipleCartons(
  units: PackingUnit[],
  boxes: BoxSpec[],
  options: MultiCartonOptions = {},
): MultiCartonPlan {
  const now = options.now ?? Date.now;
  const started = now();
  const wallMs = options.timeBudgetMs ?? SAFETY_WALL_CLOCK_MS;
  const maxCartons = options.maxCartons ?? 50;
  const budget = new CheckBudget(options.maxChecks ?? DEFAULT_MULTI_MAX_CHECKS);
  const checkDeadline = (): void => {
    budget.used += 1;
    if (budget.exhausted) throw new Timeout('budget');
    if (now() - started > wallMs) throw new Timeout('wall');
  };

  const orderedBoxes = sortBoxesByPreference(boxes);
  const stock = options.availability
    ? new Map(options.availability)
    : undefined;
  const inStockBoxes = (): BoxSpec[] =>
    orderedBoxes.filter((b) => !stock || (stock.get(b.code) ?? 0) > 0);
  const takeStock = (code: string): void => {
    if (stock) stock.set(code, (stock.get(code) ?? 0) - 1);
  };

  const cartons: PackOk[] = [];
  const unplaced: UnplacedUnit[] = [];
  let remaining: PackingUnit[] = [];

  for (const u of units) {
    const reason = classifyUnfittable(u, orderedBoxes);
    if (reason)
      unplaced.push({
        item_key: u.item_key,
        code: reason.code ?? 'ITEM_TOO_LARGE',
        reason: reason.reason,
      });
    else remaining.push(u);
  }

  try {
    // Bước 2: thử 1 kiện.
    if (remaining.length > 0 && inStockBoxes().length > 0) {
      const single = packOrder(remaining, orderedBoxes, {
        availability: stock,
        materials: options.materials,
        budget,
        maxChecks: Math.ceil(budget.limit * 0.1),
        now,
      });
      if (single.status === 'ok') {
        cartons.push(single);
        takeStock(single.box.code);
        remaining = [];
      }
    }

    // Bước 3: điền từng thùng.
    while (remaining.length > 0 && cartons.length < maxCartons) {
      checkDeadline();
      const available = inStockBoxes();
      if (available.length === 0) break;

      let best: Fill | null = null;
      for (const box of available) {
        let boxBest: Fill | null = null;
        for (const config of FILL_CONFIGS) {
          const fill = fillCarton(
            orderUnits(config.ordering, remaining),
            box,
            config.policy,
            checkDeadline,
          );
          if (!boxBest || fill.volume > boxBest.volume) boxBest = fill;
          if (fill.complete) break;
        }
        if (!boxBest || boxBest.keys.size === 0) continue;
        if (boxBest.complete) {
          best = boxBest; // thùng nhỏ nhất chứa được hết phần còn lại
          break;
        }
        if (!best || boxBest.volume > best.volume) best = boxBest;
      }
      if (!best) break;

      const chosenKeys = best.keys;
      const subset = remaining.filter((u) => chosenKeys.has(u.item_key));
      // Đóng lại bằng packOrder để chọn thùng nhỏ nhất vừa đúng nhóm món này
      // (có validator + vật tư). Không tái lập được (heuristic điền thùng khác
      // packOrder về thứ tự/gập) thì dùng chính kết quả điền — vẫn PHẢI qua
      // validator độc lập, không qua được thì dừng an toàn.
      const upToBest = available.filter(
        (b) =>
          b.outer.length_mm * b.outer.width_mm * b.outer.height_mm <=
          best.box.outer.length_mm *
            best.box.outer.width_mm *
            best.box.outer.height_mm,
      );
      let finalized: PackOk | null = null;
      const repacked = packOrder(subset, upToBest, {
        availability: stock,
        materials: options.materials,
        budget,
        maxChecks: Math.ceil(budget.limit * 0.06),
        now,
      });
      if (repacked.status === 'ok') {
        finalized = repacked;
      } else if (
        validateCandidate(best.usedUnits, best.box, best.placements).length ===
        0
      ) {
        const fillOrder = new Map(
          best.usedUnits.map((u, i) => [u.item_key, i]),
        );
        const placements = [...best.placements]
          .sort(
            (a, b) =>
              (fillOrder.get(a.item_key) ?? 0) -
              (fillOrder.get(b.item_key) ?? 0),
          )
          .map((p, i) => ({ ...p, step: i + 1 }));
        finalized = buildOk(
          best.usedUnits,
          best.box,
          placements,
          now() - started,
          undefined,
          null,
          options.materials,
        );
      }
      if (!finalized) break;

      cartons.push(finalized);
      takeStock(finalized.box.code);
      const placedKeys = new Set(finalized.placements.map((p) => p.item_key));
      remaining = remaining.filter((u) => !placedKeys.has(u.item_key));
    }
  } catch (error: unknown) {
    if (!(error instanceof Timeout)) throw error;
    const wall = error.kind === 'wall';
    for (const u of remaining) {
      unplaced.push({
        item_key: u.item_key,
        code: wall ? 'TIMEOUT' : 'BUDGET_EXHAUSTED',
        reason: wall
          ? `Hết thời gian tính đa kiện (${String(wallMs)} ms).`
          : 'Hết ngân sách tính toán đa kiện — CHƯA xếp được món này (không có nghĩa là không xếp được).',
      });
    }
    remaining = [];
  }

  if (
    options.consolidate !== false &&
    remaining.length === 0 &&
    cartons.length >= 2
  ) {
    try {
      const consolidated = consolidateCartons(cartons, units, orderedBoxes, {
        availability: options.availability,
        materials: options.materials,
        budget,
        now,
      });
      if (consolidated !== cartons) {
        // Trả tồn của kế hoạch cũ rồi trừ theo kế hoạch mới.
        for (const c of cartons)
          if (stock) stock.set(c.box.code, (stock.get(c.box.code) ?? 0) + 1);
        cartons.splice(0, cartons.length, ...consolidated);
        for (const c of cartons) takeStock(c.box.code);
      }
    } catch (error: unknown) {
      if (!(error instanceof Timeout)) throw error;
    }
  }

  if (
    options.balanceLoad !== false &&
    remaining.length === 0 &&
    cartons.length >= 2
  ) {
    try {
      const balanced = rebalanceCartons(
        cartons,
        units,
        orderedBoxes,
        options.availability,
        options,
        budget,
        now,
      );
      if (balanced !== cartons) {
        // Trả tồn của kế hoạch cũ rồi trừ theo kế hoạch mới (chỉ ảnh hưởng số liệu nội bộ).
        for (const c of cartons)
          if (stock) stock.set(c.box.code, (stock.get(c.box.code) ?? 0) + 1);
        cartons.splice(0, cartons.length, ...balanced);
        for (const c of cartons) takeStock(c.box.code);
      }
    } catch (error: unknown) {
      if (!(error instanceof Timeout)) throw error;
    }
  }

  const stockBoxes = inStockBoxes();
  for (const u of remaining) {
    const noStockFit = classifyUnfittable(u, stockBoxes);
    unplaced.push(
      stockBoxes.length === 0 || noStockFit
        ? {
            item_key: u.item_key,
            code: 'OUT_OF_STOCK',
            reason: 'Hết thùng phù hợp trong kho để đóng món này.',
          }
        : {
            item_key: u.item_key,
            code: 'NO_ARRANGEMENT',
            reason:
              'Không xếp được món này vào các kiện đã có (đạt giới hạn kiện hoặc không tìm được cách xếp).',
          },
    );
  }

  const placedCount = cartons.reduce((sum, c) => sum + c.placements.length, 0);
  const status: MultiCartonPlan['status'] =
    unplaced.length === 0 && placedCount > 0
      ? 'ok'
      : placedCount > 0
        ? 'partial'
        : 'no_fit';
  return {
    status,
    cartons,
    unplaced,
    unplacedItemKeys: unplaced.map((u) => u.item_key),
    totalPackagingCostVnd: cartons.reduce(
      (sum, c) => sum + (c.box.price_vnd ?? 0) + c.materials_cost_vnd,
      0,
    ),
    totalPackageWeightG: cartons.reduce(
      (sum, c) => sum + c.estimated_package_weight_g,
      0,
    ),
    computationTimeMs: now() - started,
    lowerBound: lowerBoundCartons(
      units.filter((u) => !unplaced.some((x) => x.item_key === u.item_key)),
      orderedBoxes,
    ),
    checksUsed: budget.used,
  };
}
