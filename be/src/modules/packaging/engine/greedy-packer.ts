import { foldUnit, orientedDims } from './units';
import {
  computeLoadsOnTop,
  isFullySupported,
  overlaps,
  validateCandidate,
} from './validator';
import { packIntoBoxEP, type PlacementPolicy } from './ep-packer';
import { selectMaterials } from './material-selector';
import {
  CheckBudget,
  DEFAULT_MAX_CHECKS,
  SAFETY_WALL_CLOCK_MS,
} from './budget';
import type {
  BoxSpec,
  MaterialPlanning,
  NoFitCode,
  NoFitReason,
  NoFitSuggestion,
  PackNoFit,
  PackOk,
  PackResult,
  PackingUnit,
  Placement,
} from './types';

/** Trần số món cho MỘT thùng (an toàn hiệu năng); đơn lớn hơn đi sang đa kiện. */
export const MAX_UNITS = 200;
/** first-fit cũ có O(n³) điểm thử — chỉ dùng cho đơn nhỏ; đơn lớn dùng extreme-point. */
const LEGACY_MAX_UNITS = 24;
/** Số phương án gập tối đa thử cho 1 thùng (fewest-folds-first). */
const MAX_FOLD_VARIANTS = 48;
/** Hệ số chia khối lượng quy đổi (cm³/kg) — cấu hình được khi có đơn vị vận chuyển thật. */
export const DEFAULT_VOLUMETRIC_DIVISOR = 6000;

export interface PackOptions {
  /**
   * Chốt chặn đồng hồ tường (ms) — chỉ để chống treo (mặc định rất lớn). Giới
   * hạn chính là số lần kiểm tra (`maxChecks`/`budget`) nên kết quả xác định.
   */
  timeBudgetMs?: number;
  /** Trần số lần kiểm tra cho riêng lệnh gọi này (mặc định DEFAULT_MAX_CHECKS). */
  maxChecks?: number;
  /** Bộ đếm dùng chung (đa kiện) — lệnh gọi này trừ dần vào đó. */
  budget?: CheckBudget;
  volumetricDivisor?: number;
  /** Cho test: đồng hồ giả. */
  now?: () => number;
  /**
   * (22/09/2026) Số thùng CÒN TRỐNG theo mã (tồn − đang giữ chỗ). Có map
   * thì thùng không có trong map hoặc ≤ 0 coi là hết hàng; bỏ qua = không
   * xét tồn (test hình học thuần).
   */
  availability?: Map<string, number>;
  /**
   * (28/09/2026) Danh mục + luật vật tư chèn. Bỏ qua = không tính vật tư
   * (materials rỗng) — dùng cho test hình học thuần.
   */
  materials?: MaterialPlanning;
}

class DeadlineExceeded extends Error {
  constructor(readonly kind: 'budget' | 'wall') {
    super(kind);
  }
}

/** Mã lý do là BẰNG CHỨNG vô nghiệm (không phụ thuộc ngân sách tìm kiếm). */
const PROOF_CODES: ReadonlySet<NoFitCode> = new Set([
  'NO_ITEMS',
  'NO_BOXES',
  'ITEM_TOO_LARGE',
  'ITEM_TOO_HEAVY',
  'TOTAL_VOLUME',
  'TOTAL_WEIGHT',
]);

/**
 * true = MỌI lý do đều là bằng chứng hình học/cân nặng (thể tích, tải, món quá
 * cỡ), không còn lý do "chưa tìm được" (NO_ARRANGEMENT/BUDGET_EXHAUSTED/
 * TIMEOUT/OUT_OF_STOCK). Chỉ khi đó mới được nói "không thể".
 */
export function isProvenInfeasible(reasons: NoFitReason[]): boolean {
  return (
    reasons.length > 0 &&
    reasons.every((r) => r.code !== undefined && PROOF_CODES.has(r.code))
  );
}

function volume(u: PackingUnit): number {
  return u.length_mm * u.width_mm * u.height_mm;
}

/** Thứ tự xếp: thể tích giảm dần → cạnh dài nhất giảm dần → item_key (ổn định). */
export function sortUnitsForPacking(units: PackingUnit[]): PackingUnit[] {
  return [...units].sort((a, b) => {
    const dv = volume(b) - volume(a);
    if (dv !== 0) return dv;
    const de =
      Math.max(b.length_mm, b.width_mm, b.height_mm) -
      Math.max(a.length_mm, a.width_mm, a.height_mm);
    if (de !== 0) return de;
    return a.item_key.localeCompare(b.item_key);
  });
}

function longestEdge(u: PackingUnit): number {
  return Math.max(u.length_mm, u.width_mm, u.height_mm);
}

const byKey = (a: PackingUnit, b: PackingUnit): number =>
  a.item_key.localeCompare(b.item_key);
/** Sức chịu tải chồng hiệu dụng: dễ vỡ hoặc không cho chồng = -1 (xếp sau, nằm trên). */
const carry = (u: PackingUnit): number =>
  u.is_fragile || u.max_stack_load_g === null ? -1 : u.max_stack_load_g;

/**
 * Multi-start: các thứ tự xếp thử lần lượt cho MỖI thùng. 4 thứ tự đầu là
 * greedy gốc (giữ nguyên để kết quả cũ không đổi); các thứ tự sau (30/09/2026)
 * đưa món DỄ VỠ / KHÔNG CHỊU TẢI xuống cuối để chúng nằm trên cùng, và món
 * chịu tải tốt lên đầu làm nền. Mọi thứ tự đều tie-break theo item_key.
 */
const UNIT_ORDERINGS: ((units: PackingUnit[]) => PackingUnit[])[] = [
  sortUnitsForPacking,
  (units) =>
    [...units].sort(
      (a, b) =>
        b.length_mm * b.width_mm - a.length_mm * a.width_mm ||
        volume(b) - volume(a) ||
        byKey(a, b),
    ),
  (units) =>
    [...units].sort(
      (a, b) =>
        longestEdge(b) - longestEdge(a) || volume(b) - volume(a) || byKey(a, b),
    ),
  (units) =>
    [...units].sort(
      (a, b) =>
        b.height_mm - a.height_mm || volume(b) - volume(a) || byKey(a, b),
    ),
  // Nền chịu tải trước, dễ vỡ/không chịu tải sau cùng (nằm trên cùng).
  (units) =>
    [...units].sort(
      (a, b) =>
        Number(a.is_fragile) - Number(b.is_fragile) ||
        carry(b) - carry(a) ||
        volume(b) - volume(a) ||
        byKey(a, b),
    ),
  // Nặng trước (nền vững), nhẹ sau.
  (units) =>
    [...units].sort(
      (a, b) => b.weight_g - a.weight_g || volume(b) - volume(a) || byKey(a, b),
    ),
  // Diện tích đáy lớn trước nhưng dễ vỡ luôn cuối.
  (units) =>
    [...units].sort(
      (a, b) =>
        Number(a.is_fragile) - Number(b.is_fragile) ||
        b.length_mm * b.width_mm - a.length_mm * a.width_mm ||
        volume(b) - volume(a) ||
        byKey(a, b),
    ),
];
const LEGACY_ORDERING_COUNT = 4;
const EP_POLICIES: PlacementPolicy[] = ['corner', 'narrow-x', 'narrow-y'];

/** Thứ tự thử thùng: thể tích NGOÀI nhỏ nhất → giá → mã. */
export function sortBoxesByPreference(boxes: BoxSpec[]): BoxSpec[] {
  const outerVolume = (b: BoxSpec): number =>
    b.outer.length_mm * b.outer.width_mm * b.outer.height_mm;
  return [...boxes].sort((a, b) => {
    const dv = outerVolume(a) - outerVolume(b);
    if (dv !== 0) return dv;
    const dp =
      (a.price_vnd ?? Number.MAX_SAFE_INTEGER) -
      (b.price_vnd ?? Number.MAX_SAFE_INTEGER);
    if (dp !== 0) return dp;
    return a.code.localeCompare(b.code);
  });
}

function fitsSomeOrientation(u: PackingUnit, box: BoxSpec): boolean {
  const { length_mm: L, width_mm: W, height_mm: H } = box.inner;
  return u.orientations.some((o) => {
    const [dx, dy, dz] = orientedDims(u, o);
    return dx <= L && dy <= W && dz <= H;
  });
}

/** Lý do loại nhanh thùng mà không cần thử xếp; null = đáng thử. */
function quickReject(units: PackingUnit[], box: BoxSpec): NoFitReason | null {
  const { length_mm: L, width_mm: W, height_mm: H } = box.inner;
  const totalVolume = units.reduce((sum, u) => sum + volume(u), 0);
  if (totalVolume > L * W * H) {
    return {
      box_code: box.code,
      code: 'TOTAL_VOLUME',
      reason: 'Tổng thể tích hàng lớn hơn lòng thùng.',
    };
  }
  const totalWeight = units.reduce((sum, u) => sum + u.weight_g, 0);
  if (totalWeight > box.max_load_g) {
    return {
      box_code: box.code,
      code: 'TOTAL_WEIGHT',
      reason: 'Hàng nặng hơn tải tối đa của thùng.',
    };
  }
  for (const u of units) {
    if (!fitsSomeOrientation(u, box)) {
      return {
        box_code: box.code,
        code: 'ITEM_TOO_LARGE',
        item_key: u.item_key,
        reason: `Món ${u.item_key} không vừa thùng theo bất kỳ hướng cho phép nào.`,
      };
    }
  }
  return null;
}

/**
 * Xếp greedy vào MỘT thùng, bắt đầu từ thùng rỗng. Điểm thử = tích Descartes
 * các tọa độ {0, mặt cuối các món đã đặt} trên 3 trục, ưu tiên z → y → x
 * (đặt thấp trước), mỗi điểm thử các hướng cho phép theo thứ tự cố định.
 * Trả null nếu có món không đặt được (không trả phương án dở dang).
 * (Bản first-fit gốc — giữ để kết quả cũ không đổi; đơn lớn dùng ep-packer.)
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
            if (
              z > 0 &&
              !stackLoadsOk(
                units,
                [...placed, candidate],
                [...weights, unit.weight_g],
              )
            )
              continue;
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

function stackLoadsOk(
  units: PackingUnit[],
  placed: Placement[],
  weights: number[],
): boolean {
  const limits = new Map(
    units.map((u) => [u.item_key, u.is_fragile ? null : u.max_stack_load_g]),
  );
  const loads = computeLoadsOnTop(placed, weights);
  return placed.every((p, i) => {
    const load = loads[i] ?? 0;
    if (load <= 0) return true;
    const limit = limits.get(p.item_key) ?? null;
    return limit !== null && load <= limit;
  });
}

/** Cấu hình 1 lần thử xếp (multi-start): first-fit gốc hoặc extreme-point + chính sách. */
type Attempt =
  | { kind: 'legacy'; ordering: number }
  | { kind: 'ep'; ordering: number; policy: PlacementPolicy };

function attemptsFor(unitCount: number): Attempt[] {
  const attempts: Attempt[] = [];
  if (unitCount <= LEGACY_MAX_UNITS) {
    for (let o = 0; o < LEGACY_ORDERING_COUNT; o += 1)
      attempts.push({ kind: 'legacy', ordering: o });
  }
  for (const policy of EP_POLICIES) {
    for (let o = 0; o < UNIT_ORDERINGS.length; o += 1)
      attempts.push({ kind: 'ep', ordering: o, policy });
  }
  return attempts;
}

function runAttempt(
  attempt: Attempt,
  units: PackingUnit[],
  box: BoxSpec,
  checkDeadline: () => void,
): Placement[] | null {
  const orderFn = UNIT_ORDERINGS[attempt.ordering];
  if (!orderFn) return null;
  const ordered = orderFn(units);
  return attempt.kind === 'legacy'
    ? packIntoBox(units, box, checkDeadline, ordered)
    : packIntoBoxEP(ordered, box, checkDeadline, attempt.policy);
}

/**
 * Món này KHÔNG BAO GIỜ vào được thùng nào? (quá cỡ mọi hướng — kể cả sau khi
 * gập nếu gập được — hoặc nặng hơn tải mọi thùng). null = ít nhất 1 thùng
 * chứa được riêng món này.
 */
export function classifyUnfittable(
  u: PackingUnit,
  boxes: BoxSpec[],
): NoFitReason | null {
  const foldedToo =
    u.foldable === true && u.folded !== true ? foldUnit(u) : null;
  const fitsSize = boxes.some(
    (b) =>
      fitsSomeOrientation(u, b) ||
      (foldedToo !== null && fitsSomeOrientation(foldedToo, b)),
  );
  if (!fitsSize) {
    return {
      box_code: '-',
      code: 'ITEM_TOO_LARGE',
      item_key: u.item_key,
      reason: `Món ${u.sku} không vừa BẤT KỲ thùng nào trong danh mục (mọi hướng cho phép) — cần thùng lớn hơn hoặc xử lý tay.`,
    };
  }
  const maxLoad = Math.max(...boxes.map((b) => b.max_load_g));
  if (u.weight_g > maxLoad) {
    return {
      box_code: '-',
      code: 'ITEM_TOO_HEAVY',
      item_key: u.item_key,
      reason: `Món ${u.sku} nặng ${String(u.weight_g)} g, hơn tải tối đa của mọi thùng (${String(maxLoad)} g).`,
    };
  }
  return null;
}

/** Mỗi SKU một dòng lý do (tránh lặp hàng chục dòng cho cùng SKU). */
function analyzeUnfittable(
  units: PackingUnit[],
  boxes: BoxSpec[],
): NoFitReason[] {
  const reasons: NoFitReason[] = [];
  const reportedSku = new Set<string>();
  for (const u of units) {
    if (reportedSku.has(u.sku)) continue;
    const reason = classifyUnfittable(u, boxes);
    if (reason) {
      reportedSku.add(u.sku);
      reasons.push(reason);
    }
  }
  return reasons;
}

/** Sắp xếp `units` theo thứ tự multi-start số `index` (dùng cho điền thùng đa kiện). */
export function orderUnits(index: number, units: PackingUnit[]): PackingUnit[] {
  const fn = UNIT_ORDERINGS[index];
  return fn ? fn(units) : [...units];
}
/** Thứ tự "nền chịu tải trước, dễ vỡ sau cùng" — nền tảng cho điền thùng đa kiện. */
export const FRAGILE_LAST_ORDERING = 4;

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
  const wallMs = options.timeBudgetMs ?? SAFETY_WALL_CLOCK_MS;
  const elapsed = (): number => now() - startedAt;
  const shared = options.budget;
  const callCap = options.maxChecks ?? DEFAULT_MAX_CHECKS;
  const ownBudget = new CheckBudget(shared ? Math.min(callCap, shared.remaining) : callCap);
  const checksRemaining = (): number => ownBudget.remaining;
  const noFit = (
    reasons: NoFitReason[],
    suggest?: NoFitSuggestion,
  ): PackNoFit => {
    if (shared) shared.used += ownBudget.used;
    return {
      status: 'no_fit',
      reasons,
      ...(suggest !== undefined && { suggest }),
      proven_infeasible: isProvenInfeasible(reasons),
      computation_time_ms: elapsed(),
    };
  };

  if (units.length === 0) {
    return noFit([
      {
        box_code: '-',
        code: 'NO_ITEMS',
        reason: 'Không có món hàng nào để đóng gói.',
      },
    ]);
  }
  if (units.length > MAX_UNITS) {
    return noFit(
      [
        {
          box_code: '-',
          code: 'TOO_MANY_UNITS',
          reason: `Đơn có ${String(units.length)} món, vượt giới hạn ${String(MAX_UNITS)} món của 1 thùng.`,
        },
      ],
      'multi_carton',
    );
  }
  if (boxes.length === 0) {
    return noFit([
      {
        box_code: '-',
        code: 'NO_BOXES',
        reason: 'Danh mục chưa có thùng nào đang dùng.',
      },
    ]);
  }

  const unfittable = analyzeUnfittable(units, boxes);
  if (unfittable.length > 0) return noFit(unfittable, 'manual');

  const reasons: NoFitReason[] = [];
  let preferredOutOfStock: string | null = null;
  const variants = foldVariants(units);
  const attempts = attemptsFor(units.length);
  const orderedBoxes = sortBoxesByPreference(boxes);

  for (const [boxIndex, box] of orderedBoxes.entries()) {
    // Chia ngân sách (số lần kiểm tra) theo thùng còn lại: thùng nhỏ thất bại
    // lâu không được ăn hết phần của thùng lớn hơn phía sau.
    const remainingBoxes = orderedBoxes.length - boxIndex;
    const boxCap = Math.min(
      checksRemaining(),
      Math.max(500, Math.ceil((checksRemaining() / remainingBoxes) * 1.5)),
    );
    let boxChecks = 0;
    const checkDeadline = (): void => {
      boxChecks += 1;
      ownBudget.used += 1;
      if (boxChecks > boxCap) throw new DeadlineExceeded('budget');
      if (now() - startedAt > wallMs) throw new DeadlineExceeded('wall');
    };

    let found: { placements: Placement[]; units: PackingUnit[] } | null = null;
    let lastViolation: string | null = null;
    let lastReject: NoFitReason | null = null;
    try {
      for (const variant of variants) {
        const rejected = quickReject(variant, box);
        if (rejected) {
          lastReject = rejected;
          continue;
        }
        for (const attempt of attempts) {
          const placements = runAttempt(attempt, variant, box, checkDeadline);
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
        const wall = error.kind === 'wall';
        reasons.push({
          box_code: box.code,
          code: wall ? 'TIMEOUT' : 'BUDGET_EXHAUSTED',
          reason: wall
            ? `Hết thời gian tính (${String(wallMs)} ms).`
            : 'Hết ngân sách tính toán cho thùng này — CHƯA tìm được cách xếp (không có nghĩa là không xếp được).',
        });
        if (wall || ownBudget.exhausted) return noFit(reasons, 'multi_carton');
        continue;
      }
      throw error;
    }
    if (!found) {
      if (lastViolation) {
        reasons.push({
          box_code: box.code,
          code: 'NO_ARRANGEMENT',
          reason: `Validator loại: ${lastViolation}`,
        });
      } else if (lastReject) {
        reasons.push(lastReject);
      } else {
        reasons.push({
          box_code: box.code,
          code: 'NO_ARRANGEMENT',
          reason:
            'Không tìm được cách xếp đủ mọi món (đã thử nhiều thứ tự xếp).',
        });
      }
      continue;
    }
    if (
      options.availability &&
      (options.availability.get(box.code) ?? 0) <= 0
    ) {
      preferredOutOfStock ??= box.code;
      reasons.push({
        box_code: box.code,
        code: 'OUT_OF_STOCK',
        reason: 'Xếp vừa nhưng kho đã hết thùng này (tồn − đang giữ chỗ = 0).',
      });
      continue;
    }
    if (shared) shared.used += ownBudget.used;
    return buildOk(
      found.units,
      box,
      found.placements,
      elapsed(),
      options.volumetricDivisor,
      preferredOutOfStock,
      options.materials,
    );
  }

  // Gợi ý: có thùng xếp vừa nhưng kho hết → nhập thùng (không chia kiện);
  // không thùng nào xếp vừa → thử đa kiện.
  const fitsButOutOfStock = reasons.some((r) => r.code === 'OUT_OF_STOCK');
  return noFit(reasons, fitsButOutOfStock ? undefined : 'multi_carton');
}

/**
 * Các phương án gập thử cho 1 đơn, ÍT MÓN GẬP NHẤT TRƯỚC (gập chỉ khi cần).
 * Món gập được cùng SKU thành 1 nhóm (k món đầu của nhóm bị gập); thử mọi tổ
 * hợp số lượng gập theo từng nhóm, theo tổng số món gập tăng dần, nhóm có món
 * lớn hơn được ưu tiên gập trước. Giới hạn MAX_FOLD_VARIANTS để không nổ tổ hợp.
 */
export function foldVariants(units: PackingUnit[]): PackingUnit[][] {
  const groups = new Map<string, PackingUnit[]>();
  for (const u of units) {
    if (u.foldable === true && u.folded !== true) {
      const list = groups.get(u.sku) ?? [];
      list.push(u);
      groups.set(u.sku, list);
    }
  }
  const ordered = [...groups.values()]
    .map((list) => [...list].sort(byKey))
    .filter(
      (list): list is [PackingUnit, ...PackingUnit[]] => list[0] !== undefined,
    )
    .sort((a, b) => volume(b[0]) - volume(a[0]) || byKey(a[0], b[0]));

  const variants: PackingUnit[][] = [units];
  const totalFoldable = ordered.reduce((sum, g) => sum + g.length, 0);
  const seen = new Set<string>(['']);

  const build = (counts: number[]): PackingUnit[] => {
    const folded = new Set<string>();
    counts.forEach((k, gi) => {
      for (const u of (ordered[gi] ?? []).slice(0, k)) folded.add(u.item_key);
    });
    return units.map((u) => (folded.has(u.item_key) ? foldUnit(u) : u));
  };

  // Duyệt theo tổng số món gập t = 1..totalFoldable, sinh vector đếm theo nhóm.
  for (
    let t = 1;
    t <= totalFoldable && variants.length < MAX_FOLD_VARIANTS;
    t += 1
  ) {
    const walk = (gi: number, left: number, counts: number[]): void => {
      if (variants.length >= MAX_FOLD_VARIANTS) return;
      if (gi === ordered.length) {
        if (left !== 0) return;
        const key = counts.join(',');
        if (seen.has(key)) return;
        seen.add(key);
        variants.push(build(counts));
        return;
      }
      const cap = Math.min(left, (ordered[gi] ?? []).length);
      for (let k = cap; k >= 0; k -= 1) walk(gi + 1, left - k, [...counts, k]);
    };
    walk(0, t, []);
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
  materialPlanning?: MaterialPlanning,
): PackOk {
  const itemsWeight = units.reduce((sum, u) => sum + u.weight_g, 0);
  const itemsVolume = units.reduce((sum, u) => sum + volume(u), 0);
  const innerVolume =
    box.inner.length_mm * box.inner.width_mm * box.inner.height_mm;
  const outerCm3 =
    (box.outer.length_mm * box.outer.width_mm * box.outer.height_mm) / 1000;
  const fillRatio = itemsVolume / innerVolume;
  // (28/09/2026) Vật tư theo luật + danh mục (ước lượng, không vào hình học).
  const materials = materialPlanning
    ? selectMaterials(units, fillRatio, materialPlanning)
    : [];
  const materialsWeight = materials.reduce((sum, m) => sum + m.weight_g, 0);
  const materialsCost = materials.reduce((sum, m) => sum + m.cost_vnd, 0);
  return {
    status: 'ok',
    box,
    placements,
    fill_ratio: fillRatio,
    items_weight_g: itemsWeight,
    materials,
    materials_weight_g: materialsWeight,
    materials_cost_vnd: materialsCost,
    estimated_package_weight_g: itemsWeight + box.tare_g + materialsWeight,
    volumetric_weight_g: Math.ceil((outerCm3 / volumetricDivisor) * 1000),
    computation_time_ms: computationTimeMs,
    preferred_box_out_of_stock: preferredOutOfStock,
  };
}
