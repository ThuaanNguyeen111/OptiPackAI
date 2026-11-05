import { expandToUnits } from '../../packaging/engine/units';
import { item } from '../../packaging/engine/scenarios/order-scenarios';
import type { BoxSpec, PackingUnit } from '../../packaging/engine/types';
import { compareBoxes, type BoxComparisonRow } from './box-comparison';
import { solveOrder } from './solve-order';
import type { SolvedParcel } from './types';

/** Thùng có giá + thành dày 5 mm mỗi phía (ngoài = lòng + 10 mm). */
function box(code: string, [l, w, h]: [number, number, number], priceVnd: number, maxLoadG = 20000): BoxSpec {
  return {
    code,
    name: `Thùng ${code}`,
    inner: { length_mm: l, width_mm: w, height_mm: h },
    outer: { length_mm: l + 10, width_mm: w + 10, height_mm: h + 10 },
    tare_g: 100,
    max_load_g: maxLoadG,
    price_vnd: priceVnd,
  };
}

/** Kiện "bộ giải đã chọn": xếp đúng các món vào đúng 1 thùng. */
function packInto(units: PackingUnit[], chosen: BoxSpec): SolvedParcel {
  const [parcel] = solveOrder(units, [chosen]).parcels;
  if (!parcel) throw new Error('fixture: thùng chọn phải vừa');
  return parcel;
}

const SMALL = box('S', [320, 220, 60], 3000);
const BIG = box('XL', [600, 400, 400], 8000);

describe('compareBoxes — bảng so sánh thùng cho 1 kiện', () => {
  it('thùng được chọn đứng đầu với điểm cao nhất; thùng to hơn xếp sau vì cân tính cước cao hơn', () => {
    // Áo 30×20×5 cm, 300 g: thùng S ôm vừa (cước 1 bậc 500 g), thùng XL 61×41×41 cm quy đổi 20,5 kg.
    const units = expandToUnits([item('AO-01', [30, 20, 5], 0.3)]);
    const chosen = packInto(units, SMALL);

    const result = compareBoxes(units, [SMALL, BIG], chosen);

    const [first, second] = result.rows;
    expect(first?.box_code).toBe('S');
    expect(first?.is_chosen).toBe(true);
    expect(first?.rank).toBe(1);
    expect(second?.box_code).toBe('XL');
    expect(second?.rank).toBe(2);
    expect(first?.score).toBeGreaterThan(second?.score ?? 10);
    expect(second?.verdict).toContain('cân tính cước');
  });

  it('thùng không dùng được có điểm 0, không xếp hạng và nêu đúng lý do', () => {
    const units = expandToUnits([item('AO-01', [30, 20, 5], 0.3)]);
    const chosen = packInto(units, SMALL);
    const tiny = box('XS', [250, 150, 40], 1500); // áo 300 mm không vừa lòng 250 mm
    const flimsy = box('PAPER', [400, 300, 100], 2000, 200); // chịu 200 g < áo 300 g
    const empty = box('M', [400, 300, 100], 4000); // vừa nhưng kho hết
    const banned = box('L', [500, 400, 200], 6000); // bị loại khi tính lại

    const result = compareBoxes(units, [SMALL, tiny, flimsy, empty, banned], chosen, {
      availability: new Map([
        ['XS', 5],
        ['PAPER', 5],
        ['M', 0],
        ['L', 5],
      ]),
      excludeBoxCodes: ['L'],
    });

    const row = (code: string): BoxComparisonRow | undefined => result.rows.find((r) => r.box_code === code);
    for (const code of ['XS', 'PAPER', 'M', 'L']) {
      expect(row(code)).toMatchObject({ eligible: false, rank: null, score: 0, criteria: null });
    }
    expect(row('XS')?.verdict).toContain('AO-01');
    expect(row('XS')?.verdict).toContain('không vừa');
    expect(row('PAPER')?.verdict).toContain('vượt tải');
    expect(row('M')?.verdict).toContain('hết');
    expect(row('M')?.billable_weight_g).not.toBeNull(); // vẫn cho xem số liệu nếu kho có thùng
    expect(row('L')?.verdict).toContain('loại');
    expect(result.rows.filter((r) => r.eligible)).toHaveLength(1);
  });

  it('thùng đang chọn KHÔNG phải tốt nhất (vd. chỉnh tay sang XL) → bảng xếp thùng tốt hơn lên đầu và nói thẳng', () => {
    const units = expandToUnits([item('AO-01', [30, 20, 5], 0.3)]);
    const chosen = packInto(units, BIG);

    const result = compareBoxes(units, [SMALL, BIG], chosen);

    const [first, second] = result.rows;
    expect(first).toMatchObject({ box_code: 'S', rank: 1, is_chosen: false });
    expect(second).toMatchObject({ box_code: 'XL', rank: 2, is_chosen: true });
    expect(first?.verdict).toContain('Tốt hơn thùng XL');
    expect(result.summary).toContain('S');
    expect(result.summary).toContain('tốt hơn');
  });

  it('tóm tắt nêu điểm thùng chọn và thùng xếp sau', () => {
    const units = expandToUnits([item('AO-01', [30, 20, 5], 0.3)]);
    const result = compareBoxes(units, [SMALL, BIG], packInto(units, SMALL));
    const [chosenRow, runnerUp] = result.rows;

    expect(result.summary).toContain(`Chọn thùng S (${String(chosenRow?.score).replace('.', ',')}/10)`);
    expect(result.summary).toContain(`XL (${String(runnerUp?.score).replace('.', ',')}/10)`);
    expect(result.scores_consistent).toBe(true);
  });

  it('điểm tổng ngược thứ hạng → giữ thứ hạng theo luật bậc, gắn cờ và cảnh báo trong tóm tắt (không sửa số)', () => {
    // Áo 20×15×5 cm, 200 g. A ôm sát: cước 500 g nhưng giá 50.000đ. B rộng hơn chút: cước 1.000 g, giá 1.000đ.
    // Luật bậc: cước trước giá → A hạng 1. Điểm trọng số: giá rẻ + lấp đầy gần bằng → B điểm cao hơn.
    const units = expandToUnits([item('AO-02', [20, 15, 5], 0.2)]);
    const a = box('A', [210, 160, 55], 50000);
    const b = box('B', [210, 160, 65], 1000);

    const result = compareBoxes(units, [a, b], packInto(units, a));

    const [first, second] = result.rows;
    expect(first).toMatchObject({ box_code: 'A', rank: 1, billable_weight_g: 500 });
    expect(second).toMatchObject({ box_code: 'B', rank: 2, billable_weight_g: 1000 });
    expect(second?.score).toBeGreaterThan(first?.score ?? 0);
    expect(result.scores_consistent).toBe(false);
    expect(result.summary).toContain('Lưu ý');
  });
});
