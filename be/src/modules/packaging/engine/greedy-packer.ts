import { foldUnit, orientedDims } from './units';
import { computeLoadsOnTop, isFullySupported, overlaps, validateCandidate } from './validator';
import type { BoxSpec, PackNoFit, PackOk, PackResult, PackingUnit, Placement } from './types';

export const MAX_UNITS = 30;
const DEFAULT_TIME_BUDGET_MS = 2000;
/** Hệ số chia khối lượng quy đổi (cm³/kg) — cấu hình được khi có đơn vị vận chuyển thật. */
export const DEFAULT_VOLUMETRIC_DIVISOR = 6000;

export interface PackOptions {
  timeBudgetMs?: number;
  volumetricDivisor?: number;
  /** Cho test: đồng hồ giả. */
  now?: () => number;
  /**
   * (22/09/2026) Số thùng CÒN TRỐNG theo mã (tồn − đang giữ chỗ). Có map
   * thì thùng không có trong map hoặc ≤ 0 coi là hết hàng; bỏ qua = không
   * xét tồn (test hình học thuần).
   */
  availability?: Map<string, number>;
}

class DeadlineExceeded extends Error {}

function volume(u: PackingUnit): number {
  return u.length_mm * u.width_mm * u.height_mm;
}

/** Thứ tự xếp: thể tích giảm dần → cạnh dài nhất giảm dần → item_key (ổn định). */
export function sortUnitsForPacking(units: PackingUnit[]): PackingUnit[] {
  return [...units].sort((a, b) => {
    const dv = volume(b) - volume(a);
    if (dv !== 0) return dv;
    const de =
      Math.max(b.length_mm, b.width_mm, b.height_mm) - Math.max(a.length_mm, a.width_mm, a.height_mm);
    if (de !== 0) return de;
    return a.item_key.localeCompare(b.item_key);
  });
}

function longestEdge(u: PackingUnit): number {
  return Math.max(u.length_mm, u.width_mm, u.height_mm);
}

/**
 * Multi-start (22/09/2026): các thứ tự xếp thử lần lượt cho MỖI thùng.
 * Thứ tự đầu là greedy cũ (thể tích giảm dần); các thứ tự sau cứu những
 * ca greedy một thứ tự bị hụt ở thùng nhỏ, để chọn được thùng nhỏ hơn.
 * Mỗi thứ tự đều tie-break theo item_key → kết quả luôn xác định.
 */
const UNIT_ORDERINGS: ((units: PackingUnit[]) => PackingUnit[])[] = [
  sortUnitsForPacking,
  (units) =>
    [...units].sort(
      (a, b) =>
        b.length_mm * b.width_mm - a.length_mm * a.width_mm || volume(b) - volume(a) || a.item_key.localeCompare(b.item_key),
    ),
  (units) =>
    [...units].sort((a, b) => longestEdge(b) - longestEdge(a) || volume(b) - volume(a) || a.item_key.localeCompare(b.item_key)),
  (units) =>
    [...units].sort((a, b) => b.height_mm - a.height_mm || volume(b) - volume(a) || a.item_key.localeCompare(b.item_key)),
];

/** Thứ tự thử thùng: thể tích NGOÀI nhỏ nhất → giá → mã. */
export function sortBoxesByPreference(boxes: BoxSpec[]): BoxSpec[] {
  const outerVolume = (b: BoxSpec): number => b.outer.length_mm * b.outer.width_mm * b.outer.height_mm;
  return [...boxes].sort((a, b) => {
    const dv = outerVolume(a) - outerVolume(b);
    if (dv !== 0) return dv;
    const dp = (a.price_vnd ?? Number.MAX_SAFE_INTEGER) - (b.price_vnd ?? Number.MAX_SAFE_INTEGER);
    if (dp !== 0) return dp;
    return a.code.localeCompare(b.code);
  });
}

/** Lý do loại nhanh thùng mà không cần thử xếp; null = đáng thử. */
function quickReject(units: PackingUnit[], box: BoxSpec): string | null {
  const { length_mm: L, width_mm: W, height_mm: H } = box.inner;
  const totalVolume = units.reduce((sum, u) => sum + volume(u), 0);
  if (totalVolume > L * W * H) return 'Tổng thể tích hàng lớn hơn lòng thùng.';
  const totalWeight = units.reduce((sum, u) => sum + u.weight_g, 0);
  if (totalWeight > box.max_load_g) return 'Hàng nặng hơn tải tối đa của thùng.';
  for (const u of units) {
    const fitsSomeWay = u.orientations.some((o) => {
      const [dx, dy, dz] = orientedDims(u, o);
      return dx <= L && dy <= W && dz <= H;
    });
    if (!fitsSomeWay) return `Món ${u.item_key} không vừa thùng theo bất kỳ hướng cho phép nào.`;
  }
  return null;
}

/**
 * Xếp greedy vào MỘT thùng, bắt đầu từ thùng rỗng. Điểm thử = tích Descartes
 * các tọa độ {0, mặt cuối các món đã đặt} trên 3 trục, ưu tiên z → y → x
 * (đặt thấp trước), mỗi điểm thử các hướng cho phép theo thứ tự cố định.
 * Trả null nếu có món không đặt được (không trả phương án dở dang).
 */
export function packIntoBox(
  units: PackingUnit[],
  box: BoxSpec,
  checkDeadline: () => void = () => undefined,
  /** Thứ tự đặt món (multi-start); mặc định greedy thể tích giảm dần. */
  ordered: PackingUnit[] = sortUnitsForPacking(units),
): Placement[] | null {
  const { length_mm: L, width_mm: W, height_mm: H } = box.inner;
  const placed: Placement[] = [];
  const weights: number[] = [];
  const xs = new Set<number>([0]);
  const ys = new Set<number>([0]);
  const zs = new Set<number>([0]);

  for (const unit of ordered) {
    let chosen: Placement | null = null;
    const sortedZ = [...zs].sort((a, b) => a - b);
    const sortedY = [...ys].sort((a, b) => a - b);
    const sortedX = [...xs].sort((a, b) => a - b);

    search: for (const z of sortedZ) {
      for (const y of sortedY) {
        for (const x of sortedX) {
          checkDeadline();
          for (const orientation of unit.orientations) {
            const [dx, dy, dz] = orientedDims(unit, orientation);
            if (x + dx > L || y + dy > W || z + dz > H) continue;
            const candidate: Placement = {
              item_key: unit.item_key,
              sku: unit.sku,
              step: placed.length + 1,
              x,
              y,
              z,
              dx,
              dy,
              dz,
              orientation,
              ...(unit.folded === true && { folded: true }),
            };
            if (placed.some((p) => overlaps(p, candidate))) continue;
            if (!isFullySupported(candidate, placed)) continue;
            if (z > 0 && !stackLoadsOk(units, [...placed, candidate], [...weights, unit.weight_g])) continue;
            chosen = candidate;
            break search;
          }
        }
      }
    }

    if (!chosen) return null;
    placed.push(chosen);
    weights.push(unit.weight_g);
    xs.add(chosen.x + chosen.dx);
    ys.add(chosen.y + chosen.dy);
    zs.add(chosen.z + chosen.dz);
  }
  return placed;
}

function stackLoadsOk(units: PackingUnit[], placed: Placement[], weights: number[]): boolean {
  const limits = new Map(units.map((u) => [u.item_key, u.max_stack_load_g]));
  const loads = computeLoadsOnTop(placed, weights);
  return placed.every((p, i) => {
    const load = loads[i] ?? 0;
    if (load <= 0) return true;
    const limit = limits.get(p.item_key) ?? null;
    return limit !== null && load <= limit;
  });
}

/**
 * ===================================================================
 * Chọn thùng + xếp cho MỘT đơn. Thử thùng theo thứ tự ưu tiên, trả
 * phương án đầu tiên qua validator. Không thùng nào hợp lệ → no_fit
 * (KHÔNG trả thùng lớn nhất như fallback cũ).
 * ===================================================================
 */
export function packOrder(
  units: PackingUnit[],
  boxes: BoxSpec[],
  options: PackOptions = {},
): PackResult {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const budget = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const elapsed = (): number => now() - startedAt;
  const noFit = (reasons: PackNoFit['reasons']): PackNoFit => ({
    status: 'no_fit',
    reasons,
    computation_time_ms: elapsed(),
  });

  if (units.length === 0) return noFit([{ box_code: '-', reason: 'Không có món hàng nào để đóng gói.' }]);
  if (units.length > MAX_UNITS) {
    return noFit([
      { box_code: '-', reason: `Đơn có ${String(units.length)} món, vượt giới hạn ${String(MAX_UNITS)} món của engine.` },
    ]);
  }
  if (boxes.length === 0) return noFit([{ box_code: '-', reason: 'Danh mục chưa có thùng nào đang dùng.' }]);

  const reasons: PackNoFit['reasons'] = [];
  const checkDeadline = (): void => {
    if (elapsed() > budget) throw new DeadlineExceeded();
  };

  // Thùng nhỏ nhất xếp vừa nhưng kho đã hết — để báo nhân viên nhập thêm.
  let preferredOutOfStock: string | null = null;

  const variants = foldVariants(units);

  for (const box of sortBoxesByPreference(boxes)) {
    // (22/09/2026) Thử nguyên trạng trước; hụt mới gập dần các món mềm —
    // gập chỉ xảy ra khi nhờ đó thùng NÀY (nhỏ hơn) mới vừa.
    let found: { placements: Placement[]; units: PackingUnit[] } | null = null;
    let lastViolation: string | null = null;
    let lastReject: string | null = null;
    try {
      for (const variant of variants) {
        const rejected = quickReject(variant, box);
        if (rejected) {
          lastReject = rejected;
          continue;
        }
        for (const ordering of UNIT_ORDERINGS) {
          const placements = packIntoBox(variant, box, checkDeadline, ordering(variant));
          if (!placements) continue;
          const violations = validateCandidate(variant, box, placements);
          if (violations.length > 0) {
            lastViolation = violations[0]?.message ?? '';
            continue;
          }
          found = { placements, units: variant };
          break;
        }
        if (found) break;
      }
    } catch (error: unknown) {
      if (error instanceof DeadlineExceeded) {
        reasons.push({ box_code: box.code, reason: `Hết thời gian tính (${String(budget)} ms).` });
        return noFit(reasons);
      }
      throw error;
    }
    if (!found) {
      reasons.push({
        box_code: box.code,
        reason: lastViolation
          ? `Validator loại: ${lastViolation}`
          : (lastReject ?? 'Không tìm được cách xếp đủ mọi món (đã thử nhiều thứ tự xếp).'),
      });
      continue;
    }
    if (options.availability && (options.availability.get(box.code) ?? 0) <= 0) {
      preferredOutOfStock ??= box.code;
      reasons.push({ box_code: box.code, reason: 'Xếp vừa nhưng kho đã hết thùng này (tồn − đang giữ chỗ = 0).' });
      continue;
    }
    return buildOk(found.units, box, found.placements, elapsed(), options.volumetricDivisor, preferredOutOfStock);
  }
  return noFit(reasons);
}

/**
 * (22/09/2026) Các phương án thử cho 1 đơn: [nguyên trạng, gập món mềm lớn
 * nhất, gập thêm món kế tiếp, ...]. Gập theo thể tích giảm dần — món to
 * nhất gập trước vì hay là thứ làm hụt thùng nhỏ.
 */
export function foldVariants(units: PackingUnit[]): PackingUnit[][] {
  const foldOrder = units
    .filter((u) => u.foldable === true && u.folded !== true)
    .sort((a, b) => volume(b) - volume(a) || a.item_key.localeCompare(b.item_key))
    .map((u) => u.item_key);
  const variants: PackingUnit[][] = [units];
  const folded = new Set<string>();
  for (const key of foldOrder) {
    folded.add(key);
    variants.push(units.map((u) => (folded.has(u.item_key) ? foldUnit(u) : u)));
  }
  return variants;
}

/** Dựng kết quả hợp lệ kèm ước tính cân/vật tư cho một thùng đã xếp. */
export function buildOk(
  units: PackingUnit[],
  box: BoxSpec,
  placements: Placement[],
  computationTimeMs: number,
  volumetricDivisor = DEFAULT_VOLUMETRIC_DIVISOR,
  preferredOutOfStock: string | null = null,
): PackOk {
  const itemsWeight = units.reduce((sum, u) => sum + u.weight_g, 0);
  const itemsVolume = units.reduce((sum, u) => sum + volume(u), 0);
  const innerVolume = box.inner.length_mm * box.inner.width_mm * box.inner.height_mm;
  const outerCm3 = (box.outer.length_mm * box.outer.width_mm * box.outer.height_mm) / 1000;
  const fragileCount = units.filter((u) => u.is_fragile).length;
  return {
    status: 'ok',
    box,
    placements,
    fill_ratio: itemsVolume / innerVolume,
    items_weight_g: itemsWeight,
    // Chưa có danh mục vật tư (khối lượng/giá) → chỉ đếm số lượng;
    // khối lượng vật tư chưa cộng vào cân ước tính.
    materials: fragileCount > 0 ? [{ type: 'bubble_wrap', quantity: fragileCount }] : [],
    estimated_package_weight_g: itemsWeight + box.tare_g,
    volumetric_weight_g: Math.ceil((outerCm3 / volumetricDivisor) * 1000),
    computation_time_ms: computationTimeMs,
    preferred_box_out_of_stock: preferredOutOfStock,
  };
}
