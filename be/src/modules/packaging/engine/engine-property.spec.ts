import { solve, sampleBoxes, item } from './scenarios/order-scenarios';
import { expandToUnits, foldUnit } from './units';
import { validateCandidate } from './validator';
import type { PackableItem } from '../../../common/interfaces/packaging.interface';

/**
 * Property test mở rộng (30/09/2026): đơn ngẫu nhiên có seed, tới ~24 món,
 * trộn dễ vỡ / hướng any-upright / gập được / tải chồng khác nhau. Mọi kết
 * quả `ok` (1 thùng hoặc đa kiện) phải qua validator độc lập, không mất và
 * không trùng món giữa các kiện.
 */
jest.setTimeout(120_000);

function makeRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function randomOrder(rand: () => number, round: number): PackableItem[] {
  const kinds = 1 + Math.floor(rand() * 4);
  return Array.from({ length: kinds }, (_, k) =>
    item(
      `P${String(round)}-${String(k)}`,
      [
        8 + Math.floor(rand() * 32),
        6 + Math.floor(rand() * 22),
        1 + Math.floor(rand() * 12),
      ],
      0.05 + rand() * 1.2,
      {
        qty: 1 + Math.floor(rand() * 6),
        fragile: rand() < 0.15,
        upright: rand() < 0.3,
        stackKg: rand() < 0.35 ? null : 0.3 + rand() * 6,
        fold: rand() < 0.4,
        category: rand() < 0.5 ? 't_shirt' : 'other',
      },
    ),
  );
}

describe('Engine — property test mở rộng (validator là nguồn sự thật)', () => {
  it('80 đơn ngẫu nhiên: mọi kết quả ok đều hợp lệ và đủ món', () => {
    const rand = makeRand(20260930);
    const boxes = sampleBoxes();
    let okCount = 0;
    for (let round = 0; round < 80; round += 1) {
      const items = randomOrder(rand, round);
      const all = new Map(expandToUnits(items).map((u) => [u.item_key, u]));
      const outcome = solve(items, boxes);
      if (outcome.status !== 'ok') continue;
      okCount += 1;

      const placed: string[] = [];
      for (const carton of outcome.cartons) {
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
        expect(carton.placements.map((p) => p.step)).toEqual(
          carton.placements.map((_, i) => i + 1),
        );
        placed.push(...carton.placements.map((p) => p.item_key));
      }
      expect([...placed].sort()).toEqual([...all.keys()].sort());
    }
    // Đảm bảo test có thực sự kiểm tra (không "xanh" vì toàn no_fit).
    expect(okCount).toBeGreaterThan(40);
  });
});
