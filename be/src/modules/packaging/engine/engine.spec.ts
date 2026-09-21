import { packOrder, packIntoBox } from './greedy-packer';
import { validateCandidate } from './validator';
import { expandToUnits, cmToMmCeil } from './units';
import type { BoxSpec, Orientation, PackingUnit, Placement } from './types';
import { ALL_ORIENTATIONS } from './types';

function unit(
  key: string,
  [l, w, h]: [number, number, number],
  weight: number,
  opts: { orientations?: readonly Orientation[]; maxStack?: number | null; fragile?: boolean } = {},
): PackingUnit {
  return {
    item_key: key,
    sku: key.split('#')[0] ?? key,
    length_mm: l,
    width_mm: w,
    height_mm: h,
    weight_g: weight,
    is_fragile: opts.fragile ?? false,
    orientations: opts.orientations ?? ALL_ORIENTATIONS,
    max_stack_load_g: opts.maxStack ?? null,
  };
}

function box(code: string, inner: [number, number, number], outer?: [number, number, number]): BoxSpec {
  const [l, w, h] = inner;
  const [ol, ow, oh] = outer ?? [l + 10, w + 10, h + 10];
  return {
    code,
    name: code,
    inner: { length_mm: l, width_mm: w, height_mm: h },
    outer: { length_mm: ol, width_mm: ow, height_mm: oh },
    tare_g: 180,
    max_load_g: 20000,
    price_vnd: null,
  };
}

function place(u: PackingUnit, step: number, [x, y, z]: [number, number, number], o: Orientation = 'LWH'): Placement {
  return { item_key: u.item_key, sku: u.sku, step, x, y, z, dx: u.length_mm, dy: u.width_mm, dz: u.height_mm, orientation: o };
}

describe('Engine đóng gói 3D — validator', () => {
  const a = unit('A#1', [100, 100, 100], 200);
  const b = unit('B#1', [100, 100, 100], 200);
  const cube = box('C', [300, 300, 300]);

  it('input rỗng → EMPTY_INPUT', () => {
    expect(validateCandidate([], cube, [])[0]?.code).toBe('EMPTY_INPUT');
  });

  it('chạm mặt là hợp lệ; lấn 1 mm là OVERLAP', () => {
    expect(validateCandidate([a, b], cube, [place(a, 1, [0, 0, 0]), place(b, 2, [100, 0, 0])])).toEqual([]);
    const v = validateCandidate([a, b], cube, [place(a, 1, [0, 0, 0]), place(b, 2, [99, 0, 0])]);
    expect(v.map((x) => x.code)).toContain('OVERLAP');
  });

  it('thiếu món / trùng món / vượt biên đều bị bắt', () => {
    expect(validateCandidate([a, b], cube, [place(a, 1, [0, 0, 0])]).map((x) => x.code)).toContain('MISSING_ITEM');
    expect(
      validateCandidate([a], cube, [place(a, 1, [0, 0, 0]), place(a, 2, [100, 0, 0])]).map((x) => x.code),
    ).toContain('DUPLICATE_ITEM');
    expect(validateCandidate([a], cube, [place(a, 1, [250, 0, 0])]).map((x) => x.code)).toContain('OUT_OF_BOUNDS');
  });

  it('lơ lửng không có vật đỡ → NO_SUPPORT', () => {
    expect(validateCandidate([a], cube, [place(a, 1, [0, 0, 50])]).map((x) => x.code)).toContain('NO_SUPPORT');
  });

  it('đặt vật lên món có max_stack_load null → STACK_LOAD_EXCEEDED', () => {
    const v = validateCandidate([a, b], cube, [place(a, 1, [0, 0, 0]), place(b, 2, [0, 0, 100])]);
    expect(v.map((x) => x.code)).toContain('STACK_LOAD_EXCEEDED');
  });

  it('upright_only không được lật (hướng LHW bị từ chối)', () => {
    const shoe = unit('SH#1', [300, 200, 120], 900, { orientations: ['LWH', 'WLH'] });
    const lying: Placement = { ...place(shoe, 1, [0, 0, 0]), dx: 300, dy: 120, dz: 200, orientation: 'LHW' };
    expect(validateCandidate([shoe], box('B', [400, 400, 400]), [lying]).map((x) => x.code)).toContain(
      'ORIENTATION_NOT_ALLOWED',
    );
  });
});

describe('Engine đóng gói 3D — greedy + chọn thùng', () => {
  it('món 100×1×1 cm không vừa thùng 20×15×10 cm (fallback cũ chọn nhầm Small)', () => {
    const stick = unit('STICK#1', [1000, 10, 10], 100);
    const result = packOrder([stick], [box('SMALL', [200, 150, 100])]);
    expect(result.status).toBe('no_fit');
  });

  it('món cạnh 200 cm → no_fit, KHÔNG trả thùng lớn nhất', () => {
    const huge = unit('HUGE#1', [2000, 2000, 2000], 1000);
    const result = packOrder([huge], [box('S', [200, 150, 100]), box('L', [500, 400, 350])]);
    expect(result.status).toBe('no_fit');
  });

  it('hai khối 60 mm trong thùng 100 mm → no_fit dù tổng thể tích nhỏ hơn (docs §5.1)', () => {
    const c1 = unit('C#1', [60, 60, 60], 100, { maxStack: 10000 });
    const c2 = unit('C#2', [60, 60, 60], 100, { maxStack: 10000 });
    expect(packOrder([c1, c2], [box('B100', [100, 100, 100])]).status).toBe('no_fit');
  });

  it('fixture docs §7 (A1/A2/B1, chỉ hướng LWH) → chọn M, tọa độ đúng như tính tay, 53,03%', () => {
    const lwh: readonly Orientation[] = ['LWH'];
    const units = [
      unit('A#1', [200, 100, 80], 250, { orientations: lwh }),
      unit('A#2', [200, 100, 80], 250, { orientations: lwh }),
      unit('B#1', [100, 100, 100], 200, { orientations: lwh }),
    ];
    const boxes = [
      box('S', [220, 120, 100], [230, 130, 110]),
      box('M', [300, 220, 120], [310, 230, 130]),
      box('L', [400, 300, 200], [410, 310, 210]),
    ];
    const result = packOrder(units, boxes);
    if (result.status !== 'ok') throw new Error('phải tìm được phương án');
    expect(result.box.code).toBe('M');
    expect(result.placements.map((p) => [p.item_key, p.x, p.y, p.z])).toEqual([
      ['A#1', 0, 0, 0],
      ['A#2', 0, 100, 0],
      ['B#1', 200, 0, 0],
    ]);
    expect(result.fill_ratio).toBeCloseTo(0.5303, 3);
    expect(result.estimated_package_weight_g).toBe(700 + 180);
  });

  it('fixture docs §7.5 (giày SH1 đỡ áo T1, tải 300 g) → áo nằm trên hộp giày tại z = 120', () => {
    const lwh: readonly Orientation[] = ['LWH'];
    const sh1 = unit('SH1#1', [330, 220, 120], 1000, { orientations: lwh, maxStack: 300 });
    const t1 = unit('T1#1', [280, 200, 40], 250, { orientations: lwh });
    const result = packOrder([sh1, t1], [box('OUT', [350, 240, 180])]);
    if (result.status !== 'ok') throw new Error('phải tìm được phương án');
    const shirt = result.placements.find((p) => p.item_key === 'T1#1');
    expect([shirt?.x, shirt?.y, shirt?.z]).toEqual([0, 0, 120]);
  });

  it('§7.5 nhưng hộp giày KHÔNG cho chồng (null) → no_fit', () => {
    const lwh: readonly Orientation[] = ['LWH'];
    const sh1 = unit('SH1#1', [330, 220, 120], 1000, { orientations: lwh, maxStack: null });
    const t1 = unit('T1#1', [280, 200, 40], 250, { orientations: lwh });
    expect(packOrder([sh1, t1], [box('OUT', [350, 240, 180])]).status).toBe('no_fit');
  });

  it('mọi phương án greedy trả về đều qua validator (nhiều tổ hợp ngẫu nhiên có seed)', () => {
    let seed = 42;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const boxes = [box('S', [250, 200, 120]), box('M', [350, 250, 200]), box('L', [500, 400, 350])];
    for (let round = 0; round < 40; round += 1) {
      const count = 1 + Math.floor(rand() * 6);
      const units = Array.from({ length: count }, (_, i) =>
        unit(
          `U${String(round)}#${String(i + 1)}`,
          [40 + Math.floor(rand() * 200), 30 + Math.floor(rand() * 150), 10 + Math.floor(rand() * 100)],
          100 + Math.floor(rand() * 900),
          { maxStack: rand() > 0.3 ? 5000 : null },
        ),
      );
      const result = packOrder(units, boxes);
      if (result.status === 'ok') {
        expect(validateCandidate(units, result.box, result.placements)).toEqual([]);
        expect(result.placements.map((p) => p.step)).toEqual(units.map((_, i) => i + 1));
      }
    }
  });

  it('hết thời gian → no_fit kèm lý do timeout, không trả phương án dở', () => {
    let t = 0;
    const units = [unit('A#1', [100, 100, 100], 100), unit('A#2', [100, 100, 100], 100)];
    const result = packOrder(units, [box('M', [300, 300, 300])], { timeBudgetMs: 5, now: () => (t += 10) });
    expect(result.status).toBe('no_fit');
    if (result.status === 'no_fit') expect(result.reasons[0]?.reason).toContain('Hết thời gian');
  });

  it('packIntoBox trả null thay vì phương án thiếu món', () => {
    const units = [unit('A#1', [100, 100, 100], 100), unit('A#2', [100, 100, 100], 100)];
    expect(packIntoBox(units, box('ONE', [100, 100, 100]))).toBeNull();
  });
});

describe('Engine đóng gói 3D — đổi đơn vị', () => {
  it('cm → mm làm tròn lên, tránh lỗi dấu phẩy động', () => {
    expect(cmToMmCeil(28.1)).toBe(281);
    expect(cmToMmCeil(28.12)).toBe(282);
  });

  it('expandToUnits nở số lượng thành item_key riêng, upright_only chỉ 2 hướng', () => {
    const units = expandToUnits([
      {
        sku: 'GIAY',
        quantity: 2,
        length_cm: 33,
        width_cm: 22,
        height_cm: 12,
        weight_kg: 1,
        is_fragile: false,
        orientation_rule: 'upright_only',
        max_stack_load_kg: 0.3,
      },
    ]);
    expect(units.map((u) => u.item_key)).toEqual(['GIAY#1', 'GIAY#2']);
    expect(units[0]?.orientations).toEqual(['LWH', 'WLH']);
    expect(units[0]?.max_stack_load_g).toBe(300);
    expect(units[0]?.weight_g).toBe(1000);
  });
});
