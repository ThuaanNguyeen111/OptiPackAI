import { expandToUnits } from '../../packaging/engine/units';
import { customBox } from '../../packaging/engine/scenarios/order-scenarios';
import { uncutBox } from './objective';
import { cheapReject, comboBound } from './proof';
import { variantsOf } from './solve-order';

// 2 khối 10 cm, 200 g. Thùng lòng 40×30×30 cm, ngoài 41×31×31 cm: nguyên cao = 8000 g cước.
const units = expandToUnits([
  {
    sku: 'CUBE',
    quantity: 2,
    length_cm: 10,
    width_cm: 10,
    height_cm: 10,
    weight_kg: 0.2,
    is_fragile: false,
    orientation_rule: 'any',
    max_stack_load_kg: 5,
    product_category: null,
  },
]);
const bound = comboBound(units, units.map(variantsOf));
const box = { ...customBox('A', [400, 300, 300]), price_vnd: 0 };

describe('comboBound.beatHeights — tổ hợp nhiều thùng', () => {
  it('mỗi thùng chỉ được cao tới mức tổng cước còn có thể dưới mục tiêu', () => {
    // Mục tiêu 2 kiện / 8000 g, cùng giá → cần ≤ 7999 g. Thùng kia thấp nhất 3000 g (cắt còn 10 cm)
    // → thùng này ≤ 4999 g: lòng 16 cm (ngoài 17 cm = 4322 g → 4500 g); 17 cm đã thành 5000 g.
    expect(bound.beatHeights([box, box], { parcels: 2, billable_g: 8000, box_price_vnd: 0 })).toEqual([160, 160]);
  });

  it('chia ngân sách cước thành trần từng thùng: hạ lòng theo quy đổi, hạ tải theo cân thật', () => {
    // ≤ 7999 g → 7500 g; mỗi thùng thấp nhất 3000 g → (4500, 3000) hoặc (4000, 3500), bỏ hoán vị.
    // Trần 4500 → lòng 16 cm, 4000 → 14 cm, 3500 → 12 cm, 3000 → 10 cm; tải = trần − 100 g bì.
    const splits = bound.billSplits([box, box], { parcels: 2, billable_g: 8000, box_price_vnd: 0 });
    expect(splits?.map((c) => c.map((b) => [b.inner.height_mm, b.max_load_g]))).toEqual([
      [[160, 4400], [100, 2900]],
      [[140, 3900], [120, 3400]],
    ]);
    // Về lại thùng danh mục: lòng và tải gốc.
    const back = uncutBox(splits?.[0]?.[0] ?? box);
    expect([back.inner.height_mm, back.max_load_g, back.catalog_max_load_g]).toEqual([300, 20000, undefined]);
  });

  it('không chiều cao nào đủ thì trả null', () => {
    // 2 thùng thấp nhất đã 6000 g ≥ mục tiêu 3500 g.
    expect(bound.beatHeights([box, box], { parcels: 2, billable_g: 3500, box_price_vnd: 0 })).toEqual([null, null]);
  });
});

describe('cheapReject — chia món vào nhiều thùng', () => {
  const block = (quantity: number): ReturnType<typeof expandToUnits> =>
    expandToUnits([
      {
        sku: 'BLOCK',
        quantity,
        length_cm: 15,
        width_cm: 15,
        height_cm: 8,
        weight_kg: 0.3,
        is_fragile: false,
        orientation_rule: 'upright_only',
        max_stack_load_kg: 5,
        product_category: null,
      },
    ]);
  const small = customBox('S', [200, 200, 100]);

  it('thể tích đủ nhưng không 2 món nào chung thùng được → loại', () => {
    // 3 khối 15×15×8 vào 2 thùng 20×20×10: chồng 16 cm > 10, cạnh nhau 30 cm > 20.
    const units3 = block(3);
    expect(cheapReject(units3, units3.map(variantsOf), [small, small])).toMatch(/không có cách chia món/);
  });

  it('mỗi món một thùng được → chưa loại', () => {
    const units2 = block(2);
    expect(cheapReject(units2, units2.map(variantsOf), [small, small])).toBeNull();
  });
});
