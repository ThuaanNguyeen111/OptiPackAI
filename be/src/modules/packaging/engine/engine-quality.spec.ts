import { packIntoMultipleCartons } from './multi-carton-packer';
import { consolidateCartons } from './improve';
import { CheckBudget } from './budget';
import { packOrder } from './greedy-packer';
import { validateCandidate } from './validator';
import { DEFAULT_FRAGILE_CUSHION_MM, expandToUnits, foldUnit } from './units';
import {
  dress,
  item,
  sampleBoxes,
  sandal,
  shoebox,
  sunglasses,
  tee,
} from './scenarios/order-scenarios';
import type { PackableItem } from '../../../common/interfaces/packaging.interface';
import type { PackOk, PackingUnit } from './types';

jest.setTimeout(60_000);

/** Mọi kiện phải qua validator độc lập (dựng lại đúng dạng gập từng món). */
function expectCartonsValid(units: PackingUnit[], cartons: PackOk[]): void {
  const byKey = new Map(units.map((u) => [u.item_key, u]));
  const seen: string[] = [];
  for (const carton of cartons) {
    const used = carton.placements.map((p) => {
      const base = byKey.get(p.item_key);
      if (!base) throw new Error(`món lạ ${p.item_key}`);
      return p.folded === true ? foldUnit(base) : base;
    });
    expect(
      validateCandidate(used, carton.box, carton.placements).map(
        (v) => v.message,
      ),
    ).toEqual([]);
    seen.push(...carton.placements.map((p) => p.item_key));
  }
  expect([...seen].sort()).toEqual([...byKey.keys()].sort());
}

const cost = (cartons: PackOk[]): number =>
  cartons.reduce((s, c) => s + (c.box.price_vnd ?? 0) + c.materials_cost_vnd, 0);

/**
 * Đơn thật từng ra 3 kiện (L 14 món, L 4 món lấp 0,20, M 1 giày nặng) dù cận dưới
 * là 1 — nguồn: benchmark 300 đơn, seed 20260930.
 */
const THREE_CARTON_ORDER: PackableItem[] = [
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

describe('Engine — chất lượng xếp (Bước 2)', () => {
  describe('giải thể kiện nhỏ', () => {
    it('đơn 3 kiện được gộp còn 2 và rẻ hơn, mọi kiện vẫn qua validator', () => {
      const units = expandToUnits(THREE_CARTON_ORDER);
      const before = packIntoMultipleCartons(units, sampleBoxes(), {
        consolidate: false,
      });
      const after = packIntoMultipleCartons(units, sampleBoxes());

      expect(before.status).toBe('ok');
      expect(after.status).toBe('ok');
      expect(after.cartons.length).toBeLessThan(before.cartons.length);
      expect(cost(after.cartons)).toBeLessThan(cost(before.cartons));
      expectCartonsValid(units, after.cartons);
    });

    it('không bao giờ làm tăng số kiện hoặc chi phí', () => {
      const orders: PackableItem[][] = [
        [tee(30), shoebox(6)],
        [shoebox(8)],
        [tee(12), dress(6), sandal(4)],
        THREE_CARTON_ORDER,
      ];
      for (const items of orders) {
        const units = expandToUnits(items);
        const off = packIntoMultipleCartons(units, sampleBoxes(), {
          consolidate: false,
        });
        const on = packIntoMultipleCartons(units, sampleBoxes());
        expect(on.cartons.length).toBeLessThanOrEqual(off.cartons.length);
        expect(cost(on.cartons)).toBeLessThanOrEqual(cost(off.cartons));
        expectCartonsValid(units, on.cartons);
      }
    });

    it('xác định: cùng đầu vào cho cùng kế hoạch', () => {
      const units = expandToUnits(THREE_CARTON_ORDER);
      const a = packIntoMultipleCartons(units, sampleBoxes());
      const b = packIntoMultipleCartons(units, sampleBoxes());
      expect(JSON.stringify(b.cartons.map((c) => c.placements))).toBe(
        JSON.stringify(a.cartons.map((c) => c.placements)),
      );
    });

    it('tôn trọng tồn kho: không dùng thùng đã hết', () => {
      const units = expandToUnits(THREE_CARTON_ORDER);
      const availability = new Map([
        ['SAMPLE-S', 0],
        ['SAMPLE-M', 0],
        ['SAMPLE-L', 5],
      ]);
      const plan = packIntoMultipleCartons(units, sampleBoxes(), {
        availability,
      });
      expect(plan.status).toBe('ok');
      expect(plan.cartons.every((c) => c.box.code === 'SAMPLE-L')).toBe(true);
    });

    it('hết ngân sách giữa chừng → giữ nguyên kế hoạch cũ, không hỏng', () => {
      const units = expandToUnits(THREE_CARTON_ORDER);
      const base = packIntoMultipleCartons(units, sampleBoxes(), {
        consolidate: false,
      });
      const kept = consolidateCartons(base.cartons, units, sampleBoxes(), {
        budget: new CheckBudget(0),
        now: () => 0,
      });
      expect(kept).toBe(base.cartons);
    });

    it('đơn quá nhiều kiện thì bỏ qua (không chậm)', () => {
      const units = expandToUnits([shoebox(8)]);
      const base = packIntoMultipleCartons(units, sampleBoxes(), {
        consolidate: false,
      });
      const kept = consolidateCartons(base.cartons, units, sampleBoxes(), {
        budget: new CheckBudget(1_000_000),
        now: () => 0,
        maxCartons: 1,
      });
      expect(kept).toBe(base.cartons);
    });
  });

  describe('cân bằng tải theo cả cân và thể tích', () => {
    it('đơn sỉ nhiều kiện: các kiện không lệch quá xa nhau', () => {
      const units = expandToUnits([tee(40), shoebox(6)]);
      const plan = packIntoMultipleCartons(units, sampleBoxes());
      expect(plan.status).toBe('ok');
      expectCartonsValid(units, plan.cartons);
      expect(plan.cartons.length).toBeGreaterThanOrEqual(2);
      const weights = plan.cartons.map((c) => c.items_weight_g);
      const total = weights.reduce((a, b) => a + b, 0);
      // Không còn cảnh một kiện gom gần hết hàng, kiện cuối chỉ vài món.
      expect(Math.max(...weights) / total).toBeLessThan(0.75);
    });
  });

  describe('khoảng đệm cho hàng dễ vỡ (vật tư vào hình học)', () => {
    const glasses = sunglasses(2, 'GLASSES');

    it('món dễ vỡ lớn hơn số đo thật đúng 2 × đệm theo mỗi chiều', () => {
      const [bare] = expandToUnits([glasses]);
      const [padded] = expandToUnits([glasses], { fragileCushionMm: 5 });
      expect(bare && padded).toBeTruthy();
      if (!bare || !padded) return;
      expect(padded.length_mm).toBe(bare.length_mm + 10);
      expect(padded.width_mm).toBe(bare.width_mm + 10);
      expect(padded.height_mm).toBe(bare.height_mm + 10);
      expect(padded.weight_g).toBe(bare.weight_g); // cân hàng không đổi
    });

    it('hàng KHÔNG dễ vỡ không bị thêm đệm', () => {
      const [bare] = expandToUnits([tee(1)]);
      const [padded] = expandToUnits([tee(1)], { fragileCushionMm: 5 });
      expect(padded).toEqual(bare);
    });

    it('mặc định không đệm (test hình học thuần), production dùng 5 mm', () => {
      expect(DEFAULT_FRAGILE_CUSHION_MM).toBe(5);
      const [a] = expandToUnits([glasses]);
      const [b] = expandToUnits([glasses], {});
      expect(b).toEqual(a);
    });

    it('xếp với đệm vẫn hợp lệ trên chính các món đã đệm', () => {
      const units = expandToUnits([glasses, tee(4)], { fragileCushionMm: 5 });
      const result = packOrder(units, sampleBoxes());
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expectCartonsValid(units, [result]);
    });

    it('đệm làm hộp vừa-khít không còn vừa (hành vi đúng: chừa chỗ bọc)', () => {
      // Hộp trong 160×70×50 mm: kính 160×70×50 vừa khít nếu không đệm.
      const tight = item('GL', [16, 7, 5], 0.2, { fragile: true });
      const box = {
        code: 'TIGHT',
        name: 'TIGHT',
        inner: { length_mm: 160, width_mm: 70, height_mm: 50 },
        outer: { length_mm: 170, width_mm: 80, height_mm: 60 },
        tare_g: 50,
        max_load_g: 5000,
        price_vnd: 1000,
      };
      expect(packOrder(expandToUnits([tight]), [box]).status).toBe('ok');
      expect(
        packOrder(expandToUnits([tight], { fragileCushionMm: 5 }), [box]).status,
      ).toBe('no_fit');
    });
  });
});
