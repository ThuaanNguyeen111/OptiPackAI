import { expandToUnits } from './units';
import { packOrder } from './greedy-packer';
import { packIntoMultipleCartons } from './multi-carton-packer';
import { lowerBoundCartons } from './lower-bound';
import {
  item,
  jean,
  sampleBoxes,
  shoebox,
  tee,
} from './scenarios/order-scenarios';

/** Đồng hồ giả chạy với tốc độ tùy ý — mô phỏng máy nhanh/chậm/bận. */
const clock = (stepMs: number): (() => number) => {
  let t = 0;
  return () => (t += stepMs);
};

const strip = (
  cartons: { placements: unknown; box: { code: string } }[],
): string =>
  JSON.stringify(
    cartons.map((c) => ({ box: c.box.code, placements: c.placements })),
  );

describe('Engine — độ tin cậy kết quả (Bước 1)', () => {
  describe('xác định (không phụ thuộc đồng hồ tường)', () => {
    const items = [tee(12), jean(6), shoebox(3)];

    it('đa kiện: cùng đầu vào, đồng hồ nhanh hay chậm vẫn ra đúng cùng kết quả', () => {
      const a = packIntoMultipleCartons(expandToUnits(items), sampleBoxes(), {
        now: clock(0),
      });
      const b = packIntoMultipleCartons(expandToUnits(items), sampleBoxes(), {
        now: clock(1),
      });
      expect(a.status).toBe('ok');
      expect(strip(b.cartons)).toBe(strip(a.cartons));
      expect(b.checksUsed).toBe(a.checksUsed);
    });

    it('một thùng: kết quả không đổi khi đồng hồ chạy khác nhau', () => {
      const units = expandToUnits([tee(6), jean(2)]);
      const a = packOrder(units, sampleBoxes(), { now: clock(0) });
      const b = packOrder(units, sampleBoxes(), { now: clock(2) });
      expect(a.status).toBe('ok');
      expect(JSON.stringify(b)).toBe(JSON.stringify(a).replace(/"computation_time_ms":\d+/, `"computation_time_ms":${String(b.computation_time_ms)}`));
    });
  });

  describe('phân loại no_fit', () => {
    it('hết ngân sách → BUDGET_EXHAUSTED, KHÔNG được nói là vô nghiệm', () => {
      const result = packOrder(expandToUnits([tee(20)]), sampleBoxes(), {
        maxChecks: 20,
      });
      expect(result.status).toBe('no_fit');
      if (result.status !== 'no_fit') return;
      expect(result.reasons.some((r) => r.code === 'BUDGET_EXHAUSTED')).toBe(
        true,
      );
      expect(result.proven_infeasible).toBe(false);
    });

    it('món quá cỡ mọi thùng → có bằng chứng (proven_infeasible)', () => {
      const huge = item('HUGE', [200, 200, 200], 1);
      const result = packOrder(expandToUnits([huge]), sampleBoxes());
      expect(result.status).toBe('no_fit');
      if (result.status !== 'no_fit') return;
      expect(result.proven_infeasible).toBe(true);
    });

    it('đa kiện hết ngân sách → món còn lại mang mã BUDGET_EXHAUSTED', () => {
      const plan = packIntoMultipleCartons(
        expandToUnits([tee(40), jean(20)]),
        sampleBoxes(),
        { maxChecks: 200 },
      );
      expect(plan.status).not.toBe('ok');
      expect(plan.unplaced.length).toBeGreaterThan(0);
      expect(plan.unplaced.every((u) => u.code === 'BUDGET_EXHAUSTED')).toBe(
        true,
      );
    });
  });

  describe('cận dưới số kiện', () => {
    it('đơn rỗng hoặc không có thùng → 0', () => {
      expect(lowerBoundCartons([], sampleBoxes())).toBe(0);
      expect(lowerBoundCartons(expandToUnits([tee(1)]), [])).toBe(0);
    });

    it('một món nhỏ → 1', () => {
      expect(lowerBoundCartons(expandToUnits([tee(1)]), sampleBoxes())).toBe(1);
    });

    it('theo thể tích: cận = ceil(tổng thể tích ÷ lòng thùng lớn nhất)', () => {
      // 100 hộp 30×20×10 cm = 600.000 cm³; thùng L 500×400×350 mm = 70.000 cm³ → ≥ 9
      const box = item('BOX', [30, 20, 10], 0.1, { qty: 100, stackKg: 5 }); // chịu tải → chỉ áp cận thể tích
      expect(lowerBoundCartons(expandToUnits([box]), sampleBoxes())).toBe(9);
    });

    it('theo khối lượng: nặng hơn tải thùng thì cần nhiều kiện hơn', () => {
      const heavy = item('HEAVY', [10, 10, 10], 6, { qty: 7 }); // 42 kg, tải tối đa 20 kg
      expect(lowerBoundCartons(expandToUnits([heavy]), sampleBoxes())).toBe(3);
    });

    it('mọi món không chịu được tải đè → cận theo diện tích sàn, chặt hơn cận thể tích', () => {
      // 250 khối 8×8×8 cm không cho chồng: tất cả phải nằm sát sàn. Tổng đáy
      // 250 × 64 cm² = 16.000 cm², sàn thùng L 500×400 mm = 2.000 cm² → cần ≥ 8 kiện
      // (cận thể tích thuần chỉ cho 2). Thực tế engine cần 9 do xếp lưới 6×5.
      const cubes = item('CUBE', [8, 8, 8], 0.1, { qty: 250 });
      expect(lowerBoundCartons(expandToUnits([cubes]), sampleBoxes())).toBe(8);
    });

    it('có món chịu được tải đè → KHÔNG áp cận sàn (vẫn chỉ theo thể tích/cân)', () => {
      const cubes = item('CUBE', [8, 8, 8], 0.1, { qty: 250, stackKg: 5 });
      expect(lowerBoundCartons(expandToUnits([cubes]), sampleBoxes())).toBe(2);
    });

    it('số kiện thực tế không bao giờ nhỏ hơn cận dưới', () => {
      const items = [tee(30), jean(10), shoebox(6)];
      const units = expandToUnits(items);
      const plan = packIntoMultipleCartons(units, sampleBoxes());
      expect(plan.status).toBe('ok');
      expect(plan.cartons.length).toBeGreaterThanOrEqual(plan.lowerBound);
      expect(plan.lowerBound).toBe(lowerBoundCartons(units, sampleBoxes()));
    });
  });
});
