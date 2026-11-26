import type { BoxSpec, PackingUnit, Placement } from '../../packaging/engine/types';
import { ALL_ORIENTATIONS, UPRIGHT_ORIENTATIONS } from '../../packaging/engine/types';
import { foldedShapeFor, foldShapes, foldUnit, minSupportPct } from '../../packaging/engine/units';
import { validateCandidate } from '../../packaging/engine/validator';
import { solveOrder, validatePlan } from './solve-order';

jest.setTimeout(60_000);

/**
 * Luật 08/11/2026 (user chốt): quần áo là đồ mềm — chỉ cần được đỡ ≥ 80% đáy và gập
 * đôi rồi được dựng đứng. Hàng cứng (hộp giày, túi xách) vẫn phải đỡ kín 100%, không gập.
 * Số đo lấy từ đơn thật DEMO-3D-1 (nhóm 01d221b5) trước đây phải tách 2 kiện.
 */
const garment = (sku: string, l: number, w: number, h: number, g: number, category: string): PackingUnit => ({
  item_key: `${sku}#1`,
  sku,
  length_mm: l,
  width_mm: w,
  height_mm: h,
  weight_g: g,
  is_fragile: false,
  orientations: UPRIGHT_ORIENTATIONS,
  max_stack_load_g: 5000,
  foldable: true,
  product_category: category,
});

const rigid = (sku: string, l: number, w: number, h: number, g: number, category: string): PackingUnit => ({
  item_key: `${sku}#1`,
  sku,
  length_mm: l,
  width_mm: w,
  height_mm: h,
  weight_g: g,
  is_fragile: false,
  orientations: ALL_ORIENTATIONS,
  max_stack_load_g: 5000,
  foldable: false,
  product_category: category,
});

const ORDER: PackingUnit[] = [
  garment('AO-KHOAC', 350, 300, 60, 700, 'jacket'),
  garment('AO-THUN', 360, 240, 40, 220, 't_shirt'),
  rigid('GIAY', 330, 210, 120, 900, 'shoes'),
  garment('QUAN-DAI', 380, 300, 60, 650, 'trousers'),
  garment('QUAN-SHORT', 300, 240, 40, 300, 'shorts'),
  garment('SO-MI', 360, 260, 50, 300, 'shirt'),
  rigid('TUI-XACH', 300, 240, 120, 600, 'bag'),
  garment('VAY', 320, 250, 30, 250, 'dress'),
];

const BOX_L: BoxSpec = {
  code: 'BOX-L',
  name: 'Thùng carton L',
  inner: { length_mm: 500, width_mm: 400, height_mm: 350 },
  outer: { length_mm: 506, width_mm: 406, height_mm: 356 },
  tare_g: 380,
  max_load_g: 20000,
  price_vnd: 8000,
};

/** Món 100×100 đặt lên đế 100×100, lệch `shift` mm theo x → đỡ (100 − shift)%. */
function overhangViolations(top: PackingUnit, shift: number): string[] {
  const base = rigid('DE', 100, 100, 50, 100, 'other');
  const box = { ...BOX_L, inner: { length_mm: 300, width_mm: 300, height_mm: 300 } };
  const placements: Placement[] = [
    { item_key: base.item_key, sku: base.sku, step: 1, x: 0, y: 0, z: 0, dx: 100, dy: 100, dz: 50, orientation: 'LWH' },
    { item_key: top.item_key, sku: top.sku, step: 2, x: shift, y: 0, z: 50, dx: 100, dy: 100, dz: 20, orientation: 'LWH' },
  ];
  return validateCandidate([base, top], box, placements).map((v) => v.code);
}

describe('Đồ mềm: đỡ 80% + gập rồi dựng đứng', () => {
  it('quần áo chìa mép tới 20% vẫn hợp lệ, chìa 21% thì không', () => {
    const shirt = garment('AO', 100, 100, 20, 200, 't_shirt');
    expect(overhangViolations(shirt, 20)).toEqual([]);
    expect(overhangViolations(shirt, 21)).toContain('NO_SUPPORT');
  });

  it('hàng cứng (hộp giày) vẫn phải được đỡ kín 100%', () => {
    const shoebox = rigid('HOP-GIAY', 100, 100, 20, 500, 'shoes');
    expect(overhangViolations(shoebox, 0)).toEqual([]);
    expect(overhangViolations(shoebox, 1)).toContain('NO_SUPPORT');
  });

  it('quần áo đã gập được dựng đứng; chưa gập vẫn nằm phẳng; hàng cứng không đổi', () => {
    const jacket = garment('AO-KHOAC', 350, 300, 60, 700, 'jacket');
    expect(jacket.orientations).toEqual(UPRIGHT_ORIENTATIONS);
    expect(foldUnit(jacket).orientations).toEqual(ALL_ORIENTATIONS);
    expect(minSupportPct(jacket)).toBe(80);
    expect(minSupportPct(rigid('TUI', 300, 240, 120, 600, 'bag'))).toBe(100);
  });

  it('đơn 6 món quần áo + giày + túi xách dồn được vào 1 thùng L', () => {
    const result = solveOrder(ORDER, [BOX_L], { seed: 1 });
    expect(result.unplaced).toEqual([]);
    expect(result.parcels).toHaveLength(1);
    expect(validatePlan(result.parcels, ORDER.map((u) => u.item_key))).toEqual([]);
  });
});

describe('Gập tư quần áo (AOFP-345)', () => {
  // Áo 30×22 cm: gập đôi 15×22 vẫn quá rộng thùng 16×12; gập tư 15×11×2 cm mới vừa.
  const shirt = garment('AO', 300, 220, 5, 200, 't_shirt');
  const small: BoxSpec = {
    code: 'Q',
    name: 'Q',
    inner: { length_mm: 160, width_mm: 120, height_mm: 60 },
    outer: { length_mm: 166, width_mm: 126, height_mm: 66 },
    tare_g: 50,
    max_load_g: 5000,
    price_vnd: 1000,
  };

  it('foldShapes cho gập đôi rồi gập tư, không quá 2 lần', () => {
    const shapes = foldShapes(shirt);
    expect(shapes.map((s) => [s.length_mm, s.width_mm, s.height_mm, s.fold_count])).toEqual([
      [150, 220, 10, 1],
      [150, 110, 20, 2],
    ]);
    expect(foldShapes(shapes[1] as PackingUnit)).toEqual([]);
  });

  it('bộ giải gập tư khi gập đôi không vừa, placement ghi fold_count 2', () => {
    const plan = solveOrder([shirt], [small], { seed: 1 });
    expect(plan.status).toBe('ok');
    const p = plan.parcels[0]?.placements[0];
    expect(p).toMatchObject({ folded: true, fold_count: 2 });
  });

  it('foldedShapeFor suy đúng số lần gập từ kích thước CP-SAT trả về', () => {
    expect(foldedShapeFor(shirt, [110, 150, 20]).fold_count).toBe(2);
    expect(foldedShapeFor(shirt, [220, 10, 150]).fold_count).toBe(1);
  });
});
