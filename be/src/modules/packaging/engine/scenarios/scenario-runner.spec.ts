import { expandToUnits, foldUnit } from '../units';
import { validateCandidate } from '../validator';
import type { PackingUnit } from '../types';
import {
  SCENARIOS,
  sampleBoxes,
  solve,
  toAvailability,
  type Scenario,
  type SolveOutcome,
} from './order-scenarios';

/**
 * Chạy MỌI kịch bản đơn hàng qua engine và kiểm bằng validator độc lập:
 *  - status/số kiện đúng kỳ vọng;
 *  - mọi kiện `ok` qua validateCandidate, món không mất/không trùng giữa các kiện;
 *  - kết quả xác định (chạy 2 lần cho cùng placements).
 * Kịch bản có `knownGap` chạy bằng it.failing: hết lỗi ⇒ jest báo đỏ để gỡ knownGap.
 */

function unitsOfCarton(
  all: Map<string, PackingUnit>,
  carton: SolveOutcome['cartons'][number],
): PackingUnit[] {
  return carton.placements.map((p) => {
    const base = all.get(p.item_key);
    if (!base) throw new Error(`Placement tham chiếu món lạ ${p.item_key}`);
    return p.folded === true ? foldUnit(base) : base;
  });
}

function run(s: Scenario): SolveOutcome {
  return solve(s.items, s.boxes ?? sampleBoxes(), {
    availability: toAvailability(s),
    allowMulti: s.allowMulti,
  });
}

function assertScenario(s: Scenario): void {
  const outcome = run(s);
  expect(outcome.status).toBe(s.expected.status);

  if (outcome.status === 'ok') {
    const allUnits = new Map(
      expandToUnits(s.items).map((u) => [u.item_key, u]),
    );
    const placedKeys: string[] = [];
    for (const carton of outcome.cartons) {
      const violations = validateCandidate(
        unitsOfCarton(allUnits, carton),
        carton.box,
        carton.placements,
      );
      expect(violations.map((v) => v.message)).toEqual([]);
      placedKeys.push(...carton.placements.map((p) => p.item_key));
    }
    // Không mất / không trùng món giữa các kiện.
    expect([...placedKeys].sort()).toEqual([...allUnits.keys()].sort());
    if (s.expected.maxCartons !== undefined)
      expect(outcome.cartons.length).toBeLessThanOrEqual(s.expected.maxCartons);
    if (s.expected.minCartons !== undefined)
      expect(outcome.cartons.length).toBeGreaterThanOrEqual(
        s.expected.minCartons,
      );
  } else if (s.expected.reasonCode) {
    expect(outcome.reasonCodes).toContain(s.expected.reasonCode);
  }
}

// Kịch bản lớn (60/120 món) chạy nhiều giây ở baseline — nới timeout mặc định 5 s.
jest.setTimeout(60_000);

describe('Bộ kịch bản đơn hàng — engine + validator độc lập', () => {
  for (const scenario of SCENARIOS) {
    const title = `[${scenario.id}] ${scenario.group}: ${scenario.name}`;
    if (scenario.knownGap) {
      it.failing(`${title} — KNOWN GAP (${scenario.knownGap})`, () => {
        assertScenario(scenario);
      });
    } else {
      it(title, () => {
        assertScenario(scenario);
      });
    }
  }

  it('mã kịch bản không trùng nhau', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('xác định: cùng đơn chạy 2 lần cho cùng placements', () => {
    // Chỉ dùng kịch bản nhanh — engine có ngân sách thời gian theo đồng hồ nên
    // kịch bản sát trần thời gian có thể lệch giữa 2 lần chạy khi máy bận.
    const fast = new Set(['Q1', 'Q2', 'H1', 'H4', 'C3', 'F2', 'K1', 'E3']);
    for (const scenario of SCENARIOS.filter((s) => fast.has(s.id))) {
      const strip = (o: SolveOutcome): unknown =>
        o.cartons.map((c) => ({ box: c.box.code, placements: c.placements }));
      expect(strip(run(scenario))).toEqual(strip(run(scenario)));
    }
  });
});
