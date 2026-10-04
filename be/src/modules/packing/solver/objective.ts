import { selectMaterials } from '../../packaging/engine/material-selector';
import type {
  BoxSpec,
  MaterialPlanning,
  PackingUnit,
  Placement,
} from '../../packaging/engine/types';
import type { ParcelState } from './parcel-state';
import type { Objective, SolvePreference, SolvedParcel } from './types';

export const DEFAULT_VOLUMETRIC_DIVISOR = 6000;

const innerVolume = (b: BoxSpec): number =>
  b.inner.length_mm * b.inner.width_mm * b.inner.height_mm;

/** Dựng kết quả 1 kiện từ trạng thái giải mã. */
export function summarizeParcel(
  state: ParcelState,
  materials: MaterialPlanning | undefined,
  volumetricDivisor = DEFAULT_VOLUMETRIC_DIVISOR,
): SolvedParcel {
  return summarizePlacements(
    state.box,
    state.units,
    state.placements,
    materials,
    volumetricDivisor,
  );
}

/** Dựng kết quả 1 kiện từ thùng + món (đúng dạng) + tọa độ: cân, độ đầy, vật tư, cân quy đổi. */
export function summarizePlacements(
  box: BoxSpec,
  units: PackingUnit[],
  placements: Placement[],
  materials: MaterialPlanning | undefined,
  volumetricDivisor = DEFAULT_VOLUMETRIC_DIVISOR,
): SolvedParcel {
  const itemsWeight = units.reduce((s, u) => s + u.weight_g, 0);
  const itemsVolume = placements.reduce((s, p) => s + p.dx * p.dy * p.dz, 0);
  const fill = itemsVolume / innerVolume(box);
  const lines = materials ? selectMaterials(units, fill, materials) : [];
  const materialsWeight = lines.reduce((s, m) => s + m.weight_g, 0);
  const materialsCost = lines.reduce((s, m) => s + m.cost_vnd, 0);
  const outerCm3 =
    (box.outer.length_mm * box.outer.width_mm * box.outer.height_mm) / 1000;
  return {
    box,
    units: [...units],
    placements: placements.map((p) => ({ ...p })),
    fill_ratio: fill,
    items_weight_g: itemsWeight,
    materials: lines,
    materials_weight_g: materialsWeight,
    materials_cost_vnd: materialsCost,
    estimated_package_weight_g: itemsWeight + box.tare_g + materialsWeight,
    volumetric_weight_g: Math.ceil((outerCm3 / volumetricDivisor) * 1000),
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

/** < 0 nếu `a` tốt hơn `b`. So theo bậc; `prefer` đổi chỗ bậc số kiện và chi phí. */
export function compareObjective(
  a: Objective,
  b: Objective,
  prefer: SolvePreference = 'fewest_parcels',
): number {
  const tiers: [number, number][] = [[a.unplaced, b.unplaced]];
  if (prefer === 'cheapest') {
    tiers.push([a.packaging_cost_vnd, b.packaging_cost_vnd], [a.parcels, b.parcels]);
  } else {
    tiers.push([a.parcels, b.parcels], [a.packaging_cost_vnd, b.packaging_cost_vnd]);
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
