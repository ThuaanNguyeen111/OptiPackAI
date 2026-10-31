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
import type { BoxSpec, MailerSpec, PackingUnit } from '../../packaging/engine/types';
import {
  compareObjective,
  DEFAULT_CHARGE_RULE,
  objectiveOf,
  summarizePlacements,
  type ChargeRule,
} from './objective';
import { solveOrder } from './solve-order';
import type { SolveOptions, SolveResult, SolvedParcel } from './types';

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
export interface FeeEstimate {
  firstStepVnd: number;
  perExtraStepVnd: number;
}

export interface MailerSolveOptions {
  mailers: MailerSpec[];
  fit?: MailerFitOptions;
  splitMinSavingVnd?: number;
  fee?: FeeEstimate;
}

export const DEFAULT_SPLIT_MIN_SAVING_VND = 5000;
export const DEFAULT_FEE_ESTIMATE: FeeEstimate = { firstStepVnd: 22000, perExtraStepVnd: 2500 };

/** Cước ước tính 1 kiện: bậc đầu + mỗi bậc thêm. */
export function estimateFeeVnd(billableG: number, stepG: number, fee: FeeEstimate): number {
  const steps = stepG > 0 ? Math.max(1, Math.ceil(billableG / stepG)) : 1;
  return fee.firstStepVnd + (steps - 1) * fee.perExtraStepVnd;
}

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

function mailerParcel(mailer: MailerSpec, stack: MailerStack, charge: ChargeRule): SolvedParcel {
  const placements = stackPlacements(stack);
  return summarizePlacements(
    mailerAsBox(mailer, stack),
    stack.items.map((f) => f.unit),
    placements,
    undefined,
    charge,
  );
}

/** Túi tốt nhất cho 1 chồng: bậc cước thấp nhất, rồi giá túi, rồi túi nhỏ hơn. */
function bestMailerFor(
  stack: MailerStack,
  mailers: MailerSpec[],
  fit: MailerFitOptions,
  charge: ChargeRule,
  stockLeft: (code: string) => number,
): SolvedParcel | null {
  let best: SolvedParcel | null = null;
  // Duyệt từ túi nhỏ → lớn; chỉ thay khi TỐT HƠN hẳn nên hòa thì giữ túi nhỏ.
  const bySize = [...mailers].sort(
    (p, q) => p.width_mm * p.length_mm - q.width_mm * q.length_mm || p.code.localeCompare(q.code),
  );
  for (const m of bySize) {
    if (stockLeft(m.code) <= 0 || !mailerFits(stack, m, fit)) continue;
    const parcel = mailerParcel(m, stack, charge);
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
  options: { fit?: MailerFitOptions; charge?: ChargeRule; availability?: Map<string, number> } = {},
): SolvedParcel[] | null {
  if (units.length === 0 || mailers.length === 0) return null;
  const fit = options.fit ?? DEFAULT_MAILER_FIT;
  const charge = options.charge ?? DEFAULT_CHARGE_RULE;
  const used = new Map<string, number>();
  const stockLeft = (code: string): number =>
    options.availability ? (options.availability.get(code) ?? 0) - (used.get(code) ?? 0) : Number.POSITIVE_INFINITY;

  // 1 túi cho cả chồng.
  const singles = [units, units.map(foldedIfAllowed)]
    .map((us) => bestMailerFor(stackOf(us), mailers, fit, charge, stockLeft))
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
    const parcel = bestMailerFor(stackOf(bin), mailers, fit, charge, stockLeft);
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

/**
 * Giải 1 đơn có xét túi niêm phong. Không có túi / không có món mềm → đúng kết
 * quả `solveOrder` (hành vi cũ).
 */
export function solveWithMailers(
  units: PackingUnit[],
  boxes: BoxSpec[],
  options: SolveOptions,
  mailerOptions: MailerSolveOptions,
): SolveResult {
  const boxResult = solveOrder(units, boxes, options);
  const soft = units.filter((u) => u.mailer_ok === true);
  if (mailerOptions.mailers.length === 0 || soft.length === 0) return boxResult;

  const charge = options.charge ?? DEFAULT_CHARGE_RULE;
  const fee = mailerOptions.fee ?? DEFAULT_FEE_ESTIMATE;
  const prefer = options.prefer ?? 'fewest_parcels';
  const softParcels = packIntoMailers(soft, mailerOptions.mailers, {
    fit: mailerOptions.fit,
    charge,
    availability: options.availability,
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
