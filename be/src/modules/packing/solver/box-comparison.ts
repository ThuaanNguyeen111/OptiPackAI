import type { BoxSpec, MaterialPlanning, PackingUnit } from '../../packaging/engine/types';
import {
  DEFAULT_CHARGE_RULE,
  firstObjectiveDifference,
  objectiveOf,
  type ChargeRule,
} from './objective';
import { solveOrder } from './solve-order';
import type { Objective, SolvePreference, SolvedParcel } from './types';
import { formatDimsMmAsCm, formatGAsKg } from '../../../common/utils/measure-format.util';

/**
 * ===================================================================
 * Bảng so sánh thùng cho 1 kiện (05/11/2026) — hàm thuần
 * ===================================================================
 * Trả lời câu hỏi "vì sao thùng này mà không phải thùng khác": xếp ĐÚNG các
 * món của kiện vào từng loại thùng (cùng bộ giải + validator), rồi:
 *  - THỨ HẠNG theo đúng luật bậc của bộ giải (`firstObjectiveDifference`) —
 *    đây là quyết định thật, không phải điểm.
 *  - ĐIỂM 0–10 có trọng số (cân tính cước, giá bao bì, lấp đầy, gập) để người
 *    xem so nhanh. Điểm chỉ là thước đo tham khảo: khi điểm tổng ngược thứ
 *    hạng, `scores_consistent = false` và câu tóm tắt nói rõ — không sửa số.
 *  - Mỗi dòng có câu kết luận: thua/hơn thùng đang chọn ở bậc nào, hoặc vì
 *    sao không dùng được (không vừa, quá tải, hết tồn, bị loại).
 * ===================================================================
 */

export interface BoxComparisonWeights {
  billable: number;
  packaging: number;
  fill: number;
  handling: number;
}

/** Trọng số điểm tổng — cước nặng nhất vì là khoản tiền lớn nhất (PACKAGING_STANDARD §2). */
export const DEFAULT_COMPARISON_WEIGHTS: BoxComparisonWeights = {
  billable: 0.4,
  packaging: 0.3,
  fill: 0.2,
  handling: 0.1,
};

/** Ngân sách giải cho mỗi thùng thay thế (đơn > 3 món; ≤ 3 món vét cạn). */
export const COMPARISON_MAX_EVALUATIONS = 400;

export interface BoxComparisonCriteria {
  /** 10 = cân tính cước thấp nhất trong các thùng dùng được. */
  billable: number;
  /** 10 = giá thùng + vật tư thấp nhất. */
  packaging: number;
  /** 10 = lấp đầy cao nhất (ít khoảng trống thừa). */
  fill: number;
  /** 10 = không phải gập món nào. */
  handling: number;
}

export interface BoxComparisonRow {
  box_code: string;
  box_name: string;
  kind: 'box' | 'mailer';
  is_chosen: boolean;
  /** true = xếp vừa 1 thùng, còn tồn, không bị loại. */
  eligible: boolean;
  /** 1 = tốt nhất theo luật bậc; null = không dùng được. */
  rank: number | null;
  /** Điểm tổng 0–10 (1 chữ số thập phân); 0 khi không dùng được. */
  score: number;
  criteria: BoxComparisonCriteria | null;
  billable_weight_g: number | null;
  packaging_cost_vnd: number | null;
  fill_ratio: number | null;
  folds: number | null;
  estimated_weight_g: number | null;
  /** Số thùng trống còn lại; null = không xét tồn. */
  available: number | null;
  verdict: string;
}

export interface BoxComparison {
  prefer: SolvePreference;
  weights: BoxComparisonWeights;
  rows: BoxComparisonRow[];
  /** false = có thùng điểm cao hơn thùng xếp trên nó (điểm chỉ tham khảo). */
  scores_consistent: boolean;
  summary: string;
}

export interface CompareBoxesOptions {
  /** Tồn trống cho thùng THAY THẾ (đã trừ các kiện khác); bỏ qua = không xét tồn. */
  availability?: Map<string, number>;
  materials?: MaterialPlanning;
  charge?: ChargeRule;
  prefer?: SolvePreference;
  excludeBoxCodes?: string[];
  weights?: BoxComparisonWeights;
  maxEvaluations?: number;
}

interface Candidate {
  box: BoxSpec;
  isChosen: boolean;
  parcel: SolvedParcel | null;
  objective: Objective | null;
  available: number | null;
  ineligibleReason: string | null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const vnd = (n: number): string => `${Math.round(n).toLocaleString('vi-VN')}đ`;
const grams = (n: number): string => formatGAsKg(n);
const packagingCost = (p: SolvedParcel): number => (p.box.price_vnd ?? 0) + p.materials_cost_vnd;
const foldsOf = (p: SolvedParcel): number => p.placements.filter((q) => q.folded === true).length;

/** Tỉ lệ "nhỏ hơn là tốt" → 0–10 so với giá trị tốt nhất. */
function lowerIsBetter(value: number, best: number): number {
  if (value <= 0) return 10;
  return Math.min(10, (10 * best) / value);
}

const TIER_LABEL: Record<keyof Objective, string> = {
  unplaced: 'số món xếp được',
  parcels: 'số kiện',
  billable_g: 'cân tính cước',
  packaging_cost_vnd: 'giá thùng + vật tư',
  volumetric_g: 'cân quy đổi',
  folds: 'số món phải gập',
  imbalance: 'độ lệch tải',
  cog: 'độ vững (trọng tâm)',
};

function tierValue(tier: keyof Objective, n: number): string {
  if (tier === 'billable_g' || tier === 'volumetric_g') return grams(n);
  if (tier === 'packaging_cost_vnd') return vnd(n);
  if (tier === 'cog' || tier === 'imbalance') return `${String(Math.round(n * 100))}%`;
  return String(n);
}

/** "cân tính cước 1.500 g so với 500 g" — bậc đầu tiên hai thùng khác nhau. */
function describeDifference(row: Objective, ref: Objective, prefer: SolvePreference): string | null {
  const diff = firstObjectiveDifference(row, ref, prefer);
  if (!diff) return null;
  return `${TIER_LABEL[diff.tier]} ${tierValue(diff.tier, diff.a)} so với ${tierValue(diff.tier, diff.b)}`;
}

const dimsText = (b: BoxSpec): string =>
  formatDimsMmAsCm(b.inner.length_mm, b.inner.width_mm, b.inner.height_mm);

/**
 * Xếp các món vào đúng 1 thùng. Lý do "không dùng được" ưu tiên điều kiện CHẮC
 * CHẮN (quá cỡ, quá tải) trước câu chung của bộ giải; xếp vừa mà hết tồn vẫn
 * trả số liệu để người xem biết "nếu kho có thùng thì thế nào".
 */
function evaluateAlternative(
  units: PackingUnit[],
  box: BoxSpec,
  available: number | null,
  options: CompareBoxesOptions,
): { parcel: SolvedParcel | null; reason: string | null } {
  if ((options.excludeBoxCodes ?? []).includes(box.code)) {
    return { parcel: null, reason: 'Đã bị loại khỏi lần tính này (chọn bỏ thùng khi tính lại).' };
  }
  const solved = solveOrder(units, [box], {
    materials: options.materials,
    charge: options.charge,
    maxEvaluations: options.maxEvaluations ?? COMPARISON_MAX_EVALUATIONS,
  });
  const skuOf = (key: string): string => units.find((u) => u.item_key === key)?.sku ?? key;
  const tooLarge = solved.unplaced.find((u) => u.code === 'ITEM_TOO_LARGE');
  if (tooLarge) {
    return {
      parcel: null,
      reason: `Món ${skuOf(tooLarge.item_key)} không vừa lòng thùng ${dimsText(box)} (mọi hướng, kể cả khi gập).`,
    };
  }
  const tooHeavy = solved.unplaced.find((u) => u.code === 'ITEM_TOO_HEAVY');
  if (tooHeavy) {
    const weight = units.find((u) => u.item_key === tooHeavy.item_key)?.weight_g ?? 0;
    return {
      parcel: null,
      reason: `Món ${skuOf(tooHeavy.item_key)} nặng ${grams(weight)} vượt tải ${grams(box.max_load_g)} của thùng.`,
    };
  }
  const totalWeight = units.reduce((s, u) => s + u.weight_g, 0);
  if (totalWeight > box.max_load_g) {
    return {
      parcel: null,
      reason: `Tổng hàng ${grams(totalWeight)} vượt tải ${grams(box.max_load_g)} của thùng.`,
    };
  }
  const [only] = solved.parcels;
  if (solved.status !== 'ok' || solved.parcels.length !== 1 || !only) {
    return { parcel: null, reason: `Bộ giải không xếp được hết ${String(units.length)} món vào 1 thùng này.` };
  }
  if (available !== null && available <= 0) {
    return { parcel: only, reason: 'Xếp vừa nhưng kho đã hết thùng trống.' };
  }
  return { parcel: only, reason: null };
}

export function compareBoxes(
  units: PackingUnit[],
  catalog: BoxSpec[],
  chosen: SolvedParcel,
  options: CompareBoxesOptions = {},
): BoxComparison {
  const prefer = options.prefer ?? 'fewest_parcels';
  const weights = options.weights ?? DEFAULT_COMPARISON_WEIGHTS;
  const charge = options.charge ?? DEFAULT_CHARGE_RULE;
  const stock = options.availability;

  const candidates: Candidate[] = [
    {
      box: chosen.box,
      isChosen: true,
      parcel: chosen,
      objective: objectiveOf([chosen], 0),
      available: null,
      ineligibleReason: null,
    },
  ];
  for (const box of catalog) {
    if (box.code === chosen.box.code) continue;
    const available = stock ? Math.max(0, stock.get(box.code) ?? 0) : null;
    const { parcel, reason } = evaluateAlternative(units, box, available, { ...options, charge });
    candidates.push({
      box,
      isChosen: false,
      parcel,
      objective: parcel ? objectiveOf([parcel], 0) : null,
      available,
      ineligibleReason: reason,
    });
  }

  const eligible = candidates.filter(
    (c): c is Candidate & { parcel: SolvedParcel; objective: Objective } =>
      c.ineligibleReason === null && c.parcel !== null && c.objective !== null,
  );
  const parcelsOf = eligible.map((c) => c.parcel);
  const bestBillable = Math.min(...parcelsOf.map((p) => p.billable_weight_g));
  const bestPackaging = Math.min(...parcelsOf.map(packagingCost));
  const bestFill = Math.max(...parcelsOf.map((p) => p.fill_ratio));
  const unitCount = Math.max(1, units.length);

  const ranked = [...eligible].sort((a, b) => {
    const diff = firstObjectiveDifference(a.objective, b.objective, prefer);
    if (diff) return diff.sign;
    return Number(b.isChosen) - Number(a.isChosen) || a.box.code.localeCompare(b.box.code);
  });
  const chosenObjective = candidates[0]?.objective ?? objectiveOf([chosen], 0);

  const rows: BoxComparisonRow[] = ranked.map((c, i) => {
    const p = c.parcel;
    const objective = c.objective;
    const criteria: BoxComparisonCriteria = {
      billable: round1(lowerIsBetter(p.billable_weight_g, bestBillable)),
      packaging: round1(lowerIsBetter(packagingCost(p), bestPackaging)),
      fill: round1(bestFill > 0 ? (10 * p.fill_ratio) / bestFill : 10),
      handling: round1(10 * (1 - foldsOf(p) / unitCount)),
    };
    const score = round1(
      weights.billable * criteria.billable +
        weights.packaging * criteria.packaging +
        weights.fill * criteria.fill +
        weights.handling * criteria.handling,
    );
    let verdict: string;
    if (c.isChosen) {
      verdict = 'Thùng đang chọn.';
    } else {
      const diff = firstObjectiveDifference(objective, chosenObjective, prefer);
      const why = describeDifference(objective, chosenObjective, prefer);
      verdict =
        diff === null || why === null
          ? `Ngang thùng ${chosen.box.code} ở mọi tiêu chí.`
          : diff.sign > 0
            ? `Thua thùng ${chosen.box.code}: ${why}.`
            : `Tốt hơn thùng ${chosen.box.code}: ${why} — có thể đổi thùng cho kiện này.`;
    }
    return {
      box_code: c.box.code,
      box_name: c.box.name,
      kind: c.box.kind ?? 'box',
      is_chosen: c.isChosen,
      eligible: true,
      rank: i + 1,
      score,
      criteria,
      billable_weight_g: p.billable_weight_g,
      packaging_cost_vnd: packagingCost(p),
      fill_ratio: p.fill_ratio,
      folds: foldsOf(p),
      estimated_weight_g: p.estimated_package_weight_g,
      available: c.available,
      verdict,
    };
  });

  for (const c of candidates) {
    if (c.ineligibleReason === null) continue;
    rows.push({
      box_code: c.box.code,
      box_name: c.box.name,
      kind: c.box.kind ?? 'box',
      is_chosen: false,
      eligible: false,
      rank: null,
      score: 0,
      criteria: null,
      billable_weight_g: c.parcel?.billable_weight_g ?? null,
      packaging_cost_vnd: c.parcel ? packagingCost(c.parcel) : null,
      fill_ratio: c.parcel?.fill_ratio ?? null,
      folds: c.parcel ? foldsOf(c.parcel) : null,
      estimated_weight_g: c.parcel?.estimated_package_weight_g ?? null,
      available: c.available,
      verdict: c.ineligibleReason,
    });
  }

  const scoresConsistent = rows
    .filter((r) => r.eligible)
    .every((r, i, all) => i === 0 || r.score <= (all[i - 1]?.score ?? Number.POSITIVE_INFINITY));

  return {
    prefer,
    weights,
    rows,
    scores_consistent: scoresConsistent,
    summary: summarize(rows, scoresConsistent, prefer),
  };
}

const scoreText = (n: number): string => `${String(n).replace('.', ',')}/10`;
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

const PREFER_RULE: Record<SolvePreference, string> = {
  fewest_parcels: 'số kiện → cân tính cước → giá thùng + vật tư → cân quy đổi → số món gập',
  cheapest: 'cân tính cước → giá thùng + vật tư → số kiện → cân quy đổi → số món gập',
};

/** Câu tóm tắt cho mục "Vì sao chọn thùng này?". */
function summarize(rows: BoxComparisonRow[], consistent: boolean, prefer: SolvePreference): string {
  const ranked = rows.filter((r) => r.eligible);
  const chosen = ranked.find((r) => r.is_chosen);
  const [top, next] = ranked;
  const unusable = rows.length - ranked.length;
  const parts: string[] = [];
  if (!chosen || !top) return 'Chưa có thùng nào xếp vừa để so sánh.';
  if (top.is_chosen) {
    if (next) {
      parts.push(
        `Chọn thùng ${chosen.box_code} (${scoreText(chosen.score)}): đứng đầu theo luật ưu tiên (${PREFER_RULE[prefer]}). ` +
          `Xếp sau: ${next.box_code} (${scoreText(next.score)}) — ${lowerFirst(next.verdict.replace(/\.$/, ''))}.`,
      );
    } else {
      parts.push(`Chọn thùng ${chosen.box_code} (${scoreText(chosen.score)}): là thùng duy nhất dùng được.`);
    }
  } else {
    parts.push(
      `Thùng đang dùng ${chosen.box_code} (${scoreText(chosen.score)}) xếp hạng ${String(chosen.rank)}; ` +
        `thùng ${top.box_code} (${scoreText(top.score)}) tốt hơn theo luật ưu tiên — có thể đổi thùng cho kiện này.`,
    );
  }
  if (unusable > 0) parts.push(`${String(unusable)} thùng khác không dùng được (xem lý do từng dòng).`);
  if (!consistent) {
    parts.push(
      'Lưu ý: điểm tổng chỉ để so nhanh; thứ hạng theo luật ưu tiên của bộ giải nên có thùng điểm cao hơn mà vẫn xếp sau.',
    );
  }
  return parts.join(' ');
}
