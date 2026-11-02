import { expandToUnits } from '../../packaging/engine/units';
import { customBox, item, sampleBoxes, shoebox, tee } from '../../packaging/engine/scenarios/order-scenarios';
import type { BoxSpec, MailerSpec } from '../../packaging/engine/types';
import { estimateFeeVnd, packIntoMailers, solveWithMailers } from './solve-with-mailers';
import { solveOrder } from './solve-order';

jest.setTimeout(60_000);

const MAILERS: MailerSpec[] = [
  { code: 'MAILER-20X30', name: '20×30', width_mm: 200, length_mm: 300, tare_g: 6, max_load_g: 3000, price_vnd: 600 },
  { code: 'MAILER-25X35', name: '25×35', width_mm: 250, length_mm: 350, tare_g: 8, max_load_g: 3000, price_vnd: 800 },
  { code: 'MAILER-32X45', name: '32×45', width_mm: 320, length_mm: 450, tare_g: 13, max_load_g: 3000, price_vnd: 1200 },
  { code: 'MAILER-38X52', name: '38×52', width_mm: 380, length_mm: 520, tare_g: 18, max_load_g: 3000, price_vnd: 1600 },
];

const priced = (b: BoxSpec, price: number): BoxSpec => ({ ...b, price_vnd: price });

/** AOFP-224 — PACKAGING_STANDARD §4 + §6. */
describe('solveWithMailers — túi niêm phong trong bộ giải', () => {
  it('1 áo thun: túi niêm phong bậc 0,5 kg thắng thùng (áo mẫu 30×22 chỉ vừa thùng M, bậc 4 kg)', () => {
    const units = expandToUnits([tee(1)]);
    const r = solveWithMailers(units, sampleBoxes(), {}, { mailers: MAILERS });
    expect(r.unplaced).toEqual([]);
    expect(r.parcels).toHaveLength(1);
    const [p] = r.parcels;
    expect(p?.box.kind).toBe('mailer');
    expect(p?.billable_weight_g).toBe(500);
    // Áo 30×22×3 nguyên dạng cần túi 32×45; gập đôi (22×15×6) vừa 25×35 rẻ hơn, cùng bậc cước.
    expect(p?.box.code).toBe('MAILER-25X35');
    expect(p?.placements[0]?.folded).toBe(true);
    expect(p?.materials).toEqual([]);
    const boxOnly = solveOrder(units, sampleBoxes(), {});
    expect(boxOnly.parcels[0]?.box.code).toBe('SAMPLE-M');
    expect(boxOnly.parcels[0]?.billable_weight_g).toBe(4000);
  });

  it('không có túi trong danh mục → đúng kết quả bộ giải thùng cũ', () => {
    const units = expandToUnits([tee(2)]);
    const r = solveWithMailers(units, sampleBoxes(), {}, { mailers: [] });
    const old = solveOrder(units, sampleBoxes(), {});
    expect({ ...r, stats: null }).toEqual({ ...old, stats: null });
  });

  it('hàng dễ vỡ không bao giờ vào túi niêm phong', () => {
    const units = expandToUnits([item('GLASSES', [16, 7, 5], 0.1, { category: 'accessory', fragile: true })]);
    expect(units[0]?.mailer_ok).toBe(false);
    const r = solveWithMailers(units, sampleBoxes(), {}, { mailers: MAILERS });
    expect(r.parcels.every((p) => p.box.kind !== 'mailer')).toBe(true);
  });

  it('hết tồn túi → không dùng túi đó', () => {
    const units = expandToUnits([tee(1)]);
    const availability = new Map([
      ['MAILER-25X35', 0],
      ['MAILER-32X45', 5],
      ...sampleBoxes().map((b) => [b.code, 10] as [string, number]),
    ]);
    const r = solveWithMailers(units, sampleBoxes(), { availability }, { mailers: MAILERS });
    expect(r.parcels[0]?.box.code).toBe('MAILER-32X45');
  });

  it('nhiều hàng mềm quá dày cho 1 túi → chia nhiều túi; ít kiện vẫn ưu tiên thùng', () => {
    const units = expandToUnits([tee(6)]);
    const parcels = packIntoMailers(units, MAILERS);
    expect(parcels).not.toBeNull();
    expect(parcels?.length).toBeGreaterThanOrEqual(2);
    const r = solveWithMailers(units, sampleBoxes(), {}, { mailers: MAILERS });
    // fewest_parcels: 1 thùng thắng ≥ 2 túi.
    expect(r.parcels).toHaveLength(1);
    expect(r.parcels[0]?.box.kind).not.toBe('mailer');
  });

  it('đơn trộn áo + giày: mặc định giữ 1 thùng chung, giải thích vì sao không tách', () => {
    const units = expandToUnits([tee(1), shoebox(1)]);
    const r = solveWithMailers(units, sampleBoxes(), {}, { mailers: MAILERS });
    expect(r.parcels).toHaveLength(1);
    expect(r.parcels[0]?.box.kind).not.toBe('mailer');
    expect(r.explanation.some((e) => e.includes('§6'))).toBe(true);
  });

  it('đơn trộn: tách túi + thùng khi rẻ hơn đủ ngưỡng', () => {
    // Thùng vừa khít hộp giày không còn chỗ cho áo → gộp phải dùng thùng lớn (bậc cước cao).
    const tight = priced(customBox('TIGHT', [340, 220, 130]), 0);
    const big = priced(customBox('BIG', [400, 300, 300]), 0);
    const units = expandToUnits([tee(1), shoebox(1)]);
    const together = solveOrder(units, [tight, big], {});
    expect(together.parcels.map((p) => p.box.code)).toEqual(['BIG']);

    const r = solveWithMailers(units, [tight, big], {}, { mailers: MAILERS, splitMinSavingVnd: 1000 });
    expect(r.parcels.map((p) => p.box.kind ?? 'box').sort()).toEqual(['box', 'mailer']);
    expect(r.parcels.find((p) => p.box.kind !== 'mailer')?.box.code).toBe('TIGHT');

    const strict = solveWithMailers(units, [tight, big], {}, { mailers: MAILERS, splitMinSavingVnd: 1_000_000 });
    expect(strict.parcels.map((p) => p.box.code)).toEqual(['BIG']);
  });

  it('cước ước tính theo bậc', () => {
    const fee = { firstStepVnd: 22000, perExtraStepVnd: 2500 };
    expect(estimateFeeVnd(500, 500, fee)).toBe(22000);
    expect(estimateFeeVnd(1000, 500, fee)).toBe(24500);
    expect(estimateFeeVnd(0, 500, fee)).toBe(22000);
  });
});
