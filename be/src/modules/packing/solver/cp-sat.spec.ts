import { expandToUnits } from '../../packaging/engine/units';
import { sampleBoxes, tee } from '../../packaging/engine/scenarios/order-scenarios';
import {
  upgradeWithCpSat,
  type CheckCombosRequest,
  type CheckCombosResponse,
  type CpSatChecker,
} from './cp-sat';
import { solveOrder } from './solve-order';
import type { SolveResult } from './types';
import type { PackingUnit } from '../../packaging/engine/types';

const [, maybeM, maybeL] = sampleBoxes();
if (!maybeM || !maybeL) throw new Error('thiếu thùng mẫu');
const M = maybeM;
const L = maybeL;

/** Checker giả: trả lời theo hàm cho trước, ghi lại request để kiểm tra. */
function fake(answer: (req: CheckCombosRequest) => CheckCombosResponse): CpSatChecker & {
  calls: CheckCombosRequest[];
} {
  const calls: CheckCombosRequest[] = [];
  return {
    calls,
    check(req) {
      calls.push(req);
      return Promise.resolve(answer(req));
    },
  };
}

const units = expandToUnits([tee(2)]);
function twoUnits(): [PackingUnit, PackingUnit] {
  const [a, b] = units;
  if (!a || !b) throw new Error('thiếu món');
  return [a, b];
}
const [u0, u1] = twoUnits();
/** Phương án giả "kém": mỗi áo 1 thùng L, còn tổ hợp chưa loại được là 1 thùng M. */
function weakResult(): SolveResult {
  const one = solveOrder([u0], [L]);
  const two = solveOrder([u1], [L]);
  const base = solveOrder(units, sampleBoxes());
  return {
    ...base,
    parcels: [...one.parcels, ...two.parcels],
    proof: 'heuristic',
    objective: { ...base.objective, parcels: 2, packaging_cost_vnd: 16_000 },
    open_candidates: [[M]],
  };
}

describe('upgradeWithCpSat', () => {
  it('mọi tổ hợp tốt hơn đều infeasible → optimal_in_model, giữ nguyên phương án', async () => {
    const weak = weakResult();
    const checker = fake(() => ({
      schema_version: 1,
      stopped_early: false,
      results: [{ combo_index: 0, status: 'infeasible', placements: null, wall_ms: 5 }],
    }));
    const r = await upgradeWithCpSat(weak, units, checker);
    expect(r.proof).toBe('optimal_in_model');
    expect(r.parcels).toBe(weak.parcels);
    expect(r.explanation.some((e) => e.includes('CP-SAT chứng minh không xếp được'))).toBe(true);
    // Hợp đồng: đơn vị mm/g, biến thể đã nở sẵn, đúng thứ tự tổ hợp.
    expect(checker.calls[0]?.units).toHaveLength(2);
    expect(checker.calls[0]?.combos[0]?.[0]?.code).toBe('SAMPLE-M');
  });

  it('CP-SAT tìm được tổ hợp tốt hơn và qua validator → nhận phương án mới', async () => {
    const good = solveOrder(units, [M]); // 2 áo vừa 1 thùng M
    const placements = (good.parcels[0]?.placements ?? []).map((p) => ({
      key: p.item_key,
      box_index: 0,
      x: p.x,
      y: p.y,
      z: p.z,
      dx: p.dx,
      dy: p.dy,
      dz: p.dz,
      orientation: p.orientation,
      folded: p.folded === true,
    }));
    const checker = fake(() => ({
      schema_version: 1,
      stopped_early: true,
      results: [{ combo_index: 0, status: 'feasible', placements, wall_ms: 5 }],
    }));
    const r = await upgradeWithCpSat(weakResult(), units, checker);
    expect(r.proof).toBe('optimal_in_model');
    expect(r.parcels).toHaveLength(1);
    expect(r.parcels[0]?.box.code).toBe('SAMPLE-M');
  });

  it('lời giải CP-SAT sai luật (chồng lên nhau) bị validator loại → giữ heuristic', async () => {
    const bad = units.map((u) => ({
      key: u.item_key,
      box_index: 0,
      x: 0,
      y: 0,
      z: 0,
      dx: u.length_mm,
      dy: u.width_mm,
      dz: u.height_mm,
      orientation: 'LWH',
      folded: false,
    }));
    const checker = fake(() => ({
      schema_version: 1,
      stopped_early: true,
      results: [{ combo_index: 0, status: 'feasible', placements: bad, wall_ms: 5 }],
    }));
    const weak = weakResult();
    const r = await upgradeWithCpSat(weak, units, checker);
    expect(r.proof).toBe('heuristic');
    expect(r.parcels).toBe(weak.parcels);
  });

  it('CP-SAT chưa kết luận hoặc không phản hồi → giữ heuristic, có lời giải thích', async () => {
    const unknown = fake(() => ({
      schema_version: 1,
      stopped_early: true,
      results: [{ combo_index: 0, status: 'unknown', placements: null, wall_ms: 1000 }],
    }));
    const r1 = await upgradeWithCpSat(weakResult(), units, unknown);
    expect(r1.proof).toBe('heuristic');
    expect(r1.explanation.at(-1)).toMatch(/chưa kết luận/);

    const down: CpSatChecker = { check: () => Promise.reject(new Error('ECONNREFUSED')) };
    const r2 = await upgradeWithCpSat(weakResult(), units, down);
    expect(r2.proof).toBe('heuristic');
    expect(r2.explanation.at(-1)).toMatch(/không phản hồi/);
  });

  it('bỏ qua khi đã tối ưu, hoặc đơn vượt ngưỡng số món', async () => {
    const checker = fake(() => {
      throw new Error('không được gọi');
    });
    const proven = solveOrder(expandToUnits([tee(1)]), sampleBoxes());
    expect(proven.proof).toBe('optimal_global');
    expect(await upgradeWithCpSat(proven, expandToUnits([tee(1)]), checker)).toBe(proven);
    const r = await upgradeWithCpSat(weakResult(), units, checker, { maxUnits: 1 });
    expect(r.proof).toBe('heuristic');
    expect(checker.calls).toHaveLength(0);
  });
});
