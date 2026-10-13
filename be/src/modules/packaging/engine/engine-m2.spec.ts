import { foldVariants, packOrder, MAX_UNITS } from './greedy-packer';
import { packIntoBoxEP } from './ep-packer';
import { validateCandidate } from './validator';
import { customBox, item, sampleBoxes, tee } from './scenarios/order-scenarios';
import { expandToUnits } from './units';
import type { PackingUnit } from './types';
import { ALL_ORIENTATIONS } from './types';

function cube(
  key: string,
  size: number,
  weight: number,
  opts: Partial<PackingUnit> = {},
): PackingUnit {
  return {
    item_key: key,
    sku: key.split('#')[0] ?? key,
    length_mm: size,
    width_mm: size,
    height_mm: size,
    weight_g: weight,
    is_fragile: false,
    orientations: ALL_ORIENTATIONS,
    max_stack_load_g: null,
    ...opts,
  };
}

describe('Engine M2 — lý do no_fit có mã', () => {
  it('món lớn hơn mọi thùng → ITEM_TOO_LARGE kèm món, gợi ý xử lý tay, không lặp từng thùng', () => {
    const units = expandToUnits([item('BIG', [80, 60, 50], 3)]);
    const result = packOrder(units, sampleBoxes());
    expect(result.status).toBe('no_fit');
    if (result.status !== 'no_fit') return;
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatchObject({
      code: 'ITEM_TOO_LARGE',
      item_key: 'BIG#1',
    });
    expect(result.suggest).toBe('manual');
  });

  it('món nặng hơn tải mọi thùng → ITEM_TOO_HEAVY', () => {
    const result = packOrder(
      expandToUnits([item('ANVIL', [20, 20, 10], 30)]),
      sampleBoxes(),
    );
    expect(result.status === 'no_fit' && result.reasons[0]?.code).toBe(
      'ITEM_TOO_HEAVY',
    );
  });

  it('món foldable chỉ vừa khi gập KHÔNG bị báo ITEM_TOO_LARGE', () => {
    // 60 x 20 x 2 cm, gập → 30 x 20 x 4; thùng lòng 350 x 250 x 200 chứa được cả hai dạng.
    const result = packOrder(
      expandToUnits([
        item('LONG', [60, 20, 2], 0.3, { fold: true, category: 't_shirt' }),
      ]),
      [customBox('NARROW', [320, 250, 60])],
    );
    expect(result.status).toBe('ok');
  });

  it('tổng thể tích/tải vượt mọi thùng nhưng từng món vừa → gợi ý multi_carton', () => {
    const units = expandToUnits([item('BLOCK', [30, 30, 30], 4, { qty: 12 })]);
    const result = packOrder(units, sampleBoxes());
    expect(result.status).toBe('no_fit');
    if (result.status === 'no_fit') expect(result.suggest).toBe('multi_carton');
  });

  it('tất cả thùng hết hàng → OUT_OF_STOCK và KHÔNG gợi ý đa kiện', () => {
    const result = packOrder(expandToUnits([tee()]), sampleBoxes(), {
      availability: new Map([
        ['SAMPLE-M', 0],
        ['SAMPLE-L', 0],
        ['SAMPLE-S', 0],
      ]),
    });
    expect(result.status).toBe('no_fit');
    if (result.status !== 'no_fit') return;
    expect(result.reasons.some((r) => r.code === 'OUT_OF_STOCK')).toBe(true);
    expect(result.suggest).toBeUndefined();
  });
});

describe('Engine M2 — bỏ trần 30 món', () => {
  it('40 khối nhỏ vào 1 thùng vừa (trước đây bị chặn vì > 30 món)', () => {
    const units = expandToUnits([item('CUBE', [5, 5, 5], 0.05, { qty: 40 })]);
    const result = packOrder(units, sampleBoxes());
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(validateCandidate(units, result.box, result.placements)).toEqual(
        [],
      );
    }
  });

  it(`đơn vượt ${String(MAX_UNITS)} món → TOO_MANY_UNITS + gợi ý multi_carton`, () => {
    const units = Array.from({ length: MAX_UNITS + 1 }, (_, i) =>
      cube(`C#${String(i + 1)}`, 10, 10),
    );
    const result = packOrder(units, sampleBoxes());
    expect(result.status === 'no_fit' && result.reasons[0]?.code).toBe(
      'TOO_MANY_UNITS',
    );
    expect(result.status === 'no_fit' && result.suggest).toBe('multi_carton');
  });
});

describe('Engine M2 — gập theo nhóm, ít món gập nhất trước', () => {
  const foldableTee = (key: string, sku: string): PackingUnit => ({
    ...cube(key, 100, 100, { max_stack_load_g: 5000 }),
    sku,
    length_mm: 300,
    width_mm: 200,
    height_mm: 30,
    foldable: true,
  });

  it('không món nào gập được → đúng 1 phương án (nguyên trạng)', () => {
    expect(
      foldVariants([cube('A#1', 50, 10), cube('A#2', 50, 10)]),
    ).toHaveLength(1);
  });

  it('3 áo cùng SKU → nguyên trạng, gập 1, gập 2, gập 3', () => {
    const units = [1, 2, 3].map((n) => foldableTee(`T#${String(n)}`, 'T'));
    const variants = foldVariants(units);
    expect(
      variants.map((v) => v.filter((u) => u.folded === true).length),
    ).toEqual([0, 1, 2, 3]);
  });

  it('2 SKU (2 + 1 món) → tổng số món gập không giảm, không trùng tổ hợp', () => {
    const units = [
      foldableTee('A#1', 'A'),
      foldableTee('A#2', 'A'),
      foldableTee('B#1', 'B'),
    ];
    const counts = foldVariants(units).map((v) =>
      v
        .filter((u) => u.folded === true)
        .map((u) => u.item_key)
        .join('+'),
    );
    expect(new Set(counts).size).toBe(counts.length);
    const sizes = counts.map((c) => (c === '' ? 0 : c.split('+').length));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    // 3 nhóm số lượng: A ∈ {0,1,2} x B ∈ {0,1} = 6 tổ hợp
    expect(counts).toHaveLength(6);
  });

  it('nhiều nhóm lớn không nổ tổ hợp (giới hạn số phương án)', () => {
    const units: PackingUnit[] = [];
    for (const sku of ['A', 'B', 'C', 'D']) {
      for (let n = 1; n <= 20; n += 1)
        units.push(foldableTee(`${sku}#${String(n)}`, sku));
    }
    expect(foldVariants(units).length).toBeLessThanOrEqual(48);
  });
});

describe('Engine M2 — tải chồng tăng dần khớp validator', () => {
  const column = (limitG: number): PackingUnit[] =>
    Array.from({ length: 4 }, (_, i) =>
      cube(`P#${String(i + 1)}`, 100, 100, { max_stack_load_g: limitG }),
    );
  // Thùng chỉ đủ 1 cột 100x100, cao 400: buộc phải chồng cả 4.
  const narrow = customBox('COLUMN', [100, 100, 400]);

  it('giới hạn 250 g: món dưới cùng gánh 300 g → không xếp được', () => {
    expect(
      packIntoBoxEP(column(250), narrow, () => undefined, 'corner'),
    ).toBeNull();
  });

  it('giới hạn 300 g: xếp được và validator chấp nhận', () => {
    const units = column(300);
    const placements = packIntoBoxEP(units, narrow, () => undefined, 'corner');
    expect(placements).not.toBeNull();
    if (placements)
      expect(validateCandidate(units, narrow, placements)).toEqual([]);
  });

  it('dễ vỡ không bao giờ có món khác đè lên (kể cả limit lớn)', () => {
    const fragile = cube('F#1', 100, 100, {
      is_fragile: true,
      max_stack_load_g: 9999,
    });
    const normal = cube('N#1', 100, 100, { max_stack_load_g: 9999 });
    const units = [fragile, normal];
    // Thùng chỉ đủ cột 2 tầng: chỉ hợp lệ khi dễ vỡ nằm TRÊN (xếp dễ vỡ sau cùng).
    const box = customBox('COLUMN2', [100, 100, 200]);
    const ordered = [normal, fragile];
    const placements = packIntoBoxEP(ordered, box, () => undefined, 'corner');
    expect(placements).not.toBeNull();
    if (placements)
      expect(validateCandidate(units, box, placements)).toEqual([]);
    expect(packIntoBoxEP(units, box, () => undefined, 'corner')).toBeNull(); // dễ vỡ xếp trước → N không đè lên được
  });
});

describe('Engine M2 — orientation policy cứu tổ hợp', () => {
  it('2 hộp giày upright chỉ vừa thùng L khi xoay 1 hộp — first-fit gốc bỏ lỡ, EP tìm ra', () => {
    const units = expandToUnits([
      item('SHOE', [33, 21, 12], 0.9, {
        qty: 2,
        upright: true,
        category: 'shoes',
      }),
    ]);
    const result = packOrder(units, [customBox('L', [500, 400, 130])]);
    expect(result.status).toBe('ok');
  });
});
