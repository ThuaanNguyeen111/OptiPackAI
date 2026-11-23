import { foldUnit } from '../../packaging/engine/units';
import {
  DEFAULT_MAILER_FIT,
  filledMailerDims,
  mailerFits,
  stackOf,
  stackPlacements,
  type MailerFitOptions,
  type MailerStack,
} from '../../packaging/engine/mailer-fit';
import type { BoxSpec, MailerSpec, MaterialPlanning, PackingUnit } from '../../packaging/engine/types';
import {
  compareObjective,
  DEFAULT_CHARGE_RULE,
  DEFAULT_FEE_ESTIMATE,
  estimateFeeVnd,
  objectiveOf,
  summarizePlacements,
  type ChargeRule,
} from './objective';
import { solveOrder } from './solve-order';
import type { FeeEstimate, FillHint, SolveOptions, SolveResult, SolvedParcel } from './types';

export { DEFAULT_FEE_ESTIMATE, estimateFeeVnd, type FeeEstimate };

/**
 * ===================================================================
 * Túi niêm phong trong bộ giải (AOFP-224, 31/10/2026) — hàm thuần
 * ===================================================================
 * docs/PACKAGING_STANDARD.md §4 + §6. Bộ giải 3D vẫn chỉ xếp THÙNG; hàm này
 * bọc ngoài, sinh thêm phương án túi niêm phong cho các món `mailer_ok` rồi
 * chọn:
 *  - Đơn toàn hàng mềm: so phương án túi với phương án thùng bằng
 *    `compareObjective` (số kiện → bậc cước → giá bao bì).
 *  - Đơn trộn mềm + cứng: phương án TÁCH (thùng cho hàng cứng + túi cho hàng
 *    mềm) chỉ thắng khi tổng chi phí ước tính rẻ hơn ít nhất
 *    `splitMinSavingVnd` — mặc định nghiêng về 1 kiện (khách nhận nhiều kiện
 *    rời dễ tưởng thiếu hàng).
 * Túi không dùng vật tư chèn (§7) và không qua CP-SAT (không có tổ hợp mở).
 * ===================================================================
 */

/** Cước ước tính theo bậc cân tính cước — chỉ để so phương án tách/gộp (giả định, packing_settings). */
export interface MailerSolveOptions {
  mailers: MailerSpec[];
  fit?: MailerFitOptions;
  splitMinSavingVnd?: number;
  fee?: FeeEstimate;
}

export const DEFAULT_SPLIT_MIN_SAVING_VND = 5000;
/** Tổng chi phí ước tính = cước theo bậc + bao bì + vật tư. */
export function estimateTotalVnd(parcels: SolvedParcel[], charge: ChargeRule, fee: FeeEstimate): number {
  return parcels.reduce(
    (s, p) =>
      s +
      estimateFeeVnd(p.billable_weight_g, charge.billingStepG, fee) +
      (p.box.price_vnd ?? 0) +
      p.materials_cost_vnd,
    0,
  );
}

function mailerAsBox(mailer: MailerSpec, stack: MailerStack): BoxSpec {
  const dims = filledMailerDims(stack);
  return {
    code: mailer.code,
    name: mailer.name,
    kind: 'mailer',
    inner: { ...dims },
    outer: { ...dims },
    tare_g: mailer.tare_g,
    max_load_g: mailer.max_load_g,
    price_vnd: mailer.price_vnd,
  };
}

/**
 * Túi niêm phong không lấp khoảng trống (§7) — chỉ giữ luật giấy pelure (lớp sản
 * phẩm của đầm/túi xách).
 */
function mailerMaterials(planning: MaterialPlanning | undefined): MaterialPlanning | undefined {
  if (!planning) return undefined;
  return { ...planning, rules: planning.rules.filter((r) => r.material_type === 'tissue_paper') };
}

function mailerParcel(
  mailer: MailerSpec,
  stack: MailerStack,
  charge: ChargeRule,
  materials: MaterialPlanning | undefined,
  fee: FeeEstimate,
): SolvedParcel {
  const placements = stackPlacements(stack);
  return summarizePlacements(
    mailerAsBox(mailer, stack),
    stack.items.map((f) => f.unit),
    placements,
    mailerMaterials(materials),
    charge,
    fee,
  );
}

/** Túi tốt nhất cho 1 chồng: bậc cước thấp nhất, rồi giá túi, rồi túi nhỏ hơn. */
function bestMailerFor(
  stack: MailerStack,
  mailers: MailerSpec[],
  fit: MailerFitOptions,
  charge: ChargeRule,
  stockLeft: (code: string) => number,
  materials: MaterialPlanning | undefined,
  fee: FeeEstimate,
): SolvedParcel | null {
  let best: SolvedParcel | null = null;
  // Duyệt từ túi nhỏ → lớn; chỉ thay khi TỐT HƠN hẳn nên hòa thì giữ túi nhỏ.
  const bySize = [...mailers].sort(
    (p, q) => p.width_mm * p.length_mm - q.width_mm * q.length_mm || p.code.localeCompare(q.code),
  );
  for (const m of bySize) {
    if (stockLeft(m.code) <= 0 || !mailerFits(stack, m, fit)) continue;
    const parcel = mailerParcel(m, stack, charge, materials, fee);
    const price = parcel.box.price_vnd ?? 0;
    if (
      best === null ||
      parcel.billable_weight_g < best.billable_weight_g ||
      (parcel.billable_weight_g === best.billable_weight_g && price < (best.box.price_vnd ?? 0))
    ) {
      best = parcel;
    }
  }
  return best;
}

/** Dạng gập đôi nếu món được gập; không thì giữ nguyên. */
const foldedIfAllowed = (u: PackingUnit): PackingUnit => (u.foldable === true ? foldUnit(u) : u);

/**
 * Xếp các món mềm vào túi niêm phong. Thử 1 túi cho cả chồng (nguyên dạng và
 * dạng gập đôi các món gập được), không vừa thì chia chồng theo first-fit
 * giảm dần vào túi lớn nhất rồi chọn lại túi vừa nhất cho từng chồng.
 * null = có món không vừa túi nào (hoặc hết túi) → không có phương án túi.
 */
export function packIntoMailers(
  units: PackingUnit[],
  mailers: MailerSpec[],
  options: {
    fit?: MailerFitOptions;
    charge?: ChargeRule;
    availability?: Map<string, number>;
    materials?: MaterialPlanning;
    fee?: FeeEstimate;
  } = {},
): SolvedParcel[] | null {
  if (units.length === 0 || mailers.length === 0) return null;
  const fit = options.fit ?? DEFAULT_MAILER_FIT;
  const charge = options.charge ?? DEFAULT_CHARGE_RULE;
  const fee = options.fee ?? DEFAULT_FEE_ESTIMATE;
  const used = new Map<string, number>();
  const stockLeft = (code: string): number =>
    options.availability ? (options.availability.get(code) ?? 0) - (used.get(code) ?? 0) : Number.POSITIVE_INFINITY;

  // 1 túi cho cả chồng.
  const singles = [units, units.map(foldedIfAllowed)]
    .map((us) => bestMailerFor(stackOf(us), mailers, fit, charge, stockLeft, options.materials, fee))
    .filter((p): p is SolvedParcel => p !== null)
    .sort((p, q) => compareObjective(objectiveOf([p], 0), objectiveOf([q], 0)));
  const [single] = singles;
  if (single) return [single];

  // Chia chồng: first-fit giảm dần theo diện tích đáy vào túi LỚN nhất.
  const largest = [...mailers].sort((p, q) => q.width_mm * q.length_mm - p.width_mm * p.length_mm)[0];
  if (!largest) return null;
  const sorted = [...units].sort(
    (p, q) => q.length_mm * q.width_mm - p.length_mm * p.width_mm || p.item_key.localeCompare(q.item_key),
  );
  const bins: PackingUnit[][] = [];
  for (const u of sorted) {
    const target = bins.find((bin) => mailerFits(stackOf([...bin, u]), largest, fit));
    if (target) {
      target.push(u);
      continue;
    }
    const alone = [u, foldedIfAllowed(u)].find((v) => mailerFits(stackOf([v]), largest, fit));
    if (!alone) return null;
    bins.push([alone]);
  }
  const parcels: SolvedParcel[] = [];
  for (const bin of bins) {
    const parcel = bestMailerFor(stackOf(bin), mailers, fit, charge, stockLeft, options.materials, fee);
    if (!parcel) return null;
    used.set(parcel.box.code, (used.get(parcel.box.code) ?? 0) + 1);
    parcels.push(parcel);
  }
  return parcels;
}

function resultOf(base: SolveResult, parcels: SolvedParcel[], explanation: string[]): SolveResult {
  return {
    status: 'ok',
    parcels,
    unplaced: [],
    lower_bound_parcels: Math.min(base.lower_bound_parcels, parcels.length),
    proof: 'heuristic',
    strategy: base.strategy,
    objective: objectiveOf(parcels, 0),
    explanation,
    open_candidates: [],
    stats: base.stats,
  };
}

const vnd = (n: number): string => `${Math.round(n).toLocaleString('vi-VN')}đ`;

/** (13/11/2026, user chốt) Mục tiêu lấp đầy — chỉ cảnh báo kèm lý do, không ràng buộc cứng. */
export const FILL_TARGET = 0.8;

/** Ngân sách giải mã khi thử thùng gợi ý — kiện thường ít món, không cần nhiều. */
const HINT_EVALUATIONS = 400;

const ceilCm = (mm: number): number => Math.ceil(mm / 10) * 10;

/**
 * (17/11/2026) Cỡ lòng thùng nhỏ nhất xếp vừa CẢ kiện: thử khối bao của cách xếp hiện tại
 * và cách chồng các món lên nhau (đáy = món rộng nhất, cao = tổng chiều cao), làm tròn lên
 * cm, nhỏ trước; mỗi cỡ được giải lại thật nên luôn đúng luật đỡ / xếp chồng / dễ vỡ.
 * null = không cỡ nào nhỏ hơn thùng đang dùng.
 */
export function tightestInner(p: SolvedParcel, options: SolveOptions): FillHint | null {
  const q = p.placements;
  const max = (f: (x: (typeof q)[number]) => number): number => Math.max(...q.map(f));
  const candidates: [number, number, number][] = [
    [max((x) => x.x + x.dx), max((x) => x.y + x.dy), max((x) => x.z + x.dz)],
    [max((x) => x.dx), max((x) => x.dy), q.reduce((s, x) => s + x.dz, 0)],
  ].map((d) => d.map(ceilCm) as [number, number, number]);
  const current = p.box.inner.length_mm * p.box.inner.width_mm * p.box.inner.height_mm;
  const itemsMm3 = q.reduce((s, x) => s + x.dx * x.dy * x.dz, 0);
  candidates.sort((a, b) => a[0] * a[1] * a[2] - b[0] * b[1] * b[2]);
  for (const [l, w, h] of candidates) {
    if (l * w * h >= current) continue;
    const inner = { length_mm: l, width_mm: w, height_mm: h };
    const box: BoxSpec = {
      code: 'HINT',
      name: 'Thùng gợi ý',
      kind: 'box',
      inner,
      outer: { length_mm: l + 6, width_mm: w + 6, height_mm: h + 6 },
      tare_g: 0,
      max_load_g: p.box.max_load_g,
      price_vnd: 0,
    };
    const solved = solveOrder(p.units, [box], {
      ...options,
      availability: undefined,
      excludeBoxCodes: undefined,
      maxEvaluations: HINT_EVALUATIONS,
    });
    if (solved.status === 'ok' && solved.parcels.length === 1) {
      return { suggest_inner_mm: inner, suggest_fill: itemsMm3 / (l * w * h) };
    }
  }
  return null;
}

/**
 * Kiện lấp đầy dưới mục tiêu: câu giải thích (vì sao + cách khắc phục) và gợi ý cỡ thùng
 * gắn lên kiện để FE hiển thị.
 */
function withFillNotes(
  parcels: SolvedParcel[],
  hasMailers: boolean,
  options: SolveOptions,
): { parcels: SolvedParcel[]; notes: string[] } {
  const notes: string[] = [];
  const target = `${String(Math.round(FILL_TARGET * 100))}%`;
  const out = parcels.map((p, i) => {
    // Túi niêm phong ôm sát hàng — mục tiêu lấp đầy chỉ áp cho thùng.
    if (p.box.kind === 'mailer' || p.fill_ratio >= FILL_TARGET) return p;
    const head = `Kiện ${String(i + 1)} (${p.box.code}) lấp đầy ${String(Math.round(p.fill_ratio * 100))}% < ${target}`;
    if (!hasMailers && p.units.every((u) => u.mailer_ok === true)) {
      notes.push(`${head}: kho chưa có túi niêm phong nên hàng mềm phải vào thùng — nhập túi để kiện ôm sát hàng.`);
      return p;
    }
    const hint = tightestInner(p, options);
    if (!hint) {
      notes.push(`${head}: không xếp được vào thùng nào nhỏ hơn — đây đã là thùng sát nhất có thể cho kiện này.`);
      return p;
    }
    const { length_mm: l, width_mm: w, height_mm: h } = hint.suggest_inner_mm;
    notes.push(
      `${head}: danh mục không có thùng nhỏ hơn chứa vừa kiện. Thùng nhỏ nhất xếp vừa có lòng ` +
        `${String(l / 10)}×${String(w / 10)}×${String(h / 10)} cm (đầy ${String(Math.round(hint.suggest_fill * 100))}%) — nên nhập thêm thùng cỡ này.`,
    );
    return { ...p, fill_hint: hint };
  });
  return { parcels: out, notes };
}

/**
 * Giải 1 đơn có xét túi niêm phong. Không có túi / không có món mềm → đúng kết
 * quả `solveOrder` (hành vi cũ). Kiện lấp đầy < FILL_TARGET được ghi lý do vào `explanation`.
 */
export function solveWithMailers(
  units: PackingUnit[],
  boxes: BoxSpec[],
  options: SolveOptions,
  mailerOptions: MailerSolveOptions,
): SolveResult {
  const result = solveWithMailersCore(units, boxes, options, mailerOptions);
  return withFreshFillNotes(result, mailerOptions.mailers.length > 0, options);
}

/** Câu do `withFillNotes` viết ("Kiện N (MÃ) lấp đầy X% < 80%…") — để gỡ khi kiện đổi. */
export const isFillNote = (line: string): boolean => /^Kiện \d+ \(.+?\) lấp đầy \d+% < \d+%/.test(line);

/**
 * (19/11/2026) Gỡ câu lấp đầy + gợi ý cũ rồi tính lại theo các kiện hiện tại — dùng khi
 * CP-SAT thay kiện, để câu chữ và `fill_hint` khớp với thùng thật đang dùng.
 */
export function withFreshFillNotes(result: SolveResult, hasMailers: boolean, options: SolveOptions): SolveResult {
  const bare = result.parcels.map((p) => ({ ...p, fill_hint: undefined }));
  const { parcels, notes } = withFillNotes(bare, hasMailers, options);
  return { ...result, parcels, explanation: [...result.explanation.filter((l) => !isFillNote(l)), ...notes] };
}

function solveWithMailersCore(
  units: PackingUnit[],
  boxes: BoxSpec[],
  options: SolveOptions,
  mailerOptions: MailerSolveOptions,
): SolveResult {
  const fee = mailerOptions.fee ?? options.fee ?? DEFAULT_FEE_ESTIMATE;
  options = { ...options, fee };
  const boxResult = solveOrder(units, boxes, options);
  const soft = units.filter((u) => u.mailer_ok === true);
  if (mailerOptions.mailers.length === 0 || soft.length === 0) return boxResult;

  const charge = options.charge ?? DEFAULT_CHARGE_RULE;
  const prefer = options.prefer ?? 'fewest_parcels';
  const softParcels = packIntoMailers(soft, mailerOptions.mailers, {
    fit: mailerOptions.fit,
    charge,
    availability: options.availability,
    materials: options.materials,
    fee,
  });
  if (!softParcels) return boxResult;
  const mailerCodes = softParcels.map((p) => p.box.code).join(', ');

  const hard = units.filter((u) => u.mailer_ok !== true);
  if (hard.length === 0) {
    const candidate = resultOf(boxResult, softParcels, [
      `Toàn bộ hàng mềm (đi túi niêm phong được) → túi ${mailerCodes} thay cho thùng (PACKAGING_STANDARD §4).`,
    ]);
    const better =
      boxResult.unplaced.length > 0 || compareObjective(candidate.objective, boxResult.objective, prefer) <= 0;
    if (!better) {
      return {
        ...boxResult,
        explanation: [
          ...boxResult.explanation,
          `Đã xét túi niêm phong ${mailerCodes} nhưng phương án thùng tốt hơn (số kiện / bậc cước / giá bao bì).`,
        ],
      };
    }
    return candidate;
  }

  // Đơn trộn: tách hàng cứng vào thùng + hàng mềm vào túi.
  const hardStock = options.availability ? new Map(options.availability) : undefined;
  const hardResult = solveOrder(hard, boxes, { ...options, availability: hardStock });
  if (hardResult.unplaced.length > 0) return boxResult;
  const splitParcels = [...hardResult.parcels, ...softParcels];
  const splitCost = estimateTotalVnd(splitParcels, charge, fee);
  const minSaving = mailerOptions.splitMinSavingVnd ?? DEFAULT_SPLIT_MIN_SAVING_VND;
  if (boxResult.unplaced.length === 0) {
    const together = estimateTotalVnd(boxResult.parcels, charge, fee);
    if (splitCost > together - minSaving) {
      return {
        ...boxResult,
        explanation: [
          ...boxResult.explanation,
          `Tách hàng mềm ra túi ${mailerCodes} ước tính ${vnd(splitCost)}, gộp chung thùng ${vnd(together)} — ` +
            `tiết kiệm chưa tới ${vnd(minSaving)} nên giữ ít kiện (PACKAGING_STANDARD §6).`,
        ],
      };
    }
    return resultOf(hardResult, splitParcels, [
      ...hardResult.explanation,
      `Tách hàng mềm ra túi ${mailerCodes}: ước tính ${vnd(splitCost)} so với ${vnd(together)} khi gộp chung thùng ` +
        `(rẻ hơn ≥ ${vnd(minSaving)}, PACKAGING_STANDARD §6).`,
    ]);
  }
  return resultOf(hardResult, splitParcels, [
    ...hardResult.explanation,
    `Không xếp hết vào thùng — hàng mềm đi túi ${mailerCodes}.`,
  ]);
}
