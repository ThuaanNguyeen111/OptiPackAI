import type { BoxSpec, PackingUnit, Placement } from '../../packaging/engine/types';
import { ALL_ORIENTATIONS, UPRIGHT_ORIENTATIONS } from '../../packaging/engine/types';
import { cutBoxNote } from '../../packaging/engine/packing-guide';
import { cutBoxToLoad, uncutBox } from './objective';
import { solveOrder, validatePlan } from './solve-order';

jest.setTimeout(60_000);

/** Luật 08/11/2026 (user chốt): cắt hạ thùng carton xuống sát chồng hàng khi bỏ được ≥ 5 cm. */
const BOX_L: BoxSpec = {
  code: 'BOX-L',
  name: 'Thùng carton L',
  inner: { length_mm: 500, width_mm: 400, height_mm: 350 },
  outer: { length_mm: 506, width_mm: 406, height_mm: 356 },
  tare_g: 380,
  max_load_g: 20000,
  price_vnd: 8000,
};

const at = (z: number, dz: number): Placement => ({
  item_key: 'A#1', sku: 'A', step: 1, x: 0, y: 0, z, dx: 100, dy: 100, dz, orientation: 'LWH',
});

const unit = (sku: string, l: number, w: number, h: number, g: number, category: string, soft: boolean): PackingUnit => ({
  item_key: `${sku}#1`,
  sku,
  length_mm: l,
  width_mm: w,
  height_mm: h,
  weight_g: g,
  is_fragile: false,
  orientations: soft ? UPRIGHT_ORIENTATIONS : ALL_ORIENTATIONS,
  max_stack_load_g: 5000,
  foldable: soft,
  product_category: category,
});

describe('Cắt hạ thùng', () => {
  it('cắt xuống đỉnh chồng hàng làm tròn lên cm, thành thùng giữ nguyên độ dày', () => {
    const cut = cutBoxToLoad(BOX_L, [at(0, 120), at(120, 105)]);
    expect(cut.inner.height_mm).toBe(230);
    expect(cut.outer.height_mm).toBe(236);
    expect(cut.cut_from).toEqual({ inner_height_mm: 350, outer_height_mm: 356 });
    expect(cut.code).toBe('BOX-L');
  });

  it('bỏ được dưới 5 cm thì không cắt; túi niêm phong không cắt', () => {
    expect(cutBoxToLoad(BOX_L, [at(0, 310)])).toEqual(BOX_L);
    expect(cutBoxToLoad(BOX_L, [at(0, 300)]).inner.height_mm).toBe(300);
    const mailer: BoxSpec = { ...BOX_L, kind: 'mailer' };
    expect(cutBoxToLoad(mailer, [at(0, 50)])).toEqual(mailer);
  });

  it('cắt lại luôn tính từ thùng gốc, uncutBox trả đúng thùng danh mục', () => {
    const low = cutBoxToLoad(BOX_L, [at(0, 100)]);
    expect(cutBoxToLoad(low, [at(0, 250)]).inner.height_mm).toBe(250);
    expect(cutBoxToLoad(low, [at(0, 340)])).toEqual(BOX_L);
    expect(uncutBox(low)).toEqual(BOX_L);
  });

  it('câu dặn cắt chỉ có khi thùng được cắt', () => {
    expect(cutBoxNote(BOX_L)).toBe('');
    expect(cutBoxNote(cutBoxToLoad(BOX_L, [at(0, 245)]))).toContain('lên 25 cm (thùng gốc 35 cm)');
  });

  it('đơn 8 món: bộ giải xếp thấp để cắt thùng, lấp đầy vượt 62% của thùng nguyên', () => {
    const order = [
      unit('AO-KHOAC', 350, 300, 60, 700, 'jacket', true),
      unit('AO-THUN', 360, 240, 40, 220, 't_shirt', true),
      unit('GIAY', 330, 210, 120, 900, 'shoes', false),
      unit('QUAN-DAI', 380, 300, 60, 650, 'trousers', true),
      unit('QUAN-SHORT', 300, 240, 40, 300, 'shorts', true),
      unit('SO-MI', 360, 260, 50, 300, 'shirt', true),
      unit('TUI-XACH', 300, 240, 120, 600, 'bag', false),
      unit('VAY', 320, 250, 30, 250, 'dress', true),
    ];
    const result = solveOrder(order, [BOX_L], { seed: 1 });
    const [parcel] = result.parcels;
    expect(result.parcels).toHaveLength(1);
    expect(parcel?.box.cut_from).toBeDefined();
    expect(parcel?.fill_ratio).toBeGreaterThan(0.7);
    expect(validatePlan(result.parcels, order.map((u) => u.item_key))).toEqual([]);
  });
});
