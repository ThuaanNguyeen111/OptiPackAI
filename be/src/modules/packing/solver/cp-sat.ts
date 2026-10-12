import axios from 'axios';
import { foldUnit } from '../../packaging/engine/units';
import type {
  BoxSpec,
  Orientation,
  PackingUnit,
  Placement,
} from '../../packaging/engine/types';
import { compareObjective, objectiveOf, summarizePlacements } from './objective';
import { validatePlan, variantsOf } from './solve-order';
import type { SolveResult, SolvedParcel } from './types';

/**
 * ===================================================================
 * Nâng nhãn chứng minh bằng CP-SAT (microservice `packer/`, đợt 2)
 * ===================================================================
 * Bộ giải BRKGA để lại các tổ hợp thùng TỐT HƠN mà kiểm tra nhanh chưa loại
 * được (`open_candidates`, sắp theo số kiện rồi giá). Hỏi CP-SAT từng tổ hợp
 * theo đúng thứ tự:
 *  - "infeasible": chứng minh không xếp được (theo luật chồng CHẶT HƠN
 *    validator) → xét tổ hợp kế tiếp;
 *  - "feasible": tìm được phương án tốt hơn BRKGA → nhận NẾU qua validator TS
 *    (hai ngôn ngữ kiểm nhau); mọi tổ hợp trước nó đã bị loại → optimal_in_model;
 *  - "unknown"/lỗi mạng: dừng, giữ nguyên phương án và nhãn heuristic.
 * Tất cả tổ hợp đều "infeasible" → phương án BRKGA là optimal_in_model.
 * ===================================================================
 */

export const CP_SAT_SCHEMA_VERSION = 1;
/** Mặc định chỉ hỏi CP-SAT cho đơn tới chừng này món (đo bằng benchmark). */
export const CP_SAT_MAX_UNITS = 12;

export interface CpSatVariant {
  dx: number;
  dy: number;
  dz: number;
  orientation: string;
  folded: boolean;
}
export interface CpSatUnit {
  key: string;
  weight_g: number;
  fragile: boolean;
  max_stack_load_g: number | null;
  variants: CpSatVariant[];
}
export interface CpSatBox {
  code: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  max_load_g: number;
}
export interface CheckCombosRequest {
  schema_version: number;
  units: CpSatUnit[];
  combos: CpSatBox[][];
  deterministic_time_per_combo: number;
  wall_time_limit_s: number;
  seed: number;
}
export interface CpSatPlacement {
  key: string;
  box_index: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  orientation: string;
  folded: boolean;
}
export interface ComboResult {
  combo_index: number;
  status: 'feasible' | 'infeasible' | 'unknown' | 'skipped';
  placements: CpSatPlacement[] | null;
  wall_ms: number;
}
export interface CheckCombosResponse {
  schema_version: number;
  results: ComboResult[];
  stopped_early: boolean;
}

export interface CpSatChecker {
  check(request: CheckCombosRequest): Promise<CheckCombosResponse>;
}

/** Client HTTP tới service `packer/`. */
export function httpCpSatChecker(baseUrl: string, timeoutMs: number): CpSatChecker {
  return {
    async check(request) {
      const res = await axios.post<CheckCombosResponse>(
        `${baseUrl.replace(/\/$/, '')}/v1/check-combos`,
        request,
        { timeout: timeoutMs },
      );
      return res.data;
    },
  };
}

export interface CpSatUpgradeOptions {
  availability?: Map<string, number>;
  materials?: Parameters<typeof summarizePlacements>[3];
  volumetricDivisor?: number;
  maxUnits?: number;
  deterministicTimePerCombo?: number;
  wallTimeLimitS?: number;
  seed?: number;
}

const comboName = (combo: BoxSpec[]): string => combo.map((b) => b.code).join(' + ');

function toPayloadBox(b: BoxSpec): CpSatBox {
  return {
    code: b.code,
    length_mm: b.inner.length_mm,
    width_mm: b.inner.width_mm,
    height_mm: b.inner.height_mm,
    max_load_g: b.max_load_g,
  };
}

function toPayloadUnit(unit: PackingUnit, boxes: BoxSpec[]): CpSatUnit {
  const seen = new Set<string>();
  const variants: CpSatVariant[] = [];
  for (const v of variantsOf(unit)) {
    const fits = boxes.some(
      (b) =>
        v.dx <= b.inner.length_mm &&
        v.dy <= b.inner.width_mm &&
        v.dz <= b.inner.height_mm,
    );
    const key = `${String(v.dx)}x${String(v.dy)}x${String(v.dz)}:${String(v.unit.folded === true)}`;
    if (!fits || seen.has(key)) continue;
    seen.add(key);
    variants.push({
      dx: v.dx,
      dy: v.dy,
      dz: v.dz,
      orientation: v.orientation,
      folded: v.unit.folded === true,
    });
  }
  return {
    key: unit.item_key,
    weight_g: unit.weight_g,
    fragile: unit.is_fragile,
    max_stack_load_g: unit.max_stack_load_g,
    variants,
  };
}

/** Dựng các kiện từ tọa độ CP-SAT; thứ tự đặt = thấp → sâu → trái (món dưới luôn đặt trước). */
function parcelsFromPlacements(
  combo: BoxSpec[],
  placements: CpSatPlacement[],
  unitByKey: Map<string, PackingUnit>,
  options: CpSatUpgradeOptions,
): SolvedParcel[] | null {
  const parcels: SolvedParcel[] = [];
  for (const [index, box] of combo.entries()) {
    const inBox = placements
      .filter((p) => p.box_index === index)
      .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    if (inBox.length === 0) continue;
    const units: PackingUnit[] = [];
    const placed: Placement[] = [];
    for (const [i, p] of inBox.entries()) {
      const base = unitByKey.get(p.key);
      if (!base) return null;
      units.push(p.folded ? foldUnit(base) : base);
      placed.push({
        item_key: p.key,
        sku: base.sku,
        step: i + 1,
        x: p.x,
        y: p.y,
        z: p.z,
        dx: p.dx,
        dy: p.dy,
        dz: p.dz,
        orientation: p.orientation as Orientation,
        ...(p.folded && { folded: true }),
      });
    }
    parcels.push(
      summarizePlacements(box, units, placed, options.materials, options.volumetricDivisor),
    );
  }
  return parcels;
}

export async function upgradeWithCpSat(
  result: SolveResult,
  allUnits: PackingUnit[],
  checker: CpSatChecker,
  options: CpSatUpgradeOptions = {},
): Promise<SolveResult> {
  const candidates = result.open_candidates;
  if (result.proof !== 'heuristic' || result.unplaced.length > 0 || candidates.length === 0)
    return result;
  const placedKeys = result.parcels.flatMap((p) => p.placements.map((q) => q.item_key));
  const units = allUnits.filter((u) => placedKeys.includes(u.item_key));
  if (units.length > (options.maxUnits ?? CP_SAT_MAX_UNITS)) {
    return {
      ...result,
      explanation: [
        ...result.explanation,
        `Đơn ${String(units.length)} món vượt ngưỡng chứng minh bằng CP-SAT — giữ nhãn heuristic.`,
      ],
    };
  }

  const allBoxes = [...new Map(candidates.flat().map((b) => [b.code, b])).values()];
  const request: CheckCombosRequest = {
    schema_version: CP_SAT_SCHEMA_VERSION,
    units: units.map((u) => toPayloadUnit(u, allBoxes)),
    combos: candidates.map((combo) => combo.map(toPayloadBox)),
    deterministic_time_per_combo: options.deterministicTimePerCombo ?? 2,
    wall_time_limit_s: options.wallTimeLimitS ?? 3,
    seed: options.seed ?? 1,
  };

  let response: CheckCombosResponse;
  try {
    response = await checker.check(request);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...result,
      explanation: [...result.explanation, `CP-SAT không phản hồi (${message}) — giữ nhãn heuristic.`],
    };
  }

  const lines: string[] = [];
  const unitByKey = new Map(units.map((u) => [u.item_key, u]));
  for (const r of response.results) {
    const combo = candidates[r.combo_index];
    if (!combo) break;
    if (r.status === 'infeasible') {
      lines.push(`${comboName(combo)}: CP-SAT chứng minh không xếp được (luật chồng chặt).`);
      continue;
    }
    if (r.status === 'feasible' && r.placements) {
      const parcels = parcelsFromPlacements(combo, r.placements, unitByKey, options);
      const problems = parcels
        ? validatePlan(parcels, placedKeys, options.availability)
        : ['món lạ trong lời giải CP-SAT'];
      const candidate = parcels ? objectiveOf(parcels, 0) : null;
      if (parcels && candidate && problems.length === 0 && compareObjective(candidate, result.objective) < 0) {
        return {
          ...result,
          parcels,
          objective: candidate,
          proof: 'optimal_in_model',
          explanation: [
            ...result.explanation,
            ...lines,
            `${comboName(combo)}: CP-SAT tìm được cách xếp tốt hơn — mọi tổ hợp tốt hơn nữa đều đã bị loại → tối ưu (theo luật chồng chặt).`,
          ],
          open_candidates: [],
        };
      }
      lines.push(
        `${comboName(combo)}: CP-SAT trả cách xếp nhưng không dùng được (${problems[0] ?? 'không tốt hơn'}) — giữ nhãn heuristic.`,
      );
      return { ...result, explanation: [...result.explanation, ...lines] };
    }
    lines.push(`${comboName(combo)}: CP-SAT chưa kết luận trong thời gian cho phép — giữ nhãn heuristic.`);
    return { ...result, explanation: [...result.explanation, ...lines] };
  }

  const allInfeasible =
    response.results.length === candidates.length &&
    response.results.every((r) => r.status === 'infeasible');
  if (!allInfeasible) return { ...result, explanation: [...result.explanation, ...lines] };
  return {
    ...result,
    proof: 'optimal_in_model',
    explanation: [
      ...result.explanation,
      ...lines,
      'Mọi tổ hợp tốt hơn đều bị CP-SAT loại → phương án hiện tại tối ưu (theo luật chồng chặt).',
    ],
    open_candidates: [],
  };
}
