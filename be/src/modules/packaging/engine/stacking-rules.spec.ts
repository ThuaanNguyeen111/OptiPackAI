import { ProductCategory } from '../../../common/enums/product-category.enum';
import { packOrder } from './greedy-packer';
import { validateCandidate } from './validator';
import type { BoxSpec, PackingUnit, Placement } from './types';
import { ALL_ORIENTATIONS } from './types';

/**
 * (16/11/2026, user chốt) Luật xếp chồng: hàng cứng (không thuộc 6 loại quần áo)
 * không được nằm trên quần áo, kể cả chỉ một phần đáy; riêng hàng dễ vỡ được
 * nằm trên quần áo (đệm êm), nhưng vẫn không được đè gì lên nó.
 */
function unit(
  key: string,
  [l, w, h]: [number, number, number],
  weight: number,
  opts: { category?: string; fragile?: boolean; maxStack?: number | null } = {},
): PackingUnit {
  return {
    item_key: key,
    sku: key.split('#')[0] ?? key,
    length_mm: l,
    width_mm: w,
    height_mm: h,
    weight_g: weight,
    is_fragile: opts.fragile ?? false,
    orientations: ALL_ORIENTATIONS,
    max_stack_load_g: opts.maxStack === undefined ? 5000 : opts.maxStack,
    product_category: opts.category ?? null,
  };
}

const box: BoxSpec = {
  code: 'B',
  name: 'B',
  inner: { length_mm: 400, width_mm: 300, height_mm: 300 },
  outer: { length_mm: 410, width_mm: 310, height_mm: 310 },
  tare_g: 180,
  max_load_g: 20000,
  price_vnd: null,
};

function place(u: PackingUnit, step: number, [x, y, z]: [number, number, number]): Placement {
  return { item_key: u.item_key, sku: u.sku, step, x, y, z, dx: u.length_mm, dy: u.width_mm, dz: u.height_mm, orientation: 'LWH' };
}

const shirt = unit('AO#1', [300, 200, 40], 200, { category: ProductCategory.T_SHIRT });
const shoe = unit('GIAY#1', [300, 200, 120], 900, { category: ProductCategory.SHOES });
const glasses = unit('KINH#1', [160, 70, 50], 150, { category: ProductCategory.ACCESSORY, fragile: true, maxStack: null });

const codes = (placements: Placement[], units: PackingUnit[]): string[] =>
  validateCandidate(units, box, placements).map((v) => v.code);

describe('Luật xếp chồng — packOrder', () => {
  it('áo phủ kín đáy thùng, chỉ còn cách đặt giày lên áo → no_fit', () => {
    const smallShoe = unit('GIAY#9', [150, 100, 100], 100, { category: ProductCategory.SHOES });
    const tight: BoxSpec = { ...box, code: 'TIGHT', inner: { length_mm: 300, width_mm: 200, height_mm: 140 } };
    expect(packOrder([shirt, smallShoe], [tight]).status).toBe('no_fit');
  });
});

describe('Luật xếp chồng — validator', () => {
  it('hộp giày đặt lên áo → HARD_ON_SOFT', () => {
    expect(codes([place(shirt, 1, [0, 0, 0]), place(shoe, 2, [0, 0, 40])], [shirt, shoe])).toContain('HARD_ON_SOFT');
  });

  it('áo đặt lên hộp giày là hợp lệ', () => {
    expect(codes([place(shoe, 1, [0, 0, 0]), place(shirt, 2, [0, 0, 120])], [shirt, shoe])).toEqual([]);
  });

  it('hộp giày nửa trên hộp giày, nửa trên áo cao bằng nhau → HARD_ON_SOFT', () => {
    const shoeBase = unit('GIAY#2', [150, 200, 40], 300, { category: ProductCategory.SHOES });
    const halfShirt = unit('AO#2', [150, 200, 40], 200, { category: ProductCategory.T_SHIRT });
    expect(
      codes(
        [place(shoeBase, 1, [0, 0, 0]), place(halfShirt, 2, [150, 0, 0]), place(shoe, 3, [0, 0, 40])],
        [shoeBase, halfShirt, shoe],
      ),
    ).toContain('HARD_ON_SOFT');
  });

  it('hàng dễ vỡ được nằm trên áo', () => {
    expect(codes([place(shirt, 1, [0, 0, 0]), place(glasses, 2, [0, 0, 40])], [shirt, glasses])).toEqual([]);
  });

  it('áo chồng lên áo là hợp lệ', () => {
    const shirt2 = unit('AO#2', [300, 200, 40], 200, { category: ProductCategory.T_SHIRT });
    expect(codes([place(shirt, 1, [0, 0, 0]), place(shirt2, 2, [0, 0, 40])], [shirt, shirt2])).toEqual([]);
  });
});
