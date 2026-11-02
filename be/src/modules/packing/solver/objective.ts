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

/** Dựng kết quả 1 kiện từ thùng + món (đúng dạng) + tọa độ: cân, độ đầy, vật tư, cân quy đổi. */
export function summarizePlacements(
  box: BoxSpec,
  units: PackingUnit[],
  placements: Placement[],
  materials: MaterialPlanning | undefined,
  charge: ChargeRule = DEFAULT_CHARGE_RULE,
): SolvedParcel {
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
  const tiers: [number, number][] = [[a.unplaced, b.unplaced]];
  if (prefer === 'cheapest') {
    tiers.push(
      [a.billable_g, b.billable_g],
      [a.packaging_cost_vnd, b.packaging_cost_vnd],
      [a.parcels, b.parcels],
    );
  } else {
    tiers.push(
      [a.parcels, b.parcels],
      [a.billable_g, b.billable_g],
      [a.packaging_cost_vnd, b.packaging_cost_vnd],
    );
  }
  tiers.push(
    [a.volumetric_g, b.volumetric_g],
    [a.folds, b.folds],
    [r3(a.imbalance), r3(b.imbalance)],
    [r3(a.cog), r3(b.cog)],
  );
  for (const [x, y] of tiers) if (x !== y) return x - y;
  return 0;
}
