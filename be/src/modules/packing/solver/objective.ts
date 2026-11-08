import { selectMaterials } from '../../packaging/engine/material-selector';
import type {
  BoxSpec,
  MaterialPlanning,
  PackingUnit,
  Placement,
} from '../../packaging/engine/types';
import type { ParcelState } from './parcel-state';
import type { Objective, SolvePreference, SolvedParcel } from './types';

/**
 * Luật tính cân tính cước của hãng (AOFP-224, docs/PACKAGING_STANDARD.md §2):
 * cân tính cước = max(cân thật, thể tích ngoài cm³ / divisor) rồi làm tròn LÊN
 * bội số `billingStepG`. Mặc định theo GHN: divisor 5000, bước 500 g.
 */
export interface ChargeRule {
  volumetricDivisor: number;
  billingStepG: number;
}

export const DEFAULT_VOLUMETRIC_DIVISOR = 5000;
export const DEFAULT_BILLING_STEP_G = 500;
export const DEFAULT_CHARGE_RULE: ChargeRule = {
  volumetricDivisor: DEFAULT_VOLUMETRIC_DIVISOR,
  billingStepG: DEFAULT_BILLING_STEP_G,
};

/** Cân tính cước (g): max(thật, quy đổi) làm tròn lên bội số bước; bước ≤ 0 = không làm tròn. */
export function billableWeightG(actualG: number, volumetricG: number, stepG: number): number {
  const raw = Math.max(actualG, volumetricG);
  if (stepG <= 0) return Math.ceil(raw);
  return Math.max(stepG, Math.ceil(raw / stepG) * stepG);
}

const innerVolume = (b: BoxSpec): number =>
  b.inner.length_mm * b.inner.width_mm * b.inner.height_mm;

/**
 * (08/11/2026, user chốt) Cắt hạ thùng carton: chỉ cắt khi bỏ được ≥ 5 cm; chiều cao
 * lòng sau cắt = đỉnh chồng hàng làm tròn LÊN cm chẵn. Túi niêm phong không cắt.
 */
export const MIN_BOX_CUT_MM = 50;

/** Thùng gốc trong danh mục (bỏ phần cắt hạ nếu có). */
export function uncutBox(box: BoxSpec): BoxSpec {
  if (!box.cut_from) return box;
  const { cut_from: from, ...rest } = box;
  return {
    ...rest,
    inner: { ...box.inner, height_mm: from.inner_height_mm },
    outer: { ...box.outer, height_mm: from.outer_height_mm },
  };
}

/** Thùng cắt hạ xuống sát chồng hàng; không đáng cắt thì trả thùng gốc. */
export function cutBoxToLoad(box: BoxSpec, placements: Placement[]): BoxSpec {
  const base = uncutBox(box);
  if (base.kind === 'mailer' || placements.length === 0) return base;
  const top = Math.max(...placements.map((p) => p.z + p.dz));
  const height = Math.min(base.inner.height_mm, Math.ceil(top / 10) * 10);
  const saved = base.inner.height_mm - height;
  if (saved < MIN_BOX_CUT_MM) return base;
  return {
    ...base,
    inner: { ...base.inner, height_mm: height },
    outer: { ...base.outer, height_mm: base.outer.height_mm - saved },
    cut_from: { inner_height_mm: base.inner.height_mm, outer_height_mm: base.outer.height_mm },
  };
}

/** Dựng kết quả 1 kiện từ trạng thái giải mã. */
export function summarizeParcel(
  state: ParcelState,
  materials: MaterialPlanning | undefined,
  charge: ChargeRule = DEFAULT_CHARGE_RULE,
): SolvedParcel {
  return summarizePlacements(
    state.box,
    state.units,
    state.placements,
    materials,
    charge,
  );
}

/** Dựng kết quả 1 kiện từ thùng + món (đúng dạng) + tọa độ: cân, độ đầy, vật tư, cân quy đổi — theo thùng đã cắt hạ. */
export function summarizePlacements(
  catalogBox: BoxSpec,
  units: PackingUnit[],
  placements: Placement[],
  materials: MaterialPlanning | undefined,
  charge: ChargeRule = DEFAULT_CHARGE_RULE,
): SolvedParcel {
  const box = cutBoxToLoad(catalogBox, placements);
  const itemsWeight = units.reduce((s, u) => s + u.weight_g, 0);
  const itemsVolume = placements.reduce((s, p) => s + p.dx * p.dy * p.dz, 0);
  const fill = itemsVolume / innerVolume(box);
  const lines = materials ? selectMaterials(units, fill, materials) : [];
  const materialsWeight = lines.reduce((s, m) => s + m.weight_g, 0);
  const materialsCost = lines.reduce((s, m) => s + m.cost_vnd, 0);
  const outerCm3 =
    (box.outer.length_mm * box.outer.width_mm * box.outer.height_mm) / 1000;
  const packageWeight = itemsWeight + box.tare_g + materialsWeight;
  const volumetricWeight = Math.ceil((outerCm3 / charge.volumetricDivisor) * 1000);
  return {
    box,
    units: [...units],
    placements: placements.map((p) => ({ ...p })),
    fill_ratio: fill,
    items_weight_g: itemsWeight,
    materials: lines,
    materials_weight_g: materialsWeight,
    materials_cost_vnd: materialsCost,
    estimated_package_weight_g: packageWeight,
    volumetric_weight_g: volumetricWeight,
    billable_weight_g: billableWeightG(packageWeight, volumetricWeight, charge.billingStepG),
  };
}

export function objectiveOf(
  parcels: SolvedParcel[],
  unplaced: number,
): Objective {
  const weights = parcels.map((p) => p.items_weight_g);
  const volumes = parcels.map((p) =>
    p.placements.reduce((s, q) => s + q.dx * q.dy * q.dz, 0),
  );
  let imbalance = 0;
  if (parcels.length >= 2) {
    const tw = weights.reduce((a, b) => a + b, 0) || 1;
    const tv = volumes.reduce((a, b) => a + b, 0) || 1;
    imbalance =
      (Math.max(...weights) - Math.min(...weights)) / tw +
      (Math.max(...volumes) - Math.min(...volumes)) / tv;
  }
  let cog = 0;
  for (const p of parcels) {
    const w = p.units.reduce((s, u) => s + u.weight_g, 0) || 1;
    const moment = p.placements.reduce(
      (s, q, i) => s + (p.units[i]?.weight_g ?? 0) * (q.z + q.dz / 2),
      0,
    );
    cog += moment / w / p.box.inner.height_mm;
  }
  return {
    unplaced,
    parcels: parcels.length,
    packaging_cost_vnd: parcels.reduce(
      (s, p) => s + (p.box.price_vnd ?? 0) + p.materials_cost_vnd,
      0,
    ),
    billable_g: parcels.reduce((s, p) => s + p.billable_weight_g, 0),
    volumetric_g: parcels.reduce((s, p) => s + p.volumetric_weight_g, 0),
    folds: parcels.reduce(
      (s, p) => s + p.placements.filter((q) => q.folded === true).length,
      0,
    ),
    imbalance: parcels.length === 0 ? 0 : imbalance,
    cog: parcels.length === 0 ? 0 : cog / parcels.length,
  };
}

/** Làm tròn số thực trước khi so (tránh nhiễu dấu phẩy động làm kết quả không ổn định). */
const r3 = (n: number): number => Math.round(n * 1000);

/**
 * < 0 nếu `a` tốt hơn `b`. So theo bậc; `prefer` đổi chỗ bậc số kiện và chi phí.
 * Cân tính cước (theo bậc làm tròn của hãng) đứng trước giá bao bì: cước là
 * tiền lớn hơn và chỉ đổi khi kiện vượt/lọt ranh giới bậc (§2 quy chuẩn).
 */
export function compareObjective(
  a: Objective,
  b: Objective,
  prefer: SolvePreference = 'fewest_parcels',
): number {
  const diff = firstObjectiveDifference(a, b, prefer);
  return diff === null ? 0 : diff.sign;
}

/** Thứ tự bậc so sánh của bộ giải — nguồn DUY NHẤT cho cả `compareObjective` lẫn lời giải thích. */
export function objectiveTierOrder(prefer: SolvePreference = 'fewest_parcels'): (keyof Objective)[] {
  const head: (keyof Objective)[] =
    prefer === 'cheapest'
      ? ['billable_g', 'packaging_cost_vnd', 'parcels']
      : ['parcels', 'billable_g', 'packaging_cost_vnd'];
  return ['unplaced', ...head, 'volumetric_g', 'folds', 'imbalance', 'cog'];
}

/** Bậc làm tròn trước khi so (số thực). */
const ROUNDED_TIERS: ReadonlySet<keyof Objective> = new Set(['imbalance', 'cog']);

export interface ObjectiveDifference {
  /** Bậc ĐẦU TIÊN hai phương án khác nhau — chính là lý do bộ giải xếp hạng. */
  tier: keyof Objective;
  /** < 0 nếu `a` tốt hơn `b` ở bậc này. */
  sign: number;
  a: number;
  b: number;
}

/** Bậc đầu tiên `a` và `b` khác nhau theo luật bậc; null = ngang nhau ở mọi bậc. */
export function firstObjectiveDifference(
  a: Objective,
  b: Objective,
  prefer: SolvePreference = 'fewest_parcels',
): ObjectiveDifference | null {
  for (const tier of objectiveTierOrder(prefer)) {
    const x = ROUNDED_TIERS.has(tier) ? r3(a[tier]) : a[tier];
    const y = ROUNDED_TIERS.has(tier) ? r3(b[tier]) : b[tier];
    if (x !== y) return { tier, sign: x - y, a: a[tier], b: b[tier] };
  }
  return null;
}
