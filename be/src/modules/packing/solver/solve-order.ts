import { foldUnit, orientedDims } from '../../packaging/engine/units';
import { validateCandidate } from '../../packaging/engine/validator';
import { lowerBoundCartons } from '../../packaging/engine/lower-bound';
import { orderUnits } from '../../packaging/engine/greedy-packer';
import type { BoxSpec, PackingUnit } from '../../packaging/engine/types';
import { runBrkga, DEFAULT_BRKGA } from './brkga';
import { cheaper, decode, nKeys, type DecodeContext } from './decoder';
import {
  DEFAULT_VOLUMETRIC_DIVISOR,
  compareObjective,
  objectiveOf,
  summarizeParcel,
} from './objective';
import { hashString, mulberry32 } from './prng';
import { proveOptimality } from './proof';
import type {
  Objective,
  SolveOptions,
  SolveResult,
  SolveStrategy,
  SolvedParcel,
  UnplacedUnit,
  Variant,
} from './types';

/**
 * ===================================================================
 * Giải MỘT đơn: chọn số kiện, thùng, vị trí, hướng xoay, gập
 * ===================================================================
 *  1. Tách món không bao giờ xếp được (quá cỡ / quá nặng mọi thùng, hoặc chỉ
 *     vừa thùng đã hết tồn) — ghi lý do có mã.
 *  2. n ≤ 3: vét cạn không gian giải mã (mọi thứ tự × mọi lựa chọn biến thể
 *     × thiên lệch thùng). n > 3: BRKGA, quần thể đầu gieo sẵn các thứ tự
 *     xếp kinh nghiệm (thể tích giảm dần, nền chịu tải trước, …).
 *  3. Mọi kiện phải qua validator độc lập + kiểm cấp kế hoạch (mỗi món đúng
 *     1 lần, không dùng quá tồn). Sai = lỗi lập trình → ném lỗi, không lưu.
 *  4. Gắn nhãn chứng minh (proof.ts).
 * Xác định: seed mặc định băm từ nội dung đơn; ngân sách là số lần giải mã.
 * ===================================================================
 */

export const SOLVER_VERSION = 'brkga-ems-v1';
/** Đơn tới chừng này món thì vét cạn không gian giải mã. */
const EXHAUSTIVE_MAX_UNITS = 3;
const EXHAUSTIVE_MAX_EVALUATIONS = 20_000;

/** Ngân sách mặc định theo cỡ đơn (số lần giải mã) — hiệu chỉnh bằng benchmark. */
export function defaultEvaluations(n: number): number {
  if (n <= 8) return 4000;
  if (n <= 20) return 3000;
  if (n <= 60) return 1500;
  return 600;
}

/** Mọi cách đặt món: dạng gốc (+ dạng gập nếu gập được) × các hướng cho phép. */
export function variantsOf(unit: PackingUnit): Variant[] {
  const shapes = [unit];
  if (unit.foldable === true && unit.folded !== true) shapes.push(foldUnit(unit));
  const out: Variant[] = [];
  for (const shape of shapes) {
    for (const orientation of shape.orientations) {
      const [dx, dy, dz] = orientedDims(shape, orientation);
      out.push({ unit: shape, orientation, dx, dy, dz });
    }
  }
  return out;
}

function fitsBox(v: Variant, box: BoxSpec): boolean {
  return (
    v.dx <= box.inner.length_mm &&
    v.dy <= box.inner.width_mm &&
    v.dz <= box.inner.height_mm
  );
}

/** Thứ tự kinh nghiệm → khóa (hạng/n), biến thể/thùng = 0 (biến thể đầu, thùng lớn nhất). */
function seedFromOrder(order: PackingUnit[], units: PackingUnit[]): Float64Array {
  const n = units.length;
  const keys = new Float64Array(nKeys(n));
  const rank = new Map(order.map((u, i) => [u.item_key, i]));
  units.forEach((u, i) => {
    keys[i] = ((rank.get(u.item_key) ?? i) + 0.5) / n;
  });
  return keys;
}

interface Evaluated {
  parcels: SolvedParcel[];
  /** Chỉ số món (trong `units` của ngữ cảnh) chưa đặt được. */
  unplacedIdx: number[];
  objective: Objective;
}

function emptyObjective(unplaced: number): Objective {
  return objectiveOf([], unplaced);
}

/** Kiểm cấp kế hoạch: validator từng kiện + mỗi món đúng 1 lần + không vượt tồn. */
export function validatePlan(
  parcels: SolvedParcel[],
  expectedKeys: string[],
  stock?: Map<string, number>,
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const boxUse = new Map<string, number>();
  parcels.forEach((p, i) => {
    for (const v of validateCandidate(p.units, p.box, p.placements))
      problems.push(`Kiện ${String(i + 1)}: ${v.message}`);
    for (const q of p.placements) seen.set(q.item_key, (seen.get(q.item_key) ?? 0) + 1);
    boxUse.set(p.box.code, (boxUse.get(p.box.code) ?? 0) + 1);
  });
  for (const key of expectedKeys) {
    const c = seen.get(key) ?? 0;
    if (c !== 1) problems.push(`Món ${key} xuất hiện ${String(c)} lần.`);
  }
  for (const key of seen.keys())
    if (!expectedKeys.includes(key)) problems.push(`Món lạ ${key}.`);
  if (stock) {
    for (const [code, count] of boxUse)
      if (count > (stock.get(code) ?? 0))
        problems.push(`Dùng ${String(count)} thùng ${code} nhưng chỉ còn ${String(stock.get(code) ?? 0)}.`);
  }
  return problems;
}

export function solveOrder(
  allUnits: PackingUnit[],
  catalog: BoxSpec[],
  options: SolveOptions = {},
): SolveResult {
  const started = Date.now();
  const prefer = options.prefer ?? 'fewest_parcels';
  const excluded = new Set(options.excludeBoxCodes ?? []);
  const boxes = catalog.filter((b) => !excluded.has(b.code));
  const stock = options.availability;
  const inStock = (b: BoxSpec): boolean => !stock || (stock.get(b.code) ?? 0) > 0;

  // 1. Món không thể xếp.
  const unplaced: UnplacedUnit[] = [];
  const units: PackingUnit[] = [];
  const variants: Variant[][] = [];
  for (const u of allUnits) {
    const vs = variantsOf(u);
    const sizeOk = boxes.filter((b) => vs.some((v) => fitsBox(v, b)));
    const fitOk = sizeOk.filter((b) => u.weight_g <= b.max_load_g);
    if (sizeOk.length === 0) {
      unplaced.push({
        item_key: u.item_key,
        code: 'ITEM_TOO_LARGE',
        reason: `Món ${u.sku} không vừa bất kỳ thùng nào được phép (mọi hướng, kể cả khi gập).`,
      });
    } else if (fitOk.length === 0) {
      unplaced.push({
        item_key: u.item_key,
        code: 'ITEM_TOO_HEAVY',
        reason: `Món ${u.sku} nặng ${String(u.weight_g)} g, hơn tải mọi thùng vừa cỡ.`,
      });
    } else if (!fitOk.some(inStock)) {
      unplaced.push({
        item_key: u.item_key,
        code: 'OUT_OF_STOCK',
        reason: `Món ${u.sku} chỉ vừa thùng ${fitOk.map((b) => b.code).join(', ')} nhưng kho đã hết.`,
      });
    } else {
      units.push(u);
      // Chỉ giữ biến thể vừa ít nhất một thùng (bớt nhánh vô ích).
      variants.push(vs.filter((v) => boxes.some((b) => fitsBox(v, b))));
    }
  }

  const n = units.length;
  const lowerBound = lowerBoundCartons(units, boxes);
  if (n === 0) {
    return {
      status: unplaced.length > 0 ? 'no_fit' : 'ok',
      parcels: [],
      unplaced,
      lower_bound_parcels: 0,
      proof: 'heuristic',
      strategy: 'exhaustive',
      objective: emptyObjective(unplaced.length),
      explanation: [],
      open_candidates: [],
      stats: { evaluations: 0, generations: 0, computation_ms: Date.now() - started },
    };
  }

  const minDim = Math.min(
    ...variants.flat().map((v) => Math.min(v.dx, v.dy, v.dz)),
  );
  const ctx: DecodeContext = {
    units,
    variants,
    boxesBySizeDesc: [...boxes].sort(
      (a, b) =>
        b.inner.length_mm * b.inner.width_mm * b.inner.height_mm -
          a.inner.length_mm * a.inner.width_mm * a.inner.height_mm ||
        a.code.localeCompare(b.code),
    ),
    boxesByCostAsc: [...boxes].sort((a, b) =>
      cheaper(a, b) ? -1 : cheaper(b, a) ? 1 : a.code.localeCompare(b.code),
    ),
    stock,
    minDim,
  };

  const divisor = options.volumetricDivisor ?? DEFAULT_VOLUMETRIC_DIVISOR;
  const evaluateWith = (c: DecodeContext) => (keys: Float64Array): Evaluated => {
    const decoded = decode(keys, c);
    const parcels = decoded.parcels.map((s) =>
      summarizeParcel(s, options.materials, divisor),
    );
    return {
      parcels,
      unplacedIdx: decoded.unplaced,
      objective: objectiveOf(parcels, decoded.unplaced.length),
    };
  };
  const evaluate = evaluateWith(ctx);
  const compare = (a: Evaluated, b: Evaluated): number =>
    compareObjective(a.objective, b.objective, prefer);

  const seed =
    options.seed ?? hashString(units.map((u) => u.item_key).join('|'));
  const rand = mulberry32(seed);

  // 2. Vét cạn (n ≤ 3) hoặc BRKGA.
  let best: Evaluated | null = null;
  let strategy: SolveStrategy = 'brkga';
  let evaluations = 0;
  let generations = 0;

  if (n <= EXHAUSTIVE_MAX_UNITS) {
    const result = exhaustive(n, ctx, evaluate, compare);
    if (result) {
      best = result.best;
      evaluations = result.evaluations;
      strategy = 'exhaustive';
    }
  }
  if (!best) {
    const seeds: Float64Array[] = [];
    for (let o = 0; o < 7; o += 1) seeds.push(seedFromOrder(orderUnits(o, units), units));
    const brkga = runBrkga<Evaluated>(
      nKeys(n),
      evaluate,
      compare,
      {
        ...DEFAULT_BRKGA,
        populationSize: Math.min(120, Math.max(40, 10 * n)),
        maxEvaluations: options.maxEvaluations ?? defaultEvaluations(n),
      },
      rand,
      seeds,
      (b) => b.objective.unplaced === 0 && b.objective.parcels <= lowerBound && n <= 3,
    );
    best = brkga.value;
    evaluations = brkga.evaluations;
    generations = brkga.generations;
  }

  // 2b. Gộp cặp kiện: giải lại hợp của 2 kiện bằng BRKGA nhỏ, nhận nếu cả kế
  // hoạch tốt hơn (ít kiện hơn hoặc rẻ hơn). Bù cho điểm yếu first-fit của bộ
  // giải mã khi kiện cuối chỉ có vài món.
  if (best.unplacedIdx.length === 0 && best.parcels.length >= 2) {
    const merged = mergeParcels(best, units, variants, ctx, evaluateWith, compare, seed);
    best = merged.best;
    evaluations += merged.evaluations;
  }

  // Món còn lại không đặt được (thường do hết tồn giữa chừng).
  for (const i of best.unplacedIdx) {
    const u = units[i];
    if (u)
      unplaced.push({
        item_key: u.item_key,
        code: 'OUT_OF_STOCK',
        reason: `Không còn thùng trong kho đủ chỗ cho món ${u.sku}.`,
      });
  }

  // 3. Validator độc lập — sai là lỗi lập trình, không được lưu.
  const placedKeys = units
    .filter((_u, i) => !best.unplacedIdx.includes(i))
    .map((u) => u.item_key);
  const problems = validatePlan(best.parcels, placedKeys, stock);
  if (problems.length > 0) {
    throw new Error(`Bộ giải trả phương án sai luật: ${problems.slice(0, 3).join(' | ')}`);
  }

  // 4. Chứng minh (chỉ khi xếp đủ mọi món).
  // Chứng minh chỉ áp cho mục tiêu "ít kiện trước" và khi đã xếp đủ mọi món.
  const proof =
    unplaced.length === 0 && prefer === 'fewest_parcels'
      ? proveOptimality(units, variants, boxes, stock, best.parcels, lowerBound)
      : {
          label: 'heuristic' as const,
          explanation:
            prefer === 'cheapest'
              ? ['Chế độ ưu tiên rẻ nhất: không chạy phần chứng minh tối ưu.']
              : [],
          openCandidates: [] as BoxSpec[][],
        };

  const placedCount = best.parcels.reduce((s, p) => s + p.placements.length, 0);
  return {
    status:
      unplaced.length === 0 ? 'ok' : placedCount > 0 ? 'partial' : 'no_fit',
    parcels: best.parcels,
    unplaced,
    lower_bound_parcels: lowerBound,
    proof: proof.label,
    strategy,
    objective: { ...best.objective, unplaced: unplaced.length },
    explanation: proof.explanation,
    open_candidates: proof.openCandidates,
    stats: {
      evaluations,
      generations,
      computation_ms: Date.now() - started,
    },
  };
}

/**
 * Vét cạn không gian giải mã cho đơn rất nhỏ: mọi hoán vị thứ tự × lưới gen
 * biến thể (đủ mịn để chạm mọi lựa chọn) × lưới gen thùng. null nếu vượt trần.
 */
function exhaustive<E>(
  n: number,
  ctx: DecodeContext,
  evaluate: (keys: Float64Array) => E,
  compare: (a: E, b: E) => number,
): { best: E; evaluations: number } | null {
  const variantGrid = Math.max(...ctx.variants.map((v) => v.length), 1);
  const boxGrid = Math.max(1, ctx.boxesBySizeDesc.length);
  const perms: number[][] = [];
  const permute = (rest: number[], acc: number[]): void => {
    if (rest.length === 0) {
      perms.push(acc);
      return;
    }
    rest.forEach((x, i) => {
      permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]);
    });
  };
  permute(Array.from({ length: n }, (_, i) => i), []);
  const total = perms.length * variantGrid ** n * boxGrid;
  if (total > EXHAUSTIVE_MAX_EVALUATIONS) return null;

  // Giữ kết quả trong object: TS không theo dõi phép gán bên trong hàm lồng.
  const acc: { best: E | null; evaluations: number } = { best: null, evaluations: 0 };
  const keys = new Float64Array(nKeys(n));
  const choice = new Array<number>(n).fill(0);
  for (const perm of perms) {
    perm.forEach((unitIndex, rank) => {
      keys[unitIndex] = (rank + 0.5) / n;
    });
    const walk = (d: number): void => {
      if (d === n) {
        for (let b = 0; b < boxGrid; b += 1) {
          for (let i = 0; i < n; i += 1) keys[n + i] = ((choice[i] ?? 0) + 0.5) / variantGrid;
          // Gen thùng dùng bình phương trong decoder → lấy căn để phủ đều các thùng.
          keys[2 * n] = Math.sqrt((b + 0.5) / boxGrid);
          const value = evaluate(Float64Array.from(keys));
          acc.evaluations += 1;
          if (acc.best === null || compare(value, acc.best) < 0) acc.best = value;
        }
        return;
      }
      for (let c = 0; c < variantGrid; c += 1) {
        choice[d] = c;
        walk(d + 1);
      }
    };
    walk(0);
  }
  return acc.best === null ? null : { best: acc.best, evaluations: acc.evaluations };
}

/** Trần số lần giải mã cho bước gộp cặp kiện (cả đơn). */
const MERGE_MAX_EVALUATIONS = 3000;
/** Ngân sách BRKGA nhỏ cho MỖI lần giải lại một cặp kiện. */
const MERGE_PAIR_EVALUATIONS = 400;

/**
 * Gộp cặp kiện: lấy kiện vơi nhất, lần lượt giải lại hợp của nó với từng kiện
 * khác bằng một BRKGA nhỏ (cùng bộ giải mã, cùng validator), nhận khi cả kế
 * hoạch tốt hơn theo mục tiêu bậc. Lặp tới khi không cải thiện hoặc hết ngân sách.
 */
function mergeParcels(
  start: Evaluated,
  units: PackingUnit[],
  variants: Variant[][],
  ctx: DecodeContext,
  evaluateWith: (c: DecodeContext) => (keys: Float64Array) => Evaluated,
  compare: (a: Evaluated, b: Evaluated) => number,
  seed: number,
): { best: Evaluated; evaluations: number } {
  const keyIndex = new Map(units.map((u, i) => [u.item_key, i]));
  let best = start;
  let evaluations = 0;
  let round = 0;
  let improved = true;
  while (improved && best.parcels.length >= 2 && evaluations < MERGE_MAX_EVALUATIONS) {
    improved = false;
    const current = best;
    const order = current.parcels
      .map((p, i) => ({ i, fill: p.fill_ratio }))
      .sort((a, b) => a.fill - b.fill || a.i - b.i)
      .map((x) => x.i);
    const least = order[0];
    if (least === undefined) break;
    for (const other of order.slice(1)) {
      if (evaluations >= MERGE_MAX_EVALUATIONS) break;
      const pair = [current.parcels[least], current.parcels[other]];
      const idxs = pair
        .flatMap((p) => p?.placements.map((q) => keyIndex.get(q.item_key)) ?? [])
        .filter((i): i is number => i !== undefined)
        .sort((a, b) => a - b);
      const rest = current.parcels.filter((_p, i) => i !== least && i !== other);
      let stock: Map<string, number> | undefined;
      if (ctx.stock) {
        stock = new Map(ctx.stock);
        for (const p of rest) stock.set(p.box.code, (stock.get(p.box.code) ?? 0) - 1);
      }
      const subUnits = idxs.map((i) => units[i]).filter((u): u is PackingUnit => u !== undefined);
      const subCtx: DecodeContext = {
        ...ctx,
        units: subUnits,
        variants: idxs.map((i) => variants[i] ?? []),
        stock,
      };
      const seeds: Float64Array[] = [];
      for (let o = 0; o < 7; o += 1) seeds.push(seedFromOrder(orderUnits(o, subUnits), subUnits));
      round += 1;
      const sub = runBrkga<Evaluated>(
        nKeys(subUnits.length),
        evaluateWith(subCtx),
        compare,
        {
          ...DEFAULT_BRKGA,
          populationSize: 30,
          stallGenerations: 10,
          maxEvaluations: Math.min(MERGE_PAIR_EVALUATIONS, MERGE_MAX_EVALUATIONS - evaluations),
        },
        mulberry32((seed ^ Math.imul(round, 0x9e3779b1)) >>> 0),
        seeds,
      );
      evaluations += sub.evaluations;
      if (sub.value.unplacedIdx.length > 0) continue;
      const parcels = [...rest, ...sub.value.parcels];
      const candidate: Evaluated = {
        parcels,
        unplacedIdx: [],
        objective: objectiveOf(parcels, 0),
      };
      if (compare(candidate, current) < 0) {
        best = candidate;
        improved = true;
        break;
      }
    }
  }
  return { best, evaluations };
}
