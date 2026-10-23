import { expandToUnits, foldUnit, FLAT_CATEGORIES } from '../../packaging/engine/units';
import {
  customBox,
  item,
  jean,
  sandal,
  sampleBoxes,
  shoebox,
  sunglasses,
  tee,
} from '../../packaging/engine/scenarios/order-scenarios';
import type { Placement } from '../../packaging/engine/types';
import { solveOrder } from './solve-order';

jest.setTimeout(60_000);

/**
 * Hợp đồng dữ liệu cho khung 3D của FE (GUIDE_DOC/HUONG_DAN_3D_DONG_GOI_BACKEND.md):
 * khóa những điều FE dựa vào để diễn từng món, để đổi engine không làm lệch hình.
 */
describe('Hợp đồng 3D đóng gói', () => {
  const items = [jean(2), tee(3), shoebox(2), sandal(2), sunglasses(1)];
  const units = expandToUnits(items);
  const result = solveOrder(units, sampleBoxes(), { maxEvaluations: 600 });
  const clothing = new Set<string>(FLAT_CATEGORIES);
  const categoryOfSku = new Map(items.map((i) => [i.sku, i.product_category ?? null]));

  it('đơn mẫu xếp được toàn bộ', () => {
    expect(result.unplaced).toEqual([]);
    expect(result.parcels.length).toBeGreaterThan(0);
  });

  it('mỗi ô nằm trọn trong lòng thùng, gốc ở đáy (z=0)', () => {
    for (const p of result.parcels) {
      for (const q of p.placements) {
        expect(q.x).toBeGreaterThanOrEqual(0);
        expect(q.y).toBeGreaterThanOrEqual(0);
        expect(q.z).toBeGreaterThanOrEqual(0);
        expect(q.x + q.dx).toBeLessThanOrEqual(p.box.inner.length_mm);
        expect(q.y + q.dy).toBeLessThanOrEqual(p.box.inner.width_mm);
        expect(q.z + q.dz).toBeLessThanOrEqual(p.box.inner.height_mm);
      }
    }
  });

  it('step là 1..n liên tục trong từng kiện; itemKey dạng sku#số, mỗi món một lần', () => {
    const seen = new Set<string>();
    for (const p of result.parcels) {
      const steps = p.placements.map((q) => q.step).sort((a, b) => a - b);
      expect(steps).toEqual(p.placements.map((_, i) => i + 1));
      for (const q of p.placements) {
        expect(q.item_key).toMatch(new RegExp(`^${q.sku}#[1-9]\\d*$`));
        expect(seen.has(q.item_key)).toBe(false);
        seen.add(q.item_key);
      }
    }
    expect(seen.size).toBe(units.length);
  });

  it('quần áo chỉ LWH hoặc WLH (luôn nằm phẳng)', () => {
    for (const p of result.parcels) {
      for (const q of p.placements) {
        if (clothing.has(categoryOfSku.get(q.sku) ?? '')) {
          expect(['LWH', 'WLH']).toContain(q.orientation);
        }
      }
    }
  });

  it('món chồng lên nhau thì có ít nhất một món bên dưới đỡ (mặt trên chạm đáy, XY giao nhau)', () => {
    const overlapXY = (a: Placement, b: Placement): boolean =>
      a.x < b.x + b.dx && b.x < a.x + a.dx && a.y < b.y + b.dy && b.y < a.y + a.dy;
    for (const p of result.parcels) {
      for (const q of p.placements) {
        if (q.z === 0) continue;
        const supporters = p.placements.filter((o) => o !== q && o.z + o.dz === q.z && overlapXY(o, q));
        expect(supporters.length).toBeGreaterThan(0);
        // Món đỡ phải được đặt trước món nằm trên (FE diễn theo step).
        for (const s of supporters) expect(s.step).toBeLessThan(q.step);
      }
    }
  });

  it('dép, giày, phụ kiện không bao giờ folded dù hồ sơ ghi gập được', () => {
    const forced = [sandal(1), shoebox(1), sunglasses(1)].map((i) => ({ ...i, can_fold_in_half: true }));
    expect(expandToUnits(forced).every((u) => u.foldable === false)).toBe(true);
    // Thùng nhỏ khít để engine có động cơ gập nếu được phép.
    const tight = solveOrder(expandToUnits(forced), [customBox('TIGHT', [300, 250, 200]), ...sampleBoxes()], {
      maxEvaluations: 300,
    });
    for (const p of tight.parcels) for (const q of p.placements) expect(q.folded ?? false).toBe(false);
  });

  it('quần áo gập được thì foldable; foldUnit chia đôi cạnh dài hơn và nhân đôi độ dày', () => {
    const units2 = expandToUnits([item('QUAN', [38, 30, 6], 0.65, { category: 'trousers', fold: true })]);
    const u = units2[0];
    if (u === undefined) throw new Error('không nở được món');
    expect(u.foldable).toBe(true);
    const folded = foldUnit(u);
    expect([folded.length_mm, folded.width_mm, folded.height_mm]).toEqual([190, 300, 120]);
    expect(folded.folded).toBe(true);
  });

  it('đệm món dễ vỡ cộng vào kích thước ô (2 × đệm mỗi chiều)', () => {
    const [plain] = expandToUnits([sunglasses(1)]);
    const [padded] = expandToUnits([sunglasses(1)], { fragileCushionMm: 5 });
    expect((padded?.length_mm ?? 0) - (plain?.length_mm ?? 0)).toBe(10);
    expect((padded?.height_mm ?? 0) - (plain?.height_mm ?? 0)).toBe(10);
  });
});
