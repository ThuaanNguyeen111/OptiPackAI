import {
  packIntoMultipleCartons,
  type MultiCartonPlan,
} from './multi-carton-packer';
import { validateCandidate } from './validator';
import { expandToUnits, foldUnit } from './units';
import {
  customBox,
  item,
  jean,
  sampleBoxes,
  shoebox,
  sunglasses,
  tee,
} from './scenarios/order-scenarios';
import type { PackableItem } from '../../../common/interfaces/packaging.interface';
import type { PackOk } from './types';

jest.setTimeout(60_000);

function assertCartonsValid(
  items: PackableItem[],
  cartons: PackOk[],
  expectAll = true,
): void {
  const all = new Map(expandToUnits(items).map((u) => [u.item_key, u]));
  const seen: string[] = [];
  for (const carton of cartons) {
    const units = carton.placements.map((p) => {
      const base = all.get(p.item_key);
      if (!base) throw new Error(`món lạ ${p.item_key}`);
      return p.folded === true ? foldUnit(base) : base;
    });
    expect(
      validateCandidate(units, carton.box, carton.placements).map(
        (v) => v.message,
      ),
    ).toEqual([]);
    seen.push(...carton.placements.map((p) => p.item_key));
  }
  expect(new Set(seen).size).toBe(seen.length); // không món nào ở 2 kiện
  if (expectAll) expect([...seen].sort()).toEqual([...all.keys()].sort());
}

const plan = (
  items: PackableItem[],
  opts: Parameters<typeof packIntoMultipleCartons>[2] = {},
  boxes = sampleBoxes(),
): MultiCartonPlan =>
  packIntoMultipleCartons(expandToUnits(items), boxes, opts);

describe('packIntoMultipleCartons', () => {
  it('đơn vừa 1 thùng → đúng 1 kiện (ít kiện nhất luôn ưu tiên)', () => {
    const items = [tee(3), jean()];
    const result = plan(items);
    expect(result.status).toBe('ok');
    expect(result.cartons).toHaveLength(1);
    expect(result.unplaced).toEqual([]);
    assertCartonsValid(items, result.cartons);
  });

  it('25 kg giày > tải thùng lớn nhất → nhiều kiện, mỗi kiện ≤ max_load, đủ món, không trùng', () => {
    const items = [shoebox(5, 'HEAVY', 5)];
    const result = plan(items);
    expect(result.status).toBe('ok');
    expect(result.cartons.length).toBeGreaterThanOrEqual(2);
    for (const c of result.cartons)
      expect(c.items_weight_g).toBeLessThanOrEqual(c.box.max_load_g);
    assertCartonsValid(items, result.cartons);
  });

  it('món quá cỡ bị tách riêng, phần còn lại vẫn đóng (partial + lý do có mã)', () => {
    const items = [tee(2), item('BIG', [90, 70, 60], 4)];
    const result = plan(items);
    expect(result.status).toBe('partial');
    expect(result.unplaced.map((u) => u.code)).toEqual(['ITEM_TOO_LARGE']);
    expect(result.unplacedItemKeys).toEqual(['BIG#1']);
    assertCartonsValid([tee(2)], result.cartons);
  });

  it('không món nào đóng được → no_fit', () => {
    const result = plan([
      item('BIG', [90, 70, 60], 4),
      item('ANVIL', [20, 20, 10], 40),
    ]);
    expect(result.status).toBe('no_fit');
    expect(result.cartons).toEqual([]);
    expect(result.unplaced.map((u) => u.code).sort()).toEqual([
      'ITEM_TOO_HEAVY',
      'ITEM_TOO_LARGE',
    ]);
  });

  it('trừ tồn thùng theo từng kiện: cần 3 kiện L nhưng chỉ còn 2 → phần còn lại OUT_OF_STOCK', () => {
    const items = [shoebox(6, 'HEAVY', 5)]; // 30 kg, mỗi thùng L nhận ≤ 2 hộp
    const availability = new Map([
      ['SAMPLE-S', 0],
      ['SAMPLE-M', 0],
      ['SAMPLE-L', 2],
    ]);
    const result = plan(items, { availability });
    expect(result.status).toBe('partial');
    expect(result.cartons).toHaveLength(2);
    expect(result.unplaced.every((u) => u.code === 'OUT_OF_STOCK')).toBe(true);
    assertCartonsValid(items, result.cartons, false);
  });

  it('đủ thùng thì dùng đủ (2 thùng L còn lại cho đơn cần 2 kiện) → ok', () => {
    const items = [shoebox(4, 'HEAVY', 5)];
    const availability = new Map([
      ['SAMPLE-S', 0],
      ['SAMPLE-M', 0],
      ['SAMPLE-L', 2],
    ]);
    const result = plan(items, { availability });
    expect(result.status).toBe('ok');
    assertCartonsValid(items, result.cartons);
  });

  it('chạm giới hạn số kiện → phần còn lại NO_ARRANGEMENT', () => {
    const items = [shoebox(6, 'HEAVY', 5)];
    const result = plan(items, { maxCartons: 1 });
    expect(result.status).toBe('partial');
    expect(result.cartons).toHaveLength(1);
    expect(result.unplaced.every((u) => u.code === 'NO_ARRANGEMENT')).toBe(
      true,
    );
  });

  it('250 món nhỏ (vượt trần 1 thùng) vẫn đóng đủ nhiều kiện, đủ món, không trùng', () => {
    const items = [item('CUBE', [8, 8, 8], 0.1, { qty: 250 })];
    // Không đo đồng hồ (04/10/2026): engine dùng ngân sách theo số lần kiểm
    // tra nên kết quả xác định; thời gian chạy chỉ phản ánh tải máy và từng
    // làm hook pre-commit trượt ngẫu nhiên. Engine này giờ chỉ là mốc so sánh.
    const result = plan(items);
    expect(result.status).toBe('ok');
    assertCartonsValid(items, result.cartons);
  });

  it('dễ vỡ luôn hợp lệ trong đa kiện (không bị đè lên)', () => {
    const items = [sunglasses(10), shoebox(4, 'HEAVY', 5), tee(10)];
    const result = plan(items);
    expect(result.status).toBe('ok');
    assertCartonsValid(items, result.cartons);
  });

  it('hết giờ → món còn lại TIMEOUT, không ném lỗi', () => {
    let t = 0;
    const items = [tee(60)];
    const result = plan(items, { timeBudgetMs: 5, now: () => (t += 10) });
    expect(result.unplaced.length + result.cartons.length).toBeGreaterThan(0);
    expect(
      result.unplaced.every(
        (u) => u.code === 'TIMEOUT' || u.code === 'NO_ARRANGEMENT',
      ),
    ).toBe(true);
  });

  it('xác định: cùng đầu vào cho cùng kế hoạch', () => {
    const items = [tee(12), jean(6), shoebox(3)];
    const strip = (p: MultiCartonPlan): unknown =>
      p.cartons.map((c) => ({ box: c.box.code, placements: c.placements }));
    expect(strip(plan(items))).toEqual(strip(plan(items)));
  });

  it('thùng tùy biến: kiện đầu chọn thùng nhỏ nhất chứa được toàn bộ phần còn lại', () => {
    // 3 khối 100 mm: thùng nhỏ chứa 1, thùng lớn chứa 2 → 2 khối vào thùng lớn, 1 khối cuối vào thùng NHỎ.
    const boxes = [
      customBox('ONE', [100, 100, 100]),
      customBox('TWO', [100, 100, 200]),
    ];
    const items = [item('CUBE', [10, 10, 10], 0.2, { qty: 3, stackKg: 5 })];
    const result = plan(items, {}, boxes);
    expect(result.status).toBe('ok');
    expect(result.cartons.map((c) => c.box.code)).toEqual(['TWO', 'ONE']);
    expect(result.cartons.map((c) => c.placements.length)).toEqual([2, 1]);
    assertCartonsValid(items, result.cartons);
  });
});

describe('cân bằng tải giữa các kiện', () => {
  const spread = (cartons: { items_weight_g: number }[]): number =>
    Math.max(...cartons.map((c) => c.items_weight_g)) -
    Math.min(...cartons.map((c) => c.items_weight_g));
  // 2 khối 9 kg + 8 khối 2 kg = 34 kg; thùng rộng nhưng chỉ chịu 20 kg → 2 kiện.
  // Điền theo thể tích cho 20 kg + 14 kg; cân bằng phải kéo về 17 kg + 17 kg.
  const items = (): PackableItem[] => [
    item('HEAVY', [15, 15, 15], 9, { qty: 2, stackKg: 30 }),
    item('LIGHT', [15, 15, 15], 2, { qty: 8, stackKg: 30 }),
  ];
  const boxes = [customBox('BIG', [600, 400, 400], 20000)];

  it('điền theo thể tích để kiện đầu nặng sát trần; cân bằng kéo hai kiện về 17 kg + 17 kg', () => {
    const unbalanced = plan(items(), { balanceLoad: false }, boxes);
    const balanced = plan(items(), {}, boxes);
    expect(unbalanced.status).toBe('ok');
    expect(balanced.status).toBe('ok');
    expect(balanced.cartons).toHaveLength(unbalanced.cartons.length);
    expect(spread(balanced.cartons)).toBeLessThanOrEqual(
      spread(unbalanced.cartons),
    );
    expect(spread(balanced.cartons)).toBeLessThanOrEqual(3000);
    assertCartonsValid(items(), balanced.cartons);
  });

  it('cân bằng KHÔNG làm tăng số kiện, không mất/trùng món, không vượt tải thùng', () => {
    const result = plan([shoebox(7, 'H', 4), tee(6)]);
    expect(result.status).toBe('ok');
    assertCartonsValid([shoebox(7, 'H', 4), tee(6)], result.cartons);
    for (const c of result.cartons)
      expect(c.items_weight_g).toBeLessThanOrEqual(c.box.max_load_g);
  });

  it('kế hoạch 1 kiện không đổi', () => {
    const balanced = plan([tee(2)]);
    const unbalanced = plan([tee(2)], { balanceLoad: false });
    expect(
      balanced.cartons.map((c) => c.placements.map((p) => p.item_key)),
    ).toEqual(
      unbalanced.cartons.map((c) => c.placements.map((p) => p.item_key)),
    );
  });

  it('trừ tồn thùng đúng sau cân bằng: còn 2 thùng BIG cho đơn cần 2 kiện → vẫn ok', () => {
    const result = plan(
      items(),
      { availability: new Map([['BIG', 2]]) },
      boxes,
    );
    expect(result.status).toBe('ok');
    expect(result.cartons).toHaveLength(2);
  });
});
