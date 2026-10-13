import { expandToUnits } from '../../packaging/engine/units';
import {
  customBox,
  dress,
  item,
  jean,
  sampleBoxes,
  sandal,
  shoebox,
  sunglasses,
  tee,
} from '../../packaging/engine/scenarios/order-scenarios';
import type { PackableItem } from '../../../common/interfaces/packaging.interface';
import { runBrkga, DEFAULT_BRKGA } from './brkga';
import { mulberry32 } from './prng';
import { cheapReject } from './proof';
import { solveOrder, validatePlan } from './solve-order';
import type { SolveOptions, SolveResult } from './types';

jest.setTimeout(60_000);

const solve = (
  items: PackableItem[],
  options: SolveOptions = {},
  boxes = sampleBoxes(),
): SolveResult => solveOrder(expandToUnits(items), boxes, options);

const cost = (r: SolveResult): number =>
  r.parcels.reduce((s, p) => s + (p.box.price_vnd ?? 0), 0);

/** Kết quả phải tự qua validator cấp kế hoạch (bộ giải đã ném lỗi nếu không, đây là kiểm lại). */
function expectValid(r: SolveResult, items: PackableItem[]): void {
  const keys = expandToUnits(items)
    .map((u) => u.item_key)
    .filter((k) => !r.unplaced.some((x) => x.item_key === k));
  expect(validatePlan(r.parcels, keys)).toEqual([]);
}

describe('Bộ giải BRKGA + EMS', () => {
  describe('tính đúng đắn', () => {
    it('mọi đơn ngẫu nhiên đều cho phương án qua validator độc lập', () => {
      const rand = mulberry32(42);
      const makers = [tee, jean, dress, shoebox, sandal, sunglasses];
      for (let t = 0; t < 25; t += 1) {
        const items: PackableItem[] = [];
        const kinds = 1 + Math.floor(rand() * 4);
        for (let k = 0; k < kinds; k += 1) {
          const make = makers[Math.floor(rand() * makers.length)] ?? tee;
          items.push(make(1 + Math.floor(rand() * 4), `SKU-${String(t)}-${String(k)}`));
        }
        const r = solve(items, { maxEvaluations: 600 });
        expect(r.unplaced).toEqual([]);
        expectValid(r, items);
        expect(r.parcels.length).toBeGreaterThanOrEqual(r.lower_bound_parcels);
      }
    });

    it('xác định: cùng đầu vào → cùng phương án (tọa độ giống hệt)', () => {
      const items = [tee(6), jean(3), shoebox(2), sunglasses(1)];
      const a = solve(items);
      const b = solve(items);
      expect(JSON.stringify(b.parcels.map((p) => [p.box.code, p.placements]))).toBe(
        JSON.stringify(a.parcels.map((p) => [p.box.code, p.placements])),
      );
    });

    it('đơn ≤ 3 món vét cạn, đơn lớn hơn dùng BRKGA', () => {
      expect(solve([tee(2), jean(1)]).strategy).toBe('exhaustive');
      expect(solve([tee(4), jean(2)], { maxEvaluations: 300 }).strategy).toBe('brkga');
    });

    it('áo vắt qua 2 hộp giày được (đỡ bởi hợp 2 mặt trên)', () => {
      const items = [shoebox(2), tee(1)];
      const r = solve(items);
      expect(r.parcels).toHaveLength(1);
      expectValid(r, items);
    });

    it('hàng dễ vỡ không bị đặt gì lên trên', () => {
      const items = [sunglasses(3), tee(4)];
      const r = solve(items, { maxEvaluations: 800 });
      expectValid(r, items); // validator cấm vật nằm trên hàng dễ vỡ
    });

    it('đơn 3 kiện cũ (benchmark #58) giờ chỉ cần 2 kiện', () => {
      const items = [
        sunglasses(1, 'GLASSES-1'),
        tee(2, 'TEE-2'),
        shoebox(1, 'SHOE-1'),
        sandal(3, 'SANDAL-1'),
        tee(3, 'TEE-0'),
        shoebox(1, 'SHOE-0'),
        dress(5, 'DRESS-0'),
        dress(2, 'DRESS-1'),
        shoebox(1, 'SHOE-HEAVY-0', 2.5),
      ];
      const r = solve(items);
      expect(r.parcels).toHaveLength(2);
      expectValid(r, items);
    });
  });

  describe('gập đôi chỉ khi cần', () => {
    it('áo vừa thùng M khi trải phẳng thì không gập', () => {
      const r = solve([tee(1)]);
      expect(r.parcels[0]?.box.code).toBe('SAMPLE-M');
      expect(r.parcels[0]?.placements.some((p) => p.folded === true)).toBe(false);
    });

    it('quần jean rộng 26 cm không vừa lòng M (25 cm) → gập để dùng M thay vì L', () => {
      const r = solve([jean(1)]);
      expect(r.parcels[0]?.box.code).toBe('SAMPLE-M');
      expect(r.parcels[0]?.placements[0]?.folded).toBe(true);
    });

    it('quần dài hơn mọi thùng thì gập', () => {
      const long = item('LONG', [52, 20, 2], 0.4, { category: 'trousers', stackKg: 5, fold: true });
      const r = solve([long]);
      expect(r.status).toBe('ok');
      expect(r.parcels[0]?.placements[0]?.folded).toBe(true);
    });
  });

  describe('tồn kho và điều kiện tính lại', () => {
    it('không dùng thùng đã hết; thùng vừa nhất hết thì dùng thùng khác', () => {
      const items = [jean(1)];
      const free = solve(items);
      const usedCode = free.parcels[0]?.box.code ?? '';
      const r = solve(items, { availability: new Map([[usedCode, 0], ['SAMPLE-L', 5]]) });
      expect(r.parcels[0]?.box.code).toBe('SAMPLE-L');
    });

    it('không dùng thùng bị loại trừ', () => {
      const r = solve([tee(2)], { excludeBoxCodes: ['SAMPLE-S', 'SAMPLE-M'] });
      expect(r.parcels.every((p) => p.box.code === 'SAMPLE-L')).toBe(true);
    });

    it('mọi thùng vừa đều hết → OUT_OF_STOCK', () => {
      const r = solve([tee(1)], {
        availability: new Map([['SAMPLE-S', 0], ['SAMPLE-M', 0], ['SAMPLE-L', 0]]),
      });
      expect(r.status).toBe('no_fit');
      expect(r.unplaced[0]?.code).toBe('OUT_OF_STOCK');
    });

    it('món quá cỡ / quá nặng có mã lý do riêng', () => {
      const huge = item('HUGE', [200, 200, 200], 1);
      const heavy = item('HEAVY', [10, 10, 10], 30);
      expect(solve([huge]).unplaced[0]?.code).toBe('ITEM_TOO_LARGE');
      expect(solve([heavy]).unplaced[0]?.code).toBe('ITEM_TOO_HEAVY');
    });

    it('ưu tiên rẻ nhất không bao giờ đắt hơn ưu tiên ít kiện', () => {
      const items = [tee(10), shoebox(3)];
      const fewest = solve(items, { maxEvaluations: 800 });
      const cheapest = solve(items, { maxEvaluations: 800, prefer: 'cheapest' });
      expect(cost(cheapest)).toBeLessThanOrEqual(cost(fewest));
    });
  });

  describe('nhãn chứng minh', () => {
    it('1 áo vào thùng rẻ nhất → optimal_global, có lời giải thích', () => {
      const r = solve([tee(1)]);
      expect(r.proof).toBe('optimal_global');
      expect(r.explanation.length).toBeGreaterThan(0);
    });

    it('áo cần thùng M: thùng S bị loại có lý do cụ thể', () => {
      const r = solve([jacket()]);
      expect(r.parcels[0]?.box.code).not.toBe('SAMPLE-S');
      expect(r.proof).toBe('optimal_global');
      expect(r.explanation.some((e) => e.startsWith('SAMPLE-S'))).toBe(true);
    });

    it('số kiện vượt cận dưới → heuristic (không nhận tối ưu bừa)', () => {
      const r = solve([shoebox(8)], { maxEvaluations: 600 });
      if (r.parcels.length > r.lower_bound_parcels) expect(r.proof).toBe('heuristic');
    });

    it('cheapReject: điều kiện cần loại đúng tổ hợp', () => {
      const units = expandToUnits([jacket()]);
      const variants = units.map((u) => [
        { unit: u, orientation: 'LWH' as const, dx: u.length_mm, dy: u.width_mm, dz: u.height_mm },
      ]);
      const small = customBox('TINY', [100, 100, 100], 10_000);
      expect(cheapReject(units, variants, [small])).toMatch(/không vừa/);
      expect(cheapReject(units, variants, sampleBoxes().slice(2))).toBeNull();
    });
  });

  describe('validatePlan', () => {
    it('bắt món thiếu, món trùng và dùng quá tồn', () => {
      const r = solve([tee(2)]);
      const [p] = r.parcels;
      if (!p) throw new Error('thiếu kiện');
      expect(validatePlan([p, p], ['TEE#1', 'TEE#2'])).toEqual(
        expect.arrayContaining([expect.stringMatching(/xuất hiện 2 lần/)]),
      );
      expect(validatePlan([p], ['TEE#1', 'TEE#2', 'TEE#3'])).toEqual(
        expect.arrayContaining([expect.stringMatching(/TEE#3 xuất hiện 0 lần/)]),
      );
      expect(validatePlan([p], ['TEE#1', 'TEE#2'], new Map([[p.box.code, 0]]))).toEqual(
        expect.arrayContaining([expect.stringMatching(/chỉ còn 0/)]),
      );
    });
  });
});

describe('Chia đều kiện (v2, 04/10/2026)', () => {
  // Đơn sỉ của dữ liệu demo: 40 áo thun + 12 quần jean (cả hai gập đôi được).
  const wholesale = (): PackableItem[] => [
    item('DEMO-TEE', [36, 24, 4], 0.22, { qty: 40, category: 't_shirt', stackKg: 2, fold: true }),
    item('DEMO-JEAN', [38, 30, 6], 0.65, { qty: 12, category: 'trousers', stackKg: 3, fold: true }),
  ];
  const lowL = {
    ...customBox('SAMPLE-LT', [500, 400, 200], 15000),
    tare_g: 260,
    price_vnd: 6000,
  };
  const boxes = [...sampleBoxes(), lowL];
  const stock = new Map([
    ['SAMPLE-S', 20],
    ['SAMPLE-M', 0],
    ['SAMPLE-L', 16],
    ['SAMPLE-LT', 20],
  ]);

  const spread = (r: SolveResult): number => {
    const w = r.parcels.map((p) => p.items_weight_g);
    return Math.max(...w) - Math.min(...w);
  };

  it('đơn sỉ dùng thêm thùng L thấp: không quá 5 kiện / 36.000 đ, qua validator', () => {
    const items = wholesale();
    const r = solve(items, { availability: stock }, boxes);
    expect(r.unplaced).toEqual([]);
    expectValid(r, items);
    expect(r.parcels.length).toBeLessThanOrEqual(5);
    expect(cost(r)).toBeLessThanOrEqual(36000);
  });

  it('chia đều không đổi số kiện/tiền thùng và không làm lệch tải hơn', () => {
    const items = wholesale();
    const off = solve(items, { availability: stock, balance: false }, boxes);
    const on = solve(items, { availability: stock }, boxes);
    expect(on.parcels.length).toBe(off.parcels.length);
    expect(cost(on)).toBe(cost(off));
    expect(on.objective.folds).toBeLessThanOrEqual(off.objective.folds);
    expect(on.objective.imbalance).toBeLessThanOrEqual(off.objective.imbalance);
    expect(spread(on)).toBeLessThanOrEqual(spread(off) + 1e-9);
  });

  it('chia đều vẫn xác định: chạy 2 lần ra cùng tọa độ', () => {
    const a = solve(wholesale(), { availability: stock }, boxes);
    const b = solve(wholesale(), { availability: stock }, boxes);
    expect(b.parcels.map((p) => [p.box.code, p.placements])).toEqual(
      a.parcels.map((p) => [p.box.code, p.placements]),
    );
  });

  it('chia đều không dùng thùng ngoài tồn kho', () => {
    const r = solve(wholesale(), { availability: stock }, boxes);
    const keys = expandToUnits(wholesale()).map((u) => u.item_key);
    expect(validatePlan(r.parcels, keys, stock)).toEqual([]);
  });
});

describe('BRKGA (hàm tổng quát)', () => {
  // Bài toán đồ chơi: khóa càng gần 0,5 càng tốt.
  const evaluate = (k: Float64Array): number => k.reduce((s, x) => s + Math.abs(x - 0.5), 0);
  const params = { ...DEFAULT_BRKGA, populationSize: 30, maxEvaluations: 2000 };

  it('cải thiện so với cá thể ngẫu nhiên và không vượt ngân sách đánh giá', () => {
    const r = runBrkga(10, evaluate, (a, b) => a - b, params, mulberry32(1));
    expect(r.evaluations).toBeLessThanOrEqual(2000);
    expect(r.value).toBeLessThan(1.5);
  });

  it('cùng seed → cùng kết quả', () => {
    const a = runBrkga(10, evaluate, (x, y) => x - y, params, mulberry32(7));
    const b = runBrkga(10, evaluate, (x, y) => x - y, params, mulberry32(7));
    expect(Array.from(b.keys)).toEqual(Array.from(a.keys));
  });
});

function jacket(): PackableItem {
  return item('JACKET', [35, 28, 8], 0.9, { category: 'jacket', stackKg: 8 });
}
