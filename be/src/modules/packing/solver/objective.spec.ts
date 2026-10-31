import type { BoxSpec, PackingUnit, Placement } from '../../packaging/engine/types';
import {
  billableWeightG,
  compareObjective,
  DEFAULT_CHARGE_RULE,
  summarizePlacements,
} from './objective';
import type { Objective } from './types';

/** AOFP-224 — cân tính cước theo bậc làm tròn của hãng (docs/PACKAGING_STANDARD.md §2). */
describe('Cân tính cước theo bậc', () => {
  describe('billableWeightG', () => {
    it('lấy max(cân thật, quy đổi) rồi làm tròn lên bội số 500 g như GHN', () => {
      expect(billableWeightG(200, 465, 500)).toBe(500);
      expect(billableWeightG(200, 682, 500)).toBe(1000);
      expect(billableWeightG(1200, 300, 500)).toBe(1500);
      expect(billableWeightG(1500, 300, 500)).toBe(1500);
    });

    it('kiện rỗng/rất nhẹ vẫn tính tối thiểu 1 bước', () => {
      expect(billableWeightG(0, 0, 500)).toBe(500);
    });

    it('bước ≤ 0 = không làm tròn bậc (chỉ làm tròn lên gram)', () => {
      expect(billableWeightG(200, 681.3, 0)).toBe(682);
    });
  });

  describe('summarizePlacements', () => {
    const box: BoxSpec = {
      code: 'S',
      name: 'S',
      inner: { length_mm: 200, width_mm: 150, height_mm: 100 },
      outer: { length_mm: 206, width_mm: 156, height_mm: 106 },
      tare_g: 100,
      max_load_g: 20000,
      price_vnd: 2500,
    };
    const unit = {
      item_key: 'tee#1',
      sku: 'TEE',
      length_mm: 240,
      width_mm: 150,
      height_mm: 25,
      weight_g: 200,
    } as unknown as PackingUnit;
    const placement = {
      item_key: 'tee#1',
      sku: 'TEE',
      step: 1,
      x: 0,
      y: 0,
      z: 0,
      dx: 150,
      dy: 120,
      dz: 50,
      orientation: 'LWH',
      folded: true,
    } as unknown as Placement;

    it('mặc định theo GHN: thể tích ngoài ÷ 5000, bậc 500 g', () => {
      expect(DEFAULT_CHARGE_RULE).toEqual({ volumetricDivisor: 5000, billingStepG: 500 });
      const p = summarizePlacements(box, [unit], [placement], undefined);
      // 20,6 × 15,6 × 10,6 = 3.406,4 cm³ → 681,3 g → làm tròn lên 682 g
      expect(p.volumetric_weight_g).toBe(682);
      expect(p.estimated_package_weight_g).toBe(300);
      expect(p.billable_weight_g).toBe(1000);
    });

    it('dùng đúng divisor + bước của hãng được truyền vào', () => {
      const p = summarizePlacements(box, [unit], [placement], undefined, {
        volumetricDivisor: 6000,
        billingStepG: 0,
      });
      expect(p.volumetric_weight_g).toBe(568);
      expect(p.billable_weight_g).toBe(568);
    });
  });

  describe('compareObjective', () => {
    const base: Objective = {
      unplaced: 0,
      parcels: 1,
      packaging_cost_vnd: 2000,
      billable_g: 1000,
      volumetric_g: 600,
      folds: 0,
      imbalance: 0,
      cog: 0,
    };

    it('cùng số kiện: bậc cước thấp hơn thắng dù bao bì đắt hơn', () => {
      const lowerTier = { ...base, billable_g: 500, packaging_cost_vnd: 3000, volumetric_g: 480 };
      expect(compareObjective(lowerTier, base)).toBeLessThan(0);
      expect(compareObjective(lowerTier, base, 'cheapest')).toBeLessThan(0);
    });

    it('cùng bậc cước: bao bì rẻ hơn thắng dù quy đổi lớn hơn', () => {
      const cheaper = { ...base, packaging_cost_vnd: 1500, volumetric_g: 900 };
      expect(compareObjective(cheaper, base)).toBeLessThan(0);
    });

    it('fewest_parcels: ít kiện vẫn đứng trước bậc cước', () => {
      const oneParcel = { ...base, billable_g: 1500 };
      const twoParcels = { ...base, parcels: 2, billable_g: 1000 };
      expect(compareObjective(oneParcel, twoParcels)).toBeLessThan(0);
      expect(compareObjective(twoParcels, oneParcel, 'cheapest')).toBeLessThan(0);
    });
  });
});
