import { expandToUnits } from '../../packaging/engine/units';
import { customBox, item, sampleBoxes, shoebox, tee } from '../../packaging/engine/scenarios/order-scenarios';
import type { BoxSpec, MailerSpec } from '../../packaging/engine/types';
import { estimateFeeVnd, packIntoMailers, solveWithMailers } from './solve-with-mailers';
import { solveOrder } from './solve-order';
import type { PackableItem } from '../../../common/interfaces/packaging.interface';
import type { SolveResult } from './types';

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
    expect(boxOnly.parcels[0]?.box.code).toBe('BOX-M');
    // (08/11/2026) Thùng M được cắt hạ sát áo → bậc 1 kg (thùng nguyên là 4 kg), túi vẫn rẻ hơn.
    expect(boxOnly.parcels[0]?.box.cut_from).toBeDefined();
    expect(boxOnly.parcels[0]?.billable_weight_g).toBe(1000);
  });

  it('không có túi trong danh mục → đúng kết quả bộ giải thùng cũ', () => {
    const units = expandToUnits([tee(2)]);
    const r = solveWithMailers(units, sampleBoxes(), {}, { mailers: [] });
    const old = solveOrder(units, sampleBoxes(), {});
    // Chỉ khác câu cảnh báo lấp đầy thấp nối thêm cuối explanation.
    expect({ ...r, stats: null, explanation: null }).toEqual({ ...old, stats: null, explanation: null });
    expect(r.explanation.slice(0, old.explanation.length)).toEqual(old.explanation);
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
    // Sàn rộng để kể cả khi cắt hạ, gộp chung vẫn ở bậc cước cao.
    const big = priced(customBox('BIG', [600, 500, 300]), 0);
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

/**
 * (13/11/2026, user chốt) Luật chọn bao bì theo tổ hợp hàng — bảng 4 thùng thật
 * của kho (S/M/LT/L) + 4 cỡ túi niêm phong mẫu, giới hạn dày túi 8 cm mặc định,
 * ưu tiên ít kiện. Số đo hàng lấy từ hồ sơ SKU DEMO trong DB.
 */
describe('solveWithMailers — luật chọn bao bì theo tổ hợp hàng', () => {
  const WAREHOUSE_BOXES = [
    priced(customBox('BOX-S', [200, 150, 100], 5000), 2500),
    priced(customBox('BOX-M', [350, 250, 200], 10000), 4500),
    priced(customBox('BOX-LT', [500, 400, 200], 15000), 6000),
    priced(customBox('BOX-L', [500, 400, 350], 15000), 8000),
  ];
  const ao = (qty: number): PackableItem =>
    item('AO', [36, 24, 4], 0.22, { qty, category: 't_shirt', fold: true });
  const polo = (qty: number): PackableItem => item('POLO', [20, 20, 5], 0.1, { qty, category: 't_shirt', fold: true });
  const quan = (qty: number): PackableItem => item('QUAN', [38, 30, 6], 0.65, { qty, category: 'trousers', fold: true, stackKg: 5 });
  const giay = (qty: number): PackableItem => item('GIAY', [33, 21, 12], 0.9, { qty, category: 'shoes', stackKg: 5 });
  const kinh = (qty: number): PackableItem => item('KINH', [16, 7, 5], 0.15, { qty, category: 'accessory', fragile: true });
  const solve = (items: PackableItem[], mailers: MailerSpec[] = []): SolveResult =>
    solveWithMailers(expandToUnits(items, { fragileCushionMm: 5 }), WAREHOUSE_BOXES, {}, { mailers });
  const codes = (r: SolveResult): string[] => r.parcels.map((p) => p.box.code);

  it('quần áo để trống sức chịu đè vẫn được chồng lên nhau, không phải gập', () => {
    const r = solve([polo(2)]);
    expect(codes(r)).toEqual(['BOX-M']);
    const [p] = r.parcels;
    expect(p?.placements.some((q) => q.z > 0)).toBe(true);
    expect(p?.placements.every((q) => q.folded !== true)).toBe(true);
  });
  it('1–2 áo đi túi niêm phong khi kho có túi; không có túi thì vào thùng M', () => {
    expect(codes(solve([ao(1)], MAILERS))).toEqual(['MAILER-32X45']);
    expect(codes(solve([ao(2)], MAILERS))).toEqual(['MAILER-38X52']);
    expect(codes(solve([ao(1)]))).toEqual(['BOX-M']);
  });

  it('3 áo chồng dày 12 cm vượt giới hạn túi 8 cm → 1 thùng M, không tách 2 túi', () => {
    expect(codes(solve([ao(3)], MAILERS))).toEqual(['BOX-M']);
  });

  it('2 áo + 2 quần → 1 thùng LT (ưu tiên ít kiện thắng 2 túi)', () => {
    expect(codes(solve([ao(2), quan(2)], MAILERS))).toEqual(['BOX-LT']);
  });

  it('giày bắt buộc thùng kể cả khi có túi; áo đi kèm giày vào chung thùng M', () => {
    expect(codes(solve([giay(1)], MAILERS))).toEqual(['BOX-M']);
    expect(codes(solve([ao(1), giay(1)], MAILERS))).toEqual(['BOX-M']);
    expect(codes(solve([giay(2)], MAILERS))).toEqual(['BOX-LT']);
  });

  it('thùng S dành cho phụ kiện nhỏ dễ vỡ và 1 áo nhỏ khi kho không có túi', () => {
    expect(codes(solve([kinh(2)], MAILERS))).toEqual(['BOX-S']);
    expect(codes(solve([polo(1)]))).toEqual(['BOX-S']);
    expect(codes(solve([polo(1)], MAILERS))[0]).toMatch(/^MAILER-/);
  });
  it('kiện lấp đầy < 80% ghi lý do: hàng mềm thiếu túi niêm phong', () => {
    const notes = solve([ao(2)]).explanation.filter((e) => e.includes('< 80%'));
    expect(notes).toEqual([expect.stringContaining('Kiện 1 (BOX-M) lấp đầy 39% < 80%')]);
    expect(notes[0]).toContain('kho chưa có túi niêm phong');
  });
  it('kiện lấp đầy < 80% vì thùng trong kho rộng hơn hàng → gợi ý cỡ thùng sát hàng', () => {
    // Kính 16×7×5 + đệm dễ vỡ 5 mm mỗi mặt = 17×8×6 cm, thùng S 20×15×10 chỉ đầy 27%.
    const notes = solve([kinh(1)], MAILERS).explanation.filter((e) => e.includes('< 80%'));
    expect(notes).toEqual([
      'Kiện 1 (BOX-S) lấp đầy 27% < 80%: danh mục không có thùng nhỏ hơn chứa vừa kiện. Thùng nhỏ nhất xếp vừa có lòng 17×8×6 cm (đầy 100%) — nên nhập thêm thùng cỡ này.',
    ]);
  });
  it('áo thun + kính: áo gập 1 lần không lọt thùng S → thùng M, gợi ý thùng chồng áo dưới kính trên', () => {
    // (17/11/2026) Ca thật: áo 36×24×0,5 gập 1 lần còn 18×24 — không vừa đáy S 20×15; giữa S và M không có cỡ nào.
    const aoMong = item('AO-MONG', [36, 24, 0.5], 0.22, { category: 't_shirt', fold: true });
    const r = solve([aoMong, kinh(1)], MAILERS);
    expect(codes(r)).toEqual(['BOX-M']);
    const hint = r.parcels[0]?.fill_hint;
    // Áo 18×24×1 lót đáy, kính 17×8×6 nằm trên: lòng 18×24×7 cm thay vì 35×25×10.
    expect(hint?.suggest_inner_mm).toEqual({ length_mm: 180, width_mm: 240, height_mm: 70 });
    expect(hint?.suggest_fill).toBeGreaterThan(0.4);
    expect(r.explanation.at(-1)).toContain('Thùng nhỏ nhất xếp vừa có lòng 18×24×7 cm');
  });

  it('kiện đã lấp đầy ≥ 80% không có cảnh báo', () => {
    expect(solve([ao(2)], MAILERS).explanation.some((e) => e.includes('< 80%'))).toBe(false);
  });
  it('gói đã cho vào túi zip và gập túi KHÔNG bị gập chồng thêm lần nữa', () => {
    // Số đo hồ sơ là gói SAU khi gập túi zip (20×20×5) — đã là dạng gọn nhất, engine không gập thêm.
    const bagged: PackableItem = { ...polo(1), zip_bag_code: 'ZIP-M', zip_bag_folded: true };
    const r = solve([bagged]);
    expect(codes(r)).toEqual(['BOX-M']);
    expect(r.parcels[0]?.placements[0]?.folded).not.toBe(true);
    // Có túi niêm phong: chọn túi đủ lớn cho gói 20×20×5 thay vì gập tiếp để nhét túi nhỏ.
    const m = solve([bagged], MAILERS);
    expect(codes(m)).toEqual(['MAILER-32X45']);
    expect(m.parcels[0]?.placements[0]?.folded).not.toBe(true);
  });
});

